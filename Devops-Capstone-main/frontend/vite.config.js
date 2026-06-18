import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-time reverse proxy: the frontend (http://localhost:5173) calls /api/*
// as if it were same-origin, and Vite forwards each path to the right
// backend service. This keeps the browser's view of the app to a single
// origin, which is what makes the httpOnly refresh-token cookie work
// correctly (SameSite=Lax cookies aren't sent on cross-origin XHR/fetch) and
// avoids needing permissive CORS. It also mirrors the production shape:
// the Kubernetes Ingress (a student-built piece, see k8s/ingress.yaml) does
// the same path-based routing to the same three services behind one host.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api/auth": {
        target: process.env.VITE_AUTH_URL || "http://localhost:5001",
        changeOrigin: true,
      },
      "/api/products": {
        target: process.env.VITE_CATALOG_URL || "http://localhost:5002",
        changeOrigin: true,
      },
      "/api/categories": {
        target: process.env.VITE_CATALOG_URL || "http://localhost:5002",
        changeOrigin: true,
      },
      "/api/orders": {
        target: process.env.VITE_ORDERS_URL || "http://localhost:5003",
        changeOrigin: true,
      },
    },
  },
});
