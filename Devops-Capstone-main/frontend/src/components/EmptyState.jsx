import React from "react";

export default function EmptyState({ title, description, action }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-14 text-center">
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      {description && <p className="max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
