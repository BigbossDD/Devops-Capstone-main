import React from "react";
import { Link } from "react-router-dom";

const COLUMNS = [
  {
    heading: "Shop",
    links: [
      { label: "All products", to: "/" },
      { label: "Your cart", to: "/cart" },
      { label: "Order history", to: "/orders" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Profile", to: "/profile" },
      { label: "Log in", to: "/login" },
      { label: "Register", to: "/register" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="page-container py-12">
        <div className="grid gap-10 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-ink-950">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink-950 text-[12px] font-bold text-white">
                M
              </span>
              Marketly
            </Link>
            <p className="mt-3 max-w-xs text-sm text-ink-500">
              A focused, fast shopping experience — built as a teaching
              capstone for full-stack and infrastructure practice.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                {col.heading}
              </p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-sm text-ink-600 hover:text-ink-950">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-ink-200 pt-6 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Marketly. All rights reserved.</p>
          <p>Built with React, Flask &amp; a single shared sense of taste.</p>
        </div>
      </div>
    </footer>
  );
}
