import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { listAllOrders, updateOrderStatus } from "../../api/orders.js";
import StatusBadge from "../../components/StatusBadge.jsx";

const STATUSES = ["pending", "shipped", "delivered", "cancelled"];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  function load() {
    setLoading(true);
    listAllOrders()
      .then(setOrders)
      .catch(() => toast.error("Could not load orders"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleStatusChange(id, status) {
    setUpdatingId(id);
    try {
      await updateOrderStatus(id, status);
      toast.success("Order updated");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not update order");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="page-container py-10">
      <h1 className="section-heading">All orders</h1>
      <div className="mt-6 space-y-4">
        {loading && <p className="text-sm text-ink-500">Loading orders...</p>}
        {!loading && orders.length === 0 && (
          <p className="text-sm text-ink-500">No orders yet.</p>
        )}
        {!loading &&
          orders.map((o) => (
            <div key={o.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink-950">
                    Order #{o.id} &middot; {o.username}
                  </p>
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="price">Total: ${o.total.toFixed(2)}</span>
                <select
                  className="input-field w-40"
                  value={o.status}
                  disabled={updatingId === o.id}
                  onChange={(e) => handleStatusChange(o.id, e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
