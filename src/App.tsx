import { useEffect, useState } from "react";
import { AppAccessGate } from "./components/appAccessGate";
import { DashboardShell } from "./components/dashboardShell";
import { LocaleContext, type Locale, translations, withLocaleFallback } from "./i18n";
import { useAccountManagement } from "./hooks/useAccountManagement";
import { useAppPresentation } from "./hooks/useAppPresentation";
import { useOwnerInvitations } from "./hooks/useOwnerInvitations";
import { useOperationalData } from "./hooks/useOperationalData";
import { type AppSection as InternalSection, useSessionWorkspace } from "./hooks/useSessionWorkspace";
import { useThemePreference } from "./hooks/useThemePreference";

const TOTAL_VIEW = "__TOTAL__";

export default function App() {
  const [locale, setLocale] = useState<Locale>("pt");
  const { theme, setTheme } = useThemePreference();
  const [currentSection, setCurrentSection] = useState<InternalSection>("dashboard");
  const t = <K extends keyof typeof translations.pt>(key: K) => withLocaleFallback<typeof translations.pt>(locale, key);

  const {
    setSalesFiles,
    setRecipeFile,
    state,
    setState,
    uploadFeedback,
    setUploadFeedback,
    drePeriods,
    setDrePeriods,
    selectedDrePeriod,
    setSelectedDrePeriod,
    dreError,
    dreProcessing,
    selectedPeriod,
    setSelectedPeriod,
    selectedView,
    setSelectedView,
    periodDashboards,
    dashboard,
    dreData,
    goodsEntryData,
    goodsEntryError,
    goodsEntryMessage,
    goodsEntryProcessing,
    hasDashboardData,
    handlePairedUpload,
    handleDreImport,
    handleDreInventorySave,
    handleGoodsEntryImport,
    handleClearGoodsEntry,
    handleRemoveGoodsEntryImportedPeriod,
    handleRemovePeriod,
    handleRemoveDrePeriod,
    handleClearAll,
    handleResetFlow
  } = useOperationalData();

  const {
    session,
    setSession,
    effectiveSession,
    authError,
    authLoading,
    authHydrating,
    authSubmitting,
    passwordRecoveryActive,
    workspaceReady,
    login: handleLogin,
    register: handleRegister,
    requestPasswordReset: handlePasswordReset,
    completePasswordReset: handleCompletePasswordReset,
    logout: handleLogout,
    selectRestaurant: handleSelectRestaurant
  } = useSessionWorkspace({
    locale,
    setLocale,
    state,
    setState,
    uploadFeedback,
    setUploadFeedback,
    drePeriods,
    setDrePeriods,
    selectedDrePeriod,
    setSelectedDrePeriod,
    selectedPeriod,
    setSelectedPeriod,
    selectedView,
    setSelectedView,
    currentSection,
    setCurrentSection,
    setSalesFiles,
    setRecipeFile
  });

  const {
    authScreenCopy,
    accountPanelCopy,
    drePanelCopy,
    dashboardHeaderCopy,
    themeLabels,
    navigationItems,
    canManageRestaurants,
    canManageOperationalData,
    canManageUserManagement
  } = useAppPresentation({ currentSection, effectiveSession, t });

  const {
    accountMembers,
    accountMembersLoading,
    accountInvitations,
    accountInvitationsLoading,
    inviteBusy,
    inviteMessage,
    inviteError,
    inviteForm,
    setInviteForm,
    handleInviteRestaurantToggle,
    handleCreateInvitation,
    handleRevokeInvitation,
    handleUpdateMember,
    handleRemoveMember,
    refreshOwnerInvitationData
  } = useOwnerInvitations(effectiveSession, canManageUserManagement);

  const {
    accountBusy,
    accountMessage,
    accountError,
    setAccountError,
    setAccountMessage,
    userProfileForm,
    setUserProfileForm,
    restaurantProfileForm,
    newRestaurantName,
    setNewRestaurantName,
    handleUserPhotoSelect,
    handleRestaurantPhotoSelect,
    handleRestaurantNameChange,
    handleSaveUserAccount,
    handleSaveRestaurantAccount,
    handleCreateRestaurant,
    handleDeleteRestaurant,
    handleDeleteAccount,
    resetAccountPanelState
  } = useAccountManagement({
    effectiveSession,
    session,
    setSession,
    refreshOwnerInvitationData,
    profileUpdatedMessage: String(t("authProfileUpdated")),
    deleteConfirmMessage: String(t("authDeleteConfirm"))
  });

  const activateRestaurant = (restaurantId: string) => {
    handleSelectRestaurant(restaurantId);
    setAccountError(undefined);
    setAccountMessage(undefined);
  };

  useEffect(() => {
    if (currentSection === "restaurants" && !canManageRestaurants) {
      setCurrentSection("dashboard");
    }
    if (currentSection === "user-management" && !canManageUserManagement) {
      setCurrentSection("dashboard");
    }
    if (currentSection === "operational-history" && !canManageRestaurants) {
      setCurrentSection("dashboard");
    }
  }, [canManageRestaurants, canManageUserManagement, currentSection]);

  const workspaceLoading = Boolean(effectiveSession && !workspaceReady);

  if (passwordRecoveryActive || authLoading || authHydrating || workspaceLoading || !effectiveSession) {
    return (
      <LocaleContext.Provider value={locale}>
        <AppAccessGate
          locale={locale}
          theme={theme}
          authLoading={authLoading}
          authHydrating={authHydrating || workspaceLoading}
          authSubmitting={authSubmitting}
          passwordRecoveryActive={passwordRecoveryActive}
          authError={authError}
          authScreenCopy={authScreenCopy}
          onChangeLocale={setLocale}
          onChangeTheme={setTheme}
          onLogin={(email, password) => void handleLogin(email, password)}
          onRegister={(fullName, email, password) => void handleRegister(fullName, email, password)}
          onForgotPassword={(email) => void handlePasswordReset(email)}
          onUpdatePassword={(password) => void handleCompletePasswordReset(password)}
        />
      </LocaleContext.Provider>
    );
  }

  return (
    <LocaleContext.Provider value={locale}>
      <DashboardShell
        locale={locale}
        theme={theme}
        currentSection={currentSection}
        effectiveSession={effectiveSession}
        authError={authError}
        navigationItems={navigationItems}
        dashboardHeaderCopy={dashboardHeaderCopy}
        languageLabel={String(t("language"))}
        themeLabels={themeLabels}
        accountPanelCopy={accountPanelCopy}
        drePanelCopy={drePanelCopy}
        restaurantNavigatorCopy={{
          eyebrow: String(t("authRestaurantNavigator")),
          title: String(t("authRestaurantNavigator")),
          description: String(t("authRestaurantNavigatorText"))
        }}
        dreAnalysisProps={{
          data: dreData,
          periods: drePeriods,
          selectedPeriod: selectedDrePeriod,
          session: effectiveSession,
          error: dreError,
          processing: dreProcessing,
          onImport: (file) => void handleDreImport(file, effectiveSession.email),
          onSaveInventory: canManageOperationalData ? (period, inventory) => handleDreInventorySave(period, inventory, effectiveSession.email) : undefined,
          onSelectPeriod: setSelectedDrePeriod,
          onRemovePeriod: canManageOperationalData ? (period) => handleRemoveDrePeriod(period, effectiveSession.email) : undefined
        }}
        dashboardPanelProps={{
          state,
          dashboard,
          periodDashboards,
          selectedPeriod,
          selectedView,
          totalView: TOTAL_VIEW,
          hasDashboardData,
          canManageOperationalData,
          onUploadPair: (files) => handlePairedUpload({ ...files, actorEmail: effectiveSession.email }),
          onSelectPeriod: setSelectedPeriod,
          onRemovePeriod: canManageOperationalData ? (period) => handleRemovePeriod(period, effectiveSession.email) : undefined,
          onSelectView: setSelectedView
        }}
        goodsEntryPanelProps={{
          data: goodsEntryData,
          error: goodsEntryError,
          message: goodsEntryMessage,
          processing: goodsEntryProcessing,
          onImport: (files) => void handleGoodsEntryImport(files, effectiveSession.email),
          onClear: handleClearGoodsEntry,
          onRemoveImportedPeriod: (period) => handleRemoveGoodsEntryImportedPeriod(period, effectiveSession.email)
        }}
        operationalHistoryEntries={state.auditEntries}
        restaurantManagementProps={{
          restaurantForm: restaurantProfileForm,
          newRestaurantName,
          busy: accountBusy,
          message: accountMessage,
          error: accountError,
          onRestaurantNameChange: handleRestaurantNameChange,
          onRestaurantPhotoSelect: handleRestaurantPhotoSelect,
          onCreateRestaurantNameChange: setNewRestaurantName,
          onSaveRestaurant: handleSaveRestaurantAccount,
          onCreateRestaurant: handleCreateRestaurant,
          onDeleteRestaurant: handleDeleteRestaurant
        }}
        accountSettingsProps={{
          userForm: userProfileForm,
          busy: accountBusy,
          message: accountMessage,
          error: accountError,
          onUserNameChange: (value) => setUserProfileForm((current) => ({ ...current, fullName: value })),
          onUserPhotoSelect: handleUserPhotoSelect,
          onSaveUser: handleSaveUserAccount,
          onDeleteAccount: handleDeleteAccount
        }}
        userManagementProps={{
          members: accountMembers,
          membersLoading: accountMembersLoading,
          inviteForm: {
            email: inviteForm.email,
            restaurantIds: inviteForm.restaurantIds
          },
          inviteBusy,
          inviteMessage,
          inviteError,
          invitations: accountInvitations,
          invitationsLoading: accountInvitationsLoading,
          onInviteEmailChange: (value) => setInviteForm((current) => ({ ...current, email: value })),
          onInviteRestaurantToggle: handleInviteRestaurantToggle,
          onCreateInvitation: () => void handleCreateInvitation(),
          onRevokeInvitation: (invitationId) => void handleRevokeInvitation(invitationId),
          onUpdateMember: (payload) => handleUpdateMember(payload),
          onRemoveMember: (member) => handleRemoveMember(member)
        }}
        canManageRestaurants={canManageRestaurants}
        canManageOperationalData={canManageOperationalData}
        canManageUserManagement={canManageUserManagement}
        onChangeLocale={setLocale}
        onChangeTheme={setTheme}
        onChangeSection={setCurrentSection}
        onLogout={handleLogout}
        onOpenAccount={() => {
          resetAccountPanelState();
          setCurrentSection("account");
        }}
        onCloseAccount={() => {
          resetAccountPanelState();
          setCurrentSection("dashboard");
        }}
        onActivateRestaurant={activateRestaurant}
        logoutLabel={String(t("authLogout"))}
        myAccountLabel={String(t("navMyAccount"))}
        brandTagline={String(t("brandTagline"))}
        processingLabel={String(t("processing"))}
      />
    </LocaleContext.Provider>
  );
}
