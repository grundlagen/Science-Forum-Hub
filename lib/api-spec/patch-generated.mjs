/**
 * Post-codegen patch for the React Query client.
 *
 * Orval 8.5.x types each hook's `query` option as a full `UseQueryOptions`,
 * which (under the installed TanStack Query) makes `queryKey` a *required*
 * field. The whole point of the generated hooks is that the queryKey is
 * supplied for you, so callers should be able to pass just `{ enabled }`.
 * We relax the option to `Partial<UseQueryOptions<...>>`, matching the style
 * the rest of the app is written against. Idempotent: re-running is a no-op.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(
  __dirname,
  "..",
  "api-client-react",
  "src",
  "generated",
  "api.ts",
);

const src = readFileSync(target, "utf8");
const patched = src.replace(
  /query\?: UseQueryOptions<([\s\S]*?)>;/g,
  "query?: Partial<UseQueryOptions<$1>>;",
);

if (patched !== src) {
  writeFileSync(target, patched);
  const count = (patched.match(/Partial<UseQueryOptions</g) ?? []).length;
  console.log(`patched ${count} query option type(s) → Partial<UseQueryOptions<…>>`);
} else {
  console.log("no query option types needed patching");
}
