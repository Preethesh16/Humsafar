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

> Every AI shopping agent today is a solo actor: one model, one purchase, no way to make
> trade-offs when a goal is messy and the budget is finite. "Plan my Goa trip under
> ₹30,000" is really flights, stay, food and activities competing for one pot. Handing one
> agent a real card also means a single bug, bad merchant or prompt injection can drain
> everything.

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
