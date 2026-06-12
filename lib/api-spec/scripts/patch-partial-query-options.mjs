// Orval 8.5.x emits `query?: UseQueryOptions<...>` for hook options, but the
// workspace's @tanstack/react-query types require `queryKey` on that shape, so
// callers can't pass partial options like `{ enabled }`. The previously
// committed client was hand-patched to `Partial<UseQueryOptions<...>>`; this
// script reapplies that patch after every codegen run so regeneration stays
// reproducible.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "..", "api-client-react", "src", "generated", "api.ts",
);

const source = readFileSync(target, "utf8");
const patched = source.replace(
  /query\?: UseQueryOptions<([\s\S]*?)>;/g,
  "query?: Partial<UseQueryOptions<$1>>;",
);

const count = (patched.match(/Partial<UseQueryOptions</g) ?? []).length;
writeFileSync(target, patched);
console.log(`patch-partial-query-options: wrapped ${count} occurrence(s) in ${path.relative(process.cwd(), target)}`);
