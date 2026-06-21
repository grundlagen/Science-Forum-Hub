# Focus Guard — Routine Log

> This is the **handoff file**. Each routine session appends an entry, leaves
> the build green, and updates the backlog so the next session can start cold.
> Read this top-to-bottom, then `DESIGN.md` for the deep context.

## How to resume (start here, every time)

```bash
pnpm install                                   # restores node_modules (ephemeral container)
pnpm run typecheck                             # must be green before you touch anything
pnpm --filter @workspace/api-spec run codegen  # only if you edit openapi.yaml
```

- **Branch:** `claude/upbeat-fermat-vd8zzn`.
- **Source of truth for the API:** `lib/api-spec/openapi.yaml` → run codegen,
  never hand-edit `lib/api-*/src/generated/**`.
- **DB:** no migration files; apply schema with
  `pnpm --filter @workspace/db run push` once `DATABASE_URL` is set.
- **Gotcha:** codegen re-runs `patch-generated.mjs` to wrap query options in
  `Partial<…>`. If a page suddenly demands `queryKey`, the patch didn't run.

---

## Backlog (prioritised — pick from the top)

> ✅ P1 (verdict guard wired into review) and P2 (engine tests) were completed in
> Routine #1 — see the log below. The list below is what's left.

### P1 — break timer + session UX polish
`break_start`/`break_end` events exist but the UI has no break mode. Add a
post-completion "take a {preferredBreakMinutes}m break" countdown. Consider a
gentle nudge when `elapsedSeconds` exceeds planned (the timer already turns
amber).

### P2 — surface focus stats on the profile / "My Portal"
Add a small Focus card to `me.tsx` (streak, total focus minutes, sessions). The
`focus_sessions` data is private-by-design; decide what (if anything) is public.

### P3 — feed/notification quieting during an active session
True "guard" behaviour: when a session is active, dim or hide the feed entry
points to reduce switching cost (attention residue). Pure frontend.

### P4 — seed data
Extend `artifacts/api-server/scripts/seed.ts` with a couple of demo focus
sessions so the dashboard isn't empty in dev.

### Stretch / research
- Personalised session length from the user's own historical focus scores
  (simple regression — find each user's actual flow-maximising block length).
- Honest weekly reflection digest (no streaks-as-pressure).
- Chronotype inference from when high-scoring sessions actually happen.

---

## Routine entries (newest first)

### Routine #1 — 2026-06-21 — Focus Guard, first fully-fledged cut
**Built from scratch (no prior routine md existed):**
- DB schema `focus_profiles`, `focus_sessions`, `focus_events`
  (`lib/db/src/schema/focusGuard.ts`, wired into schema index).
- Psychology engine `artifacts/api-server/src/lib/focus.ts` — pure functions,
  every constant cited (flow, implementation intentions, attention residue,
  decision fatigue, Zeigarnik, anchoring, confirmation bias, SDT, ART).
- 11 REST endpoints under `/focus/*` (`routes/focus.ts`, wired into router).
- Full OpenAPI definitions + regenerated zod & react-query clients.
- Frontend `/focus` page: start form, live session, parking lot, completion
  reflection, kind streak, recommendation panel, settings dialog. Nav links
  added.
- **Verdict guard wired into the review flow** (`paper-detail.tsx`): casting a
  review now opens a Focus Guard dialog showing readiness warnings/suggestions
  and a required steelman textarea for reject/challenge. Never blocks ("Cast
  anyway"); the steelman text is appended to the justification.
- **19 unit tests** for the pure engine (`focus.test.ts`, `node:test` + `tsx`,
  `pnpm --filter @workspace/api-server run test`). Cover focus score, streak
  state machine, readiness matrix, recommendations, peak windows.
- **Infra fix:** discovered the committed generated client was hand-patched to
  `Partial<UseQueryOptions>`; `clean:true` codegen wiped it and broke existing
  pages. Made it reproducible via `lib/api-spec/patch-generated.mjs` wired into
  `codegen`.

**Gates:** `pnpm run typecheck` ✅ all packages. `pnpm --filter
@workspace/api-server run test` ✅ 19/19. `scivet` + `api-server` builds ✅.
`mockup-sandbox` build fails pre-existingly (needs `PORT` at config load) —
not ours.

**Not done (see backlog):** break-timer UI, focus stats on the profile page,
feed-quieting during sessions, seed data. DB schema not pushed (no
`DATABASE_URL` in this container — run `pnpm --filter @workspace/db run push`).

**Next routine, start with the new P1 (break timer / session UX).**
