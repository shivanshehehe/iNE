import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, scrapeProductPage } from "../src/scraper.js";

const record = process.env.RECORD === "true";
const recordDir = record
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../recordings")
  : undefined;
const ids = (process.env.DEMO_STORE_IDS || "21,50").split(",").map(Number);

async function main() {
  console.log("Headed scrape against https://demo.inelabteamdev.com");
  console.log("Watch cookies, hover, reveal, retry/slow path, then a trusted price or a visible failure.");

  const { browser, context, page } = await launchBrowser({
    headed: true,
    recordDir,
  });
  const results = [];
  try {
    for (const storeId of ids) {
      const steps = [];
      try {
        const result = await scrapeProductPage(page, storeId, { steps });
        results.push({ storeId, ...result, steps });
        console.log(`#${storeId} ${result.outcome} ₹${result.price} ${result.stockText}`);
      } catch (error) {
        console.log(`#${storeId} failed: ${error.message}`);
        results.push({ storeId, outcome: "failed", error: error.message, steps: error.steps || steps });
      }
      await page.waitForTimeout(1500);
    }
  } finally {
    await context.close();
    await browser.close();
  }
  if (recordDir) console.log(`Video directory: ${recordDir}`);
  console.log(JSON.stringify(results.map(({ storeId, outcome, price, stockText }) => ({ storeId, outcome, price, stockText })), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
