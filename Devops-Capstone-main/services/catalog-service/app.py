"""
catalog-service
Migrated from SQLite to PostgreSQL.
All ? placeholders replaced with %s. sqlite3 replaced with psycopg2.
Everything else is identical to the original.
"""
import os
import math

import jwt
import psycopg2
import psycopg2.extras
from flask import Flask, jsonify, request

app = Flask(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://marketly:marketly_dev@localhost:5432/catalog_db"
)
SHARED_SECRET     = os.environ.get("SHARED_SECRET", "dev-shared-secret-change-me")
CORS_ALLOWED_ORIGIN = os.environ.get("CORS_ALLOWED_ORIGIN", "http://localhost:5173")

SORT_COLUMNS = {
    "price_asc":  "price ASC",
    "price_desc": "price DESC",
    "name":       "name ASC",
    "newest":     "id DESC",
}

SEED_PRODUCTS = [
    ("Mechanical Keyboard",       "Tactile brown switches, USB-C, hot-swappable.",              89.99,  25, "Peripherals", "https://picsum.photos/seed/keyboard/480/360"),
    ("27-inch Monitor",           "1440p IPS panel, 144Hz, USB-C with 65W PD.",                249.50, 12, "Monitors",    "https://picsum.photos/seed/monitor/480/360"),
    ("Webcam 1080p",              "Autofocus, built-in dual mic, privacy shutter.",              39.99,  40, "Peripherals", "https://picsum.photos/seed/webcam/480/360"),
    ("USB-C Dock",                "HDMI 4K, 3x USB-A, Gigabit Ethernet, 100W PD passthrough.", 59.00,  18, "Accessories", "https://picsum.photos/seed/dock/480/360"),
    ("Standing Desk",             "Electric height adjust, memory presets, 70kg capacity.",    399.00,   5, "Furniture",   "https://picsum.photos/seed/desk/480/360"),
    ("Ergonomic Chair",           "Mesh back, adjustable lumbar support and armrests.",         219.00,   8, "Furniture",   "https://picsum.photos/seed/chair/480/360"),
    ("Wireless Mouse",            "2.4GHz + Bluetooth, 4000 DPI, rechargeable.",                29.99,  60, "Peripherals", "https://picsum.photos/seed/mouse/480/360"),
    ("Noise-Cancelling Headphones","ANC, 30-hour battery, USB-C fast charge.",                 179.00,  15, "Audio",       "https://picsum.photos/seed/headphones/480/360"),
    ("Laptop Stand",              "Aluminum, adjustable height, foldable.",                     34.50,  33, "Accessories", "https://picsum.photos/seed/laptopstand/480/360"),
    ("Portable SSD 1TB",          "USB 3.2 Gen 2, up to 1050MB/s read.",                       99.00,  22, "Storage",     "https://picsum.photos/seed/ssd/480/360"),
    ("4K Webcam Ring Light",      "Adjustable brightness and color temperature clip light.",    24.99,  45, "Accessories", "https://picsum.photos/seed/ringlight/480/360"),
    ("Mechanical Numpad",         "Compact 21-key hot-swappable numpad.",                       39.00,  27, "Peripherals", "https://picsum.photos/seed/numpad/480/360"),
]


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
    return response


@app.route("/api/products",              methods=["OPTIONS"])
@app.route("/api/products/<int:_unused>",methods=["OPTIONS"])
@app.route("/api/products/<int:_unused>/stock", methods=["OPTIONS"])
@app.route("/api/categories",            methods=["OPTIONS"])
def cors_preflight(_unused=None):
    return "", 204


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_db():
    return psycopg2.connect(DATABASE_URL)


def get_cursor(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def init_db():
    conn = get_db()
    cur  = get_cursor(conn)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id          SERIAL PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT,
            price       NUMERIC(10,2) NOT NULL,
            stock       INTEGER NOT NULL DEFAULT 0,
            category    TEXT NOT NULL DEFAULT 'General',
            image_url   TEXT DEFAULT ''
        )
    """)
    conn.commit()

    cur.execute("SELECT COUNT(*) AS c FROM products")
    if cur.fetchone()["c"] == 0:
        psycopg2.extras.execute_values(
            cur,
            "INSERT INTO products (name, description, price, stock, category, image_url) VALUES %s",
            SEED_PRODUCTS,
        )
        conn.commit()

    cur.close()
    conn.close()


def row_to_dict(row):
    return {
        "id":          row["id"],
        "name":        row["name"],
        "description": row["description"],
        "price":       float(row["price"]),
        "stock":       row["stock"],
        "category":    row["category"],
        "image_url":   row["image_url"],
    }


def require_admin():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SHARED_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("role") != "admin":
        return None
    return payload


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify(status="ok", service="catalog-service"), 200


@app.route("/api/categories", methods=["GET"])
def list_categories():
    conn = get_db()
    cur  = get_cursor(conn)
    cur.execute("SELECT DISTINCT category FROM products ORDER BY category")
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify([r["category"] for r in rows]), 200


@app.route("/api/products", methods=["GET"])
def list_products():
    q        = (request.args.get("q") or "").strip()
    category = (request.args.get("category") or "").strip()
    sort     = request.args.get("sort", "newest")
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        page_size = min(48, max(1, int(request.args.get("page_size", 12))))
    except ValueError:
        page_size = 12

    where  = []
    params = []
    if q:
        where.append("(name ILIKE %s OR description ILIKE %s)")
        params += [f"%{q}%", f"%{q}%"]
    if category:
        where.append("category = %s")
        params.append(category)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    order_sql = SORT_COLUMNS.get(sort, SORT_COLUMNS["newest"])

    conn = get_db()
    cur  = get_cursor(conn)

    cur.execute(f"SELECT COUNT(*) AS c FROM products {where_sql}", params)
    total = cur.fetchone()["c"]

    cur.execute(
        f"SELECT * FROM products {where_sql} ORDER BY {order_sql} LIMIT %s OFFSET %s",
        params + [page_size, (page - 1) * page_size],
    )
    rows = cur.fetchall()
    cur.close(); conn.close()

    return jsonify(
        items=[row_to_dict(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size)),
    ), 200


@app.route("/api/products/<int:product_id>", methods=["GET"])
def get_product(product_id):
    conn = get_db()
    cur  = get_cursor(conn)
    cur.execute("SELECT * FROM products WHERE id = %s", (product_id,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        return jsonify(error="product not found"), 404
    return jsonify(row_to_dict(row)), 200


@app.route("/api/products", methods=["POST"])
def create_product():
    if not require_admin():
        return jsonify(error="admin role required"), 403

    data  = request.get_json(force=True) or {}
    name  = (data.get("name") or "").strip()
    price = data.get("price")
    if not name:
        return jsonify(error="validation failed", fields={"name": "required"}), 400
    if price is None or float(price) < 0:
        return jsonify(error="validation failed", fields={"price": "must be a non-negative number"}), 400

    conn = get_db()
    cur  = get_cursor(conn)
    cur.execute(
        "INSERT INTO products (name, description, price, stock, category, image_url) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
        (name, data.get("description",""), float(price), int(data.get("stock",0)),
         data.get("category","General"), data.get("image_url","")),
    )
    new_id = cur.fetchone()["id"]
    conn.commit()
    cur.execute("SELECT * FROM products WHERE id = %s", (new_id,))
    row = cur.fetchone()
    cur.close(); conn.close()
    return jsonify(row_to_dict(row)), 201


@app.route("/api/products/<int:product_id>", methods=["PUT"])
def update_product(product_id):
    if not require_admin():
        return jsonify(error="admin role required"), 403

    conn = get_db()
    cur  = get_cursor(conn)
    cur.execute("SELECT * FROM products WHERE id = %s", (product_id,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return jsonify(error="product not found"), 404

    data = request.get_json(force=True) or {}
    cur.execute(
        "UPDATE products SET name=%s, description=%s, price=%s, stock=%s, category=%s, image_url=%s WHERE id=%s",
        (
            data.get("name",        row["name"]),
            data.get("description", row["description"]),
            float(data.get("price", row["price"])),
            int(data.get("stock",   row["stock"])),
            data.get("category",    row["category"]),
            data.get("image_url",   row["image_url"]),
            product_id,
        ),
    )
    conn.commit()
    cur.execute("SELECT * FROM products WHERE id = %s", (product_id,))
    row = cur.fetchone()
    cur.close(); conn.close()
    return jsonify(row_to_dict(row)), 200


@app.route("/api/products/<int:product_id>", methods=["DELETE"])
def delete_product(product_id):
    if not require_admin():
        return jsonify(error="admin role required"), 403

    conn = get_db()
    cur  = get_cursor(conn)
    cur.execute("SELECT id FROM products WHERE id = %s", (product_id,))
    if not cur.fetchone():
        cur.close(); conn.close()
        return jsonify(error="product not found"), 404
    cur.execute("DELETE FROM products WHERE id = %s", (product_id,))
    conn.commit()
    cur.close(); conn.close()
    return jsonify(message="deleted"), 200


@app.route("/api/products/<int:product_id>/stock", methods=["PATCH"])
def adjust_stock(product_id):
    data  = request.get_json(force=True) or {}
    delta = data.get("delta")
    if delta is None:
        return jsonify(error="delta is required"), 400

    conn = get_db()
    cur  = get_cursor(conn)
    cur.execute("SELECT * FROM products WHERE id = %s", (product_id,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return jsonify(error="product not found"), 404

    new_stock = row["stock"] + int(delta)
    if new_stock < 0:
        cur.close(); conn.close()
        return jsonify(error="insufficient stock"), 409

    cur.execute("UPDATE products SET stock = %s WHERE id = %s", (new_stock, product_id))
    conn.commit()
    cur.execute("SELECT * FROM products WHERE id = %s", (product_id,))
    row = cur.fetchone()
    cur.close(); conn.close()
    return jsonify(row_to_dict(row)), 200


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5002)