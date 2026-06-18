# auth-service

Owns user accounts and session security for Marketly: registration, login,
profile management, and a production-style token/session model — access
tokens, rotating refresh tokens, CSRF protection, rate limiting, and account
lockout. catalog-service and orders-service verify access tokens locally
(shared secret, HS256) without calling back into this service.

## Run standalone

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Listens on `http://localhost:5001`. On first run it seeds an admin account
(`admin` / `admin1234` by default — override with `ADMIN_SEED_USERNAME` /
`ADMIN_SEED_PASSWORD` / `ADMIN_SEED_EMAIL`) and a demo customer account
(`demo` / `demo1234` by default — override with `DEMO_SEED_USERNAME` /
`DEMO_SEED_PASSWORD` / `DEMO_SEED_EMAIL`) so the regular customer flow can be
tested without registering a new account first.

## Session model

- **Access token** — short-lived (15 min) JWT, returned in the response
  body only. The frontend keeps it in memory (never `localStorage`) and
  attaches it as `Authorization: Bearer <token>`.
- **Refresh token** — long-lived (30 days), a random opaque string (not a
  JWT). It's stored server-side as a SHA-256 hash and delivered to the
  browser as an `httpOnly`, `SameSite=Lax` cookie (`marketly_refresh_token`),
  so client-side JS can never read it.
- **Rotation** — every call to `/api/auth/refresh` revokes the refresh
  token it was given and issues a new one. If a stolen token is replayed
  after the legitimate user has already refreshed, the replay fails because
  the token was already revoked — this surfaces token theft as a visible
  failure rather than silently allowing two valid sessions.
- **CSRF protection** — a companion non-`httpOnly` cookie
  (`marketly_csrf_token`) holds a value the frontend must echo back as an
  `X-CSRF-Token` header on `/api/auth/refresh` and `/api/auth/logout`
  (the double-submit cookie pattern). A cross-site page can trigger the
  cookie-authenticated request but cannot read the cookie to forge the
  matching header, so the request is rejected.
- **Rate limiting + lockout** — an in-memory sliding window throttles
  requests per IP (`RATE_LIMIT_MAX_REQUESTS` per `RATE_LIMIT_WINDOW_SECONDS`),
  and repeated failed logins for one username trigger a temporary lockout
  (`LOGIN_MAX_ATTEMPTS` within `LOGIN_ATTEMPT_WINDOW_MINUTES`, locked for
  `LOGIN_LOCKOUT_MINUTES`). This is intentionally dependency-free (no Redis)
  since the service runs as a single process; it resets on restart.

Email verification and password-reset flows are intentionally out of scope —
they require an external mail provider, which is outside what this
single-process teaching service depends on.

## Endpoints

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/health` | - | health check |
| POST | `/api/auth/register` | `{username, password, email?, full_name?}` | username >= 3 chars, password >= 6 chars; sets refresh+CSRF cookies; returns `{token, user}` |
| POST | `/api/auth/login` | `{username, password}` | rate-limited and lockout-protected; sets refresh+CSRF cookies; returns `{token, user}` |
| POST | `/api/auth/refresh` | - | reads the refresh cookie, rotates it, returns a new `{token, user}` |
| POST | `/api/auth/logout` | - | requires `X-CSRF-Token` header matching the CSRF cookie; revokes the refresh token and clears cookies |
| GET | `/api/auth/me` | - | requires `Authorization: Bearer <access token>`; returns the full profile |
| PUT | `/api/auth/profile` | `{email?, full_name?, address?}` | requires bearer access token; updates the caller's own profile |
| POST | `/api/auth/change-password` | `{current_password, new_password}` | requires bearer access token; revokes all of the user's refresh tokens on success, signing out other sessions |

`user` objects look like:

```json
{"id": 1, "username": "student1", "email": "", "full_name": "", "address": "", "role": "customer", "created_at": "..."}
```

`role` is either `customer` or `admin`. It's embedded in the access token
payload so catalog-service and orders-service can authorize admin-only
actions (product management, order status updates) without an extra
network call.

## Environment variables

- `AUTH_DB_PATH` — path to SQLite file (default: `users.db` next to app.py)
- `SHARED_SECRET` — JWT signing secret for access tokens. **Must be the
  same value** on catalog-service and orders-service since they verify
  tokens without calling auth-service.
- `ADMIN_SEED_USERNAME` / `ADMIN_SEED_PASSWORD` / `ADMIN_SEED_EMAIL` —
  credentials for the auto-seeded admin account (default `admin` /
  `admin1234` / `admin@example.com`).
- `DEMO_SEED_USERNAME` / `DEMO_SEED_PASSWORD` / `DEMO_SEED_EMAIL` —
  credentials for the auto-seeded demo customer account (default `demo` /
  `demo1234` / `demo@example.com`).
- `CORS_ALLOWED_ORIGIN` — the single origin allowed to make
  credentialed requests (default `http://localhost:5173`). Wildcard CORS
  is not used because cookies require an explicit origin.
- `COOKIE_SECURE` — set to `true` once served over HTTPS so cookies are
  marked `Secure` (default `false` for local HTTP development).
- `ACCESS_TOKEN_EXP_MINUTES` (default `15`), `REFRESH_TOKEN_EXP_DAYS`
  (default `30`) — token lifetimes.
- `LOGIN_MAX_ATTEMPTS` (default `5`), `LOGIN_LOCKOUT_MINUTES` (default `15`),
  `LOGIN_ATTEMPT_WINDOW_MINUTES` (default `15`) — account lockout tuning.
- `RATE_LIMIT_WINDOW_SECONDS` (default `60`), `RATE_LIMIT_MAX_REQUESTS`
  (default `20`) — per-IP rate limit tuning.
