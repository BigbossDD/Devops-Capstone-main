import React from "react";

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="skeleton aspect-[4/3] w-full rounded-lg" />
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="w-full">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton mt-1.5 h-3 w-1/3" />
        </div>
        <div className="skeleton h-4 w-10 shrink-0" />
      </div>
    </div>
  );
}

export function OrderSkeleton() {
  return (
    <div className="card">
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton mt-3 h-3 w-full" />
      <div className="skeleton mt-2 h-3 w-2/3" />
    </div>
  );
}
