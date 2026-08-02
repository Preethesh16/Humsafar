# Humsafar — keys, free data and real-booking boundaries

Last reviewed: 2026-08-02. This is the answer to “which API keys do we actually
need?” A planning result, a provider search result and a confirmed booking are
three different claims; Humsafar keeps them separate.

## Exact answer

The project can run end to end with **zero API keys** using deterministic agent
dialogue and disclosed synthetic inventory. For the intended OpenAI multi-agent
experience, the only additional key required is the existing server-side
`OPENAI_API_KEY`.

| Variable | Required? | What it unlocks |
|---|---:|---|
| `OPENAI_API_KEY` | **Yes for real model reasoning; no for offline mode** | One key serves the Budget Strategy, Journey, Stay, Food, Guide and Mediator agents. It stays server-side. Organizer credits are useful, but OpenAI usage is not promised to be free forever. |
| `PRAVA_SECRET_KEY` | Only for the existing sandbox payment proof | Server-to-server Prava sandbox access, mandate lookup and capped credentials. It does not supply travel inventory. |
| `PRAVA_PUBLISHABLE_KEY` | No, not in the current REST flow | Reserved for a future Prava browser SDK integration. Never substitute it for the secret key. |
| `INTERNAL_API_TOKEN` | Only when deployed off localhost | Protects state-changing backend routes. Generate this ourselves; it is not a third-party API key. |
| `DUFFEL_ACCESS_TOKEN` | **Optional** | Live/test flight and stay search. Current code does not place Duffel orders. Free/no-key mode uses disclosed estimates and checkout handoffs. |
| `GEOAPIFY_API_KEY` | **Yes for the mapped local planner** | Server-side place discovery, nearby food possibilities and route distance/duration. It never proves opening hours, a ticket, a table or a booking. |
| `GOOGLE_MAPS_API_KEY` | **Optional** | Paid geocoder override. The default is now keyless OpenStreetMap Nominatim. |

Do **not** create a separate OpenAI key per agent. Agent isolation comes from
different instructions, schemas, tools and permissions—not from copying the
same billing credential six times.

## Free/no-key stack

These services improve planning without pretending to be booking APIs:

| Need | Free path | Current state and constraint |
|---|---|---|
| Destination coordinates | OpenStreetMap Nominatim | **Implemented.** User-triggered only, server-cached, identified with a custom User-Agent, serialised and limited to one request/second. Public Nominatim is suitable for this hackathon/low-volume use, not an SLA-backed commercial launch. Set `HUMSAFAR_NOMINATIM_URL` to a self-hosted instance when scaling. |
| Weather | Open-Meteo | **Implemented, keyless.** Exact-date forecasts are shown only inside the provider's 16-day window; distant dates are labelled unavailable. |
| Restaurants, sights and essentials | Geoapify Places | **Implemented.** Real mapped POIs and nearby meal possibilities; public place data is not availability, popularity, opening-hours or booking proof. |
| Road distance and duration | Geoapify Routing | **Implemented.** Multi-stop drive/walk/bicycle/scooter/transit routing; an outage degrades to a labelled straight-line estimate. |
| Rail/bus planning | Operator-published GTFS/static schedules where available, otherwise an honest search handoff | No single complete, reliable, free India-wide transactional feed exists. Never scrape IRCTC. Exact availability and ticketing remain on the official/authorized checkout surface. |
| Destination knowledge | Wikivoyage/Wikimedia APIs | Useful for itinerary context with attribution; not pricing or availability. |

Public Nominatim policy: <https://operations.osmfoundation.org/policies/nominatim/>

Open-Meteo documentation and terms: <https://open-meteo.com/en/docs>,
<https://open-meteo.com/en/terms>

## What “free booking” can honestly mean

There is no legitimate, unlimited, no-key API that can create real flight,
train, bus and hotel orders across India. Humsafar therefore has two execution
levels:

1. **Free concierge mode:** understand the trip conversationally, compare
   modes, build an itinerary, negotiate the budget, let the user choose, then
   open the exact provider search/checkout handoff. The user completes payment
   on the official surface.
2. **Transactional partner mode:** after a provider grants booking access,
   Humsafar can hold/create/cancel an order and then use a production payment
   credential. Only that provider-confirmed response may be called a booking.

This is still valuable for a lazy traveller: they answer nine simple prompts
instead of comparing twenty tabs. The system does the thinking, budgeting and
shortlisting; the final external checkout remains honest until partner access
exists.

## Current agent and money architecture

1. Budget Strategy Agent interprets intent and bounded category priorities.
2. The traveller selects which of Journey, Stay, Food and Things-to-do should
   participate; a disabled agent receives no slice and performs no checkout.
3. Journey Agent handles flight, train, bus, road, or cross-mode comparison.
4. Stay Agent handles hotels, hostels, homestays and group-aware entire-home or
   villa search handoffs. There is no live Airbnb claim without partner access.
5. Food Agent handles meals and restaurant priorities.
6. Things-to-do Agent handles activities, optional guides and local transport.
7. Mediator explains the deterministic settlement.

The model never creates rupee amounts. Provider prices/estimates enter as
integer paise; the deterministic engine allocates the exact shared ceiling.
The user chooses offered option IDs and approves the exact plan once. An OpenAI
timeout may remove personality, but cannot overspend or authorize a different
option.

## External access still required for actual orders

| Need | Required boundary |
|---|---|
| Air/stay order | Duffel or another accredited booking provider with order credentials, traveller/contact fields and cancellation handling |
| Indian rail ticket | IRCTC-authorized B2B provider agreement; no scraping or unofficial consumer endpoint |
| Activity ticket | Viator/another operator’s booking tier, not only search access |
| Restaurant reservation | A supported reservation partner or direct restaurant handoff |
| Cab/vehicle order | Official deep link or contracted fleet API |
| Real payment | Prava production approval plus a merchant checkout that accepts/reconciles the credential |

Until those boundaries are granted, adapters return a clearly labelled
estimate, public-data result or checkout handoff. They must not emit a completed
merchant checkout.

## Local planner contract now implemented

The concierge asks whether the traveller wants to choose from mapped suggestions
or let Humsafar decide, then collects interests, pace and local transport. The
backend groups geographically close places, orders each group by nearest next
stop, inserts nearby lunch/dinner possibilities, adds travel time and returns to
the route base each night. Before accommodation is chosen the base is explicitly
the destination centre; after the Stay choice, the selected property is geocoded
and the route is rebuilt around it.

Only place coordinates, routes and in-window weather are provider facts. Visit
duration, entry and meal ranges are planning estimates. Food and activities are
passed to the agent layer as `advisory` categories: they may reserve budget but
cannot mint a card or claim a checkout. Duffel results are accepted into the INR
budget only when Duffel returns `INR`; another billing currency fails closed
rather than being silently treated as rupees.

REST Countries is not used for domestic Goa planning. Adding an unrelated key
would increase secret and failure surface without improving places, routing,
weather or inventory; it belongs in a future international-entry-requirements
adapter if that feature is built.
