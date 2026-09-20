import { chromium } from "playwright";
import { config } from "./config.js";
import { parseMoney, parseStock } from "./parse.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launchBrowser({ headed = !config.headless, recordDir } = {}) {
  const browser = await chromium.launch({
    headless: !headed,
    slowMo: headed ? (recordDir ? 220 : 80) : 0,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    recordVideo: recordDir ? { dir: recordDir, size: { width: 1280, height: 800 } } : undefined,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(config.scrapeTimeoutMs);
  return { browser, context, page };
}

async function dismissCookies(page, steps) {
  for (let i = 0; i < 6; i += 1) {
    const overlay = page.locator(".cookie-overlay, [aria-label='Cookie consent']");
    if (!(await overlay.isVisible().catch(() => false))) return;
    steps.push(`Cookie banner visible, click ${i + 1}`);
    const accept = page.getByRole("button", { name: /accept cookies/i });
    if (await accept.count()) {
      await accept.click({ force: true }).catch(() => {});
    } else {
      await overlay.locator("button").first().click({ force: true }).catch(() => {});
    }
    await sleep(250);
  }
}

async function hoverPriceBlock(page, steps) {
  const block = page.locator(".price-block").first();
  await block.waitFor({ state: "visible", timeout: 30000 });
  const box = await block.boundingBox();
  if (!box) throw new Error("Price block has no bounding box");

  steps.push("Hovering price block with real mouse movement");
  await page.mouse.move(box.x + 12, box.y + 10);
  for (let i = 0; i < 14; i += 1) {
    await page.mouse.move(box.x + 16 + i * 9, box.y + 12 + (i % 4) * 5, { steps: 2 });
    await sleep(50);
  }
  await sleep(700);
}

async function clickReveal(page, steps) {
  const button = page.getByRole("button", { name: /reveal price/i });
  if (!(await button.count())) return false;
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('button[aria-label="Reveal price"]');
      return el && !el.disabled;
    }, { timeout: 8000 });
  } catch {
    steps.push("Reveal button stayed disabled; hovering again");
    await hoverPriceBlock(page, steps);
  }
  steps.push("Clicking Reveal price");
  await button.click({ timeout: 5000 }).catch(() => {});
  return true;
}

async function readPhase(page) {
  return page.evaluate(() => {
    const block = document.querySelector(".price-block");
    if (!block) return { phase: "missing", text: "" };
    const text = block.innerText || "";
    if (block.classList.contains("price-success")) return { phase: "success", text };
    if (block.classList.contains("price-error")) return { phase: "error", text };
    if (block.classList.contains("price-idle")) return { phase: "idle", text };
    if (/Retrying/i.test(text)) return { phase: "retrying", text };
    if (/Loading current price/i.test(text)) return { phase: "loading", text };
    return { phase: "unknown", text };
  });
}

async function extractQuote(page) {
  return page.evaluate(() => {
    const success = document.querySelector(".price-block.price-success");
    if (!success) return { ok: false, reason: "price-success not in DOM" };

    const pending = /Updating/i.test(success.innerText || "");
    const priceMain = success.querySelector(".price-main") || success;
    const realEl =
      [...priceMain.querySelectorAll("*")].find((el) => {
        const styleAttr = el.getAttribute("style") || "";
        const style = window.getComputedStyle(el);
        return (
          styleAttr.includes("2.4rem") &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          el.getAttribute("aria-hidden") !== "true"
        );
      }) ||
      [...priceMain.querySelectorAll("*")].find((el) => {
        const style = window.getComputedStyle(el);
        return (
          parseFloat(style.fontSize) >= 30 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          el.getAttribute("aria-hidden") !== "true" &&
          !style.textDecorationLine.includes("line-through") &&
          /[0-9\uFF10-\uFF19]/.test(el.innerText || "")
        );
      });
    const priceText = realEl ? realEl.innerText : "";
    const mrpEl = [...priceMain.querySelectorAll("*")].find((el) =>
      window.getComputedStyle(el).textDecorationLine.includes("line-through")
    );
    const stockEl = success.querySelector(".stock-badge");
    const sellerText = [...success.querySelectorAll("small")].find((el) => /Sold by/.test(el.innerText || ""))
      ?.innerText;
    const ratingText = [...success.querySelectorAll("small")].find((el) => /ratings/.test(el.innerText || ""))
      ?.innerText;
    const loaded = (success.innerText || "").match(/Loaded in (\d+)/);

    return {
      ok: Boolean(priceText),
      pending,
      priceText,
      mrpText: mrpEl?.innerText || "",
      stockText: stockEl?.innerText || "",
      sellerText: sellerText || "",
      ratingText: ratingText || "",
      storeAttempts: loaded ? Number(loaded[1]) : 1,
      layoutClasses: [...success.classList],
    };
  });
}

async function waitForSettledPrice(page, steps) {
  const deadline = Date.now() + 8000;
  let previous = null;
  while (Date.now() < deadline) {
    const quote = await extractQuote(page);
    if (quote.ok && !quote.pending) return quote;
    if (quote.ok && previous?.priceText === quote.priceText) {
      steps.push("Updating… persisted but the visible 2.4rem price was stable; accepting it");
      return { ...quote, pending: false };
    }
    previous = quote;
    steps.push("Price still marked Updating… waiting");
    await sleep(700);
  }
  const last = await extractQuote(page);
  if (last.ok && last.priceText) {
    steps.push("Timed out waiting for Updating… to clear; keeping the stable visible price");
    return { ...last, pending: false };
  }
  throw new Error("Store left the price in an Updating state; refusing to store it");
}

export async function scrapeProductPage(page, storeId, { steps = [] } = {}) {
  const url = `${config.storeUrl}/product/${storeId}`;
  steps.push(`Opening ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator("h1").first().waitFor({ timeout: 30000 });
  await sleep(400);
  await dismissCookies(page, steps);

  // Cookie banner can appear 1.5–5s after load.
  const cookieWait = sleep(3500).then(() => dismissCookies(page, steps));

  let outcome = "failed";
  let lastPhase = "idle";
  let quote = null;
  const maxClicks = 5;
  const giveUpAt = Date.now() + 75000;

  for (let attempt = 1; attempt <= maxClicks; attempt += 1) {
    if (Date.now() > giveUpAt) break;
    await dismissCookies(page, steps);
    lastPhase = (await readPhase(page)).phase;

    if (lastPhase === "success") {
      quote = await waitForSettledPrice(page, steps);
      outcome = attempt > 1 || (quote.storeAttempts || 1) > 1 ? "retried" : "success";
      break;
    }

    if (lastPhase === "error") {
      steps.push(`Store showed a failure after attempt ${attempt}; clicking Try again`);
      outcome = "retried";
      const retryBtn = page.getByRole("button", { name: /try again/i });
      if (await retryBtn.count()) await retryBtn.click().catch(() => {});
      await sleep(600);
      continue;
    }

    if (lastPhase === "idle") {
      await hoverPriceBlock(page, steps);
      await clickReveal(page, steps);
    } else if (lastPhase === "loading" || lastPhase === "retrying") {
      steps.push(`Store is ${lastPhase}; waiting for it to settle`);
      outcome = "retried";
    }

    try {
      await page.waitForSelector(".price-block.price-success, .price-block.price-error", {
        timeout: 20000,
      });
    } catch {
      steps.push("Reveal click produced no success/error yet; likely swallowed. Retrying hover.");
    }

    const phase = await readPhase(page);
    lastPhase = phase.phase;
    if (phase.phase === "retrying") {
      outcome = "retried";
      steps.push(phase.text.split("\n").slice(0, 2).join(" | "));
      await page.waitForSelector(".price-block.price-success, .price-block.price-error", {
        timeout: 18000,
      }).catch(() => {});
    }
    if ((await readPhase(page)).phase === "success") {
      quote = await waitForSettledPrice(page, steps);
      outcome = outcome === "retried" || attempt > 1 || (quote.storeAttempts || 1) > 1 ? "retried" : "success";
      break;
    }
  }

  await cookieWait.catch(() => {});

  if (!quote?.ok && (await readPhase(page)).phase === "success") {
    quote = await waitForSettledPrice(page, steps);
    outcome = outcome === "retried" || (quote.storeAttempts || 1) > 1 ? "retried" : "success";
  }

  if (!quote?.ok) {
    const phase = await readPhase(page);
    throw Object.assign(new Error(phase.text || "Could not reveal a trustworthy price"), {
      outcome: phase.phase === "error" || outcome === "retried" ? outcome : "failed",
      steps,
      phase: phase.phase,
    });
  }

  const price = parseMoney(quote.priceText);
  const mrp = parseMoney(quote.mrpText);
  const stock = parseStock(quote.stockText);
  if (!price) {
    throw Object.assign(new Error(`Could not parse price from "${quote.priceText}"`), {
      outcome: "failed",
      steps,
    });
  }

  steps.push(`Parsed price ${price} and stock "${stock.text}"`);
  return {
    outcome,
    steps,
    price,
    mrp,
    currency: "INR",
    inStock: stock.inStock,
    stockQty: stock.quantity,
    stockText: stock.text,
    rawPriceText: quote.priceText,
    seller: quote.sellerText,
    ratingText: quote.ratingText,
    storeAttempts: quote.storeAttempts,
    pending: false,
    layoutClasses: quote.layoutClasses,
  };
}

export async function scrapeStoreProduct(storeId, options = {}) {
  const started = Date.now();
  const steps = [];
  const { browser, context, page } = await launchBrowser(options);
  try {
    const result = await scrapeProductPage(page, storeId, { steps });
    return { ...result, durationMs: Date.now() - started };
  } catch (error) {
    error.steps = error.steps || steps;
    error.durationMs = Date.now() - started;
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}
