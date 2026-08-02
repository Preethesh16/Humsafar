import assert from "node:assert/strict";
import test from "node:test";

import { destinationFromGoal, mapsUrl } from "../src/lib/maps.js";

test("builds a keyless Google Maps search for the vendor and place", () => {
  const url = mapsUrl("Anjuna Beach Resort", "Goa");
  assert.ok(url.startsWith("https://www.google.com/maps/search/?api=1&query="));
  assert.ok(url.includes("Anjuna"));
  assert.ok(url.includes("Goa"));
  // No key may ever appear in a URL built in client code.
  assert.ok(!/key=/i.test(url));
});

test("the query is encoded, so punctuation cannot break the link", () => {
  const url = mapsUrl("Chef's Table & Co", "Goa");
  assert.ok(!url.includes(" "), "spaces must be encoded");
  assert.ok(!url.includes("&query=Chef's Table & Co"), "ampersands must not split the query");
  assert.ok(url.includes(encodeURIComponent("Chef's Table & Co Goa")));
});

test("a vendor that already names its city is not asked for it twice", () => {
  const url = mapsUrl("Zostel Goa", "Goa");
  assert.equal((url.match(/Goa/g) ?? []).length, 1);
});

test("deduplication ignores case", () => {
  const url = mapsUrl("Taj Holiday Village GOA", "Goa");
  assert.equal((url.match(/GOA|Goa/gi) ?? []).length, 1);
});

test("a missing destination still produces a usable link", () => {
  const url = mapsUrl("Gunpowder Assagao", "");
  assert.ok(url.includes("Gunpowder"));
  assert.ok(url.startsWith("https://www.google.com/maps/search/"));
});

test("nothing searchable yields null rather than a broken link", () => {
  assert.equal(mapsUrl("", ""), null);
  assert.equal(mapsUrl(null, undefined), null);
  assert.equal(mapsUrl("   ", "  "), null);
});

test("pulls the destination out of the goal sentence", () => {
  assert.equal(destinationFromGoal("Plan a 3-day trip from Bengaluru to Goa for 2 travellers"), "Goa");
  assert.equal(destinationFromGoal("Plan a 5-day trip from Mumbai to New Delhi for 4 travellers"), "New Delhi");
  assert.equal(destinationFromGoal("Plan my Goa trip under 30000"), "");
});

test("an unparseable goal returns empty rather than nonsense", () => {
  assert.equal(destinationFromGoal(""), "");
  assert.equal(destinationFromGoal(undefined), "");
  assert.equal(destinationFromGoal("something entirely different"), "");
});
