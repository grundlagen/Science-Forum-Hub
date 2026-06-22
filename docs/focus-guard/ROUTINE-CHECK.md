# Focus Guard — Routine Check / Handoff Log

> **Read me first.** This is the running handoff between development "routines".
> Each routine: (1) reads this file, (2) advances Focus Guard, (3) updates the
> log + roadmap below, (4) commits & pushes. Keep it honest — record what's
> *actually* done and tested, not what's aspirational.

- **Branch:** `claude/upbeat-fermat-j2dhx3`
- **Companion doc:** [`DESIGN.md`](./DESIGN.md) — full architecture + psychology basis.

---

## Current state (after Routine 1)

Focus Guard exists end to end as a **pure engine + DB schema**, fully
typechecked and unit-tested. No HTTP/UI yet — that's next.

**Built & verified:**
- `lib/focus-guard/` — 13 source modules, a public `index.ts`, and **28 passing
  tests** (`node:test` via `tsx`). Pure, deterministic, depends only on `zod`.
  - Sub-models: flow, circadian, ultradian, attention-residue, restoration,
    focus-budget, intentions, the interruption guard, peak-end scoring, streaks.
  - Orchestrator: `buildFocusPlan(ctx, mode)` → a complete, ready-to-act plan.
- `lib/db/src/schema/focus*.ts` — 5 tables: `focus_profiles`, `focus_sessions`,
  `focus_interruptions`, `focus_intentions`, `focus_open_loops`. Exported from
  `schema/index.ts`.
- `tsconfig.json` updated with the `lib/focus-guard` project reference.
- Docs: `DESIGN.md` (this folder).

**Status: GREEN.** `pnpm run typecheck:libs` passes; engine tests pass 28/28.

### How to verify (next routine, run these first)

```bash
pnpm install --prefer-offline          # deps (network: registry.npmjs.org)
pnpm run typecheck:libs                 # whole-lib typecheck — must be clean
pnpm --filter @workspace/focus-guard test   # 28/28 expected
```

---

## Routine log

| # | Date | Focus | Outcome |
|---|------|-------|---------|
| 1 | 2026-06-22 | Greenfield: design the engine + schema from psychology up | Engine (13 modules, 28 tests), 5 DB tables, DESIGN.md. All green. |
| 2 | _next_ | _see roadmap_ | _pending_ |

---

## Roadmap (priority order)

Pick the top unblocked item, do it well, then re-prioritise.

### P1 — Expose the engine over HTTP (most valuable next step)
The engine is inert without an API. In `artifacts/api-server` (Express 5):
- `POST /focus/plan` → `buildFocusPlan` (body = `FocusContext`, `mode`).
- `POST /focus/sessions` start / `PATCH /focus/sessions/:id` end (writes
  `focus_sessions`, calls `scoreSession` on completion).
- `POST /focus/sessions/:id/interruptions` → `evaluateInterruption`, persists
  verdict to `focus_interruptions`; if `parkThought`, insert a `focus_open_loops`
  row.
- `GET /focus/open-loops?status=open` and `PATCH /focus/open-loops/:id`.
- Define Zod request/response schemas; if the OpenAPI-codegen flow
  (`@workspace/api-spec` → Orval) is the convention, add paths there and
  regenerate rather than hand-writing client hooks.

### P2 — Wire the DB queries
Add a `lib/focus-guard`-adjacent or `api-server` data layer:
- streak history loader (last N days → `assessStreak`),
- "today so far" aggregator (sessions + restoration → `FocusContext` fields
  `consecutiveSessionsToday`, `priorDeepMinutesToday`, `restorationMinutesToday`),
- recent-switches loader feeding `recentSwitches`.
Add FKs/migrations: `focus_*` reference `profiles.id` / `papers.id`. Run
`pnpm --filter @workspace/db run push` against a dev DB (needs `DATABASE_URL`).

### P3 — UI in `artifacts/scivet` (React 19 + wouter + tanstack-query)
- A "Focus" panel: start a session for the paper you're viewing, live timer,
  the start-ritual checklist, and an interruption capture box that shows the
  guard's verdict + message.
- An open-loops drawer surfaced at break time.
- A post-session reflection (peak / end / satisfaction) → score + highlights.

### P4 — Make the priors adaptive (the long game)
The DESIGN promises priors that "give way to the user's own data". Implement it:
- learn personal challenge/skill **mean** for `flow.ts` from history (currently
  `FLOW.DEFAULT_MEAN`),
- learn realistic block length from completion rates,
- calibrate `distractionSensitivity` → guard strictness,
- track intention fulfilment (`focus_intentions.timesFulfilled`) to surface
  which if-then plans actually fire.

### P5 — Deepen / harden the engine
- Per-user personal mean injected into `assessFlow` / `buildFocusPlan`.
- `flowmodoro` technique (stop when flow breaks, not on a fixed timer).
- Confidence intervals / "why" payloads on recommendations for transparency.
- Property-based tests (fast-check) for monotonicity invariants already asserted
  informally (e.g. more fatigue ⇒ never a longer block).

---

## Open questions for a human (don't guess — ask if blocked)
1. **API convention:** hand-written Express routes, or OpenAPI-spec-first via
   `@workspace/api-spec` + Orval? (Repo already uses Orval codegen — likely the
   latter.)
2. **Auth/identity:** `focus_*` use `userId text` to match `profiles.id`. Is
   Clerk the source of truth for that id in this app? (`scivet` imports Clerk.)
3. **Scope:** is Focus Guard a personal-productivity feature, or eventually
   social (shared focus rooms, co-author "do not disturb" signalling)? Affects
   schema (rooms/presence tables) before we over-build.

## Guardrails to preserve (don't regress these)
- Engine stays **pure** (no I/O, no DB import) — persistence lives in the API layer.
- Every constant stays in `constants.ts` bound to a citation.
- The ego-depletion caveat stays surfaced in `assessBudget` output.
- Wellbeing (emergency/physical) always overrides the guard.
- Messages stay autonomy-supportive — no shaming, no hard blocks.
