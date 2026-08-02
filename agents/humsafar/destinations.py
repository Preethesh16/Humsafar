"""Destination-aware fixture inventory.

`FixtureDiscovery` used to ignore the goal completely and return the same
Bengaluru→Goa options for every request. Asking for a Jaipur trip produced
BLR-GOI flights and a hotel in Anjuna — the Intent Agent parsed the destination
correctly and discovery then threw it away. That is worse than static: the
product silently claimed to have searched somewhere it had not.

This module makes the offline inventory respond to what the user actually
asked for, while keeping two properties that matter:

* **Still honestly labelled.** Every option remains `source: "fixture"`. The
  data is synthetic either way — the fix is that it is now synthetic *for the
  requested destination* instead of synthetic for somewhere else entirely.
* **Deterministic.** The same destination always yields the same options, so a
  demo is reproducible and a negotiation can be rehearsed. Prices vary by
  destination through a stable hash, not a random number.

The price ladder shape is preserved from the tuned Goa set — cheapest options
comfortably affordable, preferred options summing past a typical budget — so
the negotiation still has genuine contention wherever the user goes.
"""

import hashlib
import math
import re

# Airports for the destinations most likely in an Indian demo. Anything else
# gets a readable placeholder rather than an invented IATA code, because a
# fabricated airport code is exactly the kind of detail that looks like real
# data and is not.
AIRPORTS = {
    "goa": "GOI",
    "jaipur": "JAI",
    "delhi": "DEL",
    "mumbai": "BOM",
    "bengaluru": "BLR",
    "bangalore": "BLR",
    "chennai": "MAA",
    "kolkata": "CCU",
    "hyderabad": "HYD",
    "kochi": "COK",
    "udaipur": "UDR",
    "srinagar": "SXR",
    "leh": "IXL",
    "varanasi": "VNS",
    "pune": "PNQ",
    "ahmedabad": "AMD",
    "shillong": "SHL",
    "port blair": "IXZ",
}

ORIGIN_CITY = "bengaluru"

_STOPWORDS = {
    "plan", "my", "a", "an", "the", "trip", "to", "for", "under", "budget",
    "days", "day", "weekend", "holiday", "vacation", "travel", "visit", "in",
    "with", "and", "i", "want", "need", "really", "care", "about", "cheap",
    "cheapest", "best", "please", "lets", "let", "us", "go", "going", "book",
}


def parse_destination(goal: str, default: str = "Goa") -> str:
    """Pull a place name out of a free-text goal.

    Deliberately simple: prefer an explicit "to X" or "in X", else the first
    word that looks like a place and is not a stopword. The Intent Agent could
    do this better, but discovery must still work with no API key, and a wrong
    guess here degrades to the default rather than breaking a run.
    """
    text = (goal or "").strip()
    if not text:
        return default

    for pattern in (r"\bto\s+([A-Za-z][A-Za-z\s]{2,20}?)\b", r"\bin\s+([A-Za-z][A-Za-z\s]{2,20}?)\b"):
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            if candidate.lower().split()[0] not in _STOPWORDS:
                return candidate.title()

    # Known destinations win over positional guessing.
    lowered = text.lower()
    for name in AIRPORTS:
        if re.search(rf"\b{re.escape(name)}\b", lowered):
            return name.title()

    for word in re.findall(r"[A-Za-z]+", text):
        if word.lower() not in _STOPWORDS and len(word) > 2:
            return word.title()

    return default


def airport_code(city: str) -> str:
    """A real IATA code where we know one, a readable placeholder otherwise."""
    return AIRPORTS.get(city.strip().lower(), city.strip()[:3].upper())


def price_factor(destination: str) -> float:
    """Stable per-destination multiplier in [0.85, 1.20].

    Hash-derived so the same city always costs the same across runs, which
    keeps demos reproducible, while different cities produce visibly different
    negotiations.
    """
    digest = hashlib.sha256(destination.strip().lower().encode()).digest()
    return 0.85 + (digest[0] / 255) * 0.35


def nights_for(days: int) -> int:
    return max(1, days - 1)


# The hand-tuned Goa ladder, kept verbatim.
#
# Two reasons it is pinned rather than generated. First, the live Prava
# mandates approved for the demo are bound to these exact merchant names and
# capped at these exact slices — regenerating the names would strand every
# mandate and each one costs a passkey ceremony to replace. Second, these
# numbers are what the negotiation was tuned against: preferred options total
# Rs 35,600 against a Rs 30,000 budget, so round one genuinely overshoots and
# the concessions are real downgrades.
#
# Every other destination is generated. Both are `source: "fixture"`.
GOA_INVENTORY: dict[str, list[tuple]] = {
    "flights": [
        ("IndiGo", "6E-6423 BLR-GOI return, 1 checked bag", "IndiGo", "6500.00", 4.1),
        ("SpiceJet", "SG-482 BLR-GOI return, late arrival", "SpiceJet", "7400.00", 3.8),
        ("Akasa Air", "QP-1382 BLR-GOI return, morning out", "Akasa Air", "8200.00", 4.3),
        ("Air India Express", "IX-1128 BLR-GOI return, direct", "Air India Express", "9800.00", 4.4),
        ("Air India", "BLR-GOI return, flexible fare", "Air India", "11800.00", 4.6),
    ],
    "stay": [
        ("Zostel Goa", "2 nights, private twin, Anjuna", "Zostel Goa", "5400.00", 4.0),
        ("The Hosteller", "2 nights, deluxe double, Vagator", "The Hosteller", "8900.00", 4.2),
        ("Anjuna Beach Resort", "2 nights, pool-view room", "Anjuna Beach Resort", "11200.00", 4.5),
        ("Casa Vagator", "2 nights, sea-view room, breakfast", "Casa Vagator", "14500.00", 4.7),
        ("Taj Holiday Village", "2 nights, garden villa", "Taj Holiday Village", "16000.00", 4.8),
    ],
    "food": [
        ("Local shacks", "2 days, beach shack meals for two", "Local Shacks", "2400.00", 3.9),
        ("Fisherman's Wharf", "lunch and dinner for two", "Fisherman's Wharf", "3200.00", 4.1),
        ("Gunpowder Assagao", "dinner for two + one lunch", "Gunpowder Assagao", "4200.00", 4.5),
        ("Thalassa Vagator", "sunset dinner for two, reserved", "Thalassa Vagator", "5200.00", 4.4),
    ],
    "guide": [
        ("GoGoa Bikes", "2-day scooter rental + fuel", "GoGoa Bikes", "1800.00", 4.0),
        ("Spice Plantation Tour", "half day, guided, lunch included", "Spice Plantation Tour", "2600.00", 4.2),
        ("Dudhsagar Day Trip", "guided falls trip, shared jeep", "Dudhsagar Day Trip", "3600.00", 4.6),
        ("Sunset Cruise + Old Goa", "private guide, half day", "Sunset Cruise Old Goa", "4500.00", 4.5),
    ],
}


def build_inventory(
    destination: str,
    days: int = 3,
    origin_city: str = "Bengaluru",
    travel_mode: str = "flight",
    travelers: int = 1,
    rooms: int = 1,
    stay_style: str = "hotel",
) -> dict[str, list[tuple]]:
    """Fixture options shaped for one destination.

    Returns the same `(vendor, description, merchant, price, rating)` tuples
    `FixtureDiscovery` already consumes, so nothing downstream changes.
    """
    city = destination.strip().title() or "Goa"

    # Goa is the pinned demo destination — see GOA_INVENTORY above. Returned
    # verbatim so the live mandates and the tuned negotiation stay valid.
    #
    # **This guard is load-bearing for every live Prava run, and it is narrow.**
    # The approved mandates are `listed` scope, locked to the exact merchant
    # names in GOA_INVENTORY — "Air India Express", "Anjuna Beach Resort",
    # "Gunpowder Assagao", "Dudhsagar Day Trip". Miss any condition below and
    # discovery generates names like "Goa Grand" and "Goa Day Trip" instead, no
    # mandate resolves, and all four mints are refused with
    # "No approved mandate registered for merchant".
    #
    # That is exactly what happened once `travel_mode` and `stay_style` both
    # gained a "compare" default: the pin stopped firing on a default CLI run
    # and live cards broke without a single line of this file changing. A live
    # run needs `--travel-mode flight --stay-style hotel`, and anything driving
    # this from the browser must send the same.
    if (
        travel_mode == "flight"
        and city.lower() == "goa"
        and days == 3
        and origin_city.strip().lower() in {"bengaluru", "bangalore"}
        and travelers == 1
        and rooms == 1
        and stay_style == "hotel"
    ):
        return GOA_INVENTORY

    code = airport_code(city)
    origin = airport_code(origin_city or ORIGIN_CITY)
    route = f"{origin}-{code}"
    factor = price_factor(city)
    nights = nights_for(days)
    party = max(1, int(travelers))
    room_count = max(1, int(rooms))

    def rupees(base: float) -> str:
        # Round to the nearest 100 so amounts read like real fares rather than
        # the output of a multiplier.
        return f"{round(base * factor / 100) * 100:.2f}"

    stay_unit = 2700 * nights / 2  # the tuned ladder assumed 2 nights
    food_unit = 600 * days * party

    inventory = {
        "flights": [
            ("IndiGo", f"6E-6423 {route} return for {party} traveller{'s' if party != 1 else ''}, 1 checked bag each", "IndiGo", rupees(6500 * party), 4.1),
            ("SpiceJet", f"SG-482 {route} return for {party} traveller{'s' if party != 1 else ''}, late arrival", "SpiceJet", rupees(7400 * party), 3.8),
            ("Akasa Air", f"QP-1382 {route} return for {party} traveller{'s' if party != 1 else ''}, morning out", "Akasa Air", rupees(8200 * party), 4.3),
            ("Air India Express", f"IX-1128 {route} return for {party} traveller{'s' if party != 1 else ''}, direct", "Air India Express", rupees(9800 * party), 4.4),
            ("Air India", f"{route} return for {party} traveller{'s' if party != 1 else ''}, flexible fare", "Air India", rupees(11800 * party), 4.6),
        ],
        "stay": accommodation_inventory(
            city=city,
            nights=nights,
            travelers=party,
            rooms=room_count,
            style=stay_style,
            rupees=rupees,
            stay_unit=stay_unit,
        ),
        # Every name here is derived from the destination, like `guide` below.
        # It used to carry "Local shacks", "Gunpowder" and "Thalassa" — real Goa
        # restaurants, hardcoded, returned for *every* city. A Udaipur trip
        # recommended Gunpowder and a Shillong trip offered beach shacks, which
        # reads as a demo scripted for one destination and quietly asserts that
        # a specific real restaurant exists 2,000km from where it does.
        #
        # Goa itself is unaffected: it returns GOA_INVENTORY verbatim above,
        # with the real venue names the live Prava mandates are scoped to.
        "food": [
            (f"{city} Street Eats", f"{days} days, street and cafe meal budget for {party} travellers", f"{city} Street Eats", rupees(food_unit * 2.0), 3.9),
            (f"{city} Kitchen", f"meal budget for {party} travellers", f"{city} Kitchen", rupees(food_unit * 2.7), 4.1),
            (f"{city} Table", f"restaurant meal budget for {party} travellers", f"{city} Table", rupees(food_unit * 3.5), 4.5),
            (f"{city} Rooftop", f"sunset meal estimate for {party} travellers", f"{city} Rooftop", rupees(food_unit * 4.3), 4.4),
        ],
        "guide": [
            (f"{city} Bikes", f"{days}-day scooter rental + fuel", f"{city} Bikes", rupees(1800), 4.0),
            (f"{city} Heritage Walk", "half day, guided, lunch included", f"{city} Heritage Walk", rupees(2600), 4.2),
            (f"{city} Day Trip", "guided full-day trip, shared jeep", f"{city} Day Trip", rupees(3600), 4.6),
            (f"{city} Private Tour", "private guide, half day", f"{city} Private Tour", rupees(4500), 4.5),
        ],
    }
    inventory["flights"] = journey_inventory(
        mode=travel_mode,
        origin_city=origin_city,
        destination=city,
        route=route,
        rupees=rupees,
        flight_rows=inventory["flights"],
        travelers=party,
    )
    return inventory


def accommodation_inventory(
    city: str,
    nights: int,
    travelers: int,
    rooms: int,
    style: str,
    rupees,
    stay_unit: float,
) -> list[tuple]:
    """Group-aware, honestly-labelled accommodation estimates.

    The entire-home rows are search handoffs, not claims of Airbnb inventory.
    Their prices cover the whole property; hotel prices scale with the room
    count and hostel prices scale with travellers. This makes comparing a villa
    with several hotel rooms meaningful for a group instead of cosmetic.
    """
    style = style if style in {"compare", "hotel", "hostel", "home", "homestay"} else "compare"
    guest_text = f"{travelers} guest{'s' if travelers != 1 else ''}"
    room_text = f"{rooms} room{'s' if rooms != 1 else ''}"
    home_units = max(1, math.ceil(travelers / 5))

    hotels = [
        (f"{city} Budget Hotel", f"{nights} nights, {room_text} for {guest_text}", f"{city} Budget Hotel", rupees(stay_unit * 2.0 * rooms), 4.0),
        (f"{city} Grand", f"{nights} nights, {room_text} for {guest_text}, breakfast included", f"{city} Grand", rupees(stay_unit * 3.5 * rooms), 4.4),
        (f"Taj {city}", f"{nights} nights, {room_text} for {guest_text}, full-service hotel", f"Taj {city}", rupees(stay_unit * 5.5 * rooms), 4.8),
    ]
    hostels = [
        (f"Zostel {city}", f"{nights} nights, dorm beds for {guest_text}", f"Zostel {city}", rupees(550 * nights * travelers), 4.0),
        (f"The Hosteller {city}", f"{nights} nights, hostel private rooms for {guest_text}", f"The Hosteller {city}", rupees(900 * nights * travelers), 4.2),
        (f"{city} Social Hostel", f"{nights} nights, premium dorm beds for {guest_text}", f"{city} Social Hostel", rupees(1200 * nights * travelers), 4.4),
    ]
    homes = [
        (f"{city} Entire-home search", f"{nights} nights, whole apartment estimate for {guest_text}", f"{city} Entire-home search", rupees(3200 * nights * home_units), 4.2),
        (f"{city} Villa search", f"{nights} nights, whole villa estimate for {guest_text}", f"{city} Villa search", rupees(4700 * nights * home_units), 4.5),
        (f"{city} Pool Villa search", f"{nights} nights, private whole-property estimate for {guest_text}", f"{city} Pool Villa search", rupees(6800 * nights * home_units), 4.7),
    ]
    homestays = [
        (f"{city} Family Homestay", f"{nights} nights, {room_text} for {guest_text}", f"{city} Family Homestay", rupees(stay_unit * 1.8 * rooms), 4.1),
        (f"{city} Heritage Homestay", f"{nights} nights, {room_text} with breakfast", f"{city} Heritage Homestay", rupees(stay_unit * 2.7 * rooms), 4.5),
        (f"{city} Farmstay", f"{nights} nights, private stay for {guest_text}", f"{city} Farmstay", rupees(stay_unit * 3.4 * rooms), 4.6),
    ]

    if style == "hotel":
        return hotels
    if style == "hostel":
        return hostels
    if style == "home":
        return homes
    if style == "homestay":
        return homestays
    if travelers >= 3:
        return [hotels[0], hotels[1], homes[0], homes[1], homes[2]]
    return [hostels[0], hotels[0], homestays[0], hotels[1], homes[0]]


def journey_inventory(
    mode: str,
    origin_city: str,
    destination: str,
    route: str,
    rupees,
    flight_rows: list[tuple],
    travelers: int = 1,
) -> list[tuple]:
    """Synthetic, disclosed transport choices matching the user's mode.

    The locked event key remains ``flights`` for compatibility, but this is the
    Journey Agent's inventory. Rail/bus/road rows are planning estimates and
    handoffs, never claims that an operator API was searched or a seat exists.
    """
    mode = mode if mode in {"compare", "flight", "train", "bus", "drive"} else "compare"
    route_words = f"{origin_city.strip().title()} to {destination}"
    party = max(1, int(travelers))
    party_text = f"for {party} traveller{'s' if party != 1 else ''}"
    car_count = max(1, math.ceil(party / 4))
    bike_count = max(1, math.ceil(party / 2))
    if mode == "flight":
        return flight_rows

    trains = [
        ("Rail search handoff", f"{route_words} return, sleeper estimate {party_text}", "Rail search handoff", rupees(1800 * party), 3.7),
        ("Rail search handoff", f"{route_words} return, AC 3-tier estimate {party_text}", "Rail search handoff", rupees(2800 * party), 4.1),
        ("Rail search handoff", f"{route_words} return, AC 2-tier estimate {party_text}", "Rail search handoff", rupees(4300 * party), 4.3),
        ("Rail search handoff", f"{route_words} return, first AC estimate {party_text}", "Rail search handoff", rupees(6500 * party), 4.5),
    ]
    buses = [
        ("Intercity bus handoff", f"{route_words} return, non-AC seater estimate {party_text}", "Intercity bus handoff", rupees(1600 * party), 3.5),
        ("Intercity bus handoff", f"{route_words} return, AC sleeper estimate {party_text}", "Intercity bus handoff", rupees(2600 * party), 4.0),
        ("Intercity bus handoff", f"{route_words} return, premium sleeper estimate {party_text}", "Intercity bus handoff", rupees(3800 * party), 4.3),
        ("Intercity bus handoff", f"{route_words} return, flexible cancellation estimate {party_text}", "Intercity bus handoff", rupees(4700 * party), 4.4),
    ]
    road = [
        ("Own vehicle estimate", f"{route_words} return, fuel and toll estimate for {car_count} vehicle{'s' if car_count != 1 else ''}", "Road trip handoff", rupees(3200 * car_count), 4.0),
        ("Bike rental estimate", f"{route_words} return, {bike_count} bike{'s' if bike_count != 1 else ''}, fuel and tolls", "Road trip handoff", rupees(4200 * bike_count), 4.1),
        ("Self-drive rental estimate", f"{route_words} return, {car_count} car{'s' if car_count != 1 else ''}, fuel and tolls", "Road trip handoff", rupees(6800 * car_count), 4.3),
        ("Cab handoff", f"{route_words} return, {car_count} private cab{'s' if car_count != 1 else ''} estimate", "Road trip handoff", rupees(9800 * car_count), 4.4),
    ]
    if mode == "train":
        return trains
    if mode == "bus":
        return buses
    if mode == "drive":
        return road

    # A cross-mode shortlist makes "compare for me" a real input to discovery,
    # not just decorative copy in the prompt.
    return [
        trains[1],
        buses[1],
        road[0],
        flight_rows[0],
        flight_rows[-1],
    ]
