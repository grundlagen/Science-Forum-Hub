// Seed the labelled ground-truth table. Requires DATABASE_URL.
//   pnpm --filter @workspace/extrapolator run seed-ground-truth
import { db, riGroundTruthCasesTable } from "@workspace/db";
import { KNOWN_POSITIVES } from "./groundTruth";

async function main(): Promise<void> {
  let inserted = 0;
  for (const c of KNOWN_POSITIVES) {
    const res = await db
      .insert(riGroundTruthCasesTable)
      .values(c)
      .onConflictDoNothing()
      .returning();
    inserted += res.length;
  }
  console.log(`Ground-truth seed complete: ${inserted} inserted, ${KNOWN_POSITIVES.length} total known-positives.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
