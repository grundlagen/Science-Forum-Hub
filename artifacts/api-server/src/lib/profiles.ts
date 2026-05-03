import { eq } from "drizzle-orm";
import { db, profilesTable, type Profile } from "@workspace/db";
import { clerkClient } from "@clerk/express";

const profileCache = new Map<string, Profile>();

function fallbackName(userId: string): string {
  return `Researcher ${userId.slice(-6)}`;
}

export async function getOrCreateProfile(userId: string): Promise<Profile> {
  const cached = profileCache.get(userId);
  if (cached) return cached;

  const [existing] = await db.select().from(profilesTable).where(eq(profilesTable.id, userId));
  if (existing) {
    profileCache.set(userId, existing);
    return existing;
  }

  let displayName = fallbackName(userId);
  let avatarUrl: string | null = null;
  try {
    const u = await clerkClient.users.getUser(userId);
    const first = u.firstName ?? "";
    const last = u.lastName ?? "";
    const composed = `${first} ${last}`.trim();
    displayName = composed || u.username || u.primaryEmailAddress?.emailAddress?.split("@")[0] || displayName;
    avatarUrl = u.imageUrl ?? null;
  } catch {
    // Clerk lookup failed (e.g. seed user); fall back to defaults
  }

  const [created] = await db
    .insert(profilesTable)
    .values({ id: userId, displayName, avatarUrl, bio: null })
    .returning();
  profileCache.set(userId, created);
  return created;
}

export async function getProfilesByIds(ids: string[]): Promise<Map<string, Profile>> {
  const map = new Map<string, Profile>();
  for (const id of new Set(ids)) {
    const p = await getOrCreateProfile(id);
    map.set(id, p);
  }
  return map;
}

export function profileToPublic(p: Profile) {
  return {
    id: p.id,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    bio: p.bio,
    createdAt: p.createdAt,
  };
}
