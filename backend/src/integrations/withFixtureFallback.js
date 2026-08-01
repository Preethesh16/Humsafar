export async function withFixtureFallback({ integration, live, fixture, logger = console }) {
  try {
    const data = await live();
    logger.info?.({ integration, source: "live" });
    return { data, source: "live" };
  } catch (error) {
    logger.warn?.({ integration, source: "fixture", code: error?.code ?? "LIVE_UNAVAILABLE" });
    return { data: await fixture(), source: "fixture" };
  }
}
