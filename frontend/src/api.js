const API = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export const api = {
  health: () => request("/api/health"),
  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
  dashboard: () => request("/api/dashboard"),
  product: (id) => request(`/api/products/${id}`),
  track: (storeId, scrapeIntervalMinutes = 120) =>
    request("/api/products", {
      method: "POST",
      body: JSON.stringify({ storeId, scrapeIntervalMinutes }),
    }),
  updateProduct: (id, body) =>
    request(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  untrack: (id) => request(`/api/products/${id}`, { method: "DELETE" }),
  scrapeNow: (id) => request(`/api/products/${id}/scrape`, { method: "POST", body: "{}" }),
  syncCatalog: () => request("/api/catalog/sync", { method: "POST" }),
  markAlertRead: (id) => request(`/api/alerts/${id}/read`, { method: "POST", body: "{}" }),
};
