import { describe, expect, it } from "vitest";
import type { AccountMember } from "../types";
import { getUserDirectoryStatus, searchDirectoryMembers } from "./userDirectory";

const member: AccountMember = { membershipId: "m", accountId: "a", userId: "u", role: "user", fullName: "João Magalhães", email: "joao@example.com", emailConfirmedAt: "2026-10-01T12:00:00Z", restaurants: [] };

describe("user directory", () => {
  it("distinguishes an unconfirmed account from an active account without restaurants", () => {
    expect(getUserDirectoryStatus({ ...member, emailConfirmedAt: null })).toBe("pending");
    expect(getUserDirectoryStatus(member)).toBe("unlinked");
  });
  it("keeps confirmation pending even if restaurant access has been prepared", () => {
    expect(getUserDirectoryStatus({ ...member, emailConfirmedAt: null, restaurants: [{ restaurantId: "r", restaurantName: "Katzsu", role: "viewer" }] })).toBe("pending");
  });
  it("recognizes global owners as having access even without explicit restaurant links", () => {
    expect(getUserDirectoryStatus({ ...member, role: "owner" })).toBe("linked");
  });
  it("does not assume confirmation when the database did not return it", () => {
    expect(getUserDirectoryStatus({ ...member, emailConfirmedAt: undefined })).toBe("unknown");
  });
  it("keeps known restaurant access visible without assuming email confirmation", () => {
    expect(getUserDirectoryStatus({ ...member, emailConfirmedAt: undefined, restaurants: [{ restaurantId: "r", restaurantName: "Katzsu", role: "viewer" }] })).toBe("linked");
    expect(getUserDirectoryStatus({ ...member, emailConfirmedAt: undefined, role: "owner" })).toBe("linked");
  });
  it("matches all search terms across name, email and restaurants without accent or case sensitivity", () => {
    const linked = { ...member, restaurants: [{ restaurantId: "r", restaurantName: "Nosso Ipanema", role: "viewer" as const }] };
    expect(searchDirectoryMembers([linked], " IPANEMA JOAO ")).toEqual([linked]);
    expect(searchDirectoryMembers([linked], "example MAGALHAES")).toEqual([linked]);
    expect(searchDirectoryMembers([linked], "Joao Katzsu")).toEqual([]);
  });
});
