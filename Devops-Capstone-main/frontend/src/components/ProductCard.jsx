import React from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useCart } from "../context/CartContext.jsx";

export default function ProductCard({ product }) {
  const { addItem } = useCart();

  function handleAdd(e) {
    e.preventDefault();
    addItem(product);
    toast.success(`${product.name} added to cart`);
  }

  const outOfStock = product.stock < 1;

  return (
    <Link to={`/products/${product.id}`} className="group flex flex-col">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
        <img
          src={product.image_url || "https://placehold.co/480x360?text=No+Image"}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
        {outOfStock && (
          <span className="absolute left-2 top-2 badge border-ink-950 bg-ink-950 text-white">
            Sold out
          </span>
        )}
        <button
          className="absolute inset-x-2 bottom-2 translate-y-2 rounded-md bg-ink-950 py-2 text-xs font-medium text-white opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
          disabled={outOfStock}
          onClick={handleAdd}
        >
          Add to cart
        </button>
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-ink-950">{product.name}</h3>
          <p className="mt-0.5 text-xs text-ink-400">{product.category}</p>
        </div>
        <span className="price shrink-0 text-sm">${product.price.toFixed(2)}</span>
      </div>
    </Link>
  );
}
