/**
 * Links a vendor to its place on Google Maps.
 *
 * A URL, not an embedded map. Three reasons:
 *  - the Maps JavaScript/Embed APIs need a browser-exposed key, and a key in
 *    client JavaScript is public to every visitor;
 *  - an embed is another network dependency that can fail mid-demo;
 *  - Google's documented `?api=1` search URL needs no key at all and opens the
 *    real place, with reviews and photos, in the user's own Maps app.
 *
 * The query is vendor plus destination rather than vendor alone: "Gunpowder"
 * on its own could be anywhere on earth, while "Gunpowder Assagao Goa" lands on
 * the restaurant the agent actually picked.
 */

const SEARCH = "https://www.google.com/maps/search/?api=1&query=";
const PLACE = "https://www.google.com/maps/place/?api=1&query=";

/**
 * Google resolves a `place_id` to exactly one location. Without one, the search
 * endpoint can only guess, and a generic vendor name — "The Hosteller",
 * "Local shacks" — legitimately matches many places, so it returns a list.
 *
 * Place ids come from the backend, where the API key lives. When one is absent
 * this falls back to search, and `isExactPlace` lets the UI label the link
 * honestly rather than promising a single result it cannot deliver.
 */
export function isExactPlace(placeId) {
  return typeof placeId === "string" && placeId.trim().length > 0;
}

/**
 * @param {string} vendor    the merchant name the agent chose
 * @param {string} [place]   destination or city, used to disambiguate
 * @param {string} [placeId] Google place id; pins the link to one location
 * @returns {string|null}    null when there is nothing searchable, so callers
 *                           can omit the link rather than render a broken one
 */
export function mapsUrl(vendor, place, placeId) {
  const parts = [vendor, place]
    .map((part) => String(part ?? "").trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) return null;

  // Deduplicate so "Goa" + "Goa" does not become "Goa Goa", and so a vendor
  // that already names its city is not asked for it twice.
  const query = parts
    .join(" ")
    .split(/\s+/)
    .filter((word, index, words) => {
      const seen = words.slice(0, index).map((w) => w.toLowerCase());
      return !seen.includes(word.toLowerCase());
    })
    .join(" ");

  if (isExactPlace(placeId)) {
    // The place endpoint plus a place id opens that one location directly.
    // `query` stays as the human-readable label Google shows while resolving.
    return `${PLACE}${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(placeId.trim())}`;
  }

  return `${SEARCH}${encodeURIComponent(query)}`;
}

/**
 * Best-effort destination for disambiguation.
 *
 * The trip is not on the locked event contract, so it is read from whatever the
 * page already knows — the run's goal sentence — rather than adding a field to
 * a locked shape for a convenience link. Returns "" when it cannot tell, which
 * `mapsUrl` handles by searching the vendor alone.
 */
export function destinationFromGoal(goal) {
  const text = String(goal ?? "");
  // "…trip from Bengaluru to Goa for 2 travellers" → "Goa"
  const to = text.match(/\bto\s+([A-Za-z][A-Za-z\s.'-]{1,40}?)(?=\s+(?:for|with|in|on|under|,)|$)/i);
  return to ? to[1].trim() : "";
}
