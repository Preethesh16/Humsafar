# Humsafar — Production Integration Matrix

Last reviewed: 2026-08-02. This file separates credentials we can configure
today from commercial access that cannot be replaced by code or an API key.

## Agent and money architecture

Humsafar uses **one server-side `OPENAI_API_KEY`** for all logical OpenAI Agents
SDK agents. Separate keys per agent do not create isolation; distinct agent
definitions, instructions, schemas, permissions, and traces do. The current
roster is:

1. Budget Strategy Agent — interprets intent and recommends category weights.
2. Flights Agent — argues from discovered flight options.
3. Stay Agent — argues from discovered accommodation options.
4. Food Agent — argues from meal options.
5. Guide Agent — argues from experiences and local-ground-transport options.
6. Mediator — explains the deterministic settlement.

The model never generates or finalizes rupee amounts. Provider prices enter as
integer paise; the deterministic negotiation engine allocates the exact budget,
and the server binds chosen option IDs into a one-shot human approval. This is
the production safety boundary: an OpenAI timeout can remove personality, but
cannot overspend or authorize a different option.

## Credentials to configure now

Put these values only in the gitignored root `.env`. Never paste them into chat,
Markdown, frontend variables, screenshots, or commits.

| Variable | Needed for | Current implementation |
|---|---|---|
| `OPENAI_API_KEY` | Budget interpretation, specialist negotiation dialogue, mediator explanation, SDK traces | Implemented. One key serves all six logical agents. |
| `DUFFEL_ACCESS_TOKEN` | Live/test flight and accommodation discovery | Implemented for round-trip offer search and Duffel Stays search. Order creation is not yet implemented. |
| `GOOGLE_MAPS_API_KEY` | Resolve `Goa`, `Jaipur`, etc. to coordinates for Duffel Stays | Implemented server-side. Enable the Geocoding API and restrict the key to the backend. |
| `PRAVA_SECRET_KEY` | Server-to-server sandbox authorization and scoped credentials | Implemented and sandbox evidence captured. This is not a merchant booking API. |
| `PRAVA_PUBLISHABLE_KEY` | Future Prava browser SDK use | Stored locally only; not required by the current hosted REST ceremony. |
| `INTERNAL_API_TOKEN` | Protect state-changing routes outside loopback | Implemented. Required before any non-local deployment. |

The local `.env` currently has Prava credentials, but the OpenAI, Duffel, and
Google values must be added by the operator before those paths can be live. A
missing provider never becomes an unlabeled fake: the UI reports a disclosed
fixture/test mode.

## Access that requires a provider agreement

| Need | Recommended boundary | Why a normal API key is insufficient |
|---|---|---|
| Activities and guides | Viator Partner API (`VIATOR_API_KEY`) | Search access is available by partner tier; holds and bookings require Full + Booking Affiliate or Merchant access. |
| Indian rail | IRCTC-authorized B2B Principal Service Provider or a contracted authorized partner | IRCTC ticketing uses authorized service-provider/web-service arrangements. Do not scrape IRCTC or ship an unofficial consumer endpoint. |
| Restaurant reservation | Contracted reservation provider such as EazyDiner/Dineout/OpenTable where supported | Google Places can discover restaurants but does not supply a bookable total or complete the reservation. |
| Local vehicle booking | Official deep link or contracted Uber/Ola/local fleet integration | General map/search credentials do not authorize ride creation or payment. |
| Production payment | Prava production approval plus a merchant/provider checkout that accepts the credential | A Prava sandbox credential cannot purchase real production inventory. |

Until one of these commercial boundaries is granted, its adapter must return a
clearly labelled discovery/deep-link result or fixture. It must never emit
`checkout_completed` or claim an order.

## Data required before an actual booking

Provider access is only half the work. The final checkout boundary must collect
the following through a secure user form after option choice and before the
final approval: passenger legal name, date of birth and gender where required;
passport/nationality for applicable routes; contact email and phone; room
occupancy; cancellation/refund acceptance; and any provider booking questions.
Do not put this personal data into model prompts or traces.

## Recommended acquisition order

1. Add `OPENAI_API_KEY` and run one real SDK-agent smoke test.
2. Add Duffel test access and Google Geocoding; verify Goa flight/stay results.
3. Apply for Viator search access, then booking access if actual activity orders
   are in scope.
4. Choose and contract an IRCTC-authorized rail provider; do not build against
   an unofficial API while waiting.
5. Choose reservation and local-transport partners based on the launch cities.
6. Implement provider hold/order/cancel/refund adapters and only then request
   Prava production access for real-money bookings.

Official references: Google Geocoding and Places documentation, Duffel Stays
guide, Viator Partner API access tiers, and IRCTC's authorized service-provider
list. Re-check each contract and endpoint before production launch.
