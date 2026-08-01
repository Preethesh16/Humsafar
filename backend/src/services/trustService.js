export class TrustService {
  async check({ merchant, rating }) {
    if (typeof merchant !== "string" || !merchant.trim()) {
      throw new TypeError("merchant is required");
    }
    const score = Number.isFinite(rating)
      ? Math.max(0, Math.min(1, rating / 5))
      : 0.7;
    return {
      data: {
        merchant,
        score,
        decision: score >= 0.7 ? "allow" : "review",
        reason: "Fixture trust heuristic; replace with a verified Senso response before claiming track evidence",
      },
      source: "fixture",
    };
  }
}
