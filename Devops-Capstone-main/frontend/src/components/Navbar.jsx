import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useCart } from "../context/CartContext.jsx";

function CartIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 4h2l1.6 9.6a2 2 0 0 0 2 1.7h8a2 2 0 0 0 2-1.6L20 8H6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="20" r="1.3" fill="currentColor" />
      <circle cx="17" cy="20" r="1.3" fill="currentColor" />
    </svg>
  );
}

function UserIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 19.5c1.2-3.2 4-5 7-5s5.8 1.8 7 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon({ className, open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await logout();
    setMobileOpen(false);
    navigate("/login");
  }

  const navLinks = [
    { to: "/", label: "Shop" },
    ...(user ? [{ to: "/orders", label: "Orders" }] : []),
    ...(isAdmin ? [{ to: "/admin/products", label: "Products" }] : []),
    ...(isAdmin ? [{ to: "/admin/orders", label: "Order queue" }] : []),
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/90 backdrop-blur-md">
      <nav className="page-container flex h-14 items-center justify-between gap-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tightish text-ink-950"
          onClick={() => setMobileOpen(false)}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink-950 text-[12px] font-bold text-white">
            M
          </span>
          Marketly
        </Link>

        <div className="hidden items-center gap-6 text-[13px] font-medium text-ink-500 md:flex">
          {navLinks.map((link) => (
            <Link key={link.to} to={link.to} className="transition hover:text-ink-950">
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-1 md:flex">
          <Link
            to="/cart"
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-ink-600 transition hover:bg-ink-100 hover:text-ink-950"
            aria-label="Cart"
          >
            <CartIcon className="h-[18px] w-[18px]" />
            {count > 0 && (
              <span className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>
          {user ? (
            <>
              <Link
                to="/profile"
                className="flex h-9 w-9 items-center justify-center rounded-md text-ink-600 transition hover:bg-ink-100 hover:text-ink-950"
                aria-label={`Signed in as ${user.username}`}
                title={user.username}
              >
                <UserIcon className="h-[18px] w-[18px]" />
              </Link>
              <button className="btn-secondary btn-sm ml-1" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost btn-sm">
                Log in
              </Link>
              <Link to="/register" className="btn-primary btn-sm">
                Sign up
              </Link>
            </>
          )}
        </div>

        <button
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-600 hover:bg-ink-100 md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <MenuIcon className="h-5 w-5" open={mobileOpen} />
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-t border-ink-200 bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-md px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/cart"
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
              onClick={() => setMobileOpen(false)}
            >
              Cart {count > 0 && `(${count})`}
            </Link>
            <div className="my-2 divider" />
            {user ? (
              <>
                <Link
                  to="/profile"
                  className="rounded-md px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
                  onClick={() => setMobileOpen(false)}
                >
                  Signed in as {user.username}
                </Link>
                <button className="btn-secondary mt-1" onClick={handleLogout}>
                  Log out
                </button>
              </>
            ) : (
              <div className="mt-1 flex gap-2">
                <Link to="/login" className="btn-secondary flex-1" onClick={() => setMobileOpen(false)}>
                  Log in
                </Link>
                <Link to="/register" className="btn-primary flex-1" onClick={() => setMobileOpen(false)}>
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
