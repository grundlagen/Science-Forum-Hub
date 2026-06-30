// M0 end-to-end slice: organisation (and optional ROR) -> NIH RePORTER grants +
// OpenAlex works -> print the linkage. Dry-run by default; --persist writes canonical
// rows (requires DATABASE_URL).
//
// Usage:
//   pnpm --filter @workspace/extrapolator run slice -- --org "Dana-Farber Cancer Institute" --ror https://ror.org/02jzgtq86
//   DATABASE_URL=... pnpm --filter @workspace/extrapolator run slice -- --org "..." --ror "..." --persist
import { searchProjectsByOrg } from "@workspace/integration-nih-reporter";
import { getWorksByInstitutionRor, type OpenAlexWork } from "@workspace/integration-openalex";
import type { Db } from "./resolve";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const org = arg("org");
  const ror = arg("ror");
  if (!org && !ror) {
    console.error('Usage: ... run slice -- --org "<name>" [--ror <ror-url>] [--persist]');
    process.exit(1);
  }

  console.log(`# M0 slice for: ${org ?? ror}`);

  const grants = org ? (await searchProjectsByOrg(org, { limit: 25 })).results ?? [] : [];
  console.log(`NIH RePORTER grants: ${grants.length}`);
  for (const g of grants.slice(0, 10)) {
    const pi = g.principal_investigators?.[0]?.full_name ?? "?";
    console.log(
      `  - ${g.core_project_num ?? g.project_num ?? "?"}  FY${g.fiscal_year ?? "?"}  PI=${pi}  $${g.award_amount ?? "?"}  ${g.project_title ?? ""}`,
    );
  }

  let works: OpenAlexWork[] = [];
  if (ror) {
    works = (await getWorksByInstitutionRor(ror, { perPage: 25 })).results ?? [];
    const retracted = works.filter((w) => w.is_retracted).length;
    console.log(`OpenAlex works: ${works.length} (retracted: ${retracted})`);
  } else {
    console.log("OpenAlex works: (skipped — pass --ror to fetch)");
  }

  if (has("persist")) {
    if (!process.env.DATABASE_URL) {
      console.error("--persist requires DATABASE_URL");
      process.exit(1);
    }
    const dbmod = await import("@workspace/db");
    const resolveMod = await import("./resolve");
    const db = dbmod.db as Db;
    const inst = await resolveMod.resolveInstitution(db, {
      name: org ?? ror ?? "unknown",
      rorId: ror ?? null,
      isForeign: false,
    });
    console.log(`persisted institution id=${inst.id} (grants=${grants.length}, works=${works.length})`);
    console.log("Note: full grant/work/link persistence lands in M1.");
  }

  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
