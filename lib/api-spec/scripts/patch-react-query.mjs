#!/usr/bin/env node
/**
 * Post-codegen patch for the generated react-query client.
 *
 * Orval v8 emits query hook option types as `query?: UseQueryOptions<...>`,
 * which (under the @tanstack/react-query version pinned in this workspace)
 * makes `queryKey` a *required* field. Every call site in the app passes
 * partial options like `{ enabled }` and relies on the generated
 * queryOptions builder to supply the `queryKey`, so we widen the option type
 * to `Partial<UseQueryOptions<...>>`.
 *
 * This was previously applied by hand-editing the generated file after each
 * regen. That is fragile, so the transform now lives here and runs as part of
 * `pnpm --filter @workspace/api-spec run codegen`.
 *
 * The transform is intentionally narrow: it only rewrites `query?:` option
 * blocks (never `mutation?:`), and the lazy match up to `>;` is safe because
 * TypeScript type generics contain no semicolons.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(
  here,
  "..",
  "..",
  "api-client-react",
  "src",
  "generated",
  "api.ts",
);

const source = await readFile(target, "utf8");

const patched = source.replace(
  /query\?: UseQueryOptions<([\s\S]*?)>;/g,
  "query?: Partial<UseQueryOptions<$1>>;",
);

const wrapped = (patched.match(/query\?: Partial<UseQueryOptions</g) ?? []).length;
const leftover = (patched.match(/query\?: UseQueryOptions</g) ?? []).length;

if (leftover > 0) {
  throw new Error(
    `patch-react-query: ${leftover} query option block(s) were not wrapped; ` +
      "the generated shape may have changed — review api.ts.",
  );
}

if (patched !== source) {
  await writeFile(target, patched, "utf8");
}

console.log(
  `patch-react-query: wrapped ${wrapped} query option block(s) in Partial<>`,
);
