import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardShell } from "./dashboardShell";
import { translations } from "../i18n";
import { useAppPresentation } from "../hooks/useAppPresentation";
import type { AppPresentationModel } from "../presentation/contracts";
import type { AppSection } from "../hooks/useSessionWorkspace";
import type { AuthSession } from "../types";

const t = (key: keyof typeof translations.pt) => translations.pt[key];

const session: AuthSession = {
  userId: "owner-1",
  email: "owner@grest.com",
  authMode: "supabase",
  userFullName: "Marcos",
  globalRole: "owner",
  activeAccountRole: "owner",
  activeRole: "owner",
  activeRestaurantId: "r-1",
  activeRestaurantName: "Vista Mar",
  memberships: [
    {
      membershipId: "m-1",
      accountId: "a-1",
      restaurantId: "r-1",
      restaurantName: "Vista Mar",
      role: "owner"
    },
    {
      membershipId: "m-2",
      accountId: "a-1",
      restaurantId: "r-2",
      restaurantName: "Bistrô Centro",
      role: "owner"
    }
  ]
};

function getPresentationModel(): AppPresentationModel {
  let model: AppPresentationModel | undefined;

  function PresentationHarness() {
    model = useAppPresentation({
      currentSection: "dre",
      effectiveSession: session,
      t
    });
    return null;
  }

  renderToStaticMarkup(<PresentationHarness />);

  if (!model) {
    throw new Error("Presentation model was not created.");
  }

  return model;
}

const containers: HTMLDivElement[] = [];

afterEach(() => {
  while (containers.length > 0) {
    const container = containers.pop();
    if (container) {
      document.body.removeChild(container);
    }
  }
});

type DashboardShellCallbacks = {
  onChangeSection?: (section: AppSection) => void;
  onLogout?: () => void;
  onOpenAccount?: () => void;
  onCloseAccount?: () => void;
  onActivateRestaurant?: (restaurantId: string) => void;
};

function renderShell(callbacks?: DashboardShellCallbacks) {
  const onChangeSection =
    callbacks?.onChangeSection ??
    vi.fn<() => void>();
  const onLogout = callbacks?.onLogout ?? vi.fn<() => void>();
  const onOpenAccount = callbacks?.onOpenAccount ?? vi.fn<() => void>();
  const onCloseAccount = callbacks?.onCloseAccount ?? vi.fn<() => void>();
  const onActivateRestaurant = callbacks?.onActivateRestaurant ?? vi.fn<(restaurantId: string) => void>();
  const presentation = getPresentationModel();

  const container = document.createElement("div");
  containers.push(container);
  document.body.appendChild(container);

  act(() => {
    createRoot(container).render(
      <DashboardShell
        locale="pt"
        theme="light"
        currentSection="dre"
        effectiveSession={session}
        navigationItems={presentation.navigationItems}
        dashboardHeaderCopy={presentation.dashboardHeaderCopy}
        languageLabel={translations.pt.language}
        themeLabels={presentation.themeLabels}
        accountPanelCopy={presentation.accountPanelCopy}
        drePanelCopy={presentation.drePanelCopy}
        restaurantNavigatorCopy={{
          eyebrow: translations.pt.authRestaurantNavigator,
          title: translations.pt.authRestaurantNavigator,
          description: translations.pt.authRestaurantNavigatorText
        }}
        dreAnalysisProps={{
          periods: [],
          selectedPeriod: "__LATEST_DRE__",
          session,
          onImport: () => undefined,
          onSelectPeriod: () => undefined
        }}
        dashboardPanelProps={{
          state: {},
          periodDashboards: [],
          selectedPeriod: "__ALL_PERIODS__",
          selectedView: "__TOTAL__",
          totalView: "__TOTAL__",
          hasDashboardData: false,
          canManageOperationalData: true,
          onUploadPair: () => undefined,
          onSelectPeriod: () => undefined,
          onSelectView: () => undefined
        }}
        goodsEntryPanelProps={{
          onImport: () => undefined,
          onClear: () => undefined,
          onRemoveImportedPeriod: () => undefined
        }}
        restaurantManagementProps={{
          restaurantForm: { restaurantName: "Vista Mar" },
          newRestaurantName: "",
          busy: false,
          onRestaurantNameChange: () => undefined,
          onRestaurantPhotoSelect: () => undefined,
          onCreateRestaurantNameChange: () => undefined,
          onSaveRestaurant: () => undefined,
          onCreateRestaurant: () => undefined,
          onDeleteRestaurant: () => undefined
        }}
        accountSettingsProps={{
          userForm: { fullName: "Marcos" },
          busy: false,
          onUserNameChange: () => undefined,
          onUserPhotoSelect: () => undefined,
          onSaveUser: () => undefined,
          onDeleteAccount: () => undefined
        }}
        userManagementProps={{
          members: [],
          membersLoading: false,
          inviteForm: { email: "", restaurantIds: [] },
          inviteBusy: false,
          invitations: [],
          invitationsLoading: false,
          onInviteEmailChange: () => undefined,
          onInviteRestaurantToggle: () => undefined,
          onCreateInvitation: () => undefined,
          onRevokeInvitation: () => undefined,
          onUpdateMember: async () => undefined,
          onRemoveMember: async () => undefined
        }}
        canManageRestaurants={presentation.canManageRestaurants}
        canManageOperationalData={presentation.canManageOperationalData}
        canManageUserManagement={presentation.canManageUserManagement}
        onChangeLocale={() => undefined}
        onChangeTheme={() => undefined}
        onChangeSection={onChangeSection}
        onLogout={onLogout}
        onOpenAccount={onOpenAccount}
        onCloseAccount={onCloseAccount}
        onActivateRestaurant={onActivateRestaurant}
        logoutLabel={translations.pt.authLogout}
        myAccountLabel={translations.pt.navMyAccount}
        brandTagline={translations.pt.brandTagline}
        processingLabel={translations.pt.processing}
      />
    );
  });

  return { container, onChangeSection, onLogout, onOpenAccount, onActivateRestaurant };
}

describe("DashboardShell", () => {
  it("triggers navigation and topbar actions", () => {
    const { container, onChangeSection, onLogout, onOpenAccount } = renderShell();

    const dreButton = container.querySelector('button[aria-label="Dashboard"]') as HTMLButtonElement;
    const logoutButton = container.querySelector(`button[aria-label="${translations.pt.authLogout}"]`) as HTMLButtonElement;
    const accountButton = container.querySelector('.workspace-context-user') as HTMLButtonElement;
    expect(container.querySelectorAll('.sidebar-account-menu button')).toHaveLength(2);
    expect(container.querySelector('.sidebar-account-menu .profile-avatar')).toBeNull();

    act(() => {
      dreButton.click();
      logoutButton.click();
      accountButton.click();
    });

    expect(onChangeSection).toHaveBeenCalledWith("dashboard");
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onOpenAccount).toHaveBeenCalledTimes(1);
  });

  it("lets the user switch the active restaurant from the shell", () => {
    const { container, onActivateRestaurant } = renderShell();

    const restaurantButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Bistrô Centro")
    ) as HTMLButtonElement;

    act(() => {
      restaurantButton.click();
    });

    expect(onActivateRestaurant).toHaveBeenCalledWith("r-2");
  });
});
