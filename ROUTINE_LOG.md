# Focus Guard — Routine Log

A running journal for the recurring "develop Focus Guard" routine. Each pass:
read this file, pick the top unstarted item from the roadmap in
[`FOCUS_GUARD.md`](./FOCUS_GUARD.md), build it, keep it typechecking, update this
log, commit, push. Newest entry on top.

Branch: `claude/upbeat-fermat-4hnjxh`

---

## How to continue (read this first)

1. **Install & baseline:** `pnpm install --frozen-lockfile` then
   `pnpm run typecheck` — must be green before you touch anything.
2. **If you change the API contract** (`lib/api-spec/openapi.yaml`):
   - `pnpm --filter @workspace/api-spec run codegen`
   - **Then re-apply the `Partial<UseQueryOptions>` wrap**, or scivet won't
     compile (orval 8.5.3 vs react-query v5 mismatch). One-liner:
     ```bash
     node -e 'const fs=require("fs"),p="lib/api-client-react/src/generated/api.ts";let L=fs.readFileSync(p,"utf8").split("\n"),pend=false;fs.writeFileSync(p,L.map(l=>{if(pend&&/^\s*>;\s*$/.test(l)){pend=false;return l.replace(/>;\s*$/,">>;")}const m=l.match(/^(\s*)query\?: UseQueryOptions<(.*)$/);if(m){let r=m[2];if(/>;\s*$/.test(r))return `${m[1]}query?: Partial<UseQueryOptions<`+r.replace(/>;\s*$/,">>;");pend=true;return `${m[1]}query?: Partial<UseQueryOptions<`+r}return l}).join("\n"))'
     ```
   - Re-run `pnpm run typecheck`.
3. **DB:** new tables/columns require `pnpm --filter @workspace/db run push`
   against a real Postgres (`DATABASE_URL`). Not available in the sandbox/CI, so
   schema changes ship un-pushed — call this out in the commit.
4. **Verify:** `pnpm run typecheck` is the gate we can actually run here. There
   are no unit tests for this feature yet (candidate task: add some for
   `focusHelpers.computeStats`).

---

## Pass 1 — 2026-06-18 — Foundation (full vertical slice)

**Status:** ✅ committed, typecheck green.

Built Focus Guard from nothing to a working end-to-end feature:

- **Schema** (`lib/db/src/schema/focus.ts`): `focus_sessions`,
  `focus_distractions` (the parking lot), `focus_preferences`. Every field
  documented with its psychological rationale.
- **API** (`openapi.yaml` tag `focus` + `routes/focus.ts` + `lib/focusHelpers.ts`):
  9 endpoints — preferences get/put, sessions list/start/get/patch, distractions
  log/resolve, and a derived stats endpoint (streak, today's minutes, flow avg,
  breach rate). Streak + ART/flow aggregation computed in app code.
- **Generated clients** regenerated (api-zod + api-client-react) and the
  `Partial<UseQueryOptions>` wrap re-applied.
- **Frontend** (`pages/focus.tsx` + `hooks/use-focus-timer.ts`): idle dashboard,
  live session with persistent wall-clock timer, parking lot, post-session
  reflection (flow + energy + notes). Routed at `/focus`; nav + user-menu links.
- **Docs:** `FOCUS_GUARD.md` (design + literature map + roadmap) and this log.

**Deliberately deferred (see FOCUS_GUARD.md roadmap):** guards are recorded but
not yet *enforced* in the live UI; no preferences-editing UI yet; no break-timer
loop; no "focus this paper" entry points; no AI coach; streaks bucket by UTC.

**Next routine → start here:** Roadmap item 1 (Preferences UI) is the smallest
self-contained win, but item 2 (actually enforcing `guards` via a
`FocusModeContext`) is where the feature stops being a timer and starts being a
*guard*. Recommend item 2 if you have the appetite, item 1 if you want a clean
quick pass. Either way: keep `gentleMode` sacred, and never add a punishment.
