# Routine log — FocusGuard

A running log for the recurring FocusGuard development routine. **Next routine:
read this top-to-bottom first**, then continue from "Next up". Append a new dated
entry each run; don't rewrite history.

- Feature design + rationale: [`docs/focus-guard.md`](./focus-guard.md)
- Working branch: `claude/upbeat-fermat-o49qaa`

---

## 2026-06-16 — Routine 1: foundations (schema → API → server → UI)

**Status: shipped, typechecks + builds green.** First routine run — no prior log
existed, so this established the feature end-to-end.

Delivered:
- **DB schema** (`lib/db/src/schema/`): `focus_profiles`, `focus_sessions`,
  `focus_events`. Every field annotated with its psychology rationale.
- **OpenAPI** (`lib/api-spec/openapi.yaml`): 12 `/focus/*` endpoints + the
  `focusBacked`/`focusMinutes` provenance fields on `Review`. Regenerated
  `api-zod` + `api-client-react` (additive-only diff).
- **Server** (`artifacts/api-server`): `routes/focus.ts` (all endpoints),
  `lib/focusGuard.ts` (qualifying rule, streak math, recommendations,
  encouragement — pure, testable), `lib/focusProfiles.ts` (get-or-create +
  review provenance linking). Wired provenance into `reviews.ts` and `users.ts`.
- **Frontend** (`artifacts/scivet`): `/focus` page, `FocusConsole`,
  `use-focus-session` timer hook, `FocusReviewBadge`, nav link, paper-detail CTA.
- **Seed**: a demo focus habit incl. a deep session linked to a real review.
- **Codegen fix**: `lib/api-spec/scripts/wrap-query-options.mjs` makes `pnpm
  codegen` reproducible (restores `Partial<UseQueryOptions>`); wired into the
  codegen script. Without it, regeneration breaks every `{query:{enabled}}` call
  site. **Do not remove.**

Key decisions:
- Enums modelled as `text().$type<Union>()` (matches papers/reviews style), not
  `pgEnum` — avoids enum migrations.
- `isQualifyingSession` is the single source of truth for "deep" — reused by
  stats, streaks, and badges. Tune thresholds there only.
- Streaks advance once per calendar day, reset to 1 on a gap (never punish to 0).
- No leaderboards / variable rewards by design (protects review-trust signal).

Verification run this routine:
- `pnpm run typecheck` → green (all packages).
- `PORT=… BASE_PATH=/ DATABASE_URL=… pnpm --filter scivet --filter api-server run build` → green.
- Seed typechecked against the project graph.
- **Not run** (no DB/runtime here): `db push`, live server, seed execution.

---

## Next up (prioritized backlog)

1. **DB push + smoke test.** Run `pnpm --filter @workspace/db run push` against a
   real `DATABASE_URL`, run the seed, hit `/api/focus/*` end-to-end. Confirm the
   Deep-review badge renders on the seeded review.
2. **FocusGuard settings UI.** A page/section to edit the `focus_profiles`
   fields (technique, goals, chronotype, pledge, blocklist, nudges). API exists
   (`PATCH /focus/profile`); only the UI is missing.
3. **Distraction blocklist enforcement.** Today the blocklist is a stored
   pre-commitment only. Add a soft in-app guard (e.g. a "you blocked this" interstitial
   on navigation away during an active session) — keep it autonomy-supportive.
4. **Unit tests** for `focusGuard.ts` (qualifying rule boundaries, `advanceStreak`
   day-gap/continuity/same-day, `recommendSession`). No test runner is wired in
   the repo yet — adding one (vitest) is part of this task.
5. **Weekly reflection / insights.** Aggregate flow vs distractions over time;
   surface a gentle weekly summary. Schema already captures the inputs.
6. **Nudges.** Honour `nudges_enabled`: resume-a-paused-session prompt (Zeigarnik),
   chronotype-aware "good time to focus" hint. Needs a delivery mechanism.
7. **Deep-review weighting (careful).** Optionally let focus-backed reviews carry
   slightly more weight in `promotion.ts`. Discuss before implementing — risks
   gaming; keep the signal honest.
8. **Accessibility/perf pass** on the Focus Console (reduced-motion ring,
   screen-reader timer announcements).

## Gotchas for next routine
- After editing `openapi.yaml`, always run the **full** codegen script (it
  includes the wrap step). Don't call `orval` directly without the wrap.
- `mockup-sandbox` and `scivet` builds need `PORT` / `BASE_PATH` env vars; a bare
  `pnpm run build` fails on `mockup-sandbox` for that reason (not your change).
- `pnpm install --frozen-lockfile` is the safe install; the committed generated
  client is *not* reproducible by a bare Orval run in this environment — the wrap
  step is what reconciles it.
