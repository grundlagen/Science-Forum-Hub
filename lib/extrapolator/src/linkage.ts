import { and, eq } from "drizzle-orm";
import * as schema from "@workspace/db/schema";
import type { Db } from "./resolve";

export async function linkResearcherWork(
  db: Db,
  researcherId: number,
  workId: number,
  authorPosition?: string,
): Promise<schema.RiResearcherWork> {
  const found = await db
    .select()
    .from(schema.riResearcherWorksTable)
    .where(
      and(
        eq(schema.riResearcherWorksTable.researcherId, researcherId),
        eq(schema.riResearcherWorksTable.workId, workId),
      ),
    )
    .limit(1);
  if (found[0]) return found[0];
  const [row] = await db
    .insert(schema.riResearcherWorksTable)
    .values({ researcherId, workId, authorPosition: authorPosition ?? null })
    .returning();
  return row;
}

export async function linkWorkGrant(
  db: Db,
  workId: number,
  grantId: number,
  linkSource: schema.WorkGrantLinkSource,
): Promise<schema.RiWorkGrant> {
  const found = await db
    .select()
    .from(schema.riWorkGrantsTable)
    .where(
      and(
        eq(schema.riWorkGrantsTable.workId, workId),
        eq(schema.riWorkGrantsTable.grantId, grantId),
        eq(schema.riWorkGrantsTable.linkSource, linkSource),
      ),
    )
    .limit(1);
  if (found[0]) return found[0];
  const [row] = await db
    .insert(schema.riWorkGrantsTable)
    .values({ workId, grantId, linkSource })
    .returning();
  return row;
}
