import assert from "node:assert/strict";
import test from "node:test";

import { TrustService } from "../src/services/trustService.js";

test("TrustService returns an explicit fixture decision", async () => {
  const result = await new TrustService().check({ merchant: "Duffel", rating: 4.5 });
  assert.equal(result.source, "fixture");
  assert.equal(result.data.score, 0.9);
  assert.equal(result.data.decision, "allow");
  assert.match(result.data.reason, /Fixture/);
});
