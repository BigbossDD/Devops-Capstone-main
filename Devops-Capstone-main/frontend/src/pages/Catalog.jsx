import React, { useEffect, useState } from "react";
import { listProducts, listCategories } from "../api/catalog.js";
import ProductCard from "../components/ProductCard.jsx";
import { ProductCardSkeleton } from "../components/Skeletons.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Pagination from "../components/Pagination.jsx";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name", label: "Name: A-Z" },
];

const PAGE_SIZE = 12;

function SearchIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M20 20l-3.8-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Catalog() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, sort]);

  useEffect(() => {
    setLoading(true);
    setError("");
    listProducts({
      q: debouncedSearch || undefined,
      category: category || undefined,
      sort,
      page,
      page_size: PAGE_SIZE,
    })
      .then((data) => {
        setProducts(data.items);
        setTotal(data.total);
        setTotalPages(data.total_pages);
      })
      .catch(() => setError("Could not load products. Is catalog-service running on :5002?"))
      .finally(() => setLoading(false));
  }, [debouncedSearch, category, sort, page]);

  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-ink-200 bg-ink-950">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="page-container relative z-10 py-16 sm:py-20">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-300">
            New arrivals every week
          </p>
          <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-[1.1] tracking-tightish text-white sm:text-5xl">
            Everything you need, nothing you don't.
          </h1>
          <p className="mt-4 max-w-md text-[15px] text-ink-300">
            {total} item{total === 1 ? "" : "s"} ready to ship today.
          </p>
        </div>
      </div>

      <div className="page-container py-8">
        {/* Toolbar */}
        <div className="sticky top-14 z-10 -mx-4 border-b border-ink-200 bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-64">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                className="input-field pl-9"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input-field w-full sm:w-48"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                category === ""
                  ? "border-ink-950 bg-ink-950 text-white"
                  : "border-ink-200 text-ink-600 hover:border-ink-300"
              }`}
              onClick={() => setCategory("")}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
                  category === c
                    ? "border-ink-950 bg-ink-950 text-white"
                    : "border-ink-200 text-ink-600 hover:border-ink-300"
                }`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="field-error mt-4">{error}</p>}

        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>

        {!loading && products.length === 0 && !error && (
          <div className="mt-6">
            <EmptyState
              title="No products found"
              description="Try adjusting your search or filters."
            />
          </div>
        )}

        {!loading && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
      </div>
    </div>
  );
}
