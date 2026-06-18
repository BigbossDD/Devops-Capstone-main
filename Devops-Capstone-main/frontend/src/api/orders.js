import { apiClient } from "./client.js";

export async function createOrder(items) {
  const res = await apiClient.post("/api/orders", { items });
  return res.data;
}

export async function listOrders() {
  const res = await apiClient.get("/api/orders");
  return res.data;
}

export async function getOrder(id) {
  const res = await apiClient.get(`/api/orders/${id}`);
  return res.data;
}

export async function cancelOrder(id) {
  const res = await apiClient.patch(`/api/orders/${id}/cancel`, {});
  return res.data;
}

export async function listAllOrders() {
  const res = await apiClient.get("/api/orders/all");
  return res.data;
}

export async function updateOrderStatus(id, status) {
  const res = await apiClient.patch(`/api/orders/${id}/status`, { status });
  return res.data;
}
