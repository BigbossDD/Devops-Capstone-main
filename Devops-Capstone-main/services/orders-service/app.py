"""
orders-service
Owns its own SQLite database (orders.db). Verifies JWTs locally using the
same SHARED_SECRET as auth-service (no network call needed to authenticate).

For every order line item it calls catalog-service over HTTP to confirm the
product exists, to use its authoritative current price (never trusts a price
sent by the client), and to decrement stock — this is the cross-service call
students should study and reproduce for other features. Cancelling an order
restores stock the same way.

Run standalone:
    python -m venv venv && source venv/bin/activate
    pip install -r requirements.txt
    python app.py
Listens on :5003. Requires catalog-service running (default http://localhost:5002).
"""
import os
import sqlite3
import datetime
import json

import jwt
import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

DB_PATH = os.environ.get("ORDERS_DB_PATH", os.path.join(os.path.dirname(__file__), "orders.db"))
SHARED_SECRET = os.environ.get("SHARED_SECRET", "dev-shared-secret-change-me")
CATALOG_SERVICE_URL = os.environ.get("CATALOG_SERVICE_URL", "http://localhost:5002")
CORS_ALLOWED_ORIGIN = os.environ.get("CORS_ALLOWED_ORIGIN", "http://localhost:5173")

VALID_STATUSES = ["pending", "shipped", "delivered", "cancelled"]


@app.after_request
def add_security_and_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = CORS_ALLOWED_ORIGIN
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-CSRF-Token"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Vary"] = "Origin"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.route("/api/orders", methods=["OPTIONS"])
@app.route("/api/orders/<int:_unused>", methods=["OPTIONS"])
@app.route("/api/orders/<int:_unused>/cancel", methods=["OPTIONS"])
@app.route("/api/orders/<int:_unused>/status", methods=["OPTIONS"])
@app.route("/api/orders/all", methods=["OPTIONS"])
def cors_preflight(_unused=None):
    return "", 204


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            items_json TEXT NOT NULL,
            total REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    existing_cols = {row["name"] for row in conn.execute("PRAGMA table_info(orders)")}
    if "status" not in existing_cols:
        conn.execute("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'")
    if "updated_at" not in existing_cols:
        conn.execute("ALTER TABLE orders ADD COLUMN updated_at TEXT")
    conn.commit()
    conn.close()


def decode_token():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        return jwt.decode(token, SHARED_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def require_user():
    """Returns the username from a valid bearer token, or None."""
    payload = decode_token()
    return payload.get("sub") if payload else None


def require_admin():
    payload = decode_token()
    if not payload or payload.get("role") != "admin":
        return None
    return payload


def order_to_dict(row):
    return {
        "id": row["id"],
        "username": row["username"],
        "items": json.loads(row["items_json"]),
        "total": row["total"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def adjust_catalog_stock(product_id, delta):
    """Best-effort call to catalog-service to decrement/restore stock.
    Raises on failure so the caller can roll back the order it just made."""
    resp = requests.patch(
        f"{CATALOG_SERVICE_URL}/api/products/{product_id}/stock",
        json={"delta": delta},
        timeout=5,
    )
    resp.raise_for_status()
    return resp.json()


@app.route("/health")
def health():
    return jsonify(status="ok", service="orders-service"), 200


@app.route("/api/orders", methods=["POST"])
def create_order():
    username = require_user()
    if not username:
        return jsonify(error="missing or invalid bearer token"), 401

    data = request.get_json(force=True) or {}
    requested_items = data.get("items", [])  # [{product_id, quantity}]
    if not requested_items:
        return jsonify(error="items is required and must be non-empty"), 400

    order_items = []
    total = 0.0
    decremented = []  # track what we've already deducted, to roll back on failure

    for item in requested_items:
        product_id = item.get("product_id")
        quantity = item.get("quantity", 1)
        try:
            resp = requests.get(f"{CATALOG_SERVICE_URL}/api/products/{product_id}", timeout=5)
        except requests.RequestException as e:
            _rollback(decremented)
            return jsonify(error=f"catalog-service unreachable: {e}"), 502

        if resp.status_code == 404:
            _rollback(decremented)
            return jsonify(error=f"product {product_id} not found"), 400
        if resp.status_code != 200:
            _rollback(decremented)
            return jsonify(error="catalog-service error"), 502

        product = resp.json()
        if product["stock"] < quantity:
            _rollback(decremented)
            return jsonify(error=f"insufficient stock for {product['name']}"), 400

        # Reserve stock now so two concurrent checkouts can't both succeed
        # against the same last unit.
        try:
            adjust_catalog_stock(product_id, -quantity)
            decremented.append((product_id, quantity))
        except requests.RequestException as e:
            _rollback(decremented)
            return jsonify(error=f"could not reserve stock: {e}"), 502

        line_total = product["price"] * quantity
        total += line_total
        order_items.append(
            {
                "product_id": product["id"],
                "name": product["name"],
                "unit_price": product["price"],
                "quantity": quantity,
                "line_total": line_total,
            }
        )

    now = datetime.datetime.utcnow().isoformat()
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO orders (username, items_json, total, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)",
        (username, json.dumps(order_items), total, now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()

    return jsonify(order_to_dict(row)), 201


def _rollback(decremented):
    for product_id, quantity in decremented:
        try:
            adjust_catalog_stock(product_id, quantity)
        except requests.RequestException:
            pass  # best effort — nothing more we can do here


@app.route("/api/orders", methods=["GET"])
def list_orders():
    username = require_user()
    if not username:
        return jsonify(error="missing or invalid bearer token"), 401

    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM orders WHERE username = ? ORDER BY id DESC", (username,)
    ).fetchall()
    conn.close()
    return jsonify([order_to_dict(r) for r in rows]), 200


@app.route("/api/orders/<int:order_id>", methods=["GET"])
def get_order(order_id):
    username = require_user()
    if not username:
        return jsonify(error="missing or invalid bearer token"), 401

    conn = get_db()
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    conn.close()
    if not row or row["username"] != username:
        return jsonify(error="order not found"), 404
    return jsonify(order_to_dict(row)), 200


@app.route("/api/orders/<int:order_id>/cancel", methods=["PATCH"])
def cancel_order(order_id):
    username = require_user()
    if not username:
        return jsonify(error="missing or invalid bearer token"), 401

    conn = get_db()
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not row or row["username"] != username:
        conn.close()
        return jsonify(error="order not found"), 404
    if row["status"] != "pending":
        conn.close()
        return jsonify(error=f"cannot cancel an order with status '{row['status']}'"), 409

    for item in json.loads(row["items_json"]):
        try:
            adjust_catalog_stock(item["product_id"], item["quantity"])
        except requests.RequestException:
            pass  # stock restore is best-effort; cancellation still proceeds

    now = datetime.datetime.utcnow().isoformat()
    conn.execute("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?", (now, order_id))
    conn.commit()
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    conn.close()
    return jsonify(order_to_dict(row)), 200


@app.route("/api/orders/all", methods=["GET"])
def list_all_orders():
    if not require_admin():
        return jsonify(error="admin role required"), 403

    conn = get_db()
    rows = conn.execute("SELECT * FROM orders ORDER BY id DESC").fetchall()
    conn.close()
    return jsonify([order_to_dict(r) for r in rows]), 200


@app.route("/api/orders/<int:order_id>/status", methods=["PATCH"])
def set_order_status(order_id):
    if not require_admin():
        return jsonify(error="admin role required"), 403

    data = request.get_json(force=True) or {}
    new_status = data.get("status")
    if new_status not in VALID_STATUSES:
        return jsonify(error=f"status must be one of {VALID_STATUSES}"), 400

    conn = get_db()
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify(error="order not found"), 404

    now = datetime.datetime.utcnow().isoformat()
    conn.execute("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", (new_status, now, order_id))
    conn.commit()
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    conn.close()
    return jsonify(order_to_dict(row)), 200


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5003)
