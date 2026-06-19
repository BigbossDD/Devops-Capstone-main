"""
auth-service (Marketly)
Migrated from SQLite to PostgreSQL.
All DB connection logic now uses psycopg2 driven by DATABASE_URL env var.
Everything else is identical to the original.
"""
import os
import re
import secrets
import hashlib
import datetime

import jwt
import psycopg2
import psycopg2.extras
from flask import Flask, jsonify, request, make_response
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)

# ── Database connection ───────────────────────────────────────────────────────
# Provide DATABASE_URL as:
#   postgresql://USER:PASSWORD@HOST:5432/DBNAME
# In docker-compose this comes from the environment block.
# In Kubernetes it comes from a Secret mounted as an env var.
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://marketly:marketly_dev@localhost:5432/auth_db"
)

SHARED_SECRET = os.environ.get("SHARED_SECRET", "dev-shared-secret-change-me")

ACCESS_TOKEN_EXP_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXP_MINUTES", "15"))
REFRESH_TOKEN_EXP_DAYS = int(os.environ.get("REFRESH_TOKEN_EXP_DAYS", "30"))

COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
REFRESH_COOKIE_NAME = "marketly_refresh_token"
CSRF_COOKIE_NAME = "marketly_csrf_token"

CORS_ALLOWED_ORIGIN = os.environ.get("CORS_ALLOWED_ORIGIN", "http://localhost:5173")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

ADMIN_SEED_USERNAME = os.environ.get("ADMIN_SEED_USERNAME", "admin")
ADMIN_SEED_PASSWORD = os.environ.get("ADMIN_SEED_PASSWORD", "admin1234")
ADMIN_SEED_EMAIL    = os.environ.get("ADMIN_SEED_EMAIL",    "admin@example.com")

DEMO_SEED_USERNAME = os.environ.get("DEMO_SEED_USERNAME", "demo")
DEMO_SEED_PASSWORD = os.environ.get("DEMO_SEED_PASSWORD", "demo1234")
DEMO_SEED_EMAIL    = os.environ.get("DEMO_SEED_EMAIL",    "demo@example.com")

LOGIN_MAX_ATTEMPTS             = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_LOCKOUT_MINUTES          = int(os.environ.get("LOGIN_LOCKOUT_MINUTES", "15"))
LOGIN_ATTEMPT_WINDOW_MINUTES   = int(os.environ.get("LOGIN_ATTEMPT_WINDOW_MINUTES", "15"))
RATE_LIMIT_WINDOW_SECONDS      = 60
RATE_LIMIT_MAX_REQUESTS        = int(os.environ.get("RATE_LIMIT_MAX_REQUESTS", "20"))

_failed_attempts = {}
_ip_request_log  = {}


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    return conn


def get_cursor(conn):
    """Return a dict-like cursor (RealDictCursor)."""
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def init_db():
    conn = get_db()
    cur  = get_cursor(conn)

    # users table — SERIAL replaces SQLite's AUTOINCREMENT
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            SERIAL PRIMARY KEY,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email         TEXT,
            full_name     TEXT,
            address       TEXT,
            role          TEXT NOT NULL DEFAULT 'customer',
            created_at    TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id         SERIAL PRIMARY KEY,
            user_id    INTEGER NOT NULL,
            token_hash TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            revoked_at TEXT
        )
    """)

    conn.commit()

    # Seed admin
    cur.execute("SELECT id FROM users WHERE username = %s", (ADMIN_SEED_USERNAME,))
    if not cur.fetchone():
        cur.execute(
            """
            INSERT INTO users (username, password_hash, email, full_name, address, role, created_at)
            VALUES (%s, %s, %s, %s, %s, 'admin', %s)
            """,
            (
                ADMIN_SEED_USERNAME,
                generate_password_hash(ADMIN_SEED_PASSWORD),
                ADMIN_SEED_EMAIL,
                "Store Admin",
                "",
                datetime.datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()

    # Seed demo user
    cur.execute("SELECT id FROM users WHERE username = %s", (DEMO_SEED_USERNAME,))
    if not cur.fetchone():
        cur.execute(
            """
            INSERT INTO users (username, password_hash, email, full_name, address, role, created_at)
            VALUES (%s, %s, %s, %s, %s, 'customer', %s)
            """,
            (
                DEMO_SEED_USERNAME,
                generate_password_hash(DEMO_SEED_PASSWORD),
                DEMO_SEED_EMAIL,
                "Demo Customer",
                "",
                datetime.datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()

    cur.close()
    conn.close()


def user_to_dict(row):
    return {
        "id":         row["id"],
        "username":   row["username"],
        "email":      row["email"],
        "full_name":  row["full_name"],
        "address":    row["address"],
        "role":       row["role"],
        "created_at": row["created_at"],
    }


# ── Rate limiting / lockout (unchanged — in-memory) ───────────────────────────

def _client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() if forwarded else (request.remote_addr or "unknown")


def _prune_old(timestamps, window_minutes):
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(minutes=window_minutes)
    return [t for t in timestamps if t > cutoff]


def check_ip_rate_limit():
    ip  = _client_ip()
    now = datetime.datetime.utcnow()
    window_start = now - datetime.timedelta(seconds=RATE_LIMIT_WINDOW_SECONDS)
    log = [t for t in _ip_request_log.get(ip, []) if t > window_start]
    log.append(now)
    _ip_request_log[ip] = log
    return len(log) <= RATE_LIMIT_MAX_REQUESTS


def is_account_locked(username):
    key      = username.lower()
    attempts = _prune_old(_failed_attempts.get(key, []), LOGIN_ATTEMPT_WINDOW_MINUTES)
    _failed_attempts[key] = attempts
    if len(attempts) < LOGIN_MAX_ATTEMPTS:
        return False, 0
    lock_until = attempts[-1] + datetime.timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
    remaining  = (lock_until - datetime.datetime.utcnow()).total_seconds()
    if remaining > 0:
        return True, int(remaining)
    _failed_attempts[key] = []
    return False, 0


def record_failed_attempt(username):
    key      = username.lower()
    attempts = _prune_old(_failed_attempts.get(key, []), LOGIN_ATTEMPT_WINDOW_MINUTES)
    attempts.append(datetime.datetime.utcnow())
    _failed_attempts[key] = attempts


def clear_failed_attempts(username):
    _failed_attempts.pop(username.lower(), None)


# ── CORS / security headers (unchanged) ──────────────────────────────────────

@app.after_request
def add_security_and_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"]      = CORS_ALLOWED_ORIGIN
    response.headers["Access-Control-Allow-Headers"]     = "Content-Type, Authorization, X-CSRF-Token"
    response.headers["Access-Control-Allow-Methods"]     = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Vary"]                             = "Origin"
    response.headers["X-Content-Type-Options"]           = "nosniff"
    response.headers["X-Frame-Options"]                  = "DENY"
    response.headers["Referrer-Policy"]                  = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"]               = "geolocation=(), camera=(), microphone=()"
    return response


@app.route("/api/auth/<path:_unused>", methods=["OPTIONS"])
def cors_preflight(_unused):
    return "", 204


# ── Token helpers (unchanged logic, same signatures) ─────────────────────────

def make_access_token(user_row):
    payload = {
        "sub":  user_row["username"],
        "uid":  user_row["id"],
        "role": user_row["role"],
        "type": "access",
        "exp":  datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXP_MINUTES),
        "iat":  datetime.datetime.utcnow(),
    }
    return jwt.encode(payload, SHARED_SECRET, algorithm="HS256")


def _hash_token(raw_token):
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def issue_refresh_token(conn, user_id):
    raw_token  = secrets.token_urlsafe(48)
    now        = datetime.datetime.utcnow()
    expires_at = now + datetime.timedelta(days=REFRESH_TOKEN_EXP_DAYS)
    cur = get_cursor(conn)
    cur.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, created_at, expires_at) VALUES (%s, %s, %s, %s)",
        (user_id, _hash_token(raw_token), now.isoformat(), expires_at.isoformat()),
    )
    conn.commit()
    cur.close()
    return raw_token, expires_at


def revoke_refresh_token(conn, token_hash):
    cur = get_cursor(conn)
    cur.execute(
        "UPDATE refresh_tokens SET revoked_at = %s WHERE token_hash = %s AND revoked_at IS NULL",
        (datetime.datetime.utcnow().isoformat(), token_hash),
    )
    conn.commit()
    cur.close()


def find_valid_refresh_token(conn, raw_token):
    if not raw_token:
        return None
    token_hash = _hash_token(raw_token)
    cur = get_cursor(conn)
    cur.execute("SELECT * FROM refresh_tokens WHERE token_hash = %s", (token_hash,))
    row = cur.fetchone()
    cur.close()
    if not row:
        return None
    if row["revoked_at"] is not None:
        return None
    if datetime.datetime.fromisoformat(row["expires_at"]) < datetime.datetime.utcnow():
        return None
    return row


def decode_access_token():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SHARED_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload


def set_auth_cookies(response, raw_refresh_token, expires_at):
    max_age    = int((expires_at - datetime.datetime.utcnow()).total_seconds())
    response.set_cookie(REFRESH_COOKIE_NAME, raw_refresh_token, max_age=max_age,
                        httponly=True, secure=COOKIE_SECURE, samesite="Lax", path="/api/auth")
    csrf_value = secrets.token_urlsafe(24)
    response.set_cookie(CSRF_COOKIE_NAME, csrf_value, max_age=max_age,
                        httponly=False, secure=COOKIE_SECURE, samesite="Lax", path="/")
    return csrf_value


def clear_auth_cookies(response):
    response.set_cookie(REFRESH_COOKIE_NAME, "", expires=0, path="/api/auth")
    response.set_cookie(CSRF_COOKIE_NAME,    "", expires=0, path="/")


def check_csrf():
    cookie_value = request.cookies.get(CSRF_COOKIE_NAME)
    header_value = request.headers.get("X-CSRF-Token")
    return bool(cookie_value) and cookie_value == header_value


# ── Routes (only %s placeholders changed, logic identical) ───────────────────

@app.route("/health")
def health():
    return jsonify(status="ok", service="auth-service"), 200


@app.route("/api/auth/register", methods=["POST"])
def register():
    if not check_ip_rate_limit():
        return jsonify(error="too many requests, slow down"), 429

    data      = request.get_json(force=True) or {}
    username  = (data.get("username") or "").strip()
    password  = data.get("password") or ""
    email     = (data.get("email") or "").strip()
    full_name = (data.get("full_name") or "").strip()

    errors = {}
    if not username or len(username) < 3:
        errors["username"] = "username must be at least 3 characters"
    if not password or len(password) < 6:
        errors["password"] = "password must be at least 6 characters"
    if email and not EMAIL_RE.match(email):
        errors["email"] = "email is not a valid address"
    if errors:
        return jsonify(error="validation failed", fields=errors), 400

    conn = get_db()
    cur  = get_cursor(conn)
    cur.execute("SELECT id FROM users WHERE username = %s", (username,))
    if cur.fetchone():
        cur.close(); conn.close()
        return jsonify(error="username already taken", fields={"username": "already taken"}), 409

    password_hash = generate_password_hash(password)
    cur.execute(
        "INSERT INTO users (username, password_hash, email, full_name, address, role, created_at) VALUES (%s, %s, %s, %s, '', 'customer', %s)",
        (username, password_hash, email, full_name, datetime.datetime.utcnow().isoformat()),
    )
    conn.commit()
    cur.execute("SELECT * FROM users WHERE username = %s", (username,))
    row = cur.fetchone()
    cur.close()

    raw_refresh, expires_at = issue_refresh_token(conn, row["id"])
    conn.close()

    resp = make_response(jsonify(message="registered", token=make_access_token(row), user=user_to_dict(row)), 201)
    set_auth_cookies(resp, raw_refresh, expires_at)
    return resp


@app.route("/api/auth/login", methods=["POST"])
def login():
    if not check_ip_rate_limit():
        return jsonify(error="too many requests, slow down"), 429

    data     = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if username:
        locked, retry_after = is_account_locked(username)
        if locked:
            return jsonify(error=f"account temporarily locked, try again in {retry_after}s"), 423

    conn = get_db()
    cur  = get_cursor(conn)
    cur.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cur.fetchone()
    cur.close()

    if not user or not check_password_hash(user["password_hash"], password):
        conn.close()
        if username:
            record_failed_attempt(username)
        return jsonify(error="invalid username or password"), 401

    clear_failed_attempts(username)
    raw_refresh, expires_at = issue_refresh_token(conn, user["id"])
    conn.close()

    resp = make_response(jsonify(token=make_access_token(user), user=user_to_dict(user)), 200)
    set_auth_cookies(resp, raw_refresh, expires_at)
    return resp


@app.route("/api/auth/refresh", methods=["POST"])
def refresh():
    if not check_csrf():
        return jsonify(error="missing or invalid CSRF token"), 403

    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    conn = get_db()
    row  = find_valid_refresh_token(conn, raw_refresh)
    if not row:
        conn.close()
        return jsonify(error="missing or expired refresh token"), 401

    cur = get_cursor(conn)
    cur.execute("SELECT * FROM users WHERE id = %s", (row["user_id"],))
    user = cur.fetchone()
    cur.close()
    if not user:
        conn.close()
        return jsonify(error="user not found"), 404

    revoke_refresh_token(conn, row["token_hash"])
    raw_new_refresh, expires_at = issue_refresh_token(conn, user["id"])
    conn.close()

    resp = make_response(jsonify(token=make_access_token(user), user=user_to_dict(user)), 200)
    set_auth_cookies(resp, raw_new_refresh, expires_at)
    return resp


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    if not check_csrf():
        return jsonify(error="missing or invalid CSRF token"), 403
    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if raw_refresh:
        conn = get_db()
        revoke_refresh_token(conn, _hash_token(raw_refresh))
        conn.close()
    resp = make_response(jsonify(message="logged out"), 200)
    clear_auth_cookies(resp)
    return resp


@app.route("/api/auth/me", methods=["GET"])
def me():
    payload = decode_access_token()
    if not payload:
        return jsonify(error="missing or invalid bearer token"), 401

    conn = get_db()
    cur  = get_cursor(conn)
    cur.execute("SELECT * FROM users WHERE id = %s", (payload["uid"],))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        return jsonify(error="user not found"), 404
    return jsonify(user_to_dict(row)), 200


@app.route("/api/auth/profile", methods=["PUT"])
def update_profile():
    payload = decode_access_token()
    if not payload:
        return jsonify(error="missing or invalid bearer token"), 401

    data      = request.get_json(force=True) or {}
    email     = data.get("email")
    full_name = data.get("full_name")
    address   = data.get("address")

    if email is not None and email != "" and not EMAIL_RE.match(email):
        return jsonify(error="validation failed", fields={"email": "email is not a valid address"}), 400

    conn = get_db()
    cur  = get_cursor(conn)
    cur.execute("SELECT * FROM users WHERE id = %s", (payload["uid"],))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return jsonify(error="user not found"), 404

    cur.execute(
        """
        UPDATE users SET
            email     = COALESCE(%s, email),
            full_name = COALESCE(%s, full_name),
            address   = COALESCE(%s, address)
        WHERE id = %s
        """,
        (email, full_name, address, payload["uid"]),
    )
    conn.commit()
    cur.execute("SELECT * FROM users WHERE id = %s", (payload["uid"],))
    row = cur.fetchone()
    cur.close(); conn.close()
    return jsonify(user_to_dict(row)), 200


@app.route("/api/auth/change-password", methods=["POST"])
def change_password():
    payload = decode_access_token()
    if not payload:
        return jsonify(error="missing or invalid bearer token"), 401

    data             = request.get_json(force=True) or {}
    current_password = data.get("current_password") or ""
    new_password     = data.get("new_password") or ""

    if not new_password or len(new_password) < 6:
        return jsonify(error="validation failed", fields={"new_password": "must be at least 6 characters"}), 400

    conn = get_db()
    cur  = get_cursor(conn)
    cur.execute("SELECT * FROM users WHERE id = %s", (payload["uid"],))
    row = cur.fetchone()
    if not row or not check_password_hash(row["password_hash"], current_password):
        cur.close(); conn.close()
        return jsonify(error="current password is incorrect"), 401

    cur.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                (generate_password_hash(new_password), payload["uid"]))
    cur.execute(
        "UPDATE refresh_tokens SET revoked_at = %s WHERE user_id = %s AND revoked_at IS NULL",
        (datetime.datetime.utcnow().isoformat(), payload["uid"]),
    )
    conn.commit()
    cur.close(); conn.close()
    return jsonify(message="password updated"), 200


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5001)