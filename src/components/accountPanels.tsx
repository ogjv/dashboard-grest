import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { AccountInvitation, AccountMember, AuthSession } from "../types";
import type { AccountPanelCopy } from "../presentation/contracts";
import { ProfileAvatar, UserAvatar } from "./appChrome";
import { RestaurantNavigatorPanel } from "./dashboardPanels";
import { FilterSelect } from "./filterSelect";
import { confirmAction } from "../utils/confirmDialog";
import { getUserDirectoryStatus, searchDirectoryMembers, userDirectoryStatusLabels } from "../utils/userDirectory";
import type { UserDirectoryStatus } from "../utils/userDirectory";

type ProfileFormState = {
  restaurantName: string;
  profilePhotoUrl?: string;
};

type UserProfileFormState = {
  fullName: string;
  userPhotoUrl?: string;
};

export type AccountSettingsPanelProps = {
  session: AuthSession;
  userForm: UserProfileFormState;
  busy: boolean;
  message?: string;
  error?: string;
  onClose: () => void;
  onUserNameChange: (value: string) => void;
  onUserPhotoSelect: (file: File | null) => void;
  onSaveUser: () => void;
  onDeleteAccount: () => void;
  copy: AccountPanelCopy;
};

export type RestaurantManagementPanelProps = {
  session: AuthSession;
  restaurantForm: ProfileFormState;
  newRestaurantName: string;
  busy: boolean;
  message?: string;
  error?: string;
  onRestaurantNameChange: (value: string) => void;
  onRestaurantPhotoSelect: (file: File | null) => void;
  onCreateRestaurantNameChange: (value: string) => void;
  onSaveRestaurant: () => void;
  onCreateRestaurant: () => void;
  onDeleteRestaurant: (restaurantId: string) => void;
  onActivateRestaurant: (restaurantId: string) => void;
  copy: AccountPanelCopy;
};

export type UserManagementPanelProps = {
  session: AuthSession;
  members: AccountMember[];
  membersLoading: boolean;
  inviteForm: {
    email: string;
    restaurantIds: string[];
  };
  inviteBusy: boolean;
  inviteMessage?: string;
  inviteError?: string;
  invitations: AccountInvitation[];
  invitationsLoading: boolean;
  onInviteEmailChange: (value: string) => void;
  onInviteRestaurantToggle: (restaurantId: string) => void;
  onCreateInvitation: () => void;
  onRevokeInvitation: (invitationId: string) => void;
  onUpdateMember: (payload: {
    member: AccountMember;
    accountRole: "user";
    restaurantRole: "viewer";
    restaurantIds: string[];
  }) => Promise<void>;
  onRemoveMember: (member: AccountMember) => Promise<void>;
  copy: AccountPanelCopy;
};

const areRestaurantSelectionsEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
};

function ManagedMemberCard({
  member, session, busy, onUpdateMember, onRemoveMember, copy, onDirtyChange, onBusyChange, onClose
}: {
  member: AccountMember;
  session: AuthSession;
  busy: boolean;
  onUpdateMember: UserManagementPanelProps["onUpdateMember"];
  onRemoveMember: UserManagementPanelProps["onRemoveMember"];
  copy: AccountPanelCopy;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const initialRestaurantIds = useMemo(() => member.restaurants.map((restaurant) => restaurant.restaurantId).sort(), [member.restaurants]);
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState(initialRestaurantIds);
  const [localBusy, setLocalBusy] = useState(false);
  const [localMessage, setLocalMessage] = useState<string>();
  const [localError, setLocalError] = useState<string>();
  useEffect(() => { setSelectedRestaurantIds(initialRestaurantIds); }, [initialRestaurantIds]);
  const isCurrentUser = member.userId === session.userId;
  const isImmutable = member.role === "owner" || isCurrentUser;
  const hasChanges = !areRestaurantSelectionsEqual(selectedRestaurantIds, initialRestaurantIds);
  const status = getUserDirectoryStatus(member);
  useEffect(() => { onDirtyChange(hasChanges); }, [hasChanges, onDirtyChange]);
  useEffect(() => { onBusyChange(localBusy); }, [localBusy, onBusyChange]);

  const handleSave = async () => {
    if (isImmutable || busy || localBusy || !hasChanges || selectedRestaurantIds.length === 0) return;
    setLocalBusy(true);
    setLocalError(undefined);
    setLocalMessage(undefined);
    try {
      await onUpdateMember({ member, accountRole: "user", restaurantRole: "viewer", restaurantIds: selectedRestaurantIds });
      setLocalMessage(copy.teamMemberUpdated);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível salvar o acesso.");
    } finally { setLocalBusy(false); }
  };
  const handleRemove = async () => {
    if (isImmutable || busy || localBusy) return;
    const confirmed = await confirmAction({
      title: "Remover acesso aos restaurantes?",
      message: `Os vínculos de ${member.fullName ?? member.email ?? "esta conta"} serão removidos. A conta continuará cadastrada.`,
      confirmLabel: "Remover acesso", cancelLabel: "Cancelar", tone: "danger"
    });
    if (!confirmed) return;
    setLocalBusy(true);
    setLocalError(undefined);
    setLocalMessage(undefined);
    try {
      await onRemoveMember(member);
      setLocalMessage(copy.teamMemberRemoved);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível remover o acesso.");
    } finally { setLocalBusy(false); }
  };
  const availableRestaurants = [...new Map((session.memberships ?? []).map((membership) => [membership.restaurantId, membership])).values()];

  return (
    <aside className="user-access-editor" aria-label="Editar acesso do usuário">
      <div className="user-access-editor-heading">
        <h3>Acesso da conta</h3>
        <button type="button" className="user-directory-icon-button" aria-label="Fechar edição de acesso" onClick={onClose} disabled={localBusy}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div className="user-access-identity">
        <UserAvatar session={{ ...session, userFullName: member.fullName, userPhotoUrl: member.photoUrl, email: member.email ?? "" }} size="md" />
        <div><strong>{member.fullName || member.email || "Conta sem nome"}</strong><p>{member.email}</p></div>
      </div>
      <span className={`user-directory-status ${status}`}>{userDirectoryStatusLabels[status]}</span>
      <dl className="user-access-facts">
        <div><dt>Permissão</dt><dd>{member.role === "owner" ? "Owner · acesso completo" : "Somente leitura"}</dd></div>
        <div><dt>Confirmação do e-mail</dt><dd>{member.emailConfirmedAt === undefined ? "Não consultada" : member.emailConfirmedAt === null ? "Pendente" : "Confirmado"}</dd></div>
        {member.createdAt ? <div><dt>Cadastro</dt><dd>{new Intl.DateTimeFormat("pt-BR").format(new Date(member.createdAt))}</dd></div> : null}
      </dl>
      {status === "pending" ? <p className="user-access-note">O e-mail ainda não foi confirmado. Os vínculos podem ser preparados antes da ativação.</p> : null}
      {isImmutable ? <p className="user-access-note">{member.role === "owner" ? "Esta conta possui acesso completo aos restaurantes. As permissões de owner não são alteradas nesta tela." : copy.teamMemberImmutable}</p> : (
        <>
          <RestaurantNavigatorPanel
            eyebrow="" title="Restaurantes vinculados" selectionLabel="Restaurantes vinculados"
            memberships={availableRestaurants}
            multiple selectedRestaurantIds={selectedRestaurantIds}
            disabled={busy || localBusy}
            onActivateRestaurant={(restaurantId) => {
              setSelectedRestaurantIds((current) => current.includes(restaurantId) ? current.filter((id) => id !== restaurantId) : [...current, restaurantId]);
              setLocalMessage(undefined);
            }}
          />
          {selectedRestaurantIds.length === 0 ? <p className="user-access-note">Selecione ao menos um restaurante para conceder acesso.</p> : null}
          {hasChanges ? <p className="user-access-unsaved" role="status">Alterações ainda não salvas</p> : null}
          {localError ? <p className="message error" role="alert">{localError}</p> : null}
          {localMessage ? <p className="message success" role="status">{localMessage}</p> : null}
          <div className="user-access-editor-actions">
            <button type="button" className="primary-button" onClick={() => void handleSave()} disabled={!hasChanges || selectedRestaurantIds.length === 0 || busy || localBusy}>
              {localBusy ? copy.processing : "Salvar acesso"}
            </button>
            {member.restaurants.length > 0 ? <button type="button" className="ghost-button danger-button" onClick={() => void handleRemove()} disabled={busy || localBusy}>Remover acesso</button> : null}
          </div>
        </>
      )}
    </aside>
  );
}

export function AccountSettingsPanel({
  session,
  userForm,
  busy,
  message,
  error,
  onClose,
  onUserNameChange,
  onUserPhotoSelect,
  onSaveUser,
  onDeleteAccount,
  copy
}: AccountSettingsPanelProps) {
  return (
    <section className="card account-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{copy.settings}</span>
          <h3>{copy.settings}</h3>
          <p>{copy.settingsText}</p>
        </div>
        <button type="button" className="ghost-button" onClick={onClose}>
          {copy.close}
        </button>
      </div>

      <div className="account-panel-stack">
        <section className="account-user-section">
          <div className="section-head compact">
            <div>
              <span className="eyebrow">{copy.userProfile}</span>
              <h3>{copy.userProfile}</h3>
              <p>{copy.userProfileText}</p>
            </div>
          </div>

          <div className="account-user-grid">
            <section className="account-identity-card">
              <div className="account-avatar-panel">
                <UserAvatar
                  session={{
                    ...session,
                    userFullName: userForm.fullName,
                    userPhotoUrl: userForm.userPhotoUrl
                  }}
                  size="lg"
                />
                <div>
                  <strong>{copy.userProfile}</strong>
                  <p>{copy.userProfileText}</p>
                </div>
              </div>

              <label className="upload-box compact-upload">
                <div className="upload-box-top">
                  <span className="upload-order">{copy.profilePhoto}</span>
                  <span className="upload-status ready">{busy ? copy.processing : copy.uploadPhoto}</span>
                </div>
                <strong className="upload-title">{userForm.userPhotoUrl ? (userForm.fullName || session.email) : copy.uploadPhoto}</strong>
                <small>{copy.userProfileText}</small>
                <div className="upload-box-footer">
                  <span className="upload-action">{copy.uploadPhoto}</span>
                  <span className="upload-meta">.png .jpg .jpeg</span>
                </div>
                <input
                  className="upload-input-hidden"
                  type="file"
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  onChange={(event) => onUserPhotoSelect(event.target.files?.[0] ?? null)}
                />
              </label>
            </section>

            <section className="account-form-card">
              <label className="auth-field">
                <span>{copy.fullName}</span>
                <input value={userForm.fullName} onChange={(event) => onUserNameChange(event.target.value)} />
              </label>

              <label className="auth-field">
                <span>{copy.email}</span>
                <input value={session.email} disabled />
              </label>

              <div className="user-status-grid">
                <article className="mini-stat-card">
                  <span>{copy.accountStatus}</span>
                  <strong>{session.activeRole === "owner" ? copy.roleOwner : copy.roleViewer}</strong>
                </article>
                <article className="mini-stat-card">
                  <span>{copy.restaurantsCount}</span>
                  <strong>{String(session.memberships?.length ?? 0)}</strong>
                </article>
              </div>

              {message ? <p className="message success">{message}</p> : null}
              {error ? <p className="message error">{error}</p> : null}

              <div className="panel-actions">
                <button type="button" className="primary-button" onClick={onSaveUser} disabled={busy}>
                  {copy.saveProfile}
                </button>
              </div>
            </section>
          </div>
        </section>

        <section className="danger-panel">
          <div className="danger-panel-copy">
            <span className="eyebrow">{copy.dangerZone}</span>
            <strong>{copy.deleteAccount}</strong>
            <p>{copy.deleteHint}</p>
          </div>
          <button type="button" className="ghost-button danger-button" onClick={onDeleteAccount} disabled={busy}>
            {copy.deleteAccount}
          </button>
        </section>
      </div>
    </section>
  );
}

export function UserManagementPanel({
  session, members, membersLoading, inviteForm, inviteBusy, inviteMessage, inviteError,
  invitations, invitationsLoading, onInviteEmailChange, onInviteRestaurantToggle,
  onCreateInvitation, onRevokeInvitation, onUpdateMember, onRemoveMember, copy
}: UserManagementPanelProps) {
  const [memberSearch, setMemberSearch] = useState("");
  const deferredSearch = useDeferredValue(memberSearch);
  const [category, setCategory] = useState<UserDirectoryStatus | "all">("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string>();
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedUserId) editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedUserId]);
  const counts = useMemo(() => members.reduce((result, member) => {
    result[getUserDirectoryStatus(member)] += 1;
    return result;
  }, { pending: 0, unlinked: 0, linked: 0, unknown: 0 }), [members]);
  const filteredMembers = useMemo(() => {
    const matching = searchDirectoryMembers(members, deferredSearch).filter((member) => {
      const status = getUserDirectoryStatus(member);
      return category === "all" || status === category || (category === "unlinked" && status === "unknown");
    });
    return [...matching].sort((left, right) => {
      if (sort === "recent") return (Date.parse(right.createdAt ?? "") || 0) - (Date.parse(left.createdAt ?? "") || 0);
      const leftName = left.fullName || left.email || "";
      const rightName = right.fullName || right.email || "";
      return leftName.localeCompare(rightName, "pt-BR", { sensitivity: "base" });
    });
  }, [category, deferredSearch, members, sort]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleMembers = filteredMembers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedMember = members.find((member) => member.userId === selectedUserId);
  const availableRestaurants = [...new Map((session.memberships ?? []).map((membership) => [membership.restaurantId, membership])).values()];
  const categories: Array<{ key: UserDirectoryStatus | "all"; label: string; count: number }> = [
    { key: "all", label: "Todas as contas", count: members.length },
    ...(members.some((member) => member.emailConfirmedAt !== undefined) ? [{ key: "pending" as const, label: "Aguardando e-mail", count: counts.pending }] : []),
    { key: "unlinked", label: members.some((member) => member.emailConfirmedAt === undefined) ? "Sem restaurante" : "Ativas sem restaurante", count: counts.unlinked + counts.unknown },
    { key: "linked", label: "Com acesso", count: counts.linked },
  ];
  const selectMember = async (userId?: string) => {
    if (editorBusy || selectedUserId === userId) return;
    if (editorDirty && !await confirmAction({
      title: "Descartar alterações?",
      message: "As alterações de acesso ainda não foram salvas.",
      confirmLabel: "Descartar", cancelLabel: "Continuar editando"
    })) return;
    setEditorDirty(false);
    setSelectedUserId(userId);
  };

  return (
    <section className="user-directory" aria-label="Gestão de usuários">
      <header className="user-directory-heading">
        <div><h3>Contas e acessos</h3><p>Acompanhe a situação das contas e gerencie o acesso de cada cliente aos restaurantes.</p></div>
        <span className="user-directory-total">{members.length} conta(s)</span>
      </header>
      <div className="user-directory-status-filters" role="group" aria-label="Filtrar contas por situação">
        {categories.map((item) => (
          <button type="button" key={item.key} aria-pressed={category === item.key} onClick={() => { setCategory(item.key); setPage(1); }}>
            <span>{item.label}</span><strong>{item.count}</strong>
          </button>
        ))}
      </div>
      <div className="user-directory-toolbar">
        <label className="user-directory-search">
          <span>Buscar usuário</span>
          <div>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
            <input type="search" value={memberSearch} onChange={(event) => { setMemberSearch(event.target.value); setPage(1); }} placeholder="Nome, e-mail ou restaurante" autoComplete="off" />
          </div>
        </label>
        <FilterSelect label="Ordenar por" value={sort} options={[{ value: "name", label: "Nome: A a Z" }, { value: "recent", label: "Cadastros recentes" }]} onChange={(value) => { setSort(value); setPage(1); }} />
      </div>
      <div className="user-directory-layout">
        <div className="user-directory-list-panel" aria-busy={membersLoading || memberSearch !== deferredSearch}>
          <div className="user-directory-list-heading"><h4>Usuários</h4><span role="status">{membersLoading ? "Carregando…" : `${filteredMembers.length} resultado(s)`}</span></div>
          {membersLoading ? <p className="user-directory-empty" role="status">Carregando contas cadastradas…</p> : visibleMembers.length === 0 ? (
            <div className="user-directory-empty" role="status">
              <strong>{members.length === 0 ? "Nenhuma conta cadastrada" : "Nenhuma conta para este filtro"}</strong>
              {members.length > 0 ? <button type="button" className="ghost-button" onClick={() => { setMemberSearch(""); setCategory("all"); setPage(1); }}>Redefinir busca e filtros</button> : null}
            </div>
          ) : (
            <ul className="user-directory-list">
              {visibleMembers.map((member) => {
                const status = getUserDirectoryStatus(member);
                return <li key={member.userId}>
                  <button type="button" className={`user-directory-row ${selectedUserId === member.userId ? "selected" : ""}`}
                    aria-pressed={selectedUserId === member.userId} aria-label={`Gerenciar ${member.fullName || member.email || "conta"}`}
                    disabled={editorBusy} onClick={() => void selectMember(member.userId)}>
                    <span aria-hidden="true"><UserAvatar session={{ ...session, userFullName: member.fullName, userPhotoUrl: member.photoUrl, email: member.email ?? "" }} size="sm" /></span>
                    <span className="user-directory-row-copy">
                      <strong>{member.fullName || member.email || "Conta sem nome"}{member.userId === session.userId ? " · Você" : ""}</strong>
                      <span>{member.email}</span>
                      <small>{member.role === "owner" ? "Owner · todos os restaurantes" : member.restaurants.length > 0 ? member.restaurants.map((restaurant) => restaurant.restaurantName).join(", ") : "Nenhum restaurante vinculado"}</small>
                    </span>
                    <span className={`user-directory-status ${status}`}>{userDirectoryStatusLabels[status]}</span>
                    <svg className="user-directory-row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                  </button>
                </li>;
              })}
            </ul>
          )}
          {!membersLoading && filteredMembers.length > pageSize ? (
            <nav className="user-directory-pagination" aria-label="Páginas de usuários">
              <button type="button" className="user-directory-icon-button" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></button>
              <span>Página {currentPage} de {pageCount}</span>
              <button type="button" className="user-directory-icon-button" aria-label="Próxima página" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
            </nav>
          ) : null}
        </div>
        <div className="user-directory-editor-region" ref={editorRef}>
        {selectedMember ? <ManagedMemberCard key={selectedMember.userId} member={selectedMember} session={session} busy={inviteBusy}
          onUpdateMember={onUpdateMember} onRemoveMember={onRemoveMember} copy={copy} onDirtyChange={setEditorDirty} onBusyChange={setEditorBusy} onClose={() => void selectMember()} /> : (
          <aside className="user-access-editor user-access-editor-empty"><h4>Selecione uma conta</h4><p>Os dados e vínculos do cliente aparecerão aqui.</p></aside>
        )}
        </div>
      </div>
      <details className="user-invitation-section">
        <summary>Convidar por e-mail</summary>
        <form className="user-invitation-form" onSubmit={(event) => { event.preventDefault(); onCreateInvitation(); }}>
          <label className="auth-field"><span>E-mail do cliente</span><input type="email" required value={inviteForm.email} onChange={(event) => onInviteEmailChange(event.target.value)} placeholder="nome@empresa.com" disabled={inviteBusy} /></label>
          <RestaurantNavigatorPanel eyebrow="" title="Restaurantes do convite" selectionLabel="Restaurantes do convite" memberships={availableRestaurants} multiple selectedRestaurantIds={inviteForm.restaurantIds} onActivateRestaurant={onInviteRestaurantToggle} disabled={inviteBusy} />
          <button type="submit" className="primary-button" disabled={inviteBusy || inviteForm.restaurantIds.length === 0}>{inviteBusy ? copy.processing : copy.ownerInviteAction}</button>
        </form>
      </details>
      {inviteError ? <p className="message error" role="alert">{inviteError}</p> : null}
      {inviteMessage ? <p className="message success" role="status">{inviteMessage}</p> : null}
      <details className="user-invitation-section">
        <summary>Convites pendentes <span>{invitations.length}</span></summary>
        <p className="user-access-note">Convites de acesso ainda não aceitos. Esta lista é diferente das contas que aguardam confirmação de e-mail.</p>
        {invitationsLoading ? <p role="status">{copy.processing}</p> : invitations.length === 0 ? <p>{copy.ownerInviteEmpty}</p> : (
          <ul className="user-invitations-list">
            {invitations.map((invitation) => <li key={invitation.invitationId}>
              <div><strong>{invitation.email}</strong><span>{invitation.restaurants.map((restaurant) => restaurant.restaurantName).join(", ")}</span></div>
              <button type="button" className="ghost-button danger-button" onClick={() => onRevokeInvitation(invitation.invitationId)} disabled={inviteBusy}>{copy.ownerInviteRevoke}</button>
            </li>)}
          </ul>
        )}
      </details>
    </section>
  );
}

export function RestaurantManagementPanel({
  session,
  restaurantForm,
  newRestaurantName,
  busy,
  message,
  error,
  onRestaurantNameChange,
  onRestaurantPhotoSelect,
  onCreateRestaurantNameChange,
  onSaveRestaurant,
  onCreateRestaurant,
  onDeleteRestaurant,
  onActivateRestaurant,
  copy
}: RestaurantManagementPanelProps) {
  return (
    <section className="card account-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{copy.manageRestaurants}</span>
          <h3>{copy.manageRestaurants}</h3>
          <p>{copy.manageRestaurantsText}</p>
        </div>
      </div>

      <div className="account-panel-grid">
        <section className="account-form-card">
          <div className="account-avatar-panel">
            <ProfileAvatar
              session={{
                ...session,
                restaurantName: restaurantForm.restaurantName,
                profilePhotoUrl: restaurantForm.profilePhotoUrl
              }}
              size="lg"
            />
            <div>
              <strong>{copy.restaurantProfile}</strong>
              <p>{copy.restaurantProfileText}</p>
            </div>
          </div>

          <label className="upload-box compact-upload">
            <div className="upload-box-top">
              <span className="upload-order">{copy.profilePhoto}</span>
              <span className="upload-status ready">{busy ? copy.processing : copy.uploadPhoto}</span>
            </div>
            <strong className="upload-title">{restaurantForm.profilePhotoUrl ? restaurantForm.restaurantName : copy.uploadPhoto}</strong>
            <small>{copy.restaurantProfileText}</small>
            <div className="upload-box-footer">
              <span className="upload-action">{copy.uploadPhoto}</span>
              <span className="upload-meta">.png .jpg .jpeg</span>
            </div>
            <input
              className="upload-input-hidden"
              type="file"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              onChange={(event) => onRestaurantPhotoSelect(event.target.files?.[0] ?? null)}
            />
          </label>

          <label className="auth-field">
            <span>{copy.restaurantName}</span>
            <input value={restaurantForm.restaurantName} onChange={(event) => onRestaurantNameChange(event.target.value)} />
          </label>

          {message ? <p className="message success">{message}</p> : null}
          {error ? <p className="message error">{error}</p> : null}

          <div className="panel-actions">
            <button type="button" className="primary-button" onClick={onSaveRestaurant} disabled={busy}>
              {copy.saveProfile}
            </button>
          </div>
        </section>

        <section className="account-form-card restaurant-management-card">
          <div className="restaurant-member-list">
            {(session.memberships ?? []).map((membership) => {
              const isActive = membership.restaurantId === session.activeRestaurantId;
              const canDeleteThisRestaurant = membership.role === "owner" && (session.memberships?.length ?? 0) > 1;

              return (
                <article
                  key={membership.membershipId}
                  className={`restaurant-member-card ${isActive ? "active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onActivateRestaurant(membership.restaurantId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onActivateRestaurant(membership.restaurantId);
                    }
                  }}
                >
                  <div>
                    <strong>{membership.restaurantName}</strong>
                    <p>{membership.role === "owner" ? copy.roleOwner : copy.roleViewer}</p>
                  </div>
                  <div className="restaurant-member-actions">
                    <span className={`status ${isActive ? "ok" : ""}`}>
                      {isActive ? copy.active : copy.activate}
                    </span>
                    {canDeleteThisRestaurant ? (
                      <button
                        type="button"
                        className="ghost-button danger-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteRestaurant(membership.restaurantId);
                        }}
                        disabled={busy}
                      >
                        {copy.deleteRestaurant}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="restaurant-create-box">
            <div>
              <strong>{copy.createRestaurant}</strong>
              <p>{copy.createRestaurantText}</p>
            </div>
            <label className="auth-field">
              <span>{copy.restaurantName}</span>
              <input value={newRestaurantName} onChange={(event) => onCreateRestaurantNameChange(event.target.value)} />
            </label>
            <div className="panel-actions">
              <button type="button" className="primary-button" onClick={onCreateRestaurant} disabled={busy}>
                {copy.createRestaurantAction}
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
