# frontend — Marketly

React (Vite) + Tailwind CSS single-page app for Marketly: catalog browsing
with search, filtering, sorting and pagination; cart and checkout; login/
register; order history with cancellation; profile management; and an admin
area for managing products and order statuses. Talks to the three backend
microservices through a same-origin Vite dev proxy — no server-side
rendering, no backend-for-frontend layer.

This app is fully built — there is no remaining frontend work for students.
The infrastructure to deploy it (Docker, Kubernetes, Terraform, CI/CD) is the
actual assignment; see the root `README.md` and `PROJECT_BRIEF.md`.

## Auth model (what's different from a typical capstone)

The frontend never stores a token in `localStorage`. Instead:

- The access token returned by login/register/refresh lives only in memory
  (`src/api/tokenStore.js`), cleared on tab close.
- A `axios` response interceptor (`src/api/client.js`) silently calls
  `/api/auth/refresh` on a 401, retries the original request once, and signs
  the user out only if the refresh itself fails. Refresh relies on an
  `httpOnly` cookie the JS can't read, so this works without touching
  storage.
- State-changing cookie-authenticated calls (`refresh`, `logout`) also send
  an `X-CSRF-Token` header read from a (non-`httpOnly`) CSRF cookie — see
  `services/auth-service/README.md` for the full rationale.
- `AuthContext` bootstraps a session on page load by attempting a refresh,
  not by reading a stored token.

## Run standalone

```bash
npm install
cp .env.example .env   # adjust ports if your services run elsewhere
npm run dev
```

Opens on `http://localhost:5173`. Requires all three backend services
running (see `services/*/README.md`) — auth on :5001, catalog on :5002,
orders on :5003. The Vite dev server proxies `/api/auth`, `/api/products`,
`/api/categories`, and `/api/orders` to those services so the browser sees
everything as same-origin — this is required for the refresh cookie to be
sent on cross-service calls, and it mirrors the path-based routing a
Kubernetes Ingress will do in front of the real deployment.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_AUTH_URL` | `http://localhost:5001` | Dev-proxy target for auth-service |
| `VITE_CATALOG_URL` | `http://localhost:5002` | Dev-proxy target for catalog-service |
| `VITE_ORDERS_URL` | `http://localhost:5003` | Dev-proxy target for orders-service |

When deploying behind a Kubernetes Ingress, the Ingress takes over this
path-based routing and these dev-proxy targets are no longer used — that
wiring is part of the infrastructure assignment, not something this app
needs to know about.

## Structure

```
src/
  api/
    tokenStore.js     in-memory access-token/user store (no localStorage)
    client.js          shared axios instance: attaches bearer token, CSRF
                        header, and silently refreshes on 401
    auth.js             register, login, logout, refresh, me, updateProfile, changePassword
    catalog.js          listProducts, getProduct, listCategories, create/update/deleteProduct (admin)
    orders.js           createOrder, listOrders, getOrder, cancelOrder, listAllOrders/updateOrderStatus (admin)
  context/
    AuthContext.jsx    subscribes to tokenStore; bootstraps session via refresh on load
    CartContext.jsx    cart persisted to localStorage, quantity capped at product stock
  components/
    Navbar, ProtectedRoute, AdminRoute, ProductCard, StatusBadge,
    Skeletons, EmptyState, Pagination
  pages/
    Catalog, ProductDetail, Cart, Orders, Profile, Login, Register, NotFound
    admin/AdminProducts, admin/AdminOrders
```

## Design system

An original, shadcn/ui-inspired design system lives in `tailwind.config.js`
(`ink` neutral scale, `brand` accent scale, custom shadows) and
`src/styles.css` (`.btn-*`, `.card`, `.card-hover`, `.input-field`, etc.).
No third-party template code was copied — the components were built from
scratch using common, non-proprietary UI patterns.

## Build for production

```bash
npm run build
```

Outputs static files to `dist/` — this is what the frontend Dockerfile
(currently empty, a student task) should build and serve, typically via
Nginx.
