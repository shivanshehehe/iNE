import { refreshProductDetails, syncCatalog } from "./catalog.js";
import {
  dueTrackedProducts,
  insertAlert,
  insertHistory,
  insertLog,
  latestHistory,
  listTracked,
  updateTracked,
} from "./db.js";
import { detectLayoutChange } from "./layout.js";
import { scrapeStoreProduct } from "./scraper.js";

let jobLock = false;

function outcomeFromError(error) {
  if (error?.outcome === "retried") return "retried";
  return "failed";
}

async function maybeAlert(tracked, previous, current) {
  if (!previous) return;
  if (tracked.notify_price_drop !== false && Number(current.price) < Number(previous.price)) {
    await insertAlert({
      tracked_id: tracked.id,
      type: "price_drop",
      message: `${tracked.catalog_products?.name || "Product"} dropped from ₹${previous.price} to ₹${current.price}`,
      payload: { from: previous.price, to: current.price },
    });
  }
  if (
    tracked.notify_back_in_stock !== false &&
    previous.in_stock === false &&
    current.inStock === true
  ) {
    await insertAlert({
      tracked_id: tracked.id,
      type: "back_in_stock",
      message: `${tracked.catalog_products?.name || "Product"} is back in stock`,
      payload: { stockQty: current.stockQty, stockText: current.stockText },
    });
  }
}

export async function scrapeTracked(tracked, { headed = false, recordDir } = {}) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  let details = { steps: [] };
  try {
    await refreshProductDetails(tracked.store_id).catch(() => null);
    const result = await scrapeStoreProduct(tracked.store_id, { headed, recordDir });
    details = {
      steps: result.steps,
      rawPriceText: result.rawPriceText,
      storeAttempts: result.storeAttempts,
      layoutClasses: result.layoutClasses,
    };

    const previous = await latestHistory(tracked.id);
    const history = await insertHistory({
      tracked_id: tracked.id,
      price: result.price,
      currency: result.currency,
      mrp: result.mrp,
      in_stock: result.inStock,
      stock_qty: result.stockQty,
      stock_text: result.stockText,
      seller: result.seller,
      extra: { ratingText: result.ratingText, rawPriceText: result.rawPriceText },
      layout_revision: details.layoutRevision || null,
    });
    await maybeAlert(tracked, previous, result);
    await updateTracked(tracked.id, {
      last_scraped_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_price: result.price,
      last_in_stock: result.inStock,
    });
    const log = await insertLog({
      tracked_id: tracked.id,
      store_id: tracked.store_id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      outcome: result.outcome,
      attempts: result.storeAttempts || 1,
      error_message: null,
      details,
      duration_ms: result.durationMs,
    });
    return { ok: true, result, history, log };
  } catch (error) {
    const outcome = outcomeFromError(error);
    details = { steps: error.steps || details.steps, phase: error.phase };
    await updateTracked(tracked.id, { last_scraped_at: new Date().toISOString() }).catch(() => null);
    const log = await insertLog({
      tracked_id: tracked.id,
      store_id: tracked.store_id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      outcome: outcome === "retried" ? "failed" : outcome,
      attempts: 1,
      error_message: error.message,
      details,
      duration_ms: error.durationMs || Date.now() - startedMs,
    });
    return { ok: false, error: error.message, log };
  }
}

export async function runScheduledScrapes(options = {}) {
  if (jobLock) return { skipped: true, reason: "already running" };
  jobLock = true;
  try {
    const catalog = await syncCatalog().catch((error) => ({ error: error.message }));
    const layout = await detectLayoutChange().catch((error) => ({ error: error.message }));
    const due = options.all ? await listTracked() : await dueTrackedProducts();
    const targets = options.trackedId
      ? due.filter((item) => item.id === options.trackedId)
      : due;
    const results = [];
    for (const product of targets) {
      results.push(await scrapeTracked(product, options));
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return {
      skipped: false,
      catalog,
      layout,
      scraped: results.length,
      results: results.map((item) => ({
        ok: item.ok,
        outcome: item.log?.outcome,
        error: item.error || null,
        trackedId: item.log?.tracked_id,
      })),
    };
  } finally {
    jobLock = false;
  }
}
