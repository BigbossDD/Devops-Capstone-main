import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { listProducts, createProduct, updateProduct, deleteProduct } from "../../api/catalog.js";

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  stock: "",
  category: "",
  image_url: "",
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    listProducts({ page_size: 48 })
      .then((data) => setProducts(data.items))
      .catch(() => toast.error("Could not load products"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description || "",
      price: product.price,
      stock: product.stock,
      category: product.category || "",
      image_url: product.image_url || "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      price: Number(form.price),
      stock: Number(form.stock),
    };
    try {
      if (editingId) {
        await updateProduct(editingId, payload);
        toast.success("Product updated");
      } else {
        await createProduct(payload);
        toast.success("Product created");
      }
      resetForm();
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this product?")) return;
    try {
      await deleteProduct(id);
      toast.success("Product deleted");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not delete product");
    }
  }

  return (
    <div className="page-container py-10">
      <h1 className="section-heading">Manage products</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_3fr]">
        <form className="card h-fit space-y-4" onSubmit={handleSubmit}>
          <h2 className="font-semibold text-ink-950">
            {editingId ? "Edit product" : "New product"}
          </h2>
          <div>
            <label className="field-label">Name</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea
              className="input-field"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Price</label>
              <input
                className="input-field"
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="field-label">Stock</label>
              <input
                className="input-field"
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className="field-label">Category</label>
            <input
              className="input-field"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Image URL</label>
            <input
              className="input-field"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            />
          </div>
          <div className="flex gap-3">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update product" : "Create product"}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="space-y-3">
          {loading && <p className="text-sm text-ink-500">Loading products...</p>}
          {!loading &&
            products.map((p) => (
              <div key={p.id} className="card flex flex-wrap items-center gap-4">
                <img
                  src={p.image_url || "https://placehold.co/64x64?text=No+Image"}
                  alt={p.name}
                  className="h-14 w-14 rounded-lg object-cover"
                />
                <div className="min-w-[140px] flex-1">
                  <p className="font-semibold text-ink-950">{p.name}</p>
                  <p className="text-xs text-ink-500">
                    {p.category} &middot; ${p.price.toFixed(2)} &middot; {p.stock} in stock
                  </p>
                </div>
                <button className="btn-secondary btn-sm" onClick={() => startEdit(p)}>
                  Edit
                </button>
                <button className="btn-danger btn-sm" onClick={() => handleDelete(p.id)}>
                  Delete
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
