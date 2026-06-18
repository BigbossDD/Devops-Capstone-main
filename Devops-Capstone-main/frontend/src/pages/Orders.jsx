import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext.jsx";
import { listOrders, cancelOrder } from "../api/orders.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { OrderSkeleton } from "../components/Skeletons.jsx";
import EmptyState from "../components/EmptyState.jsx";

export default function Orders() {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);

  function load() {
    setLoading(true);
    listOrders()
      .then(setOrders)
      .catch(() => setError("Could not load orders. Is orders-service running on :5003?"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCancel(id) {
    setCancellingId(id);
    try {
      await cancelOrder(id);
      toast.success("Order cancelled");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not cancel order");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="page-container py-10">
      <h1 className="section-heading">My orders</h1>
      {error && <p className="field-error mt-2">{error}</p>}
      <div className="mt-6 space-y-4">
        {loading && Array.from({ length: 3 }).map((_, i) => <OrderSkeleton key={i} />)}
        {!loading && orders.length === 0 && !error && (
          <EmptyState
            title="No orders yet"
            description="Items you order will show up here."
            action={
              <Link className="btn-primary" to="/">
                Start shopping
              </Link>
            }
          />
        )}
        {!loading &&
          orders.map((o) => (
            <div key={o.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink-950">Order #{o.id}</p>
                  <p className="text-xs text-ink-400">
                    {new Date(o.created_at).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={o.status} />
              </div>
              <ul className="mt-3 divide-y divide-ink-200 text-sm">
                {o.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between py-1.5">
                    <span>
                      {i.name} &times; {i.quantity}
                    </span>
                    <span>${i.line_total.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between">
                <span className="price">Total: ${o.total.toFixed(2)}</span>
                {o.status === "pending" && (
                  <button
                    className="btn-danger"
                    disabled={cancellingId === o.id}
                    onClick={() => handleCancel(o.id)}
                  >
                    {cancellingId === o.id ? "Cancelling..." : "Cancel order"}
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
