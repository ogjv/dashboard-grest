export type RawRow = Record<string, string | number | boolean | null | undefined>;

export type SalesImportRow = {
  codigo: string;
  produto: string;
  qte: number | string;
  total: number | string;
  grupo: string;
  subgrupo: string;
};

export type SalesReportPeriod = {
  rawLabel: string;
  startDate?: string;
  endDate?: string;
  displayLabel: string;
  periodKey: string;
  periodLabel: string;
  month?: number;
  year?: number;
};

export type SalesTotalRow = {
  level: "group" | "subgroup" | "general";
  label: string;
  group: string;
  subgroup: string;
  quantity: number;
  revenue: number;
};

export type SalesImportData = {
  items: SalesImportRow[];
  totals: SalesTotalRow[];
  reportPeriod?: SalesReportPeriod;
  headerValues: string[];
};

export type DreLine = {
  label: string;
  value: number;
  percent?: number;
  rowNumber: number;
};

export type DreGroup = {
  label: string;
  lines: DreLine[];
  total?: DreLine;
};

export type DreSection = {
  label: string;
  groups: DreGroup[];
  total?: DreLine;
};

export type DreSummaryLine = {
  label: string;
  value: number;
  percent?: number;
  rowNumber: number;
};

export type DreImportData = {
  sheetName: string;
  analysisType?: string;
  restaurantName?: string;
  reportTitle?: string;
  analysisTitle?: string;
  period?: {
    rawLabel: string;
    startDate?: string;
    endDate?: string;
    month?: number;
    year?: number;
  };
  sections: DreSection[];
  summary: DreSummaryLine[];
};

export type DrePeriodData = {
  key: string;
  label: string;
  fileName?: string;
  data: DreImportData;
};

export type GoodsEntryRow = {
  rowNumber: number;
  sourceFileName?: string;
  sourcePeriodLabel?: string;
  group: string;
  subgroup: string;
  productName: string;
  purchaseUnit: string;
  quantity: number;
  purchaseUnitPrice: number;
  totalValue: number;
  supplier: string;
  receiptNumber: string;
  invoiceDate?: string;
  competencyDate?: string;
  dueDate?: string;
  stockUnit: string;
  unitPrice: number;
};

export type GoodsEntryImportData = {
  sheetName: string;
  restaurantName?: string;
  reportTitle?: string;
  reportPeriod?: SalesReportPeriod;
  importedPeriods?: SalesReportPeriod[];
  headerRowIndex?: number;
  entries: GoodsEntryRow[];
};

export type ImportValidation = {
  kind: "sales" | "recipes";
  fileName: string;
  missingColumns: string[];
  availableColumns: string[];
};

export type TotalComparison = {
  officialRevenue: number;
  parsedRevenue: number;
  revenueDifference: number;
  officialQuantity: number;
  parsedQuantity: number;
  quantityDifference: number;
};

export type DashboardIssue = {
  id: string;
  tone: "info" | "warning" | "danger";
  title: string;
  description: string;
  count?: number;
  details?: string[];
};

export type SalesRow = {
  code: string;
  itemName: string;
  group: string;
  subgroup: string;
  quantity: number;
  revenue: number;
};

export type RecipeRow = {
  code: string;
  itemName: string;
  place?: string;
  cost: number;
  salePrice?: number;
  cmvPercent?: number;
  isPromotional: boolean;
  group: string;
  subgroup: string;
};

export type ProductSummary = {
  code: string;
  itemName: string;
  group: string;
  subgroup: string;
  quantity: number;
  unitCost?: number;
  salePrice?: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  cmvPercent: number;
  matchedRecipe: boolean;
  isPromotional: boolean;
};

export type GroupSummary = {
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  cmvPercent: number;
  promotionalCount: number;
};

export type DashboardData = {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  totalQuantity: number;
  averageCMV: number;
  coveragePercent: number;
  unmatchedItems: string[];
  products: ProductSummary[];
  groups: GroupSummary[];
  subgroups: GroupSummary[];
  importedSalesTotals: SalesTotalRow[];
  promotionalProducts: ProductSummary[];
  reportPeriod?: SalesReportPeriod;
  totalComparison?: TotalComparison;
  issues: DashboardIssue[];
  productsWithoutGroup: ProductSummary[];
  productsWithoutSubgroup: ProductSummary[];
  duplicateRecipeCodes: string[];
};

export type PeriodDashboard = {
  key: string;
  label: string;
  salesFileName?: string;
  recipeFileName?: string;
  data: DashboardData;
};

export type AuthSession = {
  userId: string;
  email: string;
  authMode: "local" | "supabase";
  userFullName?: string;
  userPhotoUrl?: string;
  globalRole?: GlobalRole;
  activeAccountId?: string;
  activeAccountRole?: AccountRole;
  memberships?: RestaurantMembership[];
  activeRole?: RestaurantRole;
  activeRestaurantId?: string;
  activeRestaurantName?: string;
  activeRestaurantPhotoUrl?: string;
  restaurantId?: string;
  restaurantName?: string;
  profilePhotoUrl?: string;
};

export type GlobalRole = "owner" | "user";
export type AccountRole = "owner" | "user";
export type RestaurantRole = "owner" | "viewer";

export type RestaurantMembership = {
  membershipId: string;
  accountId?: string;
  restaurantId: string;
  restaurantName: string;
  role: RestaurantRole;
  photoUrl?: string;
};

export type AccountMember = {
  membershipId: string;
  accountId: string;
  userId: string;
  role: AccountRole;
  fullName?: string;
  email?: string;
  photoUrl?: string;
  emailConfirmedAt?: string | null;
  createdAt?: string;
  restaurants: Array<{
    restaurantId: string;
    restaurantName: string;
    role: RestaurantRole;
  }>;
};

export type AccountInvitation = {
  invitationId: string;
  accountId: string;
  email: string;
  accountRole: AccountRole;
  restaurantRole: RestaurantRole;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  restaurants: Array<{
    restaurantId: string;
    restaurantName: string;
  }>;
};

export type UploadFeedbackItem = {
  id: string;
  kind: "sales" | "recipes";
  fileName: string;
  status: "pending" | "success" | "error";
  detail?: string;
};

export type AuditLogEntry = {
  id: string;
  createdAt: string;
  module: "dashboard" | "dre" | "goods-entry";
  action: "import" | "remove";
  status: "success" | "cancelled" | "error";
  title: string;
  actorEmail?: string;
  periodLabel?: string;
  fileNames?: string[];
  detail?: string;
};

export type PersistedWorkspace = {
  locale: "pt" | "es" | "en";
  state: {
    salesFileNames?: string[];
    recipeFileName?: string;
    data?: DashboardData;
    periodDashboards?: PeriodDashboard[];
    validations?: ImportValidation[];
    recipeBase?: RecipeRow[];
    duplicateRecipeCodes?: string[];
    error?: string;
    processing?: boolean;
    goodsEntryData?: GoodsEntryImportData;
    goodsEntryFileName?: string;
    goodsEntryError?: string;
    goodsEntryMessage?: string;
    goodsEntryProcessing?: boolean;
    auditEntries?: AuditLogEntry[];
  };
  uploadFeedback: UploadFeedbackItem[];
  selectedPeriod: string;
  selectedView: string;
  drePeriods?: DrePeriodData[];
  selectedDrePeriod?: string;
  currentSection?: "account" | "dashboard" | "dre" | "restaurants" | "user-management" | "goods-entry" | "operational-history" | "help";
};
