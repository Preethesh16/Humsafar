/**
 * Scales offline discovery fixtures to the trip actually requested.
 *
 * The fixture rows are written for one baseline trip — 3 days (2 nights), one
 * traveller, one room — because that is the demo scenario and because
 * `backend/test/integrations.test.js` locks their raw totals to ₹16,100 and
 * ₹35,600 to guarantee the agents have something real to negotiate over.
 *
 * Those raw rows are left untouched. Scaling happens on the way out, so the
 * invariant still holds while an 8-day trip for four stops being quoted the
 * price of a 3-day trip for one.
 *
 * Why this matters beyond arithmetic: the descriptions previously baked in
 * "2 nights" and "for two" regardless of what was asked. A run could negotiate
 * a coherent budget and then describe a completely different trip — the kind of
 * mismatch `precaution.md` exists to prevent, because the UI would be
 * describing something the plan does not deliver.
 */

/** The trip the fixture prices are written for. */
export const BASELINE = Object.freeze({ days: 3, nights: 2, travelers: 1, rooms: 1 });

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

/** Normalises whatever the caller supplied into a usable trip shape. */
export function tripScope(input = {}) {
  const days = positiveInt(input.days, BASELINE.days);
  const travelers = positiveInt(input.travelers, BASELINE.travelers);
  // A trip of N days has N-1 nights, and a single-day trip still needs
  // somewhere to put its luggage rather than zero nights of accommodation.
  const nights = Math.max(days - 1, 1);
  // Never fewer rooms than the caller asked for, and never zero.
  const rooms = positiveInt(input.rooms, BASELINE.rooms);
  return { days, nights, travelers, rooms };
}

/**
 * How much a category's price grows relative to the baseline trip.
 *
 * Deliberately per-category, because these things do not scale the same way:
 * a hotel bill grows with nights and rooms, meals grow with days and people,
 * a seat or an activity ticket grows with people only.
 */
export function priceMultiplier(category, scope) {
  switch (category) {
    case "stay":
      return (scope.nights / BASELINE.nights) * (scope.rooms / BASELINE.rooms);
    case "food":
      return (scope.days / BASELINE.days) * (scope.travelers / BASELINE.travelers);
    case "flights":
    case "guide":
      return scope.travelers / BASELINE.travelers;
    default:
      return 1;
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The scope suffix shown to the user, so the row states what it covers. */
export function scopeLabel(category, scope) {
  switch (category) {
    case "stay":
      return `${plural(scope.nights, "night")}, ${plural(scope.rooms, "room")}`;
    case "food":
      return `${plural(scope.days, "day")} of meals for ${scope.travelers}`;
    case "flights":
      return `return, ${plural(scope.travelers, "traveller")}`;
    case "guide":
      return `for ${plural(scope.travelers, "traveller")}`;
    default:
      return "";
  }
}

/**
 * Applies both to a set of fixture rows.
 *
 * Prices round to whole rupees — a fixture quoting paise would look like a
 * calculation artefact rather than a price. Ordering, ids, vendors, ratings and
 * `source` are preserved exactly: this only answers "how much, and for what".
 */
export function scaleFixtures(rows, category, input = {}) {
  const scope = tripScope(input);
  const multiplier = priceMultiplier(category, scope);
  const label = scopeLabel(category, scope);

  return rows.map((row) => ({
    ...row,
    price: Math.round(row.price * multiplier),
    description: label ? `${row.description} · ${label}` : row.description,
  }));
}
