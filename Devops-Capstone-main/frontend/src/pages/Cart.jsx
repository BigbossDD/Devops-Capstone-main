import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useCart } from "../context/CartContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { createOrder } from "../api/orders.js";
import EmptyState from "../components/EmptyState.jsx";

export default function Cart() {
  const { items, removeItem, updateQuantity, clearCart, total } = useCart();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);

  async function handleCheckout() {
    if (!token) {
      navigate("/login");
      return;
    }
    setError("");
    setPlacing(true);
    try {
      const orderItems = items.map((i) => ({ product_id: i.product_id, quantity: i.quantity }));
      await createOrder(orderItems);
      clearCart();
      toast.success("Order placed!");
      navigate("/orders");
    } catch (err) {
      const msg = err?.response?.data?.error || "Checkout failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setPlacing(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="page-container py-12">
        <EmptyState
          title="Your cart is empty"
          description="Browse the catalog and add a few products."
          action={
            <Link className="btn-primary" to="/">
              Go shopping
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-container py-10">
      <h1 className="section-heading">Your cart</h1>
      {error && <p className="field-error mt-2">{error}</p>}
      <div className="mt-6 space-y-4">
        {items.map((i) => (
          <div key={i.product_id} className="card flex flex-wrap items-center gap-4">
            <img
              src={i.image_url || "https://placehold.co/96x96?text=No+Image"}
              alt={i.name}
              className="h-20 w-20 rounded-md object-cover"
            />
            <div className="min-w-[140px] flex-1">
              <p className="font-semibold text-ink-950">{i.name}</p>
              <p className="text-sm text-ink-500">${i.price.toFixed(2)} each</p>
            </div>
            <input
              type="number"
              min={1}
              max={i.stock || undefined}
              className="input-field w-20"
              value={i.quantity}
              onChange={(e) =>
                updateQuantity(i.product_id, Math.max(1, Number(e.target.value) || 1))
              }
            />
            <p className="price w-24 text-right">${(i.price * i.quantity).toFixed(2)}</p>
            <button className="btn-secondary" onClick={() => removeItem(i.product_id)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="card mt-6 flex flex-wrap items-center justify-between gap-3">
        <span className="price text-xl">Total: ${total.toFixed(2)}</span>
        <button className="btn-primary" disabled={placing} onClick={handleCheckout}>
          {placing ? "Placing order..." : "Checkout"}
        </button>
      </div>
    </div>
  );
}
