const FULLWIDTH = /[\uFF10-\uFF19]/g;
const INVISIBLE = /[\u200B\u200C\u200D\u2060\uFEFF\u00A0]/g;

export function normalizeDigits(value) {
  return String(value || "")
    .replace(FULLWIDTH, (ch) => String(ch.charCodeAt(0) - 0xff10))
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMoney(raw) {
  let text = normalizeDigits(raw);
  if (!text) return null;
  text = text
    .replace(/incl\.? of all taxes/i, "")
    .replace(/\/-\s*$/, "")
    .replace(/Rs\.?/gi, "")
    .replace(/INR/gi, "")
    .replace(/[₹$€£]/g, "")
    .trim();

  if (/\d{1,3}(?:\.\d{3})+,\d{2}/.test(text)) {
    const compact = text.replace(/[^\d.,]/g, "");
    const amount = Number(compact.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  const compact = text.replace(/[^\d.]/g, "");
  const amount = Number(compact);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function parseStock(raw) {
  const text = normalizeDigits(raw);
  if (!text) return { inStock: false, quantity: null, text: "" };
  if (/out of stock/i.test(text)) {
    return { inStock: false, quantity: 0, text };
  }
  const quantityMatch = text.match(/(\d+)/);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : null;
  return {
    inStock: quantity === null ? true : quantity > 0,
    quantity,
    text,
  };
}

export function looksLikeDecoy(nodeText, visiblePrice) {
  const decoy = parseMoney(nodeText);
  return decoy !== null && visiblePrice !== null && decoy !== visiblePrice;
}
