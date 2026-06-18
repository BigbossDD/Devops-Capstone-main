import { apiClient } from "./client.js";

export async function listProducts(params = {}) {
  // params: { q?, category?, sort?, page?, page_size? }
  const res = await apiClient.get("/api/products", { params });
  return res.data; // { items, total, page, page_size, total_pages }
}

export async function getProduct(id) {
  const res = await apiClient.get(`/api/products/${id}`);
  return res.data;
}

export async function listCategories() {
  const res = await apiClient.get("/api/categories");
  return res.data; // string[]
}

export async function createProduct(payload) {
  const res = await apiClient.post("/api/products", payload);
  return res.data;
}

export async function updateProduct(id, payload) {
  const res = await apiClient.put(`/api/products/${id}`, payload);
  return res.data;
}

export async function deleteProduct(id) {
  const res = await apiClient.delete(`/api/products/${id}`);
  return res.data;
}
