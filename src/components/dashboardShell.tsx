import { Suspense, lazy } from "react";
import { BrandMark, DashboardShellHeader, InternalNavigation, UserAvatar } from "./appChrome";
import { HelpPage } from "./helpPage";
import { RestaurantNavigatorPanel } from "./dashboardPanels";
import type { AppSection } from "../hooks/useSessionWorkspace";
import type { AuthSession } from "../types";
import type { AccountPanelCopy, HeaderCopy, NavigationItem, RestaurantNavigatorCopy, ThemeLabels } from "../presentation/contracts";
import type {
  AccountSettingsPanelProps,
  RestaurantManagementPanelProps,
  UserManagementPanelProps
} from "./accountPanels";
import type { DreAnalysisPanelProps, DrePanelCopy } from "./drePanels";
import type { DashboardPanelsProps } from "./cmvPanels";
import type { GoodsEntryPanelsProps } from "./goodsEntryPanels";
import type { AuditLogEntry } from "../types";

const LazyAccountSettingsPanel = lazy(() =>
  import("./accountPanels").then((module) => ({ default: module.AccountSettingsPanel }))
);
const LazyRestaurantManagementPanel = lazy(() =>
  import("./accountPanels").then((module) => ({ default: module.RestaurantManagementPanel }))
);
const LazyUserManagementPanel = lazy(() =>
  import("./accountPanels").then((module) => ({ default: module.UserManagementPanel }))
);
const LazyDreAnalysisPanel = lazy(() =>
  import("./drePanels").then((module) => ({ default: module.DreAnalysisPanel }))
);
const LazyDashboardPanels = lazy(() =>
  import("./cmvPanels").then((module) => ({ default: module.DashboardPanels }))
);
const LazyGoodsEntryPanels = lazy(() =>
  import("./goodsEntryPanels").then((module) => ({ default: module.GoodsEntryPanels }))
);
const LazyOperationalHistoryPanel = lazy(() =>
  import("./operationalHistoryPanel").then((module) => ({ default: module.OperationalHistoryPanel }))
);

type DashboardShellProps = {
  locale: "pt" | "es" | "en";
  theme: "light" | "dark";
  currentSection: AppSection;
  effectiveSession: AuthSession;
  authError?: string;
  navigationItems: NavigationItem[];
  dashboardHeaderCopy: HeaderCopy;
  languageLabel: string;
  themeLabels: ThemeLabels;
  accountPanelCopy: AccountPanelCopy;
  drePanelCopy: DrePanelCopy;
  restaurantNavigatorCopy: RestaurantNavigatorCopy;
  dreAnalysisProps: Omit<DreAnalysisPanelProps, "canManageData" | "copy">;
  dashboardPanelProps: DashboardPanelsProps;
  goodsEntryPanelProps: Omit<GoodsEntryPanelsProps, "canManageData">;
  operationalHistoryEntries?: AuditLogEntry[];
  restaurantManagementProps: Omit<RestaurantManagementPanelProps, "session" | "copy" | "onActivateRestaurant">;
  accountSettingsProps: Omit<AccountSettingsPanelProps, "session" | "copy" | "onClose">;
  userManagementProps: Omit<UserManagementPanelProps, "session" | "copy">;
  canManageRestaurants: boolean;
  canManageOperationalData: boolean;
  canManageUserManagement: boolean;
  onChangeLocale: (locale: "pt" | "es" | "en") => void;
  onChangeTheme: (theme: "light" | "dark") => void;
  onChangeSection: (section: AppSection) => void;
  onLogout: () => void;
  onOpenAccount: () => void;
  onCloseAccount: () => void;
  onActivateRestaurant: (restaurantId: string) => void;
  logoutLabel: string;
  myAccountLabel: string;
  brandTagline: string;
  processingLabel: string;
};

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true">
      <path d="M9 7H6.8A1.8 1.8 0 0 0 5 8.8v6.4A1.8 1.8 0 0 0 6.8 17H9" />
      <path d="M13 8.5 17 12l-4 3.5" />
      <path d="M17 12H9" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="ui-icon"
      aria-hidden="true"
    >
      <path
        d="M12 18V18.01M8 10C8 7.79086 9.79086 6 12 6C14.2091 6 16 7.79086 16 10C16 11.8675 14.7202 13.4361 12.9899 13.8766C12.4547 14.0128 12 14.4477 12 15M23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12C1 5.92487 5.92487 1 12 1C18.0751 1 23 5.92487 23 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const fallbackCard = (processingLabel: string) => (
  <section className="card skeleton-card" aria-label={processingLabel}>
    <span className="skeleton-line short" />
    <span className="skeleton-line long" />
    <div className="skeleton-grid">
      <span className="skeleton-block" />
      <span className="skeleton-block" />
      <span className="skeleton-block" />
    </div>
    <span className="skeleton-line medium" />
  </section>
);

function ActiveRestaurantBadge({ session }: { session: AuthSession }) {
  const activeRestaurantId = session.activeRestaurantId ?? session.restaurantId;
  const activeMembership = (session.memberships ?? []).find((membership) => membership.restaurantId === activeRestaurantId);
  const restaurantName = session.activeRestaurantName ?? activeMembership?.restaurantName ?? session.restaurantName ?? "Restaurante";
  const photoUrl = session.activeRestaurantPhotoUrl ?? activeMembership?.photoUrl;
  const initials = restaurantName.slice(0, 2).toUpperCase();

  return (
    <div className="active-restaurant-badge" aria-label={`Restaurante ativo: ${restaurantName}`}>
      <span className={`active-restaurant-badge-avatar ${photoUrl ? "has-photo" : ""}`} aria-hidden="true">
        {photoUrl ? <img src={photoUrl} alt="" /> : initials}
      </span>
      <span className="active-restaurant-badge-copy">
        <small>Restaurante ativo</small>
        <strong title={restaurantName}>{restaurantName}</strong>
      </span>
    </div>
  );
}

export function DashboardShell({
  locale,
  theme,
  currentSection,
  effectiveSession,
  authError,
  navigationItems,
  dashboardHeaderCopy,
  languageLabel,
  themeLabels,
  accountPanelCopy,
  drePanelCopy,
  restaurantNavigatorCopy,
  dreAnalysisProps,
  dashboardPanelProps,
  goodsEntryPanelProps,
  operationalHistoryEntries,
  restaurantManagementProps,
  accountSettingsProps,
  userManagementProps,
  canManageRestaurants,
  canManageOperationalData,
  canManageUserManagement,
  onChangeLocale,
  onChangeTheme,
  onChangeSection,
  onLogout,
  onOpenAccount,
  onCloseAccount,
  onActivateRestaurant,
  logoutLabel,
  myAccountLabel,
  brandTagline,
  processingLabel
}: DashboardShellProps) {
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-brand">
          <BrandMark tagline={brandTagline} />
        </div>
        <InternalNavigation section={currentSection} onChange={onChangeSection} items={navigationItems} />
        <div className="dashboard-sidebar-footer">
          <div className="sidebar-account-menu" aria-label="Opções da conta">
            <button
              type="button"
              className="sidebar-account-menu-button"
              onClick={onLogout}
              aria-label={logoutLabel}
              data-ui-tooltip={logoutLabel}
            >
              <IconLogout />
            </button>
            <button
              type="button"
              className={`sidebar-account-menu-button ${currentSection === "help" ? "active" : ""}`}
              onClick={() => onChangeSection("help")}
              aria-label="Ajuda"
              data-ui-tooltip="Ajuda"
            >
              <IconHelp />
            </button>
            <button
              type="button"
              className={`sidebar-account-menu-button sidebar-avatar-button ${currentSection === "account" ? "active" : ""}`}
              onClick={onOpenAccount}
              aria-label={myAccountLabel}
              data-ui-tooltip={myAccountLabel}
            >
              <UserAvatar session={effectiveSession} size="md" />
            </button>
          </div>
        </div>
      </aside>

      <main className="dashboard-main">
        <div className="content dashboard-content">
          <DashboardShellHeader
            session={effectiveSession}
            eyebrow={dashboardHeaderCopy.eyebrow}
            title={dashboardHeaderCopy.title}
            text={dashboardHeaderCopy.text}
            locale={locale}
            onChangeLocale={onChangeLocale}
            theme={theme}
            onChangeTheme={onChangeTheme}
            languageLabel={languageLabel}
            themeLabels={themeLabels}
          />

          {currentSection === "dashboard" || currentSection === "dre" || currentSection === "goods-entry" || currentSection === "operational-history" ? (
            <ActiveRestaurantBadge session={effectiveSession} />
          ) : null}

          {currentSection === "dashboard" || currentSection === "dre" || currentSection === "goods-entry" || currentSection === "operational-history" ? (
            <RestaurantNavigatorPanel
              eyebrow={restaurantNavigatorCopy.eyebrow}
              title={restaurantNavigatorCopy.title}
              description={restaurantNavigatorCopy.description}
              memberships={effectiveSession.memberships ?? []}
              activeRestaurantId={effectiveSession.activeRestaurantId}
              onActivateRestaurant={onActivateRestaurant}
            />
          ) : null}

          {currentSection === "dre" ? (
            <Suspense fallback={fallbackCard(processingLabel)}>
              <LazyDreAnalysisPanel
                data={dreAnalysisProps.data}
                periods={dreAnalysisProps.periods}
                selectedPeriod={dreAnalysisProps.selectedPeriod}
                session={dreAnalysisProps.session}
                error={dreAnalysisProps.error}
                processing={dreAnalysisProps.processing}
                canManageData={canManageOperationalData}
                copy={drePanelCopy}
                onImport={dreAnalysisProps.onImport}
                onSelectPeriod={dreAnalysisProps.onSelectPeriod}
                onRemovePeriod={dreAnalysisProps.onRemovePeriod}
              />
            </Suspense>
          ) : null}

          {currentSection === "goods-entry" ? (
            <Suspense fallback={fallbackCard(processingLabel)}>
              <LazyGoodsEntryPanels canManageData={canManageOperationalData} {...goodsEntryPanelProps} />
            </Suspense>
          ) : null}

          {currentSection === "restaurants" && canManageRestaurants ? (
            <Suspense fallback={fallbackCard(processingLabel)}>
              <LazyRestaurantManagementPanel
                session={effectiveSession}
                copy={accountPanelCopy}
                onActivateRestaurant={onActivateRestaurant}
                {...restaurantManagementProps}
              />
            </Suspense>
          ) : null}

          {currentSection === "operational-history" && canManageRestaurants ? (
            <Suspense fallback={fallbackCard(processingLabel)}>
              <LazyOperationalHistoryPanel entries={operationalHistoryEntries} />
            </Suspense>
          ) : null}

          {currentSection === "account" ? (
            <Suspense fallback={fallbackCard(processingLabel)}>
              <LazyAccountSettingsPanel
                session={effectiveSession}
                copy={accountPanelCopy}
                onClose={onCloseAccount}
                {...accountSettingsProps}
              />
            </Suspense>
          ) : null}

          {currentSection === "help" ? <HelpPage canManageOperationalData={canManageOperationalData} /> : null}

          {currentSection === "user-management" && canManageUserManagement ? (
            <Suspense fallback={fallbackCard(processingLabel)}>
              <LazyUserManagementPanel session={effectiveSession} copy={accountPanelCopy} {...userManagementProps} />
            </Suspense>
          ) : null}

          {authError ? (
            <section className="card">
              <p className="message error">{authError}</p>
            </section>
          ) : null}

          {currentSection === "dashboard" ? (
            <Suspense fallback={fallbackCard(processingLabel)}>
              <LazyDashboardPanels {...dashboardPanelProps} />
            </Suspense>
          ) : null}
        </div>
      </main>
    </div>
  );
}
