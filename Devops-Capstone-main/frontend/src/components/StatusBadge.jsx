import React from "react";

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-800",
  shipped: "bg-blue-100 text-blue-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
};

export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || "bg-ink-100 text-ink-700";
  return <span className={`badge ${style}`}>{status}</span>;
}
