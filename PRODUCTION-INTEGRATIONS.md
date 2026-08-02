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
| `GOOGLE_MAPS_API_KEY` | **Optional** | Paid geocoder override. The default is now keyless OpenStreetMap Nominatim. |

Do **not** create a separate OpenAI key per agent. Agent isolation comes from
different instructions, schemas, tools and permissions—not from copying the
same billing credential six times.

## Free/no-key stack

These services improve planning without pretending to be booking APIs:

| Need | Free path | Current state and constraint |
|---|---|---|
| Destination coordinates | OpenStreetMap Nominatim | **Implemented.** User-triggered only, server-cached, identified with a custom User-Agent, serialised and limited to one request/second. Public Nominatim is suitable for this hackathon/low-volume use, not an SLA-backed commercial launch. Set `HUMSAFAR_NOMINATIM_URL` to a self-hosted instance when scaling. |
| Weather | Open-Meteo | Recommended next adapter. No key for non-commercial use; attribution, usage limits and no uptime guarantee apply. Self-hosting is available. |
| Restaurants, sights and essentials | OpenStreetMap/Overpass | Recommended discovery source. Public instances are best-effort and rate-limited; cache or self-host. Results prove a place exists, not that a table/ticket is available. |
| Road distance and duration | Self-hosted OSRM or public demo for development | Open source and no proprietary key when self-hosted. The public demo is not a production SLA. |
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

This is still valuable for a lazy traveller: they answer eight simple prompts
instead of comparing twenty tabs. The system does the thinking, budgeting and
shortlisting; the final external checkout remains honest until partner access
exists.

## Current agent and money architecture

1. Budget Strategy Agent interprets intent and bounded category priorities.
2. Journey Agent handles flight, train, bus, road, or cross-mode comparison.
3. Stay Agent handles accommodation.
4. Food Agent handles meals and restaurant priorities.
5. Guide Agent handles activities and local transport.
6. Mediator explains the deterministic settlement.

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
