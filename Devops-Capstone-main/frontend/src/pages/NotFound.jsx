import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Error 404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tightish text-ink-950">Page not found</h1>
      <p className="mt-2 text-ink-500">The page you're looking for doesn't exist.</p>
      <Link className="btn-primary mt-6 inline-block" to="/">
        Back home
      </Link>
    </div>
  );
}
