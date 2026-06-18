# orders-service

Owns order data. Authenticates requests by decoding the JWT locally (same
`SHARED_SECRET` as auth-service — no network round trip needed just to check
who's logged in). For every order it places a real HTTP call to
catalog-service to confirm the product exists, to price it using
catalog-service's data (never the client's), and to decrement stock.
Cancelling an order restores that stock the same way.

## Run standalone

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Listens on `http://localhost:5003`. Requires catalog-service reachable at
`CATALOG_SERVICE_URL` (default `http://localhost:5002`).

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | - | health check |
| POST | `/api/orders` | bearer token | `{items: [{product_id, quantity}]}` — creates a `pending` order, decrements catalog stock |
| GET | `/api/orders` | bearer token | caller's own orders |
| GET | `/api/orders/<id>` | bearer token | caller's own order detail |
| PATCH | `/api/orders/<id>/cancel` | bearer token | only while `status` is `pending`; restores stock |
| GET | `/api/orders/all` | admin | every order, any user |
| PATCH | `/api/orders/<id>/status` | admin | `{status}` — one of `pending`, `shipped`, `delivered`, `cancelled` |

## Environment variables

- `ORDERS_DB_PATH` — path to SQLite file (default: `orders.db` next to app.py)
- `SHARED_SECRET` — **must match auth-service's `SHARED_SECRET`**
- `CATALOG_SERVICE_URL` — base URL of catalog-service (default `http://localhost:5002`)
