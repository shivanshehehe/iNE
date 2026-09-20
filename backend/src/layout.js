import { fetchLayout } from "./catalog.js";
import { insertLayoutSnapshot, latestLayout } from "./db.js";

function summarizeChange(prev, next) {
  const changes = [];
  if (!prev) return "First layout snapshot";
  if (prev.revision !== next.revision) changes.push(`revision ${prev.revision} → ${next.revision}`);
  if (prev.variant !== next.variant) changes.push(`variant ${prev.variant} → ${next.variant}`);
  if (prev.price_tag !== next.priceTag) changes.push(`price tag ${prev.price_tag} → ${next.priceTag}`);
  if (prev.price_carrier !== next.priceCarrier) {
    changes.push(`price carrier ${prev.price_carrier} → ${next.priceCarrier}`);
  }
  const prevClasses = JSON.stringify(prev.classes || {});
  const nextClasses = JSON.stringify(next.classes || {});
  if (prevClasses !== nextClasses) changes.push("CSS class names rotated");
  return changes.join("; ") || "Layout payload changed";
}

export async function detectLayoutChange() {
  const layout = await fetchLayout();
  const previous = await latestLayout();
  const changed = !previous || previous.revision !== layout.revision || previous.variant !== layout.variant;
  if (!changed) {
    return { changed: false, layout, previous };
  }
  const snapshot = await insertLayoutSnapshot({
    revision: layout.revision,
    variant: layout.variant,
    classes: layout.classes,
    price_tag: layout.priceTag,
    price_carrier: layout.priceCarrier,
    changed_from: previous?.revision ?? null,
    change_summary: summarizeChange(previous, layout),
  });
  return { changed: true, layout, previous, snapshot };
}
