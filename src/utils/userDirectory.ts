import type { AccountMember } from "../types";

export type UserDirectoryStatus = "pending" | "unlinked" | "linked" | "unknown";

export const userDirectoryStatusLabels: Record<UserDirectoryStatus, string> = {
  pending: "Aguardando confirmação",
  unlinked: "Ativa sem restaurante",
  linked: "Com acesso",
  unknown: "Sem restaurante"
};

export function getUserDirectoryStatus(member: AccountMember): UserDirectoryStatus {
  if (member.emailConfirmedAt === null) return "pending";
  if (member.role === "owner" || member.restaurants.length > 0) return "linked";
  if (member.emailConfirmedAt === undefined) return "unknown";
  return "unlinked";
}

export const normalizeUserSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function searchDirectoryMembers(members: AccountMember[], query: string) {
  const words = normalizeUserSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return members;
  return members.filter((member) => {
    const text = normalizeUserSearch([member.fullName, member.email, ...member.restaurants.map((restaurant) => restaurant.restaurantName)].filter(Boolean).join(" "));
    return words.every((word) => text.includes(word));
  });
}
