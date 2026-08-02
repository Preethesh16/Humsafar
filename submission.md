# Submission pack — Devfolio copy, demo runbook, final checklist

Owner: Deepthi (`execution-plan.md` Priority 2, items 9 and 10).

**Status: drafted, not published.** Nothing here is submitted until the team says so.
This exists so that when the Prava sandbox charge lands, publishing is a paste job and
not a writing job — the deadline is the one thing in this project we cannot renegotiate.

> ⚠️ **Deadline.** The official handbook contradicts itself: the header says Aug 2, 7 PM PT
> / Aug 3, 7:30 AM IST; section 8 says Aug 2, 3 PM PT / Aug 3, 3:30 AM IST. **Check the live
> Devfolio countdown and treat the earlier as real.** Publish — do not leave a draft.

---

## 1. Evidence position (final)

Prava sandbox evidence exists for four merchant-scoped credentials and a genuine
Visa over-cap decline. No merchant order was placed and no checkout was reported
as approved. The copy below uses that one evidence position consistently; there
are no longer A/B variants that can be mixed accidentally.

---

## 2. Devfolio fields

### Tagline (one line)

> A team of AI agents that negotiates one shared budget, then delegates a locked,
> capped credential per specialist — so no agent can reach another's slice.

### The problem

> **Travel planning is not a search problem. It is a coordination problem—and today the
> traveller is still the coordinator.**
>
> Ask an AI to plan Goa and it can generate a beautiful list. But the moment reality
> enters—one fixed budget, competing flight and hotel prices, different group preferences,
> places spread across a map, changing weather, and actual payment responsibility—the
> “assistant” hands the work back to you. You reopen ten tabs, compare incompatible options,
> rebuild the budget after every change, connect nearby stops manually, and trust one opaque
> agent with too much money.
>
> Humsafar removes that coordination burden. A conversational concierge first understands
> how you want to travel, who is coming, what matters, what can be skipped, and the maximum
> you will spend. It then creates a small economy of specialist agents—Journey, Stay, Food
> and Things to Do—that discover options and **negotiate over the same finite budget**. If
> Stay wants more, another specialist must make a real concession. A neutral mediator
> guarantees the final allocation fits; the user chooses only among options already
> affordable.
>
> Humsafar then turns those choices into a practical, proximity-aware day plan with timings,
> route order, weather context, nearby food suggestions and a guided trip quest—without
> pretending every suggestion was booked.
>
> Most importantly, delegation is bounded. The approved plan is run-scoped and one-shot.
> Each purchasing agent receives a merchant-scoped Prava credential capped to only its own
> slice, so a buggy or compromised agent cannot reach another agent’s allocation—or the
> rest of the traveller’s money. Visa’s sandbox enforcement has already refused an
> over-cap attempt.
>
> **Humsafar moves AI travel from “Here are some recommendations” to “Your specialists
> coordinated the trade-offs, proved the budget, and can act only inside the permission
> you gave them.”**

### What we built

> Humsafar splits a goal into specialist buying agents that **negotiate against each other
> over the same finite pot**. Round one deliberately overshoots — the preferred plan costs
> ₹35,600 against a ₹30,000 budget — so every concession is a real downgrade to a cheaper
> option the agent actually found, not scripted dialogue. A neutral mediator settles the
> split. The user approves that exact plan once, through an expiring, one-shot,
> run-scoped approval. Then each agent gets its **own merchant-scoped Prava credential
> capped at its slice**, and executes only through its configured merchant adapter.
>
> Two things make the multi-agent design load-bearing rather than decorative: agents
> genuinely contend for one pot, which a single agent cannot meaningfully reason about;
> and each agent's blast radius is its own slice.

### How we used Prava

> Prava is the delegation and enforcement layer. After the mediator
> finalises the split, the orchestrator mints one merchant-scoped credential per agent,
> capped at that agent's allocation, against an approved mandate. Cap and merchant are
> enforced at the card network, not by our own code — we deliberately did **not** implement
> the over-cap refusal as a software `if`, because a guardian check presented as network
> enforcement would be a fabricated claim. A real sandbox run generated four credentials
> totalling ₹28,800, and Visa separately declined ₹160 against a ₹100 mandate for exceeding
> the amount cap. **No merchant order was placed**; credential issuance is not presented as
> a booking or completed checkout.

### What makes it different

> Crossmint, ATXP and Locus are infrastructure — a wallet or card with a top-down spending
> limit, mostly crypto, built for developers. We could run on top of them. What none of
> them do is have several agents *negotiate* over one finite pot before anyone spends,
> then each execute on its own locked credential.

### Technologies

> Python (agent core, standard library only) · Node.js + Express (orchestration, SSE) ·
> React 19 + Vite (dashboard) · Prava REST API (sandbox) · Duffel (flights and stays) ·
> Server-Sent Events · OpenAI (optional, dialogue only — never the money path)

### What we learned

> The hardest problem was not making agents talk — it was making the negotiation *mean*
> something. Our first fixture set let the preferred plan fit the budget immediately, so
> the agents agreed in round one and the entire product thesis became invisible. We had to
> make the preferred plan genuinely unaffordable before concessions became real.
>
> The second lesson was about honesty under deadline pressure. It is very easy to write
> "purchase complete" in a UI. We ended up building a provenance module whose label strings
> are copied verbatim from our own safety rules and pinned by tests that assert the
> forbidden phrasings can never render — because the temptation to soften a label at 3am is
> real, and code is better at resisting it than discipline is.

### Challenges we ran into — paste this into Devfolio

> **The hardest part was not making four agents talk. It was making every rupee and “success” mean something.**
>
> **1. Our first negotiation was theatre.** The preferred options already fit, so every agent agreed immediately. We rebuilt it around actual prices: every ask maps to something buyable and every concession selects a real cheaper alternative. A deterministic mediator—not an LLM—allocates integer paise; largest-remainder splitting makes the slices exact, and a minimums-first fallback guarantees termination without overspending.
>
> **2. Providers do not behave like one clean product.** Duffel returned foreign-currency flights while accommodation access varied; maps, weather and venue APIs all failed differently. We normalized provenance, conservative conversion and destination-aware fallbacks. Every row says whether it is provider-backed, reference-priced, fixture or advisory—never turning a suggestion into a booking.
>
> **3. Prava forced real systems debugging.** Linux could not complete passkeys, so we built a phone QR handoff that keeps card, OTP and biometrics on Prava. Node also timed out while curl worked: unreachable NAT64 addresses plus a short Happy-Eyeballs window were the cause. Raising its timeout made 12/12 requests stable. When the assigned test card later failed credential minting even in Prava's flow, we reproduced it across amounts, currencies and paths, stopped wasteful retries, preserved support evidence and failed closed instead of fabricating success.
>
> **4. Dynamic routes broke the map.** Returning to the same stay each night stacked markers and tangled multi-day paths. We made each day a quest level, separated nearby markers deterministically, preserved real visit order and handed actual navigation to Google Maps.
>
> The result works beyond the happy path: it explains what happened, constrains every agent and stays honest when a dependency fails.

### Best Visa Intelligent Commerce Implementation — paste this into the track field

> **Visa is not a logo in Humsafar; it is the enforcement plane that makes autonomous commerce safe.**
>
> A traveller gives Humsafar one goal and one hard budget. Journey, Stay, Food and Things to Do agents compete for it while a deterministic mediator settles an exact integer-paise allocation. The LLM argues priorities but cannot create, round or modify money.
>
> After approval, Humsafar converts intent into machine-enforceable permissions. Every purchasing agent receives its own Prava mandate and single-use Visa credential, locked to one merchant and capped at its slice. Approval is bound to the run, plan digest and expiry; change an option or price and it fails closed. A compromised Stay Agent cannot spend Journey's allocation, switch merchants or reach the remaining budget.
>
> **We demonstrated the controls on Visa sandbox rails, not only in our UI:**
>
> - Five mandates were approved through a real phone passkey ceremony.
> - One multi-agent run generated four merchant-scoped credentials—₹9,800, ₹11,200, ₹4,200 and ₹3,600—totalling exactly the negotiated ₹28,800 allocation in the Prava dashboard.
> - Visa refused a deliberate ₹160 request against a ₹100 mandate for exceeding its authorization. That proof is not an application-level `if`.
> - Card numbers, dynamic CVVs and session secrets never enter prompts, browser storage, SSE events, receipts or logs.
>
> This is Intelligent Commerce as a permission system: one human decision becomes independently constrained agent capabilities enforced at the network boundary. If one specialist fails, only its slice is renegotiated.
>
> All evidence is explicitly labelled **Prava/Visa sandbox**. We claim verified passkey authorization, credential issuance and network-enforced refusal—not a production charge or merchant booking.

### OpenAI — paste this into the track field

> **OpenAI is not Humsafar's copywriter. It is the reasoning layer inside a real multi-agent market.**
>
> A Budget Strategy Agent turns a traveller's natural-language goal into a structured roster and priorities. Four independently instructed specialists—Journey, Stay, Food and Things to Do—inspect grounded options, choose what they will fight for and argue their trade-offs concurrently. A separate Mediator explains the settlement. Say “I care about eating well” or disable a guide and the agents, contention and allocation genuinely change; the model is not narrating a plan already chosen.
>
> We built this with the OpenAI Agents SDK using distinct `Agent` identities, `Runner` orchestration, typed Pydantic outputs and one trace group per trip. Structured outputs are also a safety boundary: no model-facing schema contains a price, allocation, cap or budget field. A specialist selects an option; trusted code looks up its price. Any invented figure in free text is rejected.
>
> **The LLM decides strategy; deterministic code decides money.** Integer-paise arithmetic, real-option floors, bounded rounds and largest-remainder allocation guarantee an exact, never-overspent budget. OpenAI reasoning materially influences who participates, what they value, which option they defend and how they negotiate—without access to Prava, cards or payment tools.
>
> A timeout, malformed output, rate limit or missing key falls back per agent to deterministic behavior, so the trip still completes with identical financial guarantees. Model/tool payload logging is disabled; card numbers, CVVs, passkeys, Prava secrets and raw payment responses never enter prompts or traces.
>
> Humsafar demonstrates a practical pattern for agentic commerce: give models enough freedom to reason, disagree and adapt, while making unsafe financial actions structurally unrepresentable.

### OpenAI Participation Credits (Already Claimed) — paste this into the track field

> We used the OpenAI participation credits to build and repeatedly test Humsafar's actual reasoning layer—not to generate decorative copy.
>
> The OpenAI Agents SDK powers a Budget Strategy Agent that interprets each traveller's natural-language goal, four independently instructed specialists—Journey, Stay, Food and Things to Do—that choose grounded options and negotiate concurrently, and a separate Mediator that explains the final compromise. The model's decisions materially change which specialists participate, what each one prioritizes and which real option it defends.
>
> The credits also let us test the difficult paths that make this safe enough for commerce: structured-output validation, parallel agent turns, malformed responses, timeouts, rate limits and deterministic fallbacks. No model-facing schema contains a budget, price, allocation or payment field. OpenAI chooses strategy and option identities; audited integer-paise code owns every rupee and Prava remains completely outside the agents' tool access.
>
> This support enabled us to move beyond a scripted demo and validate a reusable architecture where model reasoning is genuinely useful, but model failure can never overspend the traveller's budget or expose payment data.

### Disclosure (required)

> **Before the build window:** the project brief, product thesis, architecture sketch and
> competitive analysis were drafted in planning conversations. Ideation only — no product
> code.
> **Inside the window:** all source code, all tests, every commit in the repository.
> **Labelled, not real:** Guide and Food inventory are fixtures shaped like
> Viator/OpenTable responses; partner API approval does not clear in a weekend. Flights and
> stays fall back to the same fixtures when Duffel is unconfigured, and each run prints the
> source every category actually resolved to.
> **Payment status:** Prava sandbox authentication, mandates and four scoped credentials
> verified; a separate over-cap attempt was genuinely declined by Visa. No merchant order
> or completed checkout occurred, and none is claimed.
> **Prior art:** the buyer/mediator negotiation structure was adapted from a teammate's
> earlier separate project ("Accord"); the seller side was not used. Fixture-fallback and
> partial-failure-recovery patterns were adopted from a same-hackathon project reviewed for
> inspiration, not copied structurally.

---

## 3. Demo video runbook (~3 minutes)

Record at 1920×1080. Browser zoom 100%. **Close every tab and terminal that could show a
key.** Before recording, run `git status` to confirm no `.env` is open in an editor.

| # | Beat | Time | On screen | Say |
|---|---|---|---|---|
| 1 | Goal | 0:00–0:10 | Dashboard, hero visible | "One goal, one budget: plan a Goa trip under ₹30,000." |
| 2 | Contention | 0:10–0:55 | Deliberation feed; **split bar overflowing, chip red** | "Four specialists argue over the same pot. Round one asks ₹35,600 against ₹30,000 — it doesn't fit, so somebody has to give something up." ← **the wow moment; let it breathe** |
| 3 | Convergence | 0:55–1:10 | Bar settles, chip turns green | "The mediator settles it at ₹28,800. Every concession was a real downgrade to a cheaper option, not a scripted line." |
| 4 | Approval | 1:10–1:25 | Approval panel, countdown running | "I approve this exact plan once. The approval is scoped to this run, expires, and is one-shot — change a single price and it's void." |
| 5 | Credentials | 1:25–1:40 | Four credential cards with caps | "Each agent gets its own card, locked to one merchant and capped at its slice." |
| 6 | **Proof 1** | 1:40–2:05 | Blocked panel: ₹17,920 vs ₹11,200 cap | "Stay tries to spend beyond its slice and is refused. We deliberately did not implement this as an `if` statement in our own code." |
| 7 | **Proof 2** | 2:05–2:30 | Renegotiation panel, guide re-issued | "One booking fails. Only that agent's slice reopens — the other three purchases stand." |
| 8 | Receipt | 2:30–2:50 | Receipt with run-mode banner | "This run labels every line by provenance. The Prava evidence proves scoped delegation and cap enforcement; it does not claim a merchant order." |
| 9 | Close | 2:50–3:00 | Audit log | "A team of agents spent your budget together — not one of them could overspend it." |

**Do not say**, in any variant: "order placed", "booking confirmed", "real money",
"production", or "we analysed reviews". Beat 8 is where an overclaim is most tempting and
most damaging.

### Recording commands

```bash
npm run start:sandbox                       # terminal 1
cd frontend && npm run dev                  # terminal 2
# Open http://localhost:5173, enter any trip, and submit it.
```

Restart the backend and the dev server **after any pull** — file watching does not fire on
this setup, so a stale process will happily record last hour's code.

---

## 4. Pre-submission checklist

- [ ] Live Devfolio countdown checked; **earlier** deadline assumed.
- [ ] Every teammate accepted onto the team; RSVP/check-in complete. Only the admin submits.
- [ ] README, video and Devfolio all use the final credential-plus-cap evidence position.
- [ ] No key, card number or raw Prava response in the repo, the video, or any screenshot.
- [ ] `.env` still gitignored; secret scan run over the commits being submitted.
- [ ] `npm test` and the Python suite pass on `main`.
- [ ] Production build succeeds.
- [ ] All long-running processes restarted after the final pull.
- [ ] README status table matches reality at submission time.
- [ ] Track table updated — a landed charge moves Prava to demonstrated and completes Visa.
- [ ] Submission **published**, not left as a draft. Verify the status reads *Submitted*.
