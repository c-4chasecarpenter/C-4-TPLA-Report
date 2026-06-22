// C-4 Analytics performance model + math.
//
// C-4 data is entered by hand (GA4 / Google Ads numbers don't live in the CRM
// export the rest of the report is built from). C-4 drives website + campaign
// traffic; the dealership's CRM never cleanly tracks the sale back to us, so we
// PROJECT C-4 sold by applying the blended close rate of the entire CRM report
// to C-4's good leads. Everything here is pure logic so it can be unit-tested
// independently of the React layer.

import { ReportData } from './types';
import { metricsRow, RowMetrics } from './format';

// A single C-4 lead type (one GA4 / Google Ads conversion action).
export interface C4LeadType {
  key: string;      // raw conversion key, e.g. 'asc_click_to_call'
  label: string;    // friendly label, e.g. 'Web Phone Call'
  website: boolean; // true when sourced from the dealer website (asc_ prefix)
}

// Per-month C-4 entry: spend + a count for each lead type (keyed by C4LeadType.key).
export interface C4MonthData {
  spend: number;
  leads: Record<string, number>;
}

export interface C4Data {
  leadTypes: C4LeadType[];
  months: Record<string, C4MonthData>; // keyed by report month key (ReportData.mkeys)
  budget: number;                      // monthly budget — reference only, not the true spend
  range: { start: string | null; end: string | null }; // C-4 active month keys; null = open
}

// C-4 may run a different (shorter) window than the third parties — e.g. paid
// media starting partway through the report period. Month keys are 'YYYY-MM',
// which sort chronologically, so a lexical range filter works.
export function c4ActiveMonthKeys(c4: C4Data, mkeys: string[]): string[] {
  const s = c4.range?.start, e = c4.range?.end;
  return mkeys.filter((k) => (!s || k >= s) && (!e || k <= e));
}

// Anything prefixed `asc_` is a lead from the dealer website.
export function isWebsiteKey(key: string): boolean {
  return key.trim().toLowerCase().startsWith('asc_');
}

// Default catalog. asc_* = website; the rest are Google / off-site campaign
// conversions. The list is editable in the UI, so this is just a sensible seed.
export const DEFAULT_C4_LEAD_TYPES: C4LeadType[] = [
  { key: 'asc_click_to_call',   label: 'Web Phone Call',      website: true },
  { key: 'asc_form_submission', label: 'Web Form Submission', website: true },
  { key: 'asc_comm_submission', label: 'Web Chat Submission',  website: true },
  { key: 'google_click_to_call', label: 'Google Phone Call',  website: false },
  { key: 'google_store_visit',   label: 'Google Store Visit',  website: false },
];

export function emptyC4Data(mkeys: string[]): C4Data {
  const months: Record<string, C4MonthData> = {};
  for (const k of mkeys) months[k] = { spend: 0, leads: {} };
  return { leadTypes: DEFAULT_C4_LEAD_TYPES.map((t) => ({ ...t })), months, budget: 0, range: { start: null, end: null } };
}

// Ensure a loaded C4Data covers exactly the report's current month keys.
export function reconcileC4Months(c4: C4Data, mkeys: string[]): C4Data {
  const months: Record<string, C4MonthData> = {};
  for (const k of mkeys) months[k] = c4.months[k] ?? { spend: 0, leads: {} };
  const leadTypes = c4.leadTypes?.length ? c4.leadTypes : DEFAULT_C4_LEAD_TYPES.map((t) => ({ ...t }));
  // Drop a saved range bound that no longer exists in the current month axis.
  const start = c4.range?.start && mkeys.includes(c4.range.start) ? c4.range.start : null;
  const end = c4.range?.end && mkeys.includes(c4.range.end) ? c4.range.end : null;
  return { leadTypes, months, budget: c4.budget ?? 0, range: { start, end } };
}

// ---- blended CRM close rate (entire report: configured platforms + everything else) ----
export interface CrmCloseDetail { good: number; sold: number; rate: number; gross: number; grossPerSold: number; }
export function crmCloseDetail(d: ReportData): CrmCloseDetail {
  let good = d.comb.good, sold = d.comb.sold, gross = d.comb.gross;
  for (const u of d.unmatchedSources) { good += u.leads; sold += u.sold; gross += u.gross; }
  return { good, sold, rate: good > 0 ? (sold / good) * 100 : 0, gross, grossPerSold: sold > 0 ? gross / sold : 0 };
}
export function crmCloseRate(d: ReportData): number {
  return crmCloseDetail(d).rate;
}

// ---- computed C-4 view ----
export interface C4MonthMetrics { key: string; label: string; spend: number; leads: number; sold: number; gross: number; }
export interface C4TypeTotal { type: C4LeadType; leads: number; }

export interface C4Computed {
  spend: number;
  leads: number;
  sold: number;       // projected (rounded)
  gross: number;      // projected: sold × blended gross-per-sold
  crmClose: number;   // blended CRM close rate (%) used to project sold
  grossPerSold: number; // blended CRM gross per sold unit, used to project C-4 gross
  metrics: RowMetrics;
  byMonth: C4MonthMetrics[];   // active months only
  byType: C4TypeTotal[];
  websiteLeads: number;
  otherLeads: number;
  months: number;              // count of active C-4 months
  monthKeys: string[];         // active month keys
  hasData: boolean;
}

function monthLeadTotal(m: C4MonthData | undefined, types: C4LeadType[]): number {
  if (!m) return 0;
  let n = 0;
  for (const t of types) n += m.leads?.[t.key] ?? 0;
  return n;
}

export function computeC4(c4: C4Data, d: ReportData): C4Computed {
  const detail = crmCloseDetail(d);
  const crmClose = detail.rate;
  const grossPerSold = detail.grossPerSold;
  const active = c4ActiveMonthKeys(c4, d.mkeys);
  const labelOf = (k: string) => { const i = d.mkeys.indexOf(k); return i >= 0 ? d.mlabels[i] : k; };

  const byMonth: C4MonthMetrics[] = active.map((k) => {
    const m = c4.months[k];
    const leads = monthLeadTotal(m, c4.leadTypes);
    const mSold = (leads * crmClose) / 100;
    return { key: k, label: labelOf(k), spend: m?.spend || 0, leads, sold: mSold, gross: mSold * grossPerSold };
  });

  const spend = byMonth.reduce((s, x) => s + x.spend, 0);
  const leads = byMonth.reduce((s, x) => s + x.leads, 0);
  const soldExact = (leads * crmClose) / 100;
  const sold = Math.round(soldExact);
  const gross = soldExact * grossPerSold;

  const byType: C4TypeTotal[] = c4.leadTypes
    .map((type) => {
      let n = 0;
      for (const k of active) n += c4.months[k]?.leads?.[type.key] ?? 0;
      return { type, leads: n };
    })
    .sort((a, b) => b.leads - a.leads);

  const websiteLeads = byType.filter((x) => x.type.website).reduce((s, x) => s + x.leads, 0);
  const otherLeads = leads - websiteLeads;

  return {
    spend, leads, sold, gross, crmClose, grossPerSold,
    metrics: metricsRow(spend, leads, sold, d.t),
    byMonth, byType, websiteLeads, otherLeads,
    months: active.length, monthKeys: active,
    hasData: spend > 0 || leads > 0,
  };
}

// ---- comparison: C-4 vs each third party ----
export interface CompareRow {
  name: string;
  spend: number; leads: number; sold: number; gross: number;
  monthly: number;          // spend per active month for this channel
  m: RowMetrics;
  isC4?: boolean;
}

export interface C4Comparison {
  c4: CompareRow;
  rows: CompareRow[];          // each configured third party
  thirdBlended: CompareRow;    // all third parties combined
  beatsCplCount: number;       // third parties C-4 beats on cost per lead
  beatsCpaCount: number;       // third parties C-4 beats on cost per sold
  cplEdgePct: number | null;   // % cheaper per lead vs blended third parties
  cpaEdgePct: number | null;   // % cheaper per sold vs blended third parties
}

export function buildComparison(c4c: C4Computed, d: ReportData): C4Comparison {
  const c4: CompareRow = {
    name: 'C-4 Analytics', spend: c4c.spend, leads: c4c.leads, sold: c4c.sold, gross: c4c.gross,
    monthly: c4c.months > 0 ? c4c.spend / c4c.months : 0,
    m: c4c.metrics, isC4: true,
  };

  const rows: CompareRow[] = d.data.map((s) => {
    const spend = s.monthly * d.months;
    return { name: s.name, spend, leads: s.good, sold: s.sold, gross: s.gross, monthly: s.monthly, m: metricsRow(spend, s.good, s.sold, d.t) };
  });

  const thirdBlended: CompareRow = {
    name: 'All third parties (blended)',
    spend: d.combPeriodSpend, leads: d.comb.good, sold: d.comb.sold, gross: d.comb.gross,
    monthly: d.combMonthlySpend,
    m: metricsRow(d.combPeriodSpend, d.comb.good, d.comb.sold, d.t),
  };

  const cpl = c4.m.cpl;
  const cpa = c4.m.cpa;
  const beatsCplCount = rows.filter((r) => cpl !== null && r.m.cpl !== null && cpl < r.m.cpl).length;
  const beatsCpaCount = rows.filter((r) => cpa !== null && r.m.cpa !== null && cpa < r.m.cpa).length;

  const cplEdgePct = cpl !== null && thirdBlended.m.cpl ? ((thirdBlended.m.cpl - cpl) / thirdBlended.m.cpl) * 100 : null;
  const cpaEdgePct = cpa !== null && thirdBlended.m.cpa ? ((thirdBlended.m.cpa - cpa) / thirdBlended.m.cpa) * 100 : null;

  return { c4, rows, thirdBlended, beatsCplCount, beatsCpaCount, cplEdgePct, cpaEdgePct };
}

// ---- reallocation projector (monthly basis) ----
// Each allocation moves `monthly` dollars/month from a third party into C-4.
// Leads scale at each channel's own cost-per-lead, so the same dollars buy more
// leads at C-4's (lower) cost per lead. Allocations stack into a summary table.
export interface Allocation { source: string; monthly: number; }

export interface AllocRow {
  name: string;
  isC4?: boolean;
  currentMonthly: number;
  change: number;          // negative for sources, positive for C-4
  updatedMonthly: number;
  leadsBeforeMo: number;
  leadsAfterMo: number;
  soldBeforeMo: number;
  soldAfterMo: number;
}

export interface AllocSummary {
  sourceRows: AllocRow[];
  c4Row: AllocRow;
  totalMovedMonthly: number;
  netLeadsMo: number;
  netSoldMo: number;
  combinedCplBefore: number | null;
  combinedCplAfter: number | null;
}

export function summarizeAllocations(allocs: Allocation[], cmp: C4Comparison, crmClose: number): AllocSummary {
  const c4Cpl = cmp.c4.m.cpl;
  const c4Monthly = cmp.c4.monthly;
  const c4LeadsBeforeMo = c4Cpl ? c4Monthly / c4Cpl : 0;

  let totalMoved = 0;
  const sourceRows: AllocRow[] = [];
  for (const a of allocs) {
    const src = cmp.rows.find((r) => r.name === a.source);
    if (!src) continue;
    const curMo = src.monthly;
    const moved = Math.max(0, Math.min(a.monthly, curMo));
    totalMoved += moved;
    const cpl = src.m.cpl;
    const closeFrac = src.leads > 0 ? src.sold / src.leads : 0;
    const leadsBeforeMo = cpl ? curMo / cpl : 0;
    const updated = curMo - moved;
    const leadsAfterMo = cpl ? updated / cpl : 0;
    sourceRows.push({
      name: src.name, currentMonthly: curMo, change: -moved, updatedMonthly: updated,
      leadsBeforeMo, leadsAfterMo,
      soldBeforeMo: leadsBeforeMo * closeFrac, soldAfterMo: leadsAfterMo * closeFrac,
    });
  }

  const c4Updated = c4Monthly + totalMoved;
  const c4LeadsAfterMo = c4Cpl ? c4Updated / c4Cpl : 0;
  const c4Row: AllocRow = {
    name: 'C-4 Analytics', isC4: true,
    currentMonthly: c4Monthly, change: totalMoved, updatedMonthly: c4Updated,
    leadsBeforeMo: c4LeadsBeforeMo, leadsAfterMo: c4LeadsAfterMo,
    soldBeforeMo: (c4LeadsBeforeMo * crmClose) / 100,
    soldAfterMo: (c4LeadsAfterMo * crmClose) / 100,
  };

  const netLeadsMo = (c4Row.leadsAfterMo - c4Row.leadsBeforeMo)
    + sourceRows.reduce((s, r) => s + (r.leadsAfterMo - r.leadsBeforeMo), 0);
  const netSoldMo = (c4Row.soldAfterMo - c4Row.soldBeforeMo)
    + sourceRows.reduce((s, r) => s + (r.soldAfterMo - r.soldBeforeMo), 0);

  const spend = c4Monthly + sourceRows.reduce((s, r) => s + r.currentMonthly, 0); // conserved
  const leadsBefore = c4Row.leadsBeforeMo + sourceRows.reduce((s, r) => s + r.leadsBeforeMo, 0);
  const leadsAfter = c4Row.leadsAfterMo + sourceRows.reduce((s, r) => s + r.leadsAfterMo, 0);

  return {
    sourceRows, c4Row, totalMovedMonthly: totalMoved, netLeadsMo, netSoldMo,
    combinedCplBefore: leadsBefore > 0 ? spend / leadsBefore : null,
    combinedCplAfter: leadsAfter > 0 ? spend / leadsAfter : null,
  };
}

// ---- recommendations (data-driven) ----
export interface C4Insight { type: 'scale' | 'cut' | 'watch' | 'info'; headline: string; detail: string; }

export function c4Recommendations(c4c: C4Computed, cmp: C4Comparison, d: ReportData): C4Insight[] {
  const out: C4Insight[] = [];
  const dollars = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

  if (!c4c.hasData) {
    out.push({
      type: 'info',
      headline: 'Enter C-4 performance data to compare',
      detail: 'Toggle Edit at the top of the C-4 tabs and add monthly spend and lead counts. The tool will project sold units from the blended CRM close rate and benchmark C-4 against every third party automatically.',
    });
    return out;
  }

  if (cmp.cplEdgePct !== null && cmp.cplEdgePct > 0) {
    out.push({
      type: 'scale',
      headline: `C-4 is ${cmp.cplEdgePct.toFixed(0)}% cheaper per lead than third parties combined`,
      detail: `C-4 delivers leads at ${c4c.metrics.cpl === null ? 'n/a' : dollars(c4c.metrics.cpl)} each versus ${cmp.thirdBlended.m.cpl === null ? 'n/a' : dollars(cmp.thirdBlended.m.cpl)} blended across the third parties. The dealership's media is working harder through C-4's owned channels.`,
    });
  } else if (cmp.cplEdgePct !== null && cmp.cplEdgePct < 0) {
    out.push({
      type: 'watch',
      headline: 'Third parties are currently cheaper per lead',
      detail: `Blended third-party cost per lead is below C-4's right now. Confirm all C-4 channels and conversions are captured before drawing conclusions — under-counted leads understate C-4 efficiency.`,
    });
  }

  if (cmp.rows.length) {
    out.push({
      type: cmp.beatsCplCount >= Math.ceil(cmp.rows.length / 2) ? 'scale' : 'watch',
      headline: `C-4 beats ${cmp.beatsCplCount} of ${cmp.rows.length} third parties on cost per lead`,
      detail: `On a cost-per-sold basis, C-4 comes in ahead of ${cmp.beatsCpaCount} of ${cmp.rows.length}. Lead volume from C-4 (${Math.round(c4c.leads).toLocaleString()}) compares with ${cmp.thirdBlended.leads.toLocaleString()} from all third parties combined.`,
    });
  }

  // Flag the weakest third party as a reallocation candidate.
  const worst = [...cmp.rows].filter((r) => r.m.cpl !== null).sort((a, b) => (b.m.cpl! - a.m.cpl!))[0];
  if (worst && c4c.metrics.cpl !== null && worst.m.cpl !== null && c4c.metrics.cpl < worst.m.cpl) {
    const movePerLeadGain = worst.m.cpl - c4c.metrics.cpl;
    out.push({
      type: 'cut',
      headline: `Reallocation opportunity: ${worst.name}`,
      detail: `${worst.name} is the most expensive lead source at ${dollars(worst.m.cpl)} per lead — ${dollars(movePerLeadGain)} more than C-4. Use the projector below to model moving that budget into C-4 campaigns and watch total lead volume rise on the same spend.`,
    });
  }

  return out;
}

// ---- localStorage persistence (keyed per dealer + timeframe) ----
export function c4StorageKey(meta: { deal: string; timeframe: string }): string {
  return `tpla-c4:${meta.deal}|${meta.timeframe}`;
}

export function loadC4(meta: { deal: string; timeframe: string }, mkeys: string[]): C4Data | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(c4StorageKey(meta));
    if (!raw) return null;
    return reconcileC4Months(JSON.parse(raw) as C4Data, mkeys);
  } catch { return null; }
}

export function saveC4(meta: { deal: string; timeframe: string }, c4: C4Data): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(c4StorageKey(meta), JSON.stringify(c4)); } catch { /* quota / disabled */ }
}
