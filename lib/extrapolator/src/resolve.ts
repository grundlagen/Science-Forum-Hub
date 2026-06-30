import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";

// Drizzle client type, injected by callers so this module never imports the live pool
// (which would require DATABASE_URL at import time).
export type Db = NodePgDatabase<typeof schema>;

// Entity resolution: find-by-external-id, else insert. match_confidence and richer
// reconciliation (ORCID / NIH PPID onto the OpenAlex spine) come in M1.

export async function resolveInstitution(
  db: Db,
  v: schema.InsertRiInstitution,
): Promise<schema.RiInstitution> {
  if (v.rorId) {
    const found = await db
      .select()
      .from(schema.riInstitutionsTable)
      .where(eq(schema.riInstitutionsTable.rorId, v.rorId))
      .limit(1);
    if (found[0]) return found[0];
  }
  const [row] = await db.insert(schema.riInstitutionsTable).values(v).returning();
  return row;
}

export async function resolveResearcher(
  db: Db,
  v: schema.InsertRiResearcher,
): Promise<schema.RiResearcher> {
  if (v.openalexId) {
    const found = await db
      .select()
      .from(schema.riResearchersTable)
      .where(eq(schema.riResearchersTable.openalexId, v.openalexId))
      .limit(1);
    if (found[0]) return found[0];
  }
  const [row] = await db.insert(schema.riResearchersTable).values(v).returning();
  return row;
}

export async function resolveWork(
  db: Db,
  v: schema.InsertRiWork,
): Promise<schema.RiWork> {
  if (v.openalexId) {
    const found = await db
      .select()
      .from(schema.riWorksTable)
      .where(eq(schema.riWorksTable.openalexId, v.openalexId))
      .limit(1);
    if (found[0]) return found[0];
  }
  const [row] = await db.insert(schema.riWorksTable).values(v).returning();
  return row;
}

export async function resolveGrant(
  db: Db,
  v: schema.InsertRiGrant,
): Promise<schema.RiGrant> {
  const found = await db
    .select()
    .from(schema.riGrantsTable)
    .where(
      and(
        eq(schema.riGrantsTable.source, v.source),
        eq(schema.riGrantsTable.externalId, v.externalId),
      ),
    )
    .limit(1);
  if (found[0]) return found[0];
  const [row] = await db.insert(schema.riGrantsTable).values(v).returning();
  return row;
}
