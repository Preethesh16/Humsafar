export function questStops(plan) {
  if (!plan?.days?.length) return [];
  return plan.days.flatMap((day) => {
    const places = (day.timeline ?? [])
      .filter((stop) => stop.type === "place" && point(stop))
      .map((stop) => ({
        id: `${day.day}:${stop.id ?? stop.name}`,
        day: day.day,
        name: stop.name,
        address: stop.address,
        startAt: stop.startAt,
        latitude: Number(stop.latitude),
        longitude: Number(stop.longitude),
        kind: "place",
      }));
    const base = point(plan.base) ? [{
      id: `${day.day}:return`,
      day: day.day,
      name: `Return to ${plan.base.name}`,
      address: plan.baseAssumption,
      startAt: day.returnToBase?.arriveAt,
      latitude: Number(plan.base.latitude),
      longitude: Number(plan.base.longitude),
      kind: "return",
    }] : [];
    return [...places, ...base];
  });
}

export function mapPoints(stops, currentLocation = null) {
  const rows = [...stops, ...(point(currentLocation) ? [{ ...currentLocation, id: "you" }] : [])];
  if (!rows.length) return [];
  const latitudes = rows.map((row) => Number(row.latitude));
  const longitudes = rows.map((row) => Number(row.longitude));
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const latSpan = Math.max(maxLat - minLat, 0.002);
  const lonSpan = Math.max(maxLon - minLon, 0.002);
  return rows.map((row) => ({
    ...row,
    x: 8 + ((Number(row.longitude) - minLon) / lonSpan) * 84,
    // Latitude grows northward; screen y grows downward.
    y: 8 + ((maxLat - Number(row.latitude)) / latSpan) * 64,
  }));
}

export function distanceKm(left, right) {
  if (!point(left) || !point(right)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const lat1 = radians(Number(left.latitude));
  const lat2 = radians(Number(right.latitude));
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(Number(right.longitude) - Number(left.longitude));
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return Math.round((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 10) / 10;
}

export function questStorageKey(plan) {
  const destination = plan?.destination?.placeId ?? plan?.destination?.formatted ?? plan?.destination?.name ?? "trip";
  const date = plan?.days?.[0]?.date ?? "flexible";
  return `humsafar.quest:${destination}:${date}`;
}

function point(value) {
  return Number.isFinite(Number(value?.latitude)) && Number.isFinite(Number(value?.longitude));
}
