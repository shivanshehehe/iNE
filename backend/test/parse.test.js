import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDigits, parseMoney, parseStock } from "../src/parse.js";

test("parses standard Indian currency", () => {
  assert.equal(parseMoney("₹1,299"), 1299);
  assert.equal(parseMoney("Rs. 2,499.00"), 2499);
});

test("parses awkward store formats", () => {
  assert.equal(parseMoney("₹1 299"), 1299);
  assert.equal(parseMoney("₹1.299,00"), 1299);
  assert.equal(parseMoney("₹1,299/- (incl. of all taxes)"), 1299);
  assert.equal(parseMoney("₹１,２４０"), 1240);
});

test("strips zero-width characters", () => {
  assert.equal(normalizeDigits("₹1\u200b2\u00a09"), "₹129");
  assert.equal(parseMoney("₹1\u200b,2\u200b99"), 1299);
});

test("never stores empty or zero prices", () => {
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("Price hidden"), null);
  assert.equal(parseMoney("₹0"), null);
});

test("parses rotating stock copy", () => {
  assert.deepEqual(parseStock("In stock · 12 left").quantity, 12);
  assert.equal(parseStock("Only 3 left").inStock, true);
  assert.equal(parseStock("Out of stock").inStock, false);
  assert.equal(parseStock("Hurry, just 1 left").quantity, 1);
});
