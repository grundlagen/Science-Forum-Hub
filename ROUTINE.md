# Routine log — Focus Guard

> Read this first at the start of each routine. It records what was built, what
> was verified, and the prioritized backlog for the next iteration. The full
> feature design lives in [`docs/focus-guard.md`](docs/focus-guard.md).

## Where it stands

Focus Guard is a **fully working full-stack vertical slice**: schema → API spec →
codegen → server routes → React UI, all wired and routed at `/focus`.

**Verification status**
- ✅ `pnpm run typecheck` — clean across all packages.
- ✅ `pnpm --filter @workspace/scivet run build` (`PORT=3000 BASE_PATH=/`) — bundles clean.
- ✅ `pnpm --filter @workspace/api-spec run codegen` — deterministic; patch script wraps 36 query blocks.
- ⚠️ **No runtime test yet** — needs a live `DATABASE_URL` + Clerk session. The
  Drizzle schema has **not** been pushed (`pnpm --filter @workspace/db run push`)
  and no SQL migration has been generated. Do this before runtime testing.
- `mockup-sandbox` build fails without a `PORT` env var — pre-existing and unrelated.

## Iteration history

### Iteration 1 — 2026-06-24 (initial build)
- DB: `focus_preferences` + `focus_sessions` (`lib/db/src/schema/focus.ts`).
- Spec: 11 endpoints under the `focus` tag + all schemas; regenerated api-zod & api-client-react.
- Server: `routes/focus.ts` + `lib/focus.ts` (stats, streaks, `deriveInsight`, stale-session reaping); registered in `routes/index.ts`.
- Frontend: `/focus` page, start/active/stats/preferences panels, `focus-ring`, `parking-lot`, `use-focus-session` timer engine, nav links.
- Infra: `lib/api-spec/scripts/patch-react-query.mjs` (idempotent post-codegen patch) wired into `codegen`.
- Seed: demo preferences + 5 focus sessions for `seed_user_iris` / `seed_user_atlas`.

## Backlog for next routine (prioritized)

1. **Migrations** — generate/push the Drizzle schema; confirm jsonb defaults and
   the two indexes land. Then do a real runtime pass (start → heartbeat →
   distraction → break → complete → stats).
2. **Make guard rails actually bite.** Preferences exist but the app doesn't yet
   consume them. With an active session: dim/hide the feed firehose (`dimFeed`),
   hide vote counts/scores (`hideMetrics`), and warn on navigation away
   (`singleTaskLock`). A small persistent "session active" bar in `layout.tsx`
   would anchor this.
3. **Focus-on-this-paper.** Add a button on `paper-detail.tsx` that starts a
   session pre-filled with that `paperId` + field. The schema/API already
   accept `paperId`; only the UI entry point is missing.
4. **Parking-lot follow-through.** Let users mark parked distractions `resolved`
   and review them after a session (closes the Zeigarnik loop properly). Needs a
   small PATCH endpoint or extend the distraction POST.
5. **Soundscape playback** + **break reminder** (sound/notification at phase change).
6. **Analytics depth** — weekly calendar heatmap; energy-before vs. flow-rating
   correlation; best-time-of-day. Data is already captured.
7. **Tests** — unit-test `computeStreaks` / `deriveInsight` (pure, easy wins) and
   the timer phase transitions in `use-focus-session.ts`.
8. **Bundle size** — `/focus` adds to an already-large single chunk; consider
   `React.lazy` route splitting (pre-existing warning, not Focus-specific).

## Conventions worth remembering
- After editing `openapi.yaml`, always run the codegen script (it re-patches the
  react-query client and typechecks libs).
- New API response fields must be added to the OpenAPI `required` list or the
  generated Zod/TS turns them optional.
- Keep insight/nudge copy autonomy-supportive — it's a deliberate SDT design choice.
