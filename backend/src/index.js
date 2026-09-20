import cors from "cors";
import express from "express";
import { refreshProductDetails, searchStore, syncCatalog } from "./catalog.js";
import { config } from "./config.js";
import {
  deleteTracked,
  getCatalogProduct,
  getTracked,
  getTrackedByStoreId,
  insertTracked,
  listAlerts,
  listHistory,
  listLogs,
  listTracked,
  markAlertRead,
  searchCatalog,
  updateTracked,
} from "./db.js";
import { runScheduledScrapes, scrapeTracked } from "./jobs.js";
import { detectLayoutChange } from "./layout.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
function allowedOrigins() {
  return new Set([
    ...config.corsOrigin.split(",").map((item) => item.trim()).filter(Boolean),
    "https://i-ne-gamma.vercel.app",
    "http://localhost:5173",
  ]);
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      try {
        const host = new URL(origin).hostname;
        if (allowedOrigins().has(origin) || host.endsWith(".vercel.app")) {
          return callback(null, true);
        }
      } catch {
        /* ignore */
      }
      return callback(null, false);
    },
  })
);

function cronAuthorized(req) {
  const header = req.get("x-cron-secret") || req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const query = req.query.secret;
  return Boolean(config.cronSecret) && (header === config.cronSecret || query === config.cronSecret);
}

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    store: config.storeUrl,
    headless: config.headless,
    time: new Date().toISOString(),
  });
});

app.get("/api/search", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").slice(0, 80);
    if (q.length < 2) return res.json({ items: [], message: "Type at least 2 characters" });
    let items = await searchCatalog(q);
    if (!items.length) {
      items = await searchStore(q);
    }
    syncCatalog().catch((error) => console.error("catalog sync", error.message));
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

app.post("/api/catalog/sync", async (_req, res, next) => {
  try {
    res.json(await syncCatalog({ force: true }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard", async (_req, res, next) => {
  try {
    const products = await listTracked();
    const alerts = await listAlerts(20);
    const layout = await detectLayoutChange().catch(() => null);
    res.json({ products, alerts, layout });
  } catch (error) {
    next(error);
  }
});

app.get("/api/products", async (_req, res, next) => {
  try {
    res.json({ products: await listTracked() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/products", async (req, res, next) => {
  try {
    const storeId = Number(req.body.storeId);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      return res.status(400).json({ error: "storeId is required" });
    }
    const existing = await getTrackedByStoreId(storeId);
    if (existing) return res.status(200).json({ product: existing, alreadyTracked: true });

    let catalog = await getCatalogProduct(storeId);
    if (!catalog) {
      catalog = await refreshProductDetails(storeId);
    }
    const interval = Number(req.body.scrapeIntervalMinutes || config.defaultIntervalMinutes);
    const product = await insertTracked({
      storeId,
      intervalMinutes: Number.isFinite(interval) ? interval : config.defaultIntervalMinutes,
    });
    scrapeTracked(product).catch(() => null);
    res.status(201).json({ product });
  } catch (error) {
    next(error);
  }
});

app.get("/api/products/:id", async (req, res, next) => {
  try {
    const product = await getTracked(req.params.id);
    if (!product) return res.status(404).json({ error: "Not found" });
    const [history, logs] = await Promise.all([
      listHistory(product.id),
      listLogs(product.id),
    ]);
    res.json({ product, history, logs });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/products/:id", async (req, res, next) => {
  try {
    const patch = {};
    if (req.body.scrapeIntervalMinutes) {
      const minutes = Number(req.body.scrapeIntervalMinutes);
      if (![30, 60, 120, 240, 360].includes(minutes)) {
        return res.status(400).json({ error: "Interval must be 30, 60, 120, 240, or 360 minutes" });
      }
      patch.scrape_interval_minutes = minutes;
    }
    if (typeof req.body.notifyPriceDrop === "boolean") patch.notify_price_drop = req.body.notifyPriceDrop;
    if (typeof req.body.notifyBackInStock === "boolean") {
      patch.notify_back_in_stock = req.body.notifyBackInStock;
    }
    res.json({ product: await updateTracked(req.params.id, patch) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/products/:id", async (req, res, next) => {
  try {
    await deleteTracked(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/products/:id/scrape", async (req, res, next) => {
  try {
    const product = await getTracked(req.params.id);
    if (!product) return res.status(404).json({ error: "Not found" });
    const headed = req.body?.headed === true && process.env.ALLOW_HEADED === "true";
    scrapeTracked(product, { headed }).catch((error) => console.error("manual scrape", error.message));
    res.json({ started: true, trackedId: product.id });
  } catch (error) {
    next(error);
  }
});

app.get("/api/alerts", async (_req, res, next) => {
  try {
    res.json({ alerts: await listAlerts() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/alerts/:id/read", async (req, res, next) => {
  try {
    await markAlertRead(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/layout", async (_req, res, next) => {
  try {
    res.json(await detectLayoutChange());
  } catch (error) {
    next(error);
  }
});

async function cronHandler(req, res, next) {
  try {
    if (!cronAuthorized(req)) return res.status(401).json({ error: "Unauthorized cron request" });
    const result = await runScheduledScrapes();
    res.json(result);
  } catch (error) {
    next(error);
  }
}

app.get("/api/cron/scrape", cronHandler);
app.post("/api/cron/scrape", cronHandler);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Server error" });
});

app.listen(config.port, () => {
  console.log(`Storewatch API on :${config.port} → ${config.storeUrl}`);
  if (config.supabaseUrl) {
    syncCatalog().catch((error) => console.error("catalog sync failed", error.message));
  }
});
