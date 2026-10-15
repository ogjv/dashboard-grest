import type { User } from "@supabase/supabase-js";
import type { AccountInvitation, AccountMember, AuthSession, PersistedWorkspace, RestaurantMembership } from "../types";
import { supabase } from "./supabase";

type LegacyGlobalRole = "owner" | "admin" | "user";
type LegacyAccountRole = "owner" | "admin" | "user";
type LegacyRestaurantRole = "owner" | "admin" | "viewer";

type RegisterRestaurantInput = {
  fullName: string;
  email: string;
  password: string;
};

type MembershipRow = {
  id: string;
  role: LegacyRestaurantRole;
  restaurants:
    | {
        id: string;
        account_id?: string | null;
        name: string;
        photo_url: string | null;
      }
    | {
        id: string;
        account_id?: string | null;
        name: string;
        photo_url: string | null;
      }[]
    | null;
};

type UserProfileRow = {
  global_role?: LegacyGlobalRole | null;
  email?: string | null;
  full_name: string | null;
  photo_url: string | null;
};

type AccountMembershipRow = {
  id: string;
  account_id: string;
  user_id: string;
  role: LegacyAccountRole;
};

type RestaurantMembershipAccessRow = {
  user_id: string;
  role: LegacyRestaurantRole;
  restaurants:
    | {
        id: string;
        account_id?: string | null;
        name: string;
      }
    | {
        id: string;
        account_id?: string | null;
        name: string;
      }[]
    | null;
};

type AccountInvitationRow = {
  id: string;
  account_id: string;
  email: string;
  account_role: LegacyAccountRole;
  restaurant_role: LegacyRestaurantRole;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
};

type AccountInvitationRestaurantRow = {
  invitation_id: string;
  restaurants:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};

type AuthSessionContext = {
  profile?: UserProfileRow | null;
  memberships?: RestaurantMembership[];
  accountMemberships?: AccountMembershipRow[];
};

const normalizeAccountRoleForProfile = (
  role: LegacyAccountRole | undefined,
  globalRole: LegacyGlobalRole | undefined
): "owner" | "user" | undefined => {
  if (!role) {
    return role;
  }

  if (globalRole === "owner" || role === "owner") {
    return "owner";
  }

  return "user";
};

const normalizeRestaurantRoleForProfile = (
  role: LegacyRestaurantRole,
  globalRole: LegacyGlobalRole | undefined
): "owner" | "viewer" => {
  if (globalRole === "owner" || role === "owner") {
    return "owner";
  }

  return "viewer";
};

const normalizeGlobalRole = (role: LegacyGlobalRole | null | undefined): "owner" | "user" =>
  role === "owner" ? "owner" : "user";

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildRestaurantId = (restaurantName: string, email: string) => {
  const fromName = slugify(restaurantName);
  if (fromName) {
    return fromName;
  }

  return slugify(email.split("@")[0] ?? "restaurante") || "restaurante";
};

const isNetworkFailureMessage = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("load failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed")
  );
};

const translateExternalErrorMessage = (message: string, fallback: string) => {
  const normalized = message.toLowerCase();

  if (isNetworkFailureMessage(message)) {
    return "Não foi possível conectar ao servidor agora. Verifique sua internet e tente novamente.";
  }

  if (normalized.includes("invalid login credentials") || normalized.includes("invalid credentials")) {
    return "E-mail ou senha inválidos.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }

  if (normalized.includes("email rate limit exceeded") || normalized.includes("rate limit")) {
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  }

  if (normalized.includes("user already registered") || normalized.includes("already registered")) {
    return "Já existe uma conta cadastrada com este e-mail.";
  }

  if (normalized.includes("signup is disabled")) {
    return "A criação de novas contas está temporariamente indisponível.";
  }

  if (normalized.includes("password should be at least") || normalized.includes("password must be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  if (normalized.includes("weak password")) {
    return "A senha informada está fraca. Use letras maiúsculas, minúsculas, número e caractere especial.";
  }

  if (normalized.includes("invalid email")) {
    return "Informe um e-mail válido.";
  }

  if (normalized.includes("email link is invalid or has expired") || normalized.includes("otp_expired")) {
    return "O link de acesso expirou ou já foi usado. Solicite um novo link.";
  }

  if (normalized.includes("jwt expired") || normalized.includes("invalid jwt")) {
    return "Sua sessão expirou. Faça login novamente.";
  }

  if (normalized.includes("permission denied") || normalized.includes("row-level security")) {
    return "Você não tem permissão para realizar esta ação.";
  }

  if (normalized.includes("duplicate key")) {
    return "Este cadastro já existe.";
  }

  if (normalized.includes("error sending confirmation email") || normalized.includes("confirmation email")) {
    return "Não foi possível enviar o e-mail de confirmação. Verifique a configuração de SMTP e tente novamente.";
  }

  if (normalized.includes("error sending recovery email") || normalized.includes("recovery email")) {
    return "Não foi possível enviar o e-mail de recuperação. Verifique a configuração de SMTP e tente novamente.";
  }

  if (normalized.includes("smtp") || normalized.includes("email provider")) {
    return "Não foi possível enviar o e-mail pelo provedor configurado. Verifique as credenciais de SMTP e tente novamente.";
  }

  return fallback;
};

const asError = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return new Error(translateExternalErrorMessage(error.message, fallback));
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message;
    return new Error(translateExternalErrorMessage(message, fallback));
  }

  return new Error(fallback);
};
const SUPABASE_NOT_CONFIGURED =
  "Supabase não configurado. Para usar autenticação em nuvem defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente ou ative o modo local (VITE_FORCE_LOCAL_AUTH=true).";

const mapMembership = (row: MembershipRow): RestaurantMembership | null => {
  const restaurant = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;
  if (!restaurant) {
    return null;
  }

  return {
    membershipId: row.id,
    accountId: restaurant.account_id ?? undefined,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    role: normalizeRestaurantRoleForProfile(row.role, undefined),
    photoUrl: restaurant.photo_url ?? undefined
  };
};

const toBaseAuthSession = (user: User): AuthSession => ({
  userId: user.id,
  email: user.email ?? "",
  authMode: "supabase"
});

const loadUserProfile = async (userId: string) => {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("global_role, email, full_name, photo_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw asError(error, "Não foi possível carregar o perfil do usuário.");
  }

  return (data as UserProfileRow | null) ?? null;
};

const loadMemberships = async (userId: string) => {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("restaurant_memberships")
    .select("id, role, restaurants(id, account_id, name, photo_url)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw asError(error, "Não foi possível carregar os restaurantes vinculados.");
  }

  return ((data ?? []) as unknown as MembershipRow[])
    .map(mapMembership)
    .filter((membership): membership is RestaurantMembership => Boolean(membership));
};

const loadAllRestaurantsForGlobalOwner = async () => {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc("list_restaurants_for_global_owner");

  if (error) {
    throw asError(error, "Não foi possível carregar os restaurantes do sistema.");
  }

  return ((data ?? []) as Array<{ id: string; account_id?: string | null; name: string; photo_url?: string | null }>).map(
    (restaurant) => ({
      membershipId: `global-owner-${restaurant.id}`,
      accountId: restaurant.account_id ?? undefined,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      role: "owner" as const,
      photoUrl: restaurant.photo_url ?? undefined
    })
  );
};

const loadAccountMemberships = async (userId: string) => {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("account_memberships")
    .select("id, account_id, user_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw asError(error, "Não foi possível carregar as permissões da conta.");
  }

  return (data ?? []) as AccountMembershipRow[];
};

const ensureUserProfile = async (user: User) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const existingProfile = await loadUserProfile(user.id);
  if (existingProfile?.email === (user.email ?? null)) {
    return existingProfile;
  }

  const nextProfile: UserProfileRow = {
    global_role: normalizeGlobalRole(existingProfile?.global_role),
    email: user.email ?? null,
    full_name:
      existingProfile?.full_name ??
      (typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : null),
    photo_url:
      existingProfile?.photo_url ??
      (typeof user.user_metadata.photo_url === "string" ? user.user_metadata.photo_url : null)
  };

  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      ...nextProfile
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw asError(error, "Não foi possível preparar o perfil do usuário.");
  }
  return nextProfile;
};

export const createInitialRestaurantForUser = async (user: User, restaurantName?: string) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const nextRestaurantName =
    restaurantName?.trim() ||
    (typeof user.user_metadata.restaurant_name === "string" ? user.user_metadata.restaurant_name.trim() : "") ||
    user.email?.split("@")[0] ||
    "Restaurante";

  const slug = buildRestaurantId(nextRestaurantName, user.email ?? user.id);
  const photoUrl =
    typeof user.user_metadata.photo_url === "string" && user.user_metadata.photo_url.trim()
      ? user.user_metadata.photo_url.trim()
      : null;

  const { data, error } = await supabase.rpc("bootstrap_restaurant_for_current_user", {
    restaurant_name: nextRestaurantName,
    restaurant_slug: slug,
    restaurant_photo_url: photoUrl
  });

  if (error) {
    throw asError(error, "Não foi possível criar o restaurante inicial.");
  }

  return data;
};

export const ensurePrimaryRestaurantContext = async (user: User, restaurantNameOverride?: string) => {
  const profile = await ensureUserProfile(user);
  await acceptPendingAccountInvitations();
  void restaurantNameOverride;
  if (normalizeGlobalRole(profile?.global_role) === "owner") {
    return loadAllRestaurantsForGlobalOwner();
  }

  return loadMemberships(user.id);
};

const acceptPendingAccountInvitations = async () => {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.rpc("accept_pending_account_invitations_for_current_user");
  if (error) {
    throw asError(error, "Não foi possível validar os convites pendentes da conta.");
  }
};

const loadAuthSessionContext = async (
  user: User,
  restaurantNameOverride?: string
): Promise<AuthSessionContext> => {
  const profile = await ensureUserProfile(user);
  await acceptPendingAccountInvitations();
  void restaurantNameOverride;

  const globalRole = normalizeGlobalRole(profile?.global_role);
  const [memberships, accountMemberships] = await Promise.all([
    globalRole === "owner" ? loadAllRestaurantsForGlobalOwner() : loadMemberships(user.id),
    loadAccountMemberships(user.id)
  ]);

  return { profile, memberships, accountMemberships };
};

const toAuthSession = async (
  user: User,
  options?: {
    activeRestaurantId?: string;
    memberships?: RestaurantMembership[];
    profile?: UserProfileRow | null;
    accountMemberships?: AccountMembershipRow[];
  }
): Promise<AuthSession> => {
  const profile = options?.profile ?? (await loadUserProfile(user.id));
  const globalRole = normalizeGlobalRole(profile?.global_role);
  const [memberships, accountMemberships] = await Promise.all([
    options?.memberships ??
      (globalRole === "owner" ? loadAllRestaurantsForGlobalOwner() : loadMemberships(user.id)),
    options?.accountMemberships ?? loadAccountMemberships(user.id)
  ]);
  const normalizedMemberships =
    globalRole === "owner"
      ? memberships
      : memberships.map((membership) => ({
          ...membership,
          role: normalizeRestaurantRoleForProfile(membership.role, globalRole)
        }));
  const activeMembership =
    normalizedMemberships.find((membership) => membership.restaurantId === options?.activeRestaurantId) ??
    normalizedMemberships[0];
  const resolvedActiveAccountId = activeMembership?.accountId ?? accountMemberships[0]?.account_id;
  const activeAccountMembership = accountMemberships.find(
    (membership) => membership.account_id === resolvedActiveAccountId
  );

  return {
    userId: user.id,
    email: user.email ?? "",
    authMode: "supabase",
    globalRole,
    activeAccountId: resolvedActiveAccountId,
    userFullName:
      profile?.full_name ??
      (typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : undefined) ??
      activeMembership?.restaurantName,
    userPhotoUrl:
      profile?.photo_url ??
      (typeof user.user_metadata.photo_url === "string" ? user.user_metadata.photo_url : undefined),
    memberships: normalizedMemberships,
    activeAccountRole:
      globalRole === "owner"
        ? "owner"
        : normalizeAccountRoleForProfile(activeAccountMembership?.role, globalRole),
    activeRole: activeMembership?.role,
    activeRestaurantId: activeMembership?.restaurantId,
    activeRestaurantName: activeMembership?.restaurantName,
    activeRestaurantPhotoUrl: activeMembership?.photoUrl,
    restaurantId: activeMembership?.restaurantId,
    restaurantName: activeMembership?.restaurantName,
    profilePhotoUrl: activeMembership?.photoUrl
  };
};

const loadDirectoryPages = async <T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  errorMessage: string,
  start = 0
): Promise<T[]> => {
  const result: T[] = [];
  for (let offset = start; ; offset += 500) {
    const page = await fetchPage(offset, offset + 499);
    if (page.error) throw asError(page.error, errorMessage);
    const rows = Array.isArray(page.data) ? page.data as T[] : [];
    result.push(...rows);
    if (rows.length < 500) return result;
  }
};

export const loadAccountMembers = async (accountId: string): Promise<AccountMember[]> => {
  if (!supabase || !accountId) {
    return [];
  }
  const client = supabase;

  type DirectoryProfile = {
    user_id: string;
    global_role?: LegacyGlobalRole | null;
    email?: string | null;
    full_name: string | null;
    photo_url: string | null;
    email_confirmed_at?: string | null;
    created_at?: string;
  };
  const directory = await client.rpc("list_users_for_global_owner").range(0, 499);
  let visibleProfiles: DirectoryProfile[];
  if (directory.error) {
    if (!["PGRST202", "42883"].includes(directory.error.code)) {
      throw asError(directory.error, "Não foi possível consultar as contas cadastradas.");
    }
    visibleProfiles = await loadDirectoryPages<DirectoryProfile>((from, to) => client.from("user_profiles")
      .select("user_id, global_role, email, full_name, photo_url").order("created_at", { ascending: true }).order("user_id").range(from, to),
      "Não foi possível carregar os perfis da equipe.");
  } else {
    visibleProfiles = (directory.data ?? []) as DirectoryProfile[];
    if (visibleProfiles.length === 500) visibleProfiles.push(...await loadDirectoryPages<DirectoryProfile>(
      (from, to) => client.rpc("list_users_for_global_owner").range(from, to), "Não foi possível consultar as contas cadastradas.", 500));
  }

  const memberships = await loadDirectoryPages<AccountMembershipRow>((from, to) => client.from("account_memberships")
    .select("id, account_id, user_id, role").order("created_at", { ascending: true }).order("id").range(from, to),
    "Não foi possível carregar os membros da conta.");
  if (memberships.length === 0 && visibleProfiles.length === 0) {
    return [];
  }

  const userIds = [...new Set([...memberships.map((item) => item.user_id), ...visibleProfiles.map((item) => item.user_id)])];
  const profileMap = new Map(visibleProfiles.map((item) => [item.user_id, item]));

  const restaurantMemberships: RestaurantMembershipAccessRow[] = [];
  for (let offset = 0; offset < userIds.length; offset += 100) {
    const batch = userIds.slice(offset, offset + 100);
    restaurantMemberships.push(...await loadDirectoryPages<RestaurantMembershipAccessRow>((from, to) => client.from("restaurant_memberships")
      .select("user_id, role, restaurants(id, account_id, name)").in("user_id", batch)
      .order("user_id").order("restaurant_id").range(from, to), "Não foi possível carregar os acessos aos restaurantes."));
  }

  const restaurantsByUser = new Map<
    string,
    Array<{
      restaurantId: string;
      restaurantName: string;
      role: "owner" | "viewer";
    }>
  >();

  restaurantMemberships.forEach((membership) => {
    const restaurant = Array.isArray(membership.restaurants) ? membership.restaurants[0] : membership.restaurants;
    if (!restaurant) {
      return;
    }

    const current = restaurantsByUser.get(membership.user_id) ?? [];
    const profile = profileMap.get(membership.user_id);
    current.push({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      role: normalizeRestaurantRoleForProfile(membership.role, normalizeGlobalRole(profile?.global_role))
    });
    restaurantsByUser.set(membership.user_id, current);
  });

  const membershipByUser = new Map<string, AccountMembershipRow>();
  memberships.forEach((membership) => {
    const current = membershipByUser.get(membership.user_id);
    if (!current || membership.account_id === accountId) {
      membershipByUser.set(membership.user_id, membership);
    }
  });

  return userIds.map((userId) => {
    const profile = profileMap.get(userId);
    const membership = membershipByUser.get(userId);
    const globalRole = normalizeGlobalRole(profile?.global_role);
    return {
      membershipId: membership?.id ?? `profile-${userId}`,
      accountId: membership?.account_id ?? accountId,
      userId,
      role: globalRole === "owner" ? "owner" : "user",
      fullName: profile?.full_name ?? undefined,
      email: profile?.email ?? undefined,
      photoUrl: profile?.photo_url ?? undefined,
      emailConfirmedAt: profile?.email_confirmed_at,
      createdAt: profile?.created_at,
      restaurants:
        restaurantsByUser.get(userId)?.sort((left, right) => left.restaurantName.localeCompare(right.restaurantName)) ??
        []
    };
  });
};

export const loadAccountInvitations = async (accountId: string): Promise<AccountInvitation[]> => {
  if (!supabase || !accountId) {
    return [];
  }

  const { data, error } = await supabase
    .from("account_invitations")
    .select("id, account_id, email, account_role, restaurant_role, status, created_at")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw asError(error, "Não foi possível carregar os convites da conta.");
  }

  const invitations = (data ?? []) as AccountInvitationRow[];
  if (invitations.length === 0) {
    return [];
  }

  const invitationIds = invitations.map((invitation) => invitation.id);
  const { data: invitationRestaurants, error: invitationRestaurantsError } = await supabase
    .from("account_invitation_restaurants")
    .select("invitation_id, restaurants(id, name)")
    .in("invitation_id", invitationIds);

  if (invitationRestaurantsError) {
    throw asError(invitationRestaurantsError, "Não foi possível carregar os restaurantes dos convites.");
  }

  const restaurantsByInvitation = new Map<string, Array<{ restaurantId: string; restaurantName: string }>>();
  ((invitationRestaurants ?? []) as AccountInvitationRestaurantRow[]).forEach((row) => {
    const restaurant = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;
    if (!restaurant) {
      return;
    }

    const current = restaurantsByInvitation.get(row.invitation_id) ?? [];
    current.push({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name
    });
    restaurantsByInvitation.set(row.invitation_id, current);
  });

  return invitations.map((invitation) => ({
    invitationId: invitation.id,
    accountId: invitation.account_id,
    email: invitation.email,
    accountRole: normalizeAccountRoleForProfile(invitation.account_role, undefined) ?? "user",
    restaurantRole: normalizeRestaurantRoleForProfile(invitation.restaurant_role, undefined),
    status: invitation.status,
    createdAt: invitation.created_at,
    restaurants:
      restaurantsByInvitation.get(invitation.id)?.sort((left, right) => left.restaurantName.localeCompare(right.restaurantName)) ?? []
  }));
};

export const createAccountInvitation = async ({
  email,
  accountRole,
  restaurantRole,
  restaurantIds
}: {
  email: string;
  accountRole: "user";
  restaurantRole: "viewer";
  restaurantIds: string[];
}) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const nextEmail = email.trim().toLowerCase();
  if (!nextEmail) {
    throw new Error("Informe o e-mail do usuário.");
  }

  if (restaurantIds.length === 0) {
    throw new Error("Selecione ao menos um restaurante para este acesso.");
  }

  const { data, error } = await supabase.rpc("create_account_invitation_for_current_user", {
    target_email: nextEmail,
    target_account_role: accountRole,
    target_restaurant_role: restaurantRole,
    target_restaurant_ids: restaurantIds
  });

  if (error) {
    throw asError(error, "Não foi possível criar o convite.");
  }

  return typeof data === "string" ? data : undefined;
};

export const revokeAccountInvitation = async (invitationId: string) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const { error } = await supabase.rpc("revoke_account_invitation_for_current_user", {
    target_invitation_id: invitationId
  });

  if (error) {
    throw asError(error, "Não foi possível revogar o convite.");
  }
};

export const updateAccountMemberAccess = async ({
  accountId,
  userId,
  accountRole,
  restaurantRole,
  restaurantIds
}: {
  accountId: string;
  userId: string;
  accountRole: "user";
  restaurantRole: "viewer";
  restaurantIds: string[];
}) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  if (!accountId) {
    throw new Error("Não foi possível identificar a conta deste membro.");
  }

  if (!userId) {
    throw new Error("Não foi possível identificar o membro selecionado.");
  }

  const { data, error } = await supabase.rpc("update_account_member_for_current_user", {
    target_account_id: accountId,
    target_user_id: userId,
    target_account_role: accountRole,
    target_restaurant_role: restaurantRole,
    target_restaurant_ids: restaurantIds
  });

  if (error) {
    throw asError(error, "Não foi possível atualizar o acesso do membro.");
  }

  return typeof data === "string" ? data : undefined;
};

export const removeAccountMemberAccess = async ({
  accountId,
  userId
}: {
  accountId: string;
  userId: string;
}) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  if (!accountId) {
    throw new Error("Não foi possível identificar a conta deste membro.");
  }

  if (!userId) {
    throw new Error("Não foi possível identificar o membro selecionado.");
  }

  const { data, error } = await supabase.rpc("remove_account_member_for_current_user", {
    target_account_id: accountId,
    target_user_id: userId
  });

  if (error) {
    throw asError(error, "Não foi possível remover o acesso do membro.");
  }

  return typeof data === "string" ? data : undefined;
};

export const getSupabaseSession = async () => {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw asError(error, "Não foi possível restaurar a sessão.");
  }

  const user = data.session?.user;
  if (!user) {
    return null;
  }

  return toBaseAuthSession(user);
};

export const hydrateSupabaseSession = async (
  session: AuthSession,
  restaurantNameOverride?: string,
  preferredRestaurantId?: string
) => {
  if (!supabase) {
    return session;
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    throw asError(error, "Não foi possível carregar os restaurantes da conta.");
  }

  if (!user) {
    return null;
  }

  const context = await loadAuthSessionContext(user, restaurantNameOverride);
  return toAuthSession(user, {
    ...context,
    activeRestaurantId: preferredRestaurantId ?? session.activeRestaurantId ?? session.restaurantId
  });
};

export const subscribeToSupabaseAuth = (callback: (session: AuthSession | null, event?: string) => void) => {
  if (!supabase) {
    return () => undefined;
  }

  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user;
    if (!user) {
      callback(null, event);
      return;
    }

    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      return;
    }

    void loadAuthSessionContext(user)
      .then((context) => toAuthSession(user, context))
      .then((nextSession) => callback(nextSession, event))
      .catch(() => callback(toBaseAuthSession(user), event));
  });

  return () => subscription.unsubscribe();
};

export const signInWithSupabase = async (email: string, password: string) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw asError(error, "Não foi possível iniciar a sessão.");
  }

  const user = data.user;
  if (!user) {
    throw new Error("Não foi possível iniciar a sessão.");
  }

  return toBaseAuthSession(user);
};

export const registerRestaurantWithSupabase = async ({
  fullName,
  email,
  password
}: RegisterRestaurantInput) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        restaurant_name: fullName
      }
    }
  });

  if (error) {
    throw asError(error, "Não foi possível criar a conta. Revise os dados e tente novamente.");
  }

  const user = data.user;
  if (!user) {
    throw new Error("Não foi possível concluir a criação da conta. Tente novamente.");
  }

  if (!data.session) {
    throw new Error("Conta criada com sucesso. Confirme o e-mail enviado e depois faça login.");
  }

  const context = await loadAuthSessionContext(user, fullName);
  return toAuthSession(user, context);
};

export const requestPasswordResetWithSupabase = async (email: string) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Informe o e-mail da conta para recuperar a senha.");
  }

  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });

  if (error) {
    throw asError(error, "Não foi possível enviar o e-mail de recuperação.");
  }
};

export const updateSupabasePassword = async (password: string) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const nextPassword = password.trim();
  if (nextPassword.length < 6) {
    throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
  }

  const { error } = await supabase.auth.updateUser({ password: nextPassword });
  if (error) {
    throw asError(error, "Não foi possível atualizar a senha.");
  }
};

export const signOutFromSupabase = async () => {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw asError(error, "Não foi possível encerrar a sessão.");
  }
};

export const loadCloudWorkspace = async (restaurantId: string) => {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("restaurant_workspaces")
    .select("locale, state, upload_feedback, selected_period, selected_view")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error) {
    throw asError(error, "Não foi possível carregar a base online.");
  }

  if (!data) {
    return null;
  }

  const state = data.state as PersistedWorkspace["state"] & {
    drePeriods?: PersistedWorkspace["drePeriods"];
    selectedDrePeriod?: PersistedWorkspace["selectedDrePeriod"];
  };

  return {
    locale: data.locale,
    state,
    uploadFeedback: data.upload_feedback,
    selectedPeriod: data.selected_period,
    selectedView: data.selected_view,
    drePeriods: state?.drePeriods ?? [],
    selectedDrePeriod: state?.selectedDrePeriod
  } as PersistedWorkspace;
};

export const saveCloudWorkspace = async (restaurantId: string, workspace: PersistedWorkspace) => {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("restaurant_workspaces").upsert(
    {
      restaurant_id: restaurantId,
      locale: workspace.locale,
      state: {
        ...workspace.state,
        drePeriods: workspace.drePeriods ?? [],
        selectedDrePeriod: workspace.selectedDrePeriod
      },
      upload_feedback: workspace.uploadFeedback,
      selected_period: workspace.selectedPeriod,
      selected_view: workspace.selectedView,
      updated_at: new Date().toISOString()
    },
    { onConflict: "restaurant_id" }
  );

  if (error) {
    throw asError(error, "Não foi possível salvar a base online.");
  }
};

export const updateSupabaseRestaurantProfile = async (
  session: AuthSession,
  updates: { restaurantName: string; profilePhotoUrl?: string }
) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  if (!session.activeRestaurantId) {
    throw new Error("Nenhum restaurante ativo foi encontrado.");
  }

  const restaurantName = updates.restaurantName.trim();
  const nextSlug = buildRestaurantId(restaurantName, session.email);
  const photoUrl = updates.profilePhotoUrl?.trim() ? updates.profilePhotoUrl.trim() : null;

  const { error } = await supabase
    .from("restaurants")
    .update({
      name: restaurantName,
      slug: nextSlug,
      photo_url: photoUrl
    })
    .eq("id", session.activeRestaurantId);

  if (error) {
    throw asError(error, "Não foi possível atualizar os dados do restaurante.");
  }

  const memberships = (session.memberships ?? []).map((membership) =>
    membership.restaurantId === session.activeRestaurantId
      ? {
          ...membership,
          restaurantName,
          photoUrl: photoUrl ?? undefined
        }
      : membership
  );

  return {
    ...session,
    memberships,
    activeRestaurantName: restaurantName,
    activeRestaurantPhotoUrl: photoUrl ?? undefined,
    restaurantId: session.activeRestaurantId,
    restaurantName,
    profilePhotoUrl: photoUrl ?? undefined
  };
};

export const updateSupabaseUserProfile = async (
  session: AuthSession,
  updates: { fullName: string; userPhotoUrl?: string }
) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const fullName = updates.fullName.trim();
  const photoUrl = updates.userPhotoUrl?.trim() ? updates.userPhotoUrl.trim() : null;

  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: session.userId,
      email: session.email,
      full_name: fullName || null,
      photo_url: photoUrl
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw asError(error, "Não foi possível atualizar o perfil do usuário.");
  }

  return {
    ...session,
    userFullName: fullName || undefined,
    userPhotoUrl: photoUrl ?? undefined
  };
};

export const createSupabaseRestaurantForCurrentUser = async (
  session: AuthSession,
  restaurantName: string
) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const nextRestaurantName = restaurantName.trim();
  if (!nextRestaurantName) {
    throw new Error("Informe o nome do restaurante.");
  }

  const slug = buildRestaurantId(nextRestaurantName, session.email || session.userId);
  const { data, error } = await supabase.rpc("create_restaurant_for_current_user", {
    restaurant_name: nextRestaurantName,
    restaurant_slug: slug,
    restaurant_photo_url: null
  });

  if (error) {
    throw asError(error, "Não foi possível cadastrar o restaurante.");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sessão inválida ao cadastrar restaurante.");
  }

  const memberships =
    session.globalRole === "owner" ? await loadAllRestaurantsForGlobalOwner() : await loadMemberships(session.userId);
  return toAuthSession(user, {
    memberships,
    activeRestaurantId: typeof data === "string" ? data : undefined
  });
};

export const deleteSupabaseRestaurantFromAccount = async (
  session: AuthSession,
  restaurantId: string
) => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const { error } = await supabase.rpc("delete_restaurant_for_current_user", {
    target_restaurant_id: restaurantId
  });

  if (error) {
    throw asError(error, "Não foi possível excluir o restaurante.");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sessão inválida ao excluir restaurante.");
  }

  const memberships =
    session.globalRole === "owner" ? await loadAllRestaurantsForGlobalOwner() : await loadMemberships(session.userId);
  const fallbackRestaurantId =
    memberships.find((membership) => membership.restaurantId !== restaurantId)?.restaurantId ?? memberships[0]?.restaurantId;

  return toAuthSession(user, {
    memberships,
    activeRestaurantId: fallbackRestaurantId
  });
};

export const deleteSupabaseRestaurantAccount = async () => {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    throw asError(error, "Não foi possível excluir a conta.");
  }
};
