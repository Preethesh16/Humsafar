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

const BASE = "https://www.google.com/maps/search/?api=1&query=";

/**
 * @param {string} vendor  the merchant name the agent chose
 * @param {string} [place] destination or city, used to disambiguate
 * @returns {string|null}  null when there is nothing searchable, so callers can
 *                         omit the link rather than render a broken one
 */
export function mapsUrl(vendor, place) {
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

  return `${BASE}${encodeURIComponent(query)}`;
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
