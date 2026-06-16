// Post-process the generated react-query client.
//
// Orval emits `query?: UseQueryOptions<...>` for query hooks. With the
// @tanstack/react-query v5 types this makes `queryKey` a *required* field on
// the caller-supplied options object, which breaks the ergonomic
// `{ query: { enabled } }` call sites used throughout the app (the generated
// `getXQueryOptions` factory already supplies the queryKey itself).
//
// The committed client wraps those option types in `Partial<...>` so callers
// can pass a subset. This script restores that wrapper deterministically after
// generation, keeping `pnpm codegen` reproducible. Mutation options are left
// untouched — they don't carry a required key.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(__dirname, "..", "..", "api-client-react", "src", "generated", "api.ts");

const marker = "query?: UseQueryOptions<";
const src = fs.readFileSync(target, "utf8");

let out = "";
let i = 0;
for (;;) {
  const idx = src.indexOf(marker, i);
  if (idx === -1) {
    out += src.slice(i);
    break;
  }
  out += src.slice(i, idx);
  const openLt = idx + marker.length - 1; // the '<' after UseQueryOptions
  let depth = 1;
  let j = openLt + 1;
  while (j < src.length && depth > 0) {
    const c = src[j];
    if (c === "<") depth++;
    else if (c === ">") {
      depth--;
      if (depth === 0) break;
    }
    j++;
  }
  const inner = src.slice(idx + "query?: ".length, j + 1); // UseQueryOptions<...>
  out += `query?: Partial<${inner}>`;
  i = j + 1;
}

if (out !== src) {
  fs.writeFileSync(target, out);
  console.log("wrap-query-options: wrapped query options in Partial<>");
} else {
  console.log("wrap-query-options: nothing to wrap");
}
