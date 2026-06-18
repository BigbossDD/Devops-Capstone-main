import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getProduct } from "../api/catalog.js";
import { useCart } from "../context/CartContext.jsx";

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { addItem } = useCart();

  useEffect(() => {
    setLoading(true);
    setError("");
    setQuantity(1);
    getProduct(id)
      .then(setProduct)
      .catch(() => setError("Product not found."))
      .finally(() => setLoading(false));
  }, [id]);

  function handleAdd() {
    addItem(product, quantity);
    toast.success(`${product.name} added to cart`);
  }

  function step(delta) {
    setQuantity((q) => Math.max(1, Math.min(product.stock || 1, q + delta)));
  }

  if (loading) {
    return (
      <div className="page-container py-10">
        <div className="grid gap-10 sm:grid-cols-2">
          <div className="skeleton aspect-square w-full" />
          <div className="space-y-3">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-8 w-2/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="page-container py-12">
        <p className="field-error">{error || "Product not found."}</p>
        <Link className="link mt-3 inline-block" to="/">
          &larr; Back to catalog
        </Link>
      </div>
    );
  }

  const outOfStock = product.stock < 1;

  return (
    <div className="page-container py-10">
      <nav className="flex items-center gap-1.5 text-sm text-ink-400">
        <Link to="/" className="hover:text-ink-700">
          Catalog
        </Link>
        <span>/</span>
        <span className="capitalize text-ink-500">{product.category}</span>
        <span>/</span>
        <span className="truncate text-ink-700">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="aspect-square overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
          <img
            src={product.image_url || "https://placehold.co/640x640?text=No+Image"}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        </div>

        <div>
          <span className="badge border-ink-200 capitalize text-ink-600">{product.category}</span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tightish text-ink-950">
            {product.name}
          </h1>
          <p className="price mt-4 text-3xl">${product.price.toFixed(2)}</p>

          <div className="divider mt-6" />

          <p className="mt-6 text-[15px] leading-relaxed text-ink-600">{product.description}</p>

          <p className={`mt-6 text-sm font-medium ${outOfStock ? "text-red-600" : "text-emerald-600"}`}>
            {outOfStock ? "Out of stock" : `In stock — ${product.stock} available`}
          </p>

          <div className="sticky bottom-4 mt-6 flex items-center gap-3 rounded-lg border border-ink-200 bg-white p-3 shadow-lifted sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
            <div className="flex items-center rounded-md border border-ink-200">
              <button
                type="button"
                className="flex h-10 w-9 items-center justify-center text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                onClick={() => step(-1)}
                disabled={outOfStock || quantity <= 1}
              >
                −
              </button>
              <span className="w-8 text-center text-sm font-medium text-ink-950">{quantity}</span>
              <button
                type="button"
                className="flex h-10 w-9 items-center justify-center text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                onClick={() => step(1)}
                disabled={outOfStock || quantity >= product.stock}
              >
                +
              </button>
            </div>
            <button className="btn-primary flex-1" disabled={outOfStock} onClick={handleAdd}>
              {outOfStock ? "Sold out" : "Add to cart"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
