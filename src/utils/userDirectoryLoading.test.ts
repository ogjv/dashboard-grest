import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  directory: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  links: [] as Array<Record<string, unknown>>,
  error: null as null | { code: string; message: string },
  ranges: [] as number[],
  batches: [] as string[][],
  tables: [] as string[]
}));

vi.mock("./supabase", () => ({ supabase: {
  rpc: () => ({ range: async (from: number, to: number) => {
    fixture.ranges.push(from);
    return { data: fixture.error ? null : fixture.directory.slice(from, to + 1), error: fixture.error };
  } }),
  from: (table: string) => {
    fixture.tables.push(table);
    let ids: string[] = [];
    const query = {
      select: () => query,
      order: () => query,
      in: (_column: string, values: string[]) => { ids = values; fixture.batches.push(values); return query; },
      range: async (from: number, to: number) => {
        const rows = table === "user_profiles" ? fixture.profiles : table === "restaurant_memberships" ? fixture.links.filter((row) => ids.includes(String(row.user_id))) : [];
        return { data: rows.slice(from, to + 1), error: null };
      }
    };
    return query;
  }
} }));

import { loadAccountMembers } from "./cloudAuth";

beforeEach(() => {
  fixture.directory = [];
  fixture.profiles = [];
  fixture.links = [];
  fixture.error = null;
  fixture.ranges = [];
  fixture.batches = [];
  fixture.tables = [];
});

it("loads accounts without public profiles, preserving the real confirmation status", async () => {
  fixture.directory = [{ user_id: "pending", email: "pending@example.com", email_confirmed_at: null, full_name: "Pending", photo_url: null }];
  const result = await loadAccountMembers("account");
  expect(result).toHaveLength(1);
  expect(result[0].emailConfirmedAt).toBeNull();
  expect(result[0].restaurants).toEqual([]);
  expect(result[0].membershipId).toBe("profile-pending");
});

it("loads every page and batches restaurant queries for larger directories", async () => {
  fixture.directory = Array.from({ length: 501 }, (_, index) => ({ user_id: `u${index}`, email: `u${index}@example.com`, full_name: `Cliente ${index}`, photo_url: null, email_confirmed_at: "2026-10-01T00:00:00Z" }));
  fixture.links = fixture.directory.map((row) => ({ user_id: row.user_id, role: "viewer", restaurants: { id: "r", name: "Katzsu", account_id: "account" } }));
  const result = await loadAccountMembers("account");
  expect(result).toHaveLength(501);
  expect(fixture.ranges).toEqual([0, 500]);
  expect(Math.max(...fixture.batches.map((batch) => batch.length))).toBeLessThanOrEqual(100);
  expect(result.every((member) => member.restaurants.length === 1)).toBe(true);
});

it("keeps confirmation unknown when the SQL migration is not installed", async () => {
  fixture.error = { code: "PGRST202", message: "Function not found" };
  fixture.profiles = [{ user_id: "existing", email: "existing@example.com", full_name: "Existing", photo_url: null }];
  const result = await loadAccountMembers("account");
  expect(result[0].emailConfirmedAt).toBeUndefined();
});

it("does not fall back to another query when access is denied", async () => {
  fixture.error = { code: "42501", message: "Apenas owner pode consultar os usuários." };
  await expect(loadAccountMembers("account")).rejects.toThrow();
  expect(fixture.tables).toEqual([]);
});
