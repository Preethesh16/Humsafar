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

/**
 * Return the one itinerary day that belongs on the game board right now.
 * Every day starts and ends at the shared base, so drawing the whole trip at
 * once stacks identical markers and creates crossing tracks.
 */
export function questLevel(stops, completed) {
  if (!stops.length) {
    return { day: null, stops: [], startIndex: 0, completed: 0, total: 0 };
  }

  const safeCompleted = Math.min(Math.max(Number(completed) || 0, 0), stops.length);
  const active = stops[safeCompleted] ?? stops.at(-1);
  const day = active.day;
  const startIndex = stops.findIndex((stop) => stop.day === day);
  const levelStops = stops.filter((stop) => stop.day === day);

  return {
    day,
    stops: levelStops,
    startIndex,
    completed: Math.min(Math.max(safeCompleted - startIndex, 0), levelStops.length),
    total: levelStops.length,
  };
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
  const mapped = rows.map((row) => ({
    ...row,
    x: 8 + ((Number(row.longitude) - minLon) / lonSpan) * 84,
    // Latitude grows northward; screen y grows downward.
    y: 8 + ((maxLat - Number(row.latitude)) / latSpan) * 64,
  }));
  return separateMarkers(mapped);
}

function separateMarkers(points, minimumDistance = 11) {
  const separated = points.map((point) => ({ ...point }));
  for (let pass = 0; pass < 18; pass += 1) {
    for (let right = 0; right < separated.length; right += 1) {
      for (let left = 0; left < right; left += 1) {
        let dx = separated[right].x - separated[left].x;
        let dy = separated[right].y - separated[left].y;
        let distance = Math.hypot(dx, dy);
        if (distance >= minimumDistance) continue;

        if (distance < 0.01) {
          const angle = ((right + 1) * 137.5 * Math.PI) / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const nudge = (minimumDistance - distance) / 2;
        const unitX = dx / distance;
        const unitY = dy / distance;
        separated[left].x = clamp(separated[left].x - unitX * nudge, 8, 92);
        separated[left].y = clamp(separated[left].y - unitY * nudge, 8, 72);
        separated[right].x = clamp(separated[right].x + unitX * nudge, 8, 92);
        separated[right].y = clamp(separated[right].y + unitY * nudge, 8, 72);
      }
    }
  }
  return separated;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
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
