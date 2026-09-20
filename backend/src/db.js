import { createClient } from "@supabase/supabase-js";
import { assertDatabaseConfig, config } from "./config.js";

let client;

export function db() {
  if (!client) {
    assertDatabaseConfig();
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function upsertCatalogItems(items) {
  if (!items.length) return;
  const { error } = await db().from("catalog_products").upsert(
    items.map((item) => ({
      store_id: item.id,
      slug: item.slug,
      name: item.name,
      brand: item.brand,
      category: item.category,
      sku: item.sku,
      description: item.description,
      synced_at: new Date().toISOString(),
    })),
    { onConflict: "store_id" }
  );
  if (error) throw error;
}

export async function searchCatalog(query, limit = 20) {
  const q = query.trim().replace(/[%_,()]/g, " ").replace(/\s+/g, " ");
  if (!q) return [];
  const { data, error } = await db()
    .from("catalog_products")
    .select("*")
    .or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%`)
    .order("name")
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getCatalogProduct(storeId) {
  const { data, error } = await db()
    .from("catalog_products")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertCatalogProductDetails(product) {
  const { error } = await db().from("catalog_products").upsert(
    {
      store_id: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      category: product.category,
      sku: product.sku,
      description: product.description,
      specs: product.specs || null,
      reviews: product.reviews || null,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "store_id" }
  );
  if (error) throw error;
}

export async function listTracked() {
  const { data, error } = await db()
    .from("tracked_products")
    .select("*, catalog_products(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getTracked(id) {
  const { data, error } = await db()
    .from("tracked_products")
    .select("*, catalog_products(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getTrackedByStoreId(storeId) {
  const { data, error } = await db()
    .from("tracked_products")
    .select("*, catalog_products(*)")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertTracked({ storeId, intervalMinutes }) {
  const { data, error } = await db()
    .from("tracked_products")
    .insert({
      store_id: storeId,
      scrape_interval_minutes: intervalMinutes || config.defaultIntervalMinutes,
    })
    .select("*, catalog_products(*)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTracked(id, patch) {
  const { data, error } = await db()
    .from("tracked_products")
    .update(patch)
    .eq("id", id)
    .select("*, catalog_products(*)")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTracked(id) {
  const { error } = await db().from("tracked_products").delete().eq("id", id);
  if (error) throw error;
}

export async function insertHistory(row) {
  const { data, error } = await db().from("price_history").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function latestHistory(trackedId) {
  const { data, error } = await db()
    .from("price_history")
    .select("*")
    .eq("tracked_id", trackedId)
    .order("scraped_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listHistory(trackedId, limit = 200) {
  const { data, error } = await db()
    .from("price_history")
    .select("*")
    .eq("tracked_id", trackedId)
    .order("scraped_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function insertLog(row) {
  const { data, error } = await db().from("scrape_logs").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function listLogs(trackedId, limit = 100) {
  const { data, error } = await db()
    .from("scrape_logs")
    .select("*")
    .eq("tracked_id", trackedId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function insertAlert(row) {
  const { error } = await db().from("alerts").insert(row);
  if (error) throw error;
}

export async function listAlerts(limit = 50) {
  const { data, error } = await db()
    .from("alerts")
    .select("*, tracked_products(id, store_id, catalog_products(name, sku))")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function markAlertRead(id) {
  const { error } = await db()
    .from("alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function latestLayout() {
  const { data, error } = await db()
    .from("store_layout_snapshots")
    .select("*")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertLayoutSnapshot(row) {
  const { data, error } = await db()
    .from("store_layout_snapshots")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function dueTrackedProducts() {
  const { data, error } = await db()
    .from("tracked_products")
    .select("*, catalog_products(*)");
  if (error) throw error;
  const now = Date.now();
  return (data || []).filter((product) => {
    if (!product.last_scraped_at) return true;
    const elapsed = now - new Date(product.last_scraped_at).getTime();
    return elapsed >= product.scrape_interval_minutes * 60 * 1000;
  });
}

export async function catalogCount() {
  const { count, error } = await db()
    .from("catalog_products")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}
