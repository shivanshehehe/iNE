import { config } from "./config.js";
import { catalogCount, upsertCatalogItems, upsertCatalogProductDetails } from "./db.js";

const STORE = config.storeUrl;

async function fetchJson(path, { timeout = 20000, retries = 4 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${STORE}${path}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`${path} returned ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export async function fetchCatalogPage(page, pageSize = 50) {
  return fetchJson(`/api/catalog?page=${page}&pageSize=${pageSize}`);
}

export async function fetchProduct(id) {
  return fetchJson(`/api/product/${id}`);
}

export async function fetchLayout() {
  return fetchJson("/api/layout");
}

export async function syncCatalog({ force = false } = {}) {
  const existing = await catalogCount();
  if (!force && existing >= 1000) {
    return { synced: existing, skipped: true };
  }

  const first = await fetchCatalogPage(1, 50);
  const pages = first.pages || Math.ceil((first.total || 1000) / 50);
  await upsertCatalogItems(first.items || []);

  for (let page = 2; page <= pages; page += 1) {
    const payload = await fetchCatalogPage(page, 50);
    await upsertCatalogItems(payload.items || []);
  }

  return { synced: await catalogCount(), skipped: false, pages };
}

export async function searchStore(query, { maxPages = 12 } = {}) {
  const needle = query.toLowerCase();
  const matches = [];
  for (let page = 1; page <= maxPages && matches.length < 20; page += 1) {
    const payload = await fetchCatalogPage(page, 50);
    await upsertCatalogItems(payload.items || []);
    for (const item of payload.items || []) {
      const haystack = `${item.name} ${item.brand} ${item.sku}`.toLowerCase();
      if (haystack.includes(needle)) matches.push(item);
    }
  }
  return matches.slice(0, 20);
}

export async function refreshProductDetails(storeId) {
  const product = await fetchProduct(storeId);
  await upsertCatalogProductDetails(product);
  return product;
}
