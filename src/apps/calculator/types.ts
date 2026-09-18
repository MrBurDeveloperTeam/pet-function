
export interface Profile {
  user_id: string;
  email: string;
  name: string | null;
  account_type: 'individual' | 'company' | 'admin' | null;
  phone: string | null;
  position: string | null;
  company_name: string | null;
  avatar_url: string | null;
  background_url: string | null;
  clinic_id: string | null;
  status: string | null;
}

export type ViewState =
  | 'settings'
  | 'dashboard'
  | 'history'
  | 'procedure_builder'
  | 'overhead'
  | 'staff'
  | 'depreciation'
  | 'consumables'
  | 'sterilization'
  | 'lab'
  | 'marketing'
  | 'regulatory'
  | 'financial'
  | 'owner';

export interface CostCategoryDefinition {
  id: string;
  name: string;
  description: string;
  group: 'fixed' | 'variable';
  icon: string;
}

export interface Preset {
  name: string;
  data: {
    procedureTimeMinutes: number;
    variableCosts: {
      consumables: number;
      sterilization: number;
      lab_outsourcing: number;
      marketing: number;
    };
    profitMarginPercent: number;
  };
}

// Shared Data Types
export interface ProcedureRecipeItem {
  id: string;
  name: string;
  cost: number; // Unit cost at time of addition
  quantity: number;
}

export interface SavedProcedure {
  id: string;
  name: string;
  price: number;
  duration: number;
  variableCost: number;
  recipe?: ProcedureRecipeItem[];
}

// History & Planning
export interface SavedPlan {
  id: string;
  name: string;
  date: string; // ISO Date string
  type: 'FORECAST' | 'ROI';
  timeframe: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  targetProfit?: number; // Only for Forecast
  algorithm?: 'balanced' | 'efficiency'; // Only for Forecast
  inputs: Record<string, number>; // The map of ProcedureID -> Quantity
  results: {
    netProfit: number;
    revenue: number;
    timeUsedHours: number;
    totalProcedures: number;
    isProfitable: boolean;
  };
}

// 0. Clinic Settings (Global)
export interface ClinicSettingsData {
  clinicName: string;
  workingDaysPerWeek: number;
  hoursPerDay: number;
  currencySymbol: string;
}

// 1. Fixed Overhead (Converted to List)
export interface OverheadItem {
  id: string;
  name: string;
  monthlyCost: number;
}

export interface OverheadData {
  items: OverheadItem[];
}

// 2. Staff Cost (List)
export interface StaffMember {
  id: string;
  name: string;
  role: string;
  salary: number;
  benefits: number; // EPF/SOCSO
  bonus: number;    // Allowances
  workingDays?: number; // Individual schedule
  workingHours?: number; // Individual schedule
}

export interface StaffData {
  members: StaffMember[];
}

// 3. Equipment Depreciation (Converted to List)
export interface Asset {
  id: string;
  name: string;
  purchasePrice: number;
  resaleValue: number;
  lifespanYears: number;
}

export interface DepreciationData {
  assets: Asset[];
}

// 4. Consumables (Dynamic List)
export interface ConsumableItem {
  id: string;
  name: string;
  cost: number;
}
export interface ConsumablesData {
  items: ConsumableItem[];
}

// 5. Sterilization
export interface SterilizationData {
  pouchCost: number;
  chemicalCost: number;
  ppeCost: number;
  electricityCost: number;
  instrumentsPerCycle: number;
}

// 6. Laboratory
export interface LabData {
  labFee: number;
  shippingCost: number;
  markupPercent: number;
}

// 7. Marketing (CAC)
export interface MarketingData {
  adSpend: number;
  agencyFees: number;
  productionCosts: number;
  newPatients: number;
}

// 8. Regulatory
export interface RegulatoryData {
  annualApc: number;
  annualXray: number;
  annualInsurance: number;
  monthlyWaste: number;
}

// 9. Financial
export interface FinancialData {
  loanPrincipal: number;
  monthlyInterest: number;
  monthlyBankCharges: number;
  transactionFeesPercent: number;
  estMonthlyRevenue: number;
  taxRate: number;
}

// 10. Owner Comp
export interface OwnerData {
  desiredNetIncome: number;
  riskBufferPercent: number;
  personalTax: number;
}

export interface GlobalState {
  clinicSettings: ClinicSettingsData;
  overhead: OverheadData;
  staff: StaffData;
  depreciation: DepreciationData;
  consumables: ConsumablesData;
  sterilization: SterilizationData;
  lab: LabData;
  marketing: MarketingData;
  regulatory: RegulatoryData;
  financial: FinancialData;
  owner: OwnerData;
}

/** Phase-3 Data-Driven Chat readiness — the existing login fetch effect in
 *  CalculatorContext.tsx has no loading/error distinction today (a failed
 *  fetch only shows a toast and leaves `state` at its previous value):
 *  `loading` while the current user's config fetch is in flight (including
 *  immediately on logout/user-switch, before a stale previous value could
 *  be mistaken for current), `ready` once it has succeeded at least once
 *  for the current user, `error` if it failed. `ready` is necessary but
 *  NOT sufficient for a factual grounded answer — see
 *  aiExperience/dataChat/utils/checkCalculatorDataIntegrity.ts for the
 *  separate runtime-value integrity gate. */
export type CalculatorDataStatus = 'loading' | 'ready' | 'error';

/** The authenticated user ID for whom the currently accepted `state` /
 *  `savedPlans` / `savedProcedures` were successfully loaded — NOT
 *  necessarily the current auth user ID. `calculatorDataStatus === 'ready'`
 *  alone is insufficient to authorize a grounded Data Chat answer: React
 *  renders with the new auth user BEFORE the `[user?.id]` effect below has
 *  a chance to run, so `calculatorDataStatus` can still read `'ready'`
 *  (left over from the PREVIOUS user) for one or more renders after the
 *  auth user has already changed. Callers must additionally check
 *  `calculatorDataUserId === currentAuthenticatedUserId` — a read-time
 *  comparison available immediately at render/message-handling time, not
 *  dependent on the effect having already executed. `null` means no
 *  successfully-loaded owner (initial state, logged out, or fetch error). */
export type CalculatorDataOwnerId = string | null;

export interface CalculatorContextType {
  state: GlobalState;
  calculatorDataStatus: CalculatorDataStatus;
  calculatorDataUserId: CalculatorDataOwnerId;
  updateSection: <K extends keyof GlobalState>(section: K, data: Partial<GlobalState[K]>) => void;
  saveSection: (section: keyof GlobalState, customMessage?: string, explicitData?: any) => void;
  resetAll: () => void;
  toast: { message: string; isVisible: boolean };
  hideToast: () => void;
  showToast: (message: string) => void;
  getTotalMonthlyHours: () => number;
  getGlobalTotalMonthlyCost: () => number;

  // History & Modal Management
  savedPlans: SavedPlan[];
  savePlan: (plan: SavedPlan) => void;
  deletePlan: (id: string) => void;
  updatePlan: (plan: SavedPlan) => void;

  // Global Procedure Library
  savedProcedures: SavedProcedure[];
  saveProcedure: (procedure: SavedProcedure) => void;
  deleteProcedure: (id: string) => void;
  updateProcedure: (procedure: SavedProcedure) => void;

  // Global Modal Control
  modalState: {
    isOpen: boolean;
    type: 'ROI' | 'FORECAST' | null;
    initialData: SavedPlan | null;
  };
  openModal: (type: 'ROI' | 'FORECAST', data?: SavedPlan | null) => void;
  closeModal: () => void;

  // Odoo activity sync (see services/logActivityToOdoo.ts). Exposed so
  // App.tsx can log page_view duration events alongside the
  // save/update/delete events this context already logs internally.
  logCalculatorActivity: (
    action: string,
    details: string,
    meta?: { pagePath?: string; pageDurationSeconds?: number }
  ) => void;
}
