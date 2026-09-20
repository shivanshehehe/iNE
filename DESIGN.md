# Design note

How Storewatch scrapes INE's mock store reliably, what was traded off, and what the first AI pass got wrong.

## The store is the assignment

https://demo.inelabteamdev.com is a React SPA. The listing is useful for names and SKUs. The selling price is not on the listing, not in `/api/product/:id`, and not in the first HTML document. On `/product/:id` the price block starts as **Price hidden**. The page requires:

1. A cookie overlay that may appear 1.5–5 seconds after load and can need more than one Accept click.
2. Real mouse movement over the price block: at least 8 sampled moves and 600ms hover dwell.
3. A **Reveal price** click. About a third of clicks are delayed or swallowed on purpose.
4. The store's own retry loop (up to 6 attempts) on slow or non-OK responses.
5. Rotating CSS class names from `/api/layout`, split characters, fullwidth digits, and two hidden decoy amounts.

That is why scraping reliability is the core of this project, not the dashboard chrome.

## Split of tools

**Lightweight HTTP** is used where the page does not need a browser:

- `GET /api/catalog?page=&pageSize=` to search and cache 1,000 products
- `GET /api/product/:id` for specs, reviews, and extra dashboard copy
- `GET /api/layout` for change detection

**Playwright** is used only for price and stock. A Cheerio pass on the product URL cannot see the quote. Hitting an obfuscated price endpoint would skip the behavior the assignment asks us to survive, and it would make a headed recording meaningless.

Trade-off: Playwright is heavier on Render's free tier. The backend therefore runs from the official Playwright Docker image, scrapes products one at a time, and is woken by cron-job.org instead of an in-process loop. Render will sleep. The scheduler is outside the app because of that, not in spite of it.

## Reliability rules

The scraper is a state machine, not a single `page.content()`:

1. Wait for `h1`, not `networkidle`.
2. Dismiss cookies in a loop. The overlay can appear after hover has started.
3. Move the mouse across `.price-block`, wait 700ms, then click Reveal only if the button is enabled.
4. If the UI stays idle, assume the click was swallowed and hover again.
5. If the UI shows Retrying, wait through the store's attempts. Log `retried`.
6. On success, wait until `Updating…` is gone. A translucent unfinished number is not stored.
7. Read the large visible price node. Ignore `aria-hidden`, `display:none`, and strikethrough MRP. Those are decoys (`shown` vs `shown+7`, plus a distorted copy).
8. Parse several formats (grouped commas, `/-`, euro-style thousands, fullwidth digits, zero-width spaces).
9. Validate: price must be a finite number `> 0`. Stock text must parse to in-stock or out-of-stock.
10. On any failure, write `scrape_logs` only. `price_history` is insert-only for trusted quotes.

Scheduled runs are serialized with a lock so overlapping cron ticks do not double-write.

## Scheduling

The assignment asks for a scrape every two hours and warns that free backends sleep. cron-job.org pings `/api/cron/scrape` every 15 minutes with a shared secret. Each product has `scrape_interval_minutes` defaulting to 120, so the effective cadence matches the spec. The more frequent ping is only to wake Render and to support the bonus of configurable frequency.

## Honest logging

`success` means a trusted quote on the first visible reveal.  
`retried` means the store or the scraper had to try again and then got a quote.  
`failed` means we gave up and wrote no history row.

The UI shows all three. Hiding failures would score worse than an ugly table.

## Change detection

`/api/layout` returns a `revision`, rotating class names, and whether the price lives in a `span` or `div`. Snapshots are stored. If the revision changes, the dashboard flags it. Selectors in the scraper intentionally do not depend on `pw-k2`-style classes, so a class rotation should not kill the job.

## What AI tools got wrong on the first attempt

The first generated approach treated this like a normal e-commerce scrape:

1. **Cheerio on `/product/21`.** The document is an empty Vite shell. There is no price to parse.
2. **Trust `/api/product/:id`.** That JSON has name, SKU, specs, and reviews. It does not have `price` or `stock`.
3. **CSS class selectors.** Layout classes rotate. Any scraper that looks for `.pw-k2` or `.price-value` as the real amount will either miss or pick a hidden decoy. The real amount is the large visible node; `.price-value` is `display:none`.
4. **Click Reveal immediately.** The button stays disabled until hover samples and dwell are satisfied. A synthetic click without mouse movement never loads the quote.
5. **Save whatever number appeared.** The DOM contains decoys and an `Updating…` state. Storing those would be exactly the “incorrect or empty data on failure” the rubric forbids.
6. **`setInterval` inside Express.** That dies when Render sleeps. The PDF already says to use an external cron.

Those mistakes were corrected by driving the real UI with Playwright, parsing only a validated visible price, and moving the clock off the web process.

## Interview modification

The scrape path is isolated in `backend/src/scraper.js` with named steps (cookies, hover, reveal, wait, parse). A live change should be a wait, a selector, or a validation rule, not a rewrite of the React app.
