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
  return { leadTypes: DEFAULT_C4_LEAD_TYPES.map((t) => ({ ...t })), months };
}

// Ensure a loaded C4Data covers exactly the report's current month keys.
export function reconcileC4Months(c4: C4Data, mkeys: string[]): C4Data {
  const months: Record<string, C4MonthData> = {};
  for (const k of mkeys) months[k] = c4.months[k] ?? { spend: 0, leads: {} };
  const leadTypes = c4.leadTypes?.length ? c4.leadTypes : DEFAULT_C4_LEAD_TYPES.map((t) => ({ ...t }));
  return { leadTypes, months };
}

// ---- blended CRM close rate (entire report: configured platforms + everything else) ----
export function crmCloseRate(d: ReportData): number {
  let good = d.comb.good, sold = d.comb.sold;
  for (const u of d.unmatchedSources) { good += u.leads; sold += u.sold; }
  return good > 0 ? (sold / good) * 100 : 0;
}

// ---- computed C-4 view ----
export interface C4MonthMetrics { key: string; spend: number; leads: number; sold: number; }
export interface C4TypeTotal { type: C4LeadType; leads: number; }

export interface C4Computed {
  spend: number;
  leads: number;
  sold: number;       // projected (rounded)
  crmClose: number;   // blended CRM close rate (%) used to project sold
  metrics: RowMetrics;
  byMonth: C4MonthMetrics[];
  byType: C4TypeTotal[];
  websiteLeads: number;
  otherLeads: number;
  hasData: boolean;
}

function monthLeadTotal(m: C4MonthData | undefined, types: C4LeadType[]): number {
  if (!m) return 0;
  let n = 0;
  for (const t of types) n += m.leads?.[t.key] ?? 0;
  return n;
}

export function computeC4(c4: C4Data, d: ReportData): C4Computed {
  const crmClose = crmCloseRate(d);

  const byMonth: C4MonthMetrics[] = d.mkeys.map((k) => {
    const m = c4.months[k];
    const leads = monthLeadTotal(m, c4.leadTypes);
    return { key: k, spend: m?.spend || 0, leads, sold: (leads * crmClose) / 100 };
  });

  const spend = byMonth.reduce((s, x) => s + x.spend, 0);
  const leads = byMonth.reduce((s, x) => s + x.leads, 0);
  const sold = Math.round((leads * crmClose) / 100);

  const byType: C4TypeTotal[] = c4.leadTypes
    .map((type) => {
      let n = 0;
      for (const k of d.mkeys) n += c4.months[k]?.leads?.[type.key] ?? 0;
      return { type, leads: n };
    })
    .sort((a, b) => b.leads - a.leads);

  const websiteLeads = byType.filter((x) => x.type.website).reduce((s, x) => s + x.leads, 0);
  const otherLeads = leads - websiteLeads;

  return {
    spend, leads, sold, crmClose,
    metrics: metricsRow(spend, leads, sold, d.t),
    byMonth, byType, websiteLeads, otherLeads,
    hasData: spend > 0 || leads > 0,
  };
}

// ---- comparison: C-4 vs each third party ----
export interface CompareRow {
  name: string;
  spend: number; leads: number; sold: number;
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
    name: 'C-4 Analytics', spend: c4c.spend, leads: c4c.leads, sold: c4c.sold,
    m: c4c.metrics, isC4: true,
  };

  const rows: CompareRow[] = d.data.map((s) => {
    const spend = s.monthly * d.months;
    return { name: s.name, spend, leads: s.good, sold: s.sold, m: metricsRow(spend, s.good, s.sold, d.t) };
  });

  const thirdBlended: CompareRow = {
    name: 'All third parties (blended)',
    spend: d.combPeriodSpend, leads: d.comb.good, sold: d.comb.sold,
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

// ---- reallocation projector ----
// Move `amount` of period spend from a chosen third party to C-4. Leads scale at
// each channel's own cost-per-lead, so the punchline is: the same dollars buy
// more leads at C-4's (lower) cost per lead.
export interface ReallocSide { spend: number; leads: number; sold: number; }
export interface ReallocResult {
  amount: number;
  sourceBefore: CompareRow;
  sourceAfter: ReallocSide;
  c4Before: CompareRow;
  c4After: ReallocSide;
  totalSpend: number;            // unchanged
  totalLeadsBefore: number;
  totalLeadsAfter: number;
  leadDelta: number;
  totalSoldBefore: number;
  totalSoldAfter: number;
  soldDelta: number;
  combinedCplBefore: number | null;
  combinedCplAfter: number | null;
  valid: boolean;                // both channels have a usable cost-per-lead
}

export function reallocate(rawAmount: number, source: CompareRow, c4: CompareRow, crmClose: number): ReallocResult {
  const amount = Math.max(0, Math.min(rawAmount, source.spend));
  const tpCpl = source.m.cpl;
  const c4Cpl = c4.m.cpl;
  const tpCloseFrac = source.leads > 0 ? source.sold / source.leads : 0;

  const sourceSpendAfter = source.spend - amount;
  const c4SpendAfter = c4.spend + amount;

  const sourceLeadsAfter = tpCpl ? sourceSpendAfter / tpCpl : source.leads;
  const c4LeadsAfter = c4Cpl ? c4SpendAfter / c4Cpl : c4.leads;

  const sourceSoldAfter = sourceLeadsAfter * tpCloseFrac;
  const c4SoldAfter = (c4LeadsAfter * crmClose) / 100;

  const totalSpend = source.spend + c4.spend;
  const totalLeadsBefore = source.leads + c4.leads;
  const totalLeadsAfter = sourceLeadsAfter + c4LeadsAfter;
  const totalSoldBefore = source.sold + c4.sold;
  const totalSoldAfter = sourceSoldAfter + c4SoldAfter;

  return {
    amount,
    sourceBefore: source,
    sourceAfter: { spend: sourceSpendAfter, leads: sourceLeadsAfter, sold: sourceSoldAfter },
    c4Before: c4,
    c4After: { spend: c4SpendAfter, leads: c4LeadsAfter, sold: c4SoldAfter },
    totalSpend,
    totalLeadsBefore, totalLeadsAfter, leadDelta: totalLeadsAfter - totalLeadsBefore,
    totalSoldBefore, totalSoldAfter, soldDelta: totalSoldAfter - totalSoldBefore,
    combinedCplBefore: totalLeadsBefore > 0 ? totalSpend / totalLeadsBefore : null,
    combinedCplAfter: totalLeadsAfter > 0 ? totalSpend / totalLeadsAfter : null,
    valid: !!tpCpl && !!c4Cpl,
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
