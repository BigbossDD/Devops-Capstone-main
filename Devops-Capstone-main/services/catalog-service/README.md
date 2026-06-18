# catalog-service

Owns the product catalog. Read endpoints are public; write endpoints and the
internal stock-adjustment endpoint require an admin JWT, verified locally
with the same `SHARED_SECRET` auth-service signs with.

## Run standalone

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Listens on `http://localhost:5002`. Seeds 12 sample products across 5
categories on first run.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | - | health check |
| GET | `/api/categories` | - | distinct category names |
| GET | `/api/products` | - | query params: `q`, `category`, `sort` (`price_asc`\|`price_desc`\|`name`\|`newest`), `page`, `page_size`; returns `{items, total, page, page_size, total_pages}` |
| GET | `/api/products/<id>` | - | single product |
| POST | `/api/products` | admin | create a product |
| PUT | `/api/products/<id>` | admin | update a product |
| DELETE | `/api/products/<id>` | admin | delete a product |
| PATCH | `/api/products/<id>/stock` | internal | `{delta}` — positive to restore stock (cancelled order), negative to decrement (new order); called by orders-service |

## Environment variables

- `CATALOG_DB_PATH` — path to SQLite file (default: `catalog.db` next to app.py)
- `SHARED_SECRET` — JWT verification secret. **Must match** auth-service's
  value so admin tokens issued by auth-service are accepted here.
