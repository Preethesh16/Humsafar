export async function fetchPlaceSuggestions(input, fetchImpl = globalThis.fetch) {
  return postJson("/api/itineraries/suggestions", input, fetchImpl);
}

export async function previewItinerary(input, fetchImpl = globalThis.fetch) {
  return postJson("/api/itineraries/preview", input, fetchImpl);
}

export function itineraryRequest(answers, days) {
  return {
    destination: answers.destination.trim(),
    days,
    travelers: Number(answers.travelers),
    planningMode: answers.placePlanningMode,
    selectedPlaceIds: answers.selectedPlaceIds,
    interests: answers.placeInterests,
    pace: answers.pace,
    localTransportMode: answers.localTransportMode,
    departureDate: answers.departureDate || undefined,
  };
}

/** Rebuilds an accepted itinerary around the stay selected by the stay agent. */
export function stayReplanRequest(plan, stayName) {
  const selectedPlaceIds = plan?.days
    ?.flatMap((day) => day.timeline ?? [])
    .filter((stop) => stop.type === "place" && stop.id)
    .map((stop) => stop.id) ?? [];
  const destination = plan?.destination?.formatted ?? plan?.destination?.name ?? "";
  return {
    destination,
    days: plan?.days?.length,
    travelers: plan?.travelers,
    planningMode: "choose",
    selectedPlaceIds,
    pace: plan?.pace,
    localTransportMode: plan?.localTransportMode,
    departureDate: plan?.days?.[0]?.date ?? undefined,
    baseName: stayName,
    basePlace: [stayName, destination].filter(Boolean).join(", "),
  };
}

async function postJson(path, body, fetchImpl) {
  const response = await fetchImpl(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `Planner returned ${response.status}`);
    error.code = payload?.error?.code ?? "ITINERARY_REQUEST_FAILED";
    throw error;
  }
  return payload;
}
