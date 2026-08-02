const DEFAULT_CATEGORIES = [
  "tourism.attraction",
  "tourism.sights",
  "beach",
  "entertainment.museum",
  "leisure.park",
];

const INTEREST_CATEGORIES = Object.freeze({
  beaches: ["beach"],
  heritage: ["tourism.sights", "tourism.sights.place_of_worship", "entertainment.museum"],
  nature: ["natural", "leisure.park"],
  nightlife: ["adult.nightclub", "catering.bar", "catering.pub"],
  adventure: ["entertainment.activity_park", "commercial.outdoor_and_sport", "sport"],
  shopping: ["commercial.marketplace", "commercial.shopping_mall"],
  culture: ["entertainment.culture", "entertainment.museum", "tourism.sights"],
});

const PACE = Object.freeze({ relaxed: 2, balanced: 3, packed: 4 });

/**
 * A non-purchasing local planner.
 *
 * Provider facts (places, coordinates, routes and weather) stay separate from
 * planning estimates (visit duration, entry bands and meal bands). Nothing
 * returned here is called a booking, live price, opening time, or reservation.
 */
export class ItineraryService {
  constructor({ geoapifyClient, weatherClient, logger = console } = {}) {
    if (!geoapifyClient) throw new TypeError("A Geoapify client is required");
    if (!weatherClient) throw new TypeError("A weather client is required");
    this.geoapify = geoapifyClient;
    this.weather = weatherClient;
    this.logger = logger;
  }

  async suggestions(input = {}) {
    const trip = validateInput(input);
    const destination = await this.geoapify.geocode(trip.destination);
    const categories = categoriesFor(trip.interests);
    const rows = await this.geoapify.places({
      ...destination,
      categories,
      radius: trip.radiusMeters,
      limit: Math.max(20, Math.min(60, trip.days * PACE[trip.pace] * 4)),
    });
    const places = uniquePlaces(rows)
      .map((place) => enrichPlace(place, trip.travelers))
      .sort((left, right) => suggestionScore(right, trip.interests) - suggestionScore(left, trip.interests))
      .slice(0, Math.max(12, trip.days * PACE[trip.pace] * 2));
    if (places.length === 0) {
      const error = new Error(`No usable places were returned near ${trip.destination}`);
      error.code = "ITINERARY_PLACES_EMPTY";
      throw error;
    }
    return {
      destination,
      places,
      source: "geoapify",
      selectionBasis: "Category match and proximity; Wikipedia-linked places are prioritised when available.",
      truth: "These are real mapped places, not claims of popularity, availability, opening hours, or bookability.",
    };
  }

  async plan(input = {}) {
    const trip = validateInput(input);
    const suggested = await this.suggestions(trip);
    const wanted = new Set(trip.selectedPlaceIds);
    const selected = trip.planningMode === "choose" && wanted.size > 0
      ? suggested.places.filter((place) => wanted.has(place.id))
      : suggested.places;
    const count = Math.min(selected.length, trip.days * PACE[trip.pace]);
    if (count === 0) {
      const error = new Error("Select at least one mapped place, or let Humsafar decide");
      error.code = "ITINERARY_SELECTION_EMPTY";
      throw error;
    }

    const mappedBase = trip.baseCoordinates
      ? trip.baseCoordinates
      : trip.basePlace
        ? await this.geoapify.geocode(trip.basePlace)
        : null;
    const base = mappedBase
      ? { name: trip.baseName || mappedBase.name || "Your selected stay", latitude: mappedBase.latitude, longitude: mappedBase.longitude }
      : { name: `${suggested.destination.name} centre`, latitude: suggested.destination.latitude, longitude: suggested.destination.longitude };
    const days = clusterDays(selected.slice(0, count), trip.days, PACE[trip.pace], base);
    const weather = await this.#weather(suggested.destination, trip);
    const plannedDays = await Promise.all(days.map((places, index) => this.#buildDay({
      index,
      date: dateAt(trip.departureDate, index),
      places,
      base,
      trip,
      weather: weather.days?.[index] ?? null,
    })));

    return {
      destination: suggested.destination,
      planningMode: trip.planningMode,
      pace: trip.pace,
      travelers: trip.travelers,
      localTransportMode: trip.localTransportMode,
      base,
      baseAssumption: mappedBase
        ? "Routes start and end at the selected stay."
        : "Routes temporarily start and end at the destination centre; they should be recalculated after a stay is chosen.",
      weather,
      days: plannedDays,
      estimatedVariableCost: sumCost(plannedDays),
      source: { places: "geoapify", routes: "geoapify", weather: "open-meteo", costs: "planning-estimate" },
      truth: [
        "Food is suggested only and is never booked.",
        "Meal suggestions are near a planned stop; optional meal detours are not included in the route total.",
        "Entry and meal amounts are planning ranges, not live merchant prices.",
        "Confirm opening hours, closures, ticket rules and accessibility before leaving.",
      ],
    };
  }

  async #weather(destination, trip) {
    try {
      return await this.weather.daily({
        latitude: destination.latitude,
        longitude: destination.longitude,
        startDate: trip.departureDate,
        endDate: dateAt(trip.departureDate, trip.days - 1),
      });
    } catch (error) {
      this.logger.warn?.({ integration: "open-meteo", code: error.code ?? "FAILED" });
      return { source: "open-meteo", available: false, reason: "Weather is temporarily unavailable; the route is still usable.", days: [] };
    }
  }

  async #buildDay({ index, date, places, base, trip, weather }) {
    const ordered = nearestOrder(places, base);
    const waypoints = [base, ...ordered, base];
    const route = await this.#route(waypoints, trip.localTransportMode);
    const lunchAnchor = ordered[0] ?? base;
    const dinnerAnchor = ordered.at(-1) ?? base;
    const [lunch, dinner] = await Promise.all([
      this.#foodNear(lunchAnchor, trip.travelers, "lunch"),
      this.#foodNear(dinnerAnchor, trip.travelers, "dinner"),
    ]);
    const timeline = buildTimeline({ ordered, route, lunch, dinner, weather, startMinutes: 9 * 60 });
    const finalMinutes = timeline.at(-1)?.endMinutes ?? 17 * 60;
    const returnLeg = route.legs?.[ordered.length] ?? estimateLeg(ordered.at(-1) ?? base, base, trip.localTransportMode);

    return {
      day: index + 1,
      date,
      title: dayTitle(ordered, index),
      weather,
      weatherAdvice: weatherAdvice(weather),
      timeline: timeline.map(publicStop),
      returnToBase: {
        from: ordered.at(-1)?.name ?? base.name,
        to: base.name,
        departAt: minutesLabel(finalMinutes),
        arriveAt: minutesLabel(finalMinutes + minutesFor(returnLeg.durationSeconds)),
        distanceKm: kilometres(returnLeg.distanceMeters),
        durationMinutes: minutesFor(returnLeg.durationSeconds),
      },
      route: {
        mode: trip.localTransportMode,
        distanceKm: kilometres(route.distanceMeters),
        durationMinutes: minutesFor(route.durationSeconds),
        source: route.source,
      },
      estimatedCost: costForDay(timeline),
    };
  }

  async #route(waypoints, mode) {
    try {
      return { ...(await this.geoapify.route({ waypoints, mode })), source: "geoapify" };
    } catch (error) {
      this.logger.warn?.({ integration: "geoapify-routing", code: error.code ?? "FAILED" });
      const legs = waypoints.slice(1).map((point, index) => estimateLeg(waypoints[index], point, mode));
      return {
        source: "straight-line-estimate",
        legs,
        distanceMeters: legs.reduce((total, leg) => total + leg.distanceMeters, 0),
        durationSeconds: legs.reduce((total, leg) => total + leg.durationSeconds, 0),
      };
    }
  }

  async #foodNear(anchor, travelers, meal) {
    try {
      const places = await this.geoapify.places({
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        categories: ["catering.restaurant", "catering.cafe", "catering.fast_food"],
        radius: 2_000,
        limit: 5,
      });
      return places.slice(0, 3).map((place) => ({
        ...place,
        kind: "food",
        meal,
        estimatedCost: mealEstimate(place.categories, travelers),
        booking: "suggestion-only",
      }));
    } catch (error) {
      this.logger.warn?.({ integration: "geoapify-food", code: error.code ?? "FAILED" });
      return [];
    }
  }
}

function validateInput(input) {
  const destination = String(input.destination ?? "").trim();
  if (!destination) throw inputError("destination is required", "INVALID_ITINERARY_DESTINATION");
  const days = integer(input.days, 1, 14, 3);
  const travelers = integer(input.travelers, 1, 20, 1);
  const pace = ["relaxed", "balanced", "packed"].includes(input.pace) ? input.pace : "balanced";
  const planningMode = ["decide", "choose"].includes(input.planningMode) ? input.planningMode : "decide";
  const localTransportMode = ["drive", "walk", "bicycle", "scooter", "transit"].includes(input.localTransportMode)
    ? input.localTransportMode : "drive";
  const selectedPlaceIds = Array.isArray(input.selectedPlaceIds)
    ? [...new Set(input.selectedPlaceIds.map(String))].slice(0, 56) : [];
  const interests = Array.isArray(input.interests)
    ? [...new Set(input.interests.map(String).filter((item) => INTEREST_CATEGORIES[item]))] : [];
  const baseCoordinates = validPoint(input.baseCoordinates) ? {
    latitude: Number(input.baseCoordinates.latitude), longitude: Number(input.baseCoordinates.longitude),
  } : null;
  return {
    destination,
    days,
    travelers,
    pace,
    planningMode,
    localTransportMode,
    selectedPlaceIds,
    interests,
    departureDate: isoDate(input.departureDate),
    radiusMeters: Math.min(Math.max(Number(input.radiusMeters) || 30_000, 2_000), 100_000),
    baseCoordinates,
    baseName: String(input.baseName ?? "").trim().slice(0, 120),
    basePlace: String(input.basePlace ?? "").trim().slice(0, 240),
  };
}

function categoriesFor(interests) {
  const selected = interests.flatMap((interest) => INTEREST_CATEGORIES[interest] ?? []);
  return [...new Set(selected.length ? selected : DEFAULT_CATEGORIES)];
}

function enrichPlace(place, travelers) {
  return {
    ...place,
    kind: placeKind(place.categories),
    estimatedVisitMinutes: visitMinutes(place.categories),
    estimatedEntryCost: entryEstimate(place.categories, travelers),
    booking: "suggestion-only",
  };
}

function suggestionScore(place, interests) {
  const interestCategories = interests.flatMap((interest) => INTEREST_CATEGORIES[interest] ?? []);
  const categoryMatches = interestCategories.filter((wanted) => place.categories.some((actual) => actual.startsWith(wanted))).length;
  const distancePenalty = Number.isFinite(place.distanceMeters) ? Math.min(place.distanceMeters / 10_000, 4) : 0;
  return categoryMatches * 5 + (place.hasWikipedia ? 4 : 0) - distancePenalty;
}

function uniquePlaces(rows) {
  const seen = new Set();
  return rows.filter((place) => {
    const key = `${place.name.toLowerCase()}:${place.latitude.toFixed(4)}:${place.longitude.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clusterDays(places, days, perDay, base) {
  const remaining = [...places];
  const groups = Array.from({ length: days }, () => []);
  for (let day = 0; day < days && remaining.length; day += 1) {
    const seed = remaining.shift();
    groups[day].push(seed);
    while (groups[day].length < perDay && remaining.length) {
      const centroid = groups[day].reduce((sum, place) => ({
        latitude: sum.latitude + place.latitude / groups[day].length,
        longitude: sum.longitude + place.longitude / groups[day].length,
      }), { latitude: 0, longitude: 0 });
      const nearest = nearestIndex(remaining, centroid ?? base);
      groups[day].push(remaining.splice(nearest, 1)[0]);
    }
  }
  return groups.filter((group) => group.length);
}

function nearestOrder(places, start) {
  const remaining = [...places];
  const ordered = [];
  let current = start;
  while (remaining.length) {
    const index = nearestIndex(remaining, current);
    current = remaining.splice(index, 1)[0];
    ordered.push(current);
  }
  return ordered;
}

function nearestIndex(places, point) {
  let best = 0;
  for (let index = 1; index < places.length; index += 1) {
    if (haversine(point, places[index]) < haversine(point, places[best])) best = index;
  }
  return best;
}

function buildTimeline({ ordered, route, lunch, dinner, weather, startMinutes }) {
  const timeline = [];
  let clock = startMinutes;
  ordered.forEach((place, index) => {
    const leg = route.legs?.[index] ?? { distanceMeters: 0, durationSeconds: 0 };
    clock += minutesFor(leg.durationSeconds);
    if (index === 1 && clock < 13 * 60) clock = 13 * 60;
    const duration = place.estimatedVisitMinutes;
    timeline.push({
      type: "place",
      ...place,
      startMinutes: clock,
      endMinutes: clock + duration,
      travelFromPrevious: {
        distanceKm: kilometres(leg.distanceMeters), durationMinutes: minutesFor(leg.durationSeconds), source: route.source,
      },
      weatherNote: weatherAdvice(weather),
    });
    clock += duration;
    if (index === 0 && lunch.length) {
      const mealStart = Math.max(clock, 12 * 60 + 30);
      timeline.push({
        type: "food",
        label: "Lunch nearby — choose based on your mood",
        options: lunch,
        startMinutes: mealStart,
        endMinutes: mealStart + 60,
      });
      clock = mealStart + 60;
    }
  });
  if (dinner.length) {
    const mealStart = Math.max(clock, 19 * 60);
    timeline.push({
      type: "food",
      label: "Optional dinner nearby — not booked",
      options: dinner,
      startMinutes: mealStart,
      endMinutes: mealStart + 75,
    });
  }
  return timeline;
}

function publicStop(stop) {
  const { startMinutes, endMinutes, ...publicValue } = stop;
  return { ...publicValue, startAt: minutesLabel(startMinutes), endAt: minutesLabel(endMinutes) };
}

function costForDay(timeline) {
  let minimum = 0;
  let maximum = 0;
  for (const stop of timeline) {
    if (stop.type === "place") {
      minimum += stop.estimatedEntryCost.minimum;
      maximum += stop.estimatedEntryCost.maximum;
    } else if (stop.type === "food" && stop.options.length) {
      minimum += Math.min(...stop.options.map((option) => option.estimatedCost.minimum));
      maximum += Math.max(...stop.options.map((option) => option.estimatedCost.maximum));
    }
  }
  return { currency: "INR", minimum, maximum, basis: "planning-estimate" };
}

function sumCost(days) {
  return days.reduce((total, day) => ({
    currency: "INR",
    minimum: total.minimum + day.estimatedCost.minimum,
    maximum: total.maximum + day.estimatedCost.maximum,
    basis: "planning-estimate",
  }), { currency: "INR", minimum: 0, maximum: 0, basis: "planning-estimate" });
}

function entryEstimate(categories, travelers) {
  let perPerson = [0, 500];
  if (matches(categories, "beach") || matches(categories, "tourism.sights.place_of_worship")) perPerson = [0, 200];
  else if (matches(categories, "entertainment.museum")) perPerson = [100, 800];
  else if (matches(categories, "entertainment.activity_park") || matches(categories, "entertainment.theme_park")) perPerson = [500, 2500];
  return estimate(perPerson[0] * travelers, perPerson[1] * travelers, "category-based estimate; verify at venue");
}

function mealEstimate(categories, travelers) {
  let perPerson = [250, 900];
  if (matches(categories, "catering.cafe") || matches(categories, "catering.fast_food")) perPerson = [150, 450];
  if (matches(categories, "catering.bar") || matches(categories, "catering.pub")) perPerson = [400, 1200];
  return estimate(perPerson[0] * travelers, perPerson[1] * travelers, "meal planning estimate; no reservation");
}

function estimate(minimum, maximum, note) {
  return { currency: "INR", minimum, maximum, basis: "planning-estimate", note };
}

function visitMinutes(categories) {
  if (matches(categories, "beach")) return 120;
  if (matches(categories, "entertainment.activity_park") || matches(categories, "entertainment.theme_park")) return 180;
  if (matches(categories, "entertainment.museum")) return 90;
  if (matches(categories, "commercial")) return 90;
  return 75;
}

function placeKind(categories) {
  if (matches(categories, "beach")) return "beach";
  if (matches(categories, "tourism.sights.place_of_worship")) return "heritage";
  if (matches(categories, "entertainment.museum")) return "museum";
  if (matches(categories, "natural") || matches(categories, "leisure.park")) return "nature";
  if (matches(categories, "commercial")) return "shopping";
  if (matches(categories, "adult.nightclub") || matches(categories, "catering.bar")) return "nightlife";
  return "attraction";
}

function weatherAdvice(weather) {
  if (!weather) return null;
  if (Number(weather.precipitationProbability) >= 60) return "Rain is likely: keep indoor alternatives and travel buffer.";
  if (Number(weather.temperatureMaxC) >= 34) return "Hot afternoon: carry water and prefer shaded or indoor stops after lunch.";
  return "Conditions look suitable; recheck on the morning of the trip.";
}

function dayTitle(places, index) {
  const kinds = [...new Set(places.map((place) => place.kind))].slice(0, 2).join(" + ");
  return kinds ? `${titleCase(kinds)} day` : `Explore day ${index + 1}`;
}

function estimateLeg(from, to, mode) {
  const straight = haversine(from, to);
  const distanceMeters = straight * 1.25;
  const speedKmh = { walk: 4.5, bicycle: 14, scooter: 25, transit: 22, drive: 30 }[mode] ?? 30;
  return { distanceMeters, durationSeconds: (distanceMeters / 1000 / speedKmh) * 3600 };
}

function haversine(left, right) {
  const radius = 6_371_000;
  const radians = (degrees) => degrees * Math.PI / 180;
  const lat1 = radians(left.latitude);
  const lat2 = radians(right.latitude);
  const deltaLat = radians(right.latitude - left.latitude);
  const deltaLon = radians(right.longitude - left.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matches(categories, prefix) {
  return categories.some((category) => category === prefix || category.startsWith(`${prefix}.`));
}

function validPoint(value) {
  return value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude));
}

function integer(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function isoDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? text : null;
}

function dateAt(startDate, offset) {
  if (!startDate) return null;
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function minutesFor(seconds) {
  return Math.max(0, Math.round(Number(seconds || 0) / 60));
}

function kilometres(meters) {
  return Math.round(Number(meters || 0) / 100) / 10;
}

function minutesLabel(minutes) {
  const safe = Math.max(0, Math.round(minutes));
  const hour = Math.floor(safe / 60) % 24;
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inputError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
