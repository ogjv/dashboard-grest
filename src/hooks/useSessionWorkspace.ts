import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeDreInventory } from "../utils/dreInventory";
import type { Dispatch, SetStateAction } from "react";
import type {
  AuthSession,
  DashboardData,
  DreImportData,
  DrePeriodData,
  GoodsEntryImportData,
  PeriodDashboard,
  PersistedWorkspace,
  UploadFeedbackItem
} from "../types";
import { loadRestaurantWorkspace, registerRestaurant, restoreSession, saveRestaurantWorkspace, signIn, signOut } from "../utils/auth";
import { getSupabaseSession, hydrateSupabaseSession, loadCloudWorkspace, registerRestaurantWithSupabase, requestPasswordResetWithSupabase, saveCloudWorkspace, signInWithSupabase, signOutFromSupabase, subscribeToSupabaseAuth, updateSupabasePassword } from "../utils/cloudAuth";
import { isSupabaseConfigured } from "../utils/supabase";
import type { Locale } from "../i18n";

export type UploadState = PersistedWorkspace["state"];
export type AppSection = NonNullable<PersistedWorkspace["currentSection"]>;

const TOTAL_VIEW = "__TOTAL__";
const TOTAL_PERIOD = "__ALL_PERIODS__";
const DEFAULT_DRE_PERIOD = "__LATEST_DRE__";
const ACTIVE_RESTAURANT_STORAGE_PREFIX = "grest.activeRestaurant.";
const AUTH_BOOT_TIMEOUT_MS = 30000;
const AUTH_HYDRATE_TIMEOUT_MS = 15000;
const WORKSPACE_SAVE_ERROR_MESSAGE =
  "Não foi possível salvar as informações deste restaurante. Verifique sua conexão e tente novamente antes de fechar o site.";

const isPasswordRecoveryUrl = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);
  return hashParams.get("type") === "recovery" || searchParams.get("type") === "recovery";
};

const clearAuthUrlFragments = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState({}, document.title, window.location.pathname || "/dashboard");
};

const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });

const getPreferredRestaurant = (userId: string) => {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage.getItem(`${ACTIVE_RESTAURANT_STORAGE_PREFIX}${userId}`) ?? undefined;
};

export const savePreferredRestaurant = (userId: string, restaurantId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${ACTIVE_RESTAURANT_STORAGE_PREFIX}${userId}`, restaurantId);
};

export const applyActiveRestaurant = (session: AuthSession, restaurantId?: string): AuthSession => {
  const memberships = session.memberships ?? [];
  const activeMembership =
    memberships.find((membership) => membership.restaurantId === restaurantId) ??
    memberships.find((membership) => membership.restaurantId === session.activeRestaurantId) ??
    memberships[0];

  if (!activeMembership) {
    return session;
  }

  // Show all memberships for the session user. Previously we filtered memberships
  // by accountId which could hide restaurants when memberships belong to different
  // accounts. Keep all memberships visible so the user can switch between them.
  const scopedMemberships = memberships;

  return {
    ...session,
    memberships: scopedMemberships,
    activeRole: activeMembership.role,
    activeRestaurantId: activeMembership.restaurantId,
    activeRestaurantName: activeMembership.restaurantName,
    activeRestaurantPhotoUrl: activeMembership.photoUrl,
    restaurantId: activeMembership.restaurantId,
    restaurantName: activeMembership.restaurantName,
    profilePhotoUrl: activeMembership.photoUrl
  };
};

const getWorkspaceSessionKey = (session?: AuthSession | null) => {
  if (!session) {
    return undefined;
  }

  const restaurantId = session.activeRestaurantId ?? session.restaurantId;
  if (!restaurantId) {
    return `${session.userId}:${session.authMode}:pending`;
  }

  return `${session.userId}:${session.authMode}:${restaurantId}`;
};

const canPersistWorkspace = (session?: AuthSession | null) =>
  Boolean(
    session &&
      (
        session.authMode !== "supabase" ||
        session.globalRole === "owner" ||
        session.activeAccountRole === "owner" ||
        session.activeRole === "owner"
      )
  );

const hasPersistedWorkspaceContent = (workspace?: PersistedWorkspace | null) =>
  Boolean(
    workspace &&
      (
        ((workspace.state?.periodDashboards?.length ?? 0) > 0) ||
        ((workspace.state?.recipeBase?.length ?? 0) > 0) ||
        ((workspace.state?.salesFileNames?.length ?? 0) > 0) ||
        ((workspace.state?.goodsEntryData?.entries?.length ?? 0) > 0) ||
        ((workspace.drePeriods?.length ?? 0) > 0) ||
        ((workspace.uploadFeedback?.length ?? 0) > 0) ||
        workspace.state?.processing ||
        workspace.state?.goodsEntryProcessing
      )
  );

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object");

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const normalizeDashboardData = (value: unknown): DashboardData | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    totalRevenue: asNumber(value.totalRevenue),
    totalCost: asNumber(value.totalCost),
    grossProfit: asNumber(value.grossProfit),
    totalQuantity: asNumber(value.totalQuantity),
    averageCMV: asNumber(value.averageCMV),
    coveragePercent: asNumber(value.coveragePercent),
    unmatchedItems: asArray<string>(value.unmatchedItems),
    products: asArray(value.products),
    groups: asArray(value.groups),
    subgroups: asArray(value.subgroups),
    importedSalesTotals: asArray(value.importedSalesTotals),
    promotionalProducts: asArray(value.promotionalProducts),
    reportPeriod: isRecord(value.reportPeriod) ? (value.reportPeriod as DashboardData["reportPeriod"]) : undefined,
    totalComparison: isRecord(value.totalComparison) ? (value.totalComparison as DashboardData["totalComparison"]) : undefined,
    issues: asArray(value.issues),
    productsWithoutGroup: asArray(value.productsWithoutGroup),
    productsWithoutSubgroup: asArray(value.productsWithoutSubgroup),
    duplicateRecipeCodes: asArray<string>(value.duplicateRecipeCodes)
  };
};

const normalizeDreData = (value: unknown): DreImportData | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    sheetName: typeof value.sheetName === "string" ? value.sheetName : "DRE",
    analysisType: typeof value.analysisType === "string" ? value.analysisType : undefined,
    restaurantName: typeof value.restaurantName === "string" ? value.restaurantName : undefined,
    reportTitle: typeof value.reportTitle === "string" ? value.reportTitle : undefined,
    analysisTitle: typeof value.analysisTitle === "string" ? value.analysisTitle : undefined,
    period: isRecord(value.period) ? (value.period as DreImportData["period"]) : undefined,
    sections: asArray(value.sections),
    summary: asArray(value.summary)
  };
};

const normalizeUploadState = (value: unknown): UploadState => {
  if (!isRecord(value)) {
    return {};
  }

  const data = normalizeDashboardData(value.data);
  const periodDashboards = asArray<Record<string, unknown>>(value.periodDashboards).reduce<PeriodDashboard[]>((items, period) => {
    const periodData = normalizeDashboardData(period.data);
    if (!periodData || typeof period.key !== "string") {
      return items;
    }

    items.push({
      key: period.key,
      label: typeof period.label === "string" ? period.label : periodData.reportPeriod?.periodLabel ?? period.key,
      salesFileName: typeof period.salesFileName === "string" ? period.salesFileName : undefined,
      recipeFileName: typeof period.recipeFileName === "string" ? period.recipeFileName : undefined,
      data: periodData
    });

    return items;
  }, []);

  const goodsEntryData: GoodsEntryImportData | undefined = isRecord(value.goodsEntryData)
    ? {
        sheetName: typeof value.goodsEntryData.sheetName === "string" ? value.goodsEntryData.sheetName : "Entrada de mercadorias",
        ...value.goodsEntryData,
        importedPeriods: asArray(value.goodsEntryData.importedPeriods),
        entries: asArray(value.goodsEntryData.entries)
      }
    : undefined;

  return {
    salesFileNames: asArray<string>(value.salesFileNames),
    recipeFileName: typeof value.recipeFileName === "string" ? value.recipeFileName : undefined,
    data,
    periodDashboards,
    validations: asArray(value.validations),
    recipeBase: asArray(value.recipeBase),
    duplicateRecipeCodes: asArray<string>(value.duplicateRecipeCodes),
    error: typeof value.error === "string" ? value.error : undefined,
    processing: false,
    goodsEntryData,
    goodsEntryFileName: typeof value.goodsEntryFileName === "string" ? value.goodsEntryFileName : undefined,
    goodsEntryError: typeof value.goodsEntryError === "string" ? value.goodsEntryError : undefined,
    goodsEntryMessage: typeof value.goodsEntryMessage === "string" ? value.goodsEntryMessage : undefined,
    goodsEntryProcessing: false,
    auditEntries: asArray(value.auditEntries)
  };
};

const normalizeDrePeriods = (value: unknown): DrePeriodData[] =>
  asArray<Record<string, unknown>>(value).reduce<DrePeriodData[]>((items, period) => {
    const data = normalizeDreData(period.data);
    if (!data || typeof period.key !== "string") {
      return items;
    }

    items.push({
      key: period.key,
      label: typeof period.label === "string" ? period.label : period.key,
      fileName: typeof period.fileName === "string" ? period.fileName : undefined,
      inventory: normalizeDreInventory(period.inventory),
      data
    });

    return items;
  }, []);

type UseSessionWorkspaceOptions = {
  locale: Locale;
  setLocale: Dispatch<SetStateAction<Locale>>;
  state: UploadState;
  setState: Dispatch<SetStateAction<UploadState>>;
  uploadFeedback: UploadFeedbackItem[];
  setUploadFeedback: Dispatch<SetStateAction<UploadFeedbackItem[]>>;
  drePeriods: DrePeriodData[];
  setDrePeriods: Dispatch<SetStateAction<DrePeriodData[]>>;
  selectedDrePeriod: string;
  setSelectedDrePeriod: Dispatch<SetStateAction<string>>;
  selectedPeriod: string;
  setSelectedPeriod: Dispatch<SetStateAction<string>>;
  selectedView: string;
  setSelectedView: Dispatch<SetStateAction<string>>;
  currentSection: AppSection;
  setCurrentSection: Dispatch<SetStateAction<AppSection>>;
  setSalesFiles: Dispatch<SetStateAction<File[]>>;
  setRecipeFile: Dispatch<SetStateAction<File | null>>;
};

export function useSessionWorkspace({
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
}: UseSessionWorkspaceOptions) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authError, setAuthError] = useState<string>();
  const [authLoading, setAuthLoading] = useState(true);
  const [authHydrating, setAuthHydrating] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(() => isPasswordRecoveryUrl());
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceRestaurantId, setWorkspaceRestaurantId] = useState<string>();

  const latestWorkspaceRestaurantIdRef = useRef<string>();
  const latestStateRef = useRef<UploadState>({});
  const latestUploadFeedbackRef = useRef<UploadFeedbackItem[]>([]);
  const latestDrePeriodsRef = useRef<DrePeriodData[]>([]);
  const saveInFlightRef = useRef(false);
  const pendingCloudWorkspaceRef = useRef<{
    restaurantId: string;
    workspace: PersistedWorkspace;
  } | null>(null);
  const latestWorkspaceMetaRef = useRef({
    locale: "pt" as Locale,
    selectedPeriod: TOTAL_PERIOD,
    selectedView: TOTAL_VIEW,
    selectedDrePeriod: DEFAULT_DRE_PERIOD,
    currentSection: "dashboard" as AppSection
  });

  const processPendingCloudWorkspaceSave = useCallback(() => {
    if (saveInFlightRef.current || !pendingCloudWorkspaceRef.current) {
      return;
    }

    const pending = pendingCloudWorkspaceRef.current;
    pendingCloudWorkspaceRef.current = null;
    saveInFlightRef.current = true;

    void saveCloudWorkspace(pending.restaurantId, pending.workspace)
      .then(() => {
        setAuthError((current) => (current === WORKSPACE_SAVE_ERROR_MESSAGE ? undefined : current));
      })
      .catch(() => {
        setAuthError(WORKSPACE_SAVE_ERROR_MESSAGE);
      })
      .finally(() => {
        saveInFlightRef.current = false;
        if (pendingCloudWorkspaceRef.current) {
          processPendingCloudWorkspaceSave();
        }
      });
  }, []);

  const queueCloudWorkspaceSave = useCallback(
    (restaurantId: string, workspace: PersistedWorkspace) => {
      pendingCloudWorkspaceRef.current = { restaurantId, workspace };
      processPendingCloudWorkspaceSave();
    },
    [processPendingCloudWorkspaceSave]
  );

  const effectiveSession = useMemo(
    () => (session ? applyActiveRestaurant(session, getPreferredRestaurant(session.userId)) : null),
    [session]
  );

  const effectiveRestaurantId = effectiveSession?.activeRestaurantId ?? effectiveSession?.restaurantId ?? "";

  const activeWorkspaceSession = useMemo(
    () =>
      effectiveSession
        ? {
            authMode: effectiveSession.authMode,
            restaurantId: effectiveRestaurantId
          }
        : null,
    [effectiveSession?.authMode, effectiveRestaurantId]
  );

  const activeWorkspaceKey = getWorkspaceSessionKey(effectiveSession);
  const sharedWorkspaceContentKey = useMemo(
    () =>
      JSON.stringify({
        state,
        uploadFeedback,
        drePeriods
      }),
    [drePeriods, state, uploadFeedback]
  );

  useEffect(() => {
    latestWorkspaceRestaurantIdRef.current = workspaceRestaurantId;
    latestStateRef.current = state;
    latestUploadFeedbackRef.current = uploadFeedback;
    latestDrePeriodsRef.current = drePeriods;
    latestWorkspaceMetaRef.current = {
      locale,
      selectedPeriod,
      selectedView,
      selectedDrePeriod,
      currentSection
    };
  }, [currentSection, drePeriods, locale, selectedDrePeriod, selectedPeriod, selectedView, state, uploadFeedback, workspaceRestaurantId]);

  useEffect(() => {
    const hasPendingSave = () => Boolean(pendingCloudWorkspaceRef.current) || saveInFlightRef.current;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingSave()) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        processPendingCloudWorkspaceSave();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", processPendingCloudWorkspaceSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", processPendingCloudWorkspaceSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [processPendingCloudWorkspaceSave]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const restored = restoreSession();
      if (restored) {
        const preferred = getPreferredRestaurant(restored.userId);
        setSession(preferred ? applyActiveRestaurant(restored, preferred) : restored);
      } else {
        setSession(null);
      }
      setAuthLoading(false);
      return;
    }

    let mounted = true;
    void withTimeout(getSupabaseSession(), AUTH_BOOT_TIMEOUT_MS, "A autenticação demorou mais que o esperado. Tente atualizar a página.")
      .then((nextSession) => {
        if (mounted) {
          setSession(nextSession);
        }
      })
      .catch((error) => {
        if (mounted) {
          setSession(null);
          setAuthError(error instanceof Error ? error.message : "Não foi possível iniciar a autenticação. Tente novamente.");
        }
      })
      .finally(() => {
        if (mounted) {
          setAuthLoading(false);
        }
      });

    const unsubscribe = subscribeToSupabaseAuth((nextSession, event) => {
      if (!mounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryActive(true);
      }

      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || session.authMode !== "supabase") {
      setAuthHydrating(false);
      return;
    }

    if ((session.memberships?.length ?? 0) > 0 && (session.activeRestaurantId ?? session.restaurantId)) {
      setAuthHydrating(false);
      return;
    }

    let mounted = true;
    setAuthHydrating(true);
    const preferredRestaurantId = getPreferredRestaurant(session.userId);

    void withTimeout(
      hydrateSupabaseSession(session, undefined, preferredRestaurantId),
      AUTH_HYDRATE_TIMEOUT_MS,
        "O carregamento dos restaurantes demorou mais que o esperado. Tente atualizar a página."
    )
      .then((nextSession) => {
        if (!mounted || !nextSession) {
          return;
        }

        if (!(nextSession.activeRestaurantId ?? nextSession.restaurantId)) {
          throw new Error("Login efetuado, mas nenhum restaurante ativo foi encontrado para esta conta.");
        }

        setSession((current) => {
          if (!current || current.userId !== nextSession.userId) {
            return current;
          }

          const preferredRestaurantId = getPreferredRestaurant(nextSession.userId);
          return applyActiveRestaurant(nextSession, preferredRestaurantId);
        });
        setAuthError(undefined);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }

        setAuthError(error instanceof Error ? error.message : "Não foi possível carregar os restaurantes vinculados à sua conta.");
        setSession((current) =>
          current && !(current.activeRestaurantId ?? current.restaurantId) ? null : current
        );
      })
      .finally(() => {
        if (mounted) {
          setAuthHydrating(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session || session.authMode !== "supabase") {
      return;
    }

    const refreshSessionAccess = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const preferredRestaurantId = getPreferredRestaurant(session.userId);

      void withTimeout(
        hydrateSupabaseSession(session, undefined, preferredRestaurantId),
        AUTH_HYDRATE_TIMEOUT_MS,
        "A atualização de permissões demorou mais que o esperado. Tente novamente."
      )
        .then((nextSession) => {
          if (!nextSession) {
            return;
          }

          setSession((current) => {
            if (!current || current.userId !== nextSession.userId) {
              return current;
            }

            const preferredRestaurantId = getPreferredRestaurant(nextSession.userId);
            return applyActiveRestaurant(nextSession, preferredRestaurantId);
          });
        })
        .catch(() => undefined);
    };

    window.addEventListener("focus", refreshSessionAccess);
    document.addEventListener("visibilitychange", refreshSessionAccess);

    return () => {
      window.removeEventListener("focus", refreshSessionAccess);
      document.removeEventListener("visibilitychange", refreshSessionAccess);
    };
  }, [session]);

  useEffect(() => {
    if (!activeWorkspaceSession) {
      setWorkspaceReady(false);
      setWorkspaceRestaurantId(undefined);
      setSalesFiles([]);
      setRecipeFile(null);
      setState({});
      setUploadFeedback([]);
      setDrePeriods([]);
      setSelectedDrePeriod(DEFAULT_DRE_PERIOD);
      setSelectedPeriod(TOTAL_PERIOD);
      setSelectedView(TOTAL_VIEW);
      setCurrentSection("dashboard");
      setAuthLoading(false);
      return;
    }

    if (activeWorkspaceSession.authMode === "supabase" && !activeWorkspaceSession.restaurantId) {
      setWorkspaceReady(false);
      setWorkspaceRestaurantId(undefined);
      return;
    }

    let mounted = true;
    const targetRestaurantId = activeWorkspaceSession.restaurantId;
    const isCloudWorkspace = activeWorkspaceSession.authMode === "supabase";
    const localWorkspace = isCloudWorkspace ? null : loadRestaurantWorkspace<PersistedWorkspace>(targetRestaurantId);

    if (workspaceReady && workspaceRestaurantId === targetRestaurantId) {
      return;
    }

    setWorkspaceReady(false);
    setWorkspaceRestaurantId(undefined);

    if (localWorkspace) {
      setLocale(localWorkspace.locale ?? "pt");
      setState(normalizeUploadState(localWorkspace.state));
      setUploadFeedback(localWorkspace.uploadFeedback ?? []);
      setDrePeriods(normalizeDrePeriods(localWorkspace.drePeriods));
      setSelectedDrePeriod(
        localWorkspace.selectedDrePeriod ??
          localWorkspace.drePeriods?.[localWorkspace.drePeriods.length - 1]?.key ??
          DEFAULT_DRE_PERIOD
      );
      setSelectedPeriod(localWorkspace.selectedPeriod ?? TOTAL_PERIOD);
      setSelectedView(localWorkspace.selectedView ?? TOTAL_VIEW);
      setWorkspaceRestaurantId(targetRestaurantId);
      setWorkspaceReady(true);
    }

    const loadWorkspace = async () => {
      try {
        const cloudWorkspace =
          activeWorkspaceSession.authMode === "supabase"
            ? await loadCloudWorkspace(targetRestaurantId)
            : localWorkspace;
        const workspace = cloudWorkspace ?? localWorkspace;

        if (!mounted) {
          return;
        }

        const currentWorkspaceHasContent =
          !isCloudWorkspace &&
          latestWorkspaceRestaurantIdRef.current === targetRestaurantId &&
          hasPersistedWorkspaceContent({
            locale: latestWorkspaceMetaRef.current.locale,
            state: latestStateRef.current,
            uploadFeedback: latestUploadFeedbackRef.current,
            drePeriods: latestDrePeriodsRef.current,
            selectedPeriod: latestWorkspaceMetaRef.current.selectedPeriod,
            selectedView: latestWorkspaceMetaRef.current.selectedView,
            selectedDrePeriod: latestWorkspaceMetaRef.current.selectedDrePeriod,
            currentSection: latestWorkspaceMetaRef.current.currentSection
          });

        if (currentWorkspaceHasContent) {
          setWorkspaceRestaurantId(targetRestaurantId);
          setWorkspaceReady(true);
          return;
        }

        setSalesFiles([]);
        setRecipeFile(null);
        setAuthError(undefined);
        setLocale(workspace?.locale ?? "pt");
        setState(normalizeUploadState(workspace?.state));
        setUploadFeedback(workspace?.uploadFeedback ?? []);
        setDrePeriods(normalizeDrePeriods(workspace?.drePeriods));
        setSelectedDrePeriod(
          workspace?.selectedDrePeriod ??
            workspace?.drePeriods?.[(workspace.drePeriods?.length ?? 0) - 1]?.key ??
            DEFAULT_DRE_PERIOD
        );
        setSelectedPeriod(workspace?.selectedPeriod ?? TOTAL_PERIOD);
        setSelectedView(workspace?.selectedView ?? TOTAL_VIEW);
        setWorkspaceRestaurantId(targetRestaurantId);
        setWorkspaceReady(true);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setAuthError(error instanceof Error ? error.message : "Não foi possível carregar os dados deste restaurante.");
        setWorkspaceRestaurantId(targetRestaurantId);
        setWorkspaceReady(true);
      }
    };

    void loadWorkspace();

    return () => {
      mounted = false;
    };
  }, [activeWorkspaceKey, activeWorkspaceSession, setCurrentSection, setDrePeriods, setLocale, setRecipeFile, setSalesFiles, setSelectedDrePeriod, setSelectedPeriod, setSelectedView, setState, setUploadFeedback]);

  useEffect(() => {
    if (!effectiveSession || !workspaceReady) {
      return;
    }

    if (!canPersistWorkspace(effectiveSession)) {
      pendingCloudWorkspaceRef.current = null;
      setAuthError((current) => (current === WORKSPACE_SAVE_ERROR_MESSAGE ? undefined : current));
      return;
    }

    if (state.processing || state.goodsEntryProcessing) {
      return;
    }

    const restaurantId = effectiveSession.activeRestaurantId ?? effectiveSession.restaurantId;
    if (!restaurantId || workspaceRestaurantId !== restaurantId) {
      return;
    }

    const workspace: PersistedWorkspace = {
      locale,
      state: {
        ...state,
        processing: false,
        goodsEntryProcessing: false
      },
      uploadFeedback,
      selectedPeriod,
      selectedView,
      drePeriods,
      selectedDrePeriod,
      currentSection
    };

    if (effectiveSession.authMode === "supabase") {
      queueCloudWorkspaceSave(restaurantId, workspace);
    } else {
      saveRestaurantWorkspace<PersistedWorkspace>(restaurantId, workspace);
    }
  }, [effectiveSession, locale, queueCloudWorkspaceSave, sharedWorkspaceContentKey, workspaceReady, workspaceRestaurantId]);

  const login = async (email: string, password: string) => {
    try {
      setAuthSubmitting(true);
      setAuthError(undefined);
      const nextSession = isSupabaseConfigured
        ? await signInWithSupabase(email, password)
        : signIn(email, password);
      if (!isSupabaseConfigured && !(nextSession.activeRestaurantId ?? nextSession.restaurantId)) {
        throw new Error("Login efetuado, mas nenhum restaurante ativo foi encontrado para esta conta.");
      }
      setSession(nextSession);
      setAuthError(undefined);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Não foi possível entrar. Verifique os dados e tente novamente.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const register = async (fullName: string, email: string, password: string) => {
    try {
      setAuthSubmitting(true);
      setAuthError(undefined);
      const nextSession = isSupabaseConfigured
        ? await registerRestaurantWithSupabase({ fullName, email, password })
        : registerRestaurant({ fullName, email, password });
      setSession(nextSession);
      setAuthError(undefined);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Não foi possível criar sua conta. Revise os dados e tente novamente.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const requestPasswordReset = async (email: string) => {
    try {
      setAuthSubmitting(true);
      setAuthError(undefined);
      if (!isSupabaseConfigured) {
        throw new Error("A recuperação de senha está disponível apenas no modo online.");
      }
      await requestPasswordResetWithSupabase(email);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Não foi possível enviar o e-mail de recuperação. Tente novamente.");
      throw error;
    } finally {
      setAuthSubmitting(false);
    }
  };

  const completePasswordReset = async (password: string) => {
    try {
      setAuthSubmitting(true);
      setAuthError(undefined);
      if (!isSupabaseConfigured) {
        throw new Error("A recuperação de senha está disponível apenas no modo online.");
      }

      await updateSupabasePassword(password);
      setPasswordRecoveryActive(false);
      clearAuthUrlFragments();

      const nextSession = await getSupabaseSession();
      if (nextSession) {
        setSession(nextSession);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Não foi possível atualizar a senha. Tente novamente.");
      throw error;
    } finally {
      setAuthSubmitting(false);
    }
  };

  const logout = async () => {
    try {
      if (session?.authMode === "supabase") {
        await signOutFromSupabase();
      } else {
        signOut();
      }
    } finally {
      setSession(null);
    }
  };

  const selectRestaurant = (restaurantId: string) => {
    if (!session) {
      return;
    }

    savePreferredRestaurant(session.userId, restaurantId);
    setWorkspaceReady(false);
    setWorkspaceRestaurantId(undefined);
    setSalesFiles([]);
    setRecipeFile(null);
    setState({});
    setUploadFeedback([]);
    setSelectedPeriod(TOTAL_PERIOD);
    setSelectedView(TOTAL_VIEW);
    setSession((current) => (current ? applyActiveRestaurant(current, restaurantId) : current));
  };

  return {
    session,
    setSession,
    effectiveSession,
    authError,
    setAuthError,
    authLoading,
    authHydrating,
    authSubmitting,
    passwordRecoveryActive,
    workspaceReady,
    workspaceRestaurantId,
    login,
    register,
    requestPasswordReset,
    completePasswordReset,
    logout,
    selectRestaurant
  };
}
