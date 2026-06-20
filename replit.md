# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Focus Guard

Psychology-grounded subsystem that protects reviewer attention quality (guards
against drive-by reviews and decision fatigue). Tracks engaged reading, weighs
reviews by focus, and nudges/gates (opt-in) low-focus judgements. The pure
engine lives in `artifacts/api-server/src/lib/focusGuard/` and is unit-tested
(`pnpm --filter @workspace/api-server test`).

**Start here for ongoing work:** `docs/focus-guard/ROUTINE.md` — design,
psychology citations, schema/API reference, status, and the roadmap for the
next work session.
