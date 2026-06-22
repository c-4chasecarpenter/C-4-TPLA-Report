import { ColumnMap, MonthBucket, PlatformAgg, ReportData, Row, ParseResult, SourceEntry, Thresholds } from './types';
import { resolveGrossHeaders, rowGross } from './gross';

export type { Row };

export const DEFAULT_THRESHOLDS: Thresholds = {
  cpl: { good: 35, bad: 75 },
  close: { good: 18, bad: 10 },
  cpa: { good: 400, bad: 800 },
};

// ---- column detection ----
const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

export function findCol(headers: string[], cands: string[]): string | null {
  const nh = headers.map((h) => ({ raw: h, n: normHeader(h) }));
  for (const c of cands) {
    const cn = normHeader(c);
    const hit = nh.find((x) => x.n === cn);
    if (hit) return hit.raw;
  }
  for (const c of cands) {
    const cn = normHeader(c);
    const hit = nh.find((x) => x.n.includes(cn));
    if (hit) return hit.raw;
  }
  return null;
}

export function detectColumns(headers: string[]): ColumnMap {
  return {
    source: findCol(headers, [
      'LeadSourceName', 'LeadSource', 'Source', 'Lead Source', 'SourceName',
      'LeadSourceType', 'Traffic Source', 'Marketing Source', 'Source Name',
    ]),
    status: findCol(headers, [
      'LeadStatusTypeName', 'LeadStatusType', 'Status', 'Lead Status',
      'LeadStatus', 'Stage', 'Lead Stage', 'Disposition', 'Outcome',
    ]),
    created: findCol(headers, [
      'Created', 'CreatedDate', 'CreateDate', 'Date', 'LeadDate',
      'VisitStartTime', 'EntryDate', 'Received', 'ReceivedDate', 'SubmittedDate',
    ]),
  };
}

// ---- status normalization ----
const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const SOLD_PATTERNS = [
  'sold', 'sale', 'closedwon', 'won', 'purchased', 'delivered',
  'closedsold', 'financed', 'closed',
];

const BAD_PATTERNS = [
  'bad', 'duplicate', 'junk', 'spam', 'invalid', 'dead', 'lost',
  'disqualified', 'noshow', 'unqualified', 'donotcontact', 'badlead', 'bogus',
];

export function normalizeStatus(raw: string): 'sold' | 'bad' | 'good' {
  const n = norm(raw);
  if (!n) return 'good';
  if (n === 'fi') return 'sold';
  for (const p of SOLD_PATTERNS) if (n.includes(p)) return 'sold';
  for (const p of BAD_PATTERNS) if (n.includes(p)) return 'bad';
  return 'good';
}

// ---- date parsing ----
export function parseDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v).trim().split(' ')[0];
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function detectMonths(rows: Row[], createdCol: string | null): number | null {
  if (!createdCol) return null;
  let min: Date | null = null, max: Date | null = null;
  for (const r of rows) {
    const d = parseDate(r[createdCol]);
    if (d) { if (!min || d < min) min = d; if (!max || d > max) max = d; }
  }
  if (min && max) return (max.getFullYear() - min.getFullYear()) * 12 + (max.getMonth() - min.getMonth()) + 1;
  return null;
}

// Estimate months across all uploaded files for the UI input default.
export function autoDetectMonths(files: ParseResult[], createdCol: string | null): number | null {
  const deskRows = files.flatMap((f) => f.kind === 'desklog' ? f.rows : []);
  if (deskRows.length) return detectMonths(deskRows, createdCol);
  const aggRows = files.flatMap((f) => f.kind === 'aggregated' ? f.rows : []);
  const months = new Set(aggRows.filter((r) => r.month).map((r) => r.month));
  if (months.size) return months.size;
  return files.filter((f) => f.kind === 'aggregated').length || null;
}

// ---- source matching ----
const ALIASES: Record<string, string[]> = {
  kbb: ['kelleybluebook', 'kbb', 'kbbcom'],
  edmunds: ['edmunds'],
  truecar: ['truecar'],
  cargurus: ['cargurus'],
  autotrader: ['autotrader'],
  carscom: ['carscom', 'carsco'],
  carfax: ['carfax'],
};

export function matches(src: string, name: string): boolean {
  const sn = norm(src), en = norm(name);
  if (!en) return false;
  if (sn.includes(en)) return true;
  for (const k in ALIASES) {
    if (en.includes(k) || k.includes(en)) {
      if (ALIASES[k].some((a) => sn.includes(a))) return true;
    }
  }
  return false;
}

// ---- main analysis ----
export function analyze(
  files: ParseResult[],
  cols: ColumnMap,
  entries: SourceEntry[],
  months: number,
  t: Thresholds,
  meta: { deal: string; timeframe: string; description: string }
): ReportData {
  const deskRows = files.flatMap((f) => f.kind === 'desklog' ? f.rows : []);
  const aggRows = files.flatMap((f) => f.kind === 'aggregated' ? f.rows : []);

  // Build month axis from desk log dates + aggregated file months
  const mmap: Record<string, Date> = {};
  if (cols.created) {
    for (const r of deskRows) {
      const d = parseDate(r[cols.created]);
      if (d) {
        const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!mmap[k]) mmap[k] = d;
      }
    }
  }
  for (const r of aggRows) {
    if (r.month && !mmap[r.month]) {
      const [y, mo] = r.month.split('-').map(Number);
      mmap[r.month] = new Date(y, mo - 1, 1);
    }
  }

  let mkeys = Object.keys(mmap).sort();
  let mlabels = mkeys.map((k) => mmap[k].toLocaleString('en-US', { month: 'short', year: '2-digit' }));
  const noDates = mkeys.length === 0;
  if (noDates) { mkeys = ['all']; mlabels = ['All data']; }

  const blank = () => {
    const o = { leads: 0, good: 0, sold: 0, gross: 0, bm: {} as Record<string, MonthBucket> };
    mkeys.forEach((k) => (o.bm[k] = { leads: 0, good: 0, sold: 0, gross: 0 }));
    return o;
  };

  const data: PlatformAgg[] = entries.map((e) => ({ name: e.name, monthly: e.monthly, ...blank() }));
  const unmatchedMap = new Map<string, { good: number; sold: number; gross: number }>();
  const unknownStatusSet = new Set<string>();

  // Gross columns vary wildly in naming; resolve them once from the desk-log headers.
  const grossHeaders = deskRows.length ? resolveGrossHeaders(Object.keys(deskRows[0])) : [];

  // --- Desk log rows: row-level, normalize status ---
  for (const r of deskRows) {
    const src = String(cols.source ? r[cols.source] : '').trim() || '(blank)';
    const rawStatus = String(cols.status ? r[cols.status] : '').trim();
    const bucket = normalizeStatus(rawStatus);

    if (bucket === 'good' && rawStatus) {
      const n = norm(rawStatus);
      const isKnownGood = [
        'active', 'new', 'open', 'working', 'contacted', 'appointmentset',
        'inprogress', 'pending', 'fresh', 'unread', 'read', 'replied',
      ].some((p) => n.includes(p));
      if (!isKnownGood) unknownStatusSet.add(rawStatus);
    }

    if (bucket === 'bad') continue;

    const sold = bucket === 'sold';
    const rowG = grossHeaders.length ? rowGross(r, grossHeaders) : 0;

    let mk = noDates ? 'all' : mkeys[0];
    if (!noDates && cols.created) {
      const d = parseDate(r[cols.created]);
      if (d) {
        const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (mmap[k]) mk = k;
      }
    }

    let best: SourceEntry | null = null, blen = -1;
    for (const e of entries) {
      if (matches(src, e.name) && norm(e.name).length > blen) { best = e; blen = norm(e.name).length; }
    }

    if (best) {
      const D = data.find((x) => x.name === best!.name)!;
      D.leads++; D.good++; if (sold) D.sold++; D.gross += rowG;
      const b = D.bm[mk] || (D.bm[mk] = { leads: 0, good: 0, sold: 0, gross: 0 });
      b.leads++; b.good++; if (sold) b.sold++; b.gross += rowG;
    } else {
      const um = unmatchedMap.get(src) ?? { good: 0, sold: 0, gross: 0 };
      um.good += 1; if (sold) um.sold += 1; um.gross += rowG;
      unmatchedMap.set(src, um);
    }
  }

  // --- Aggregated rows: pre-summed, skip status normalization ---
  for (const r of aggRows) {
    let best: SourceEntry | null = null, blen = -1;
    for (const e of entries) {
      if (matches(r.source, e.name) && norm(e.name).length > blen) { best = e; blen = norm(e.name).length; }
    }

    const mk = (r.month && mmap[r.month]) ? r.month : (noDates ? 'all' : mkeys[0]);

    if (best) {
      const D = data.find((x) => x.name === best!.name)!;
      D.leads += r.good; D.good += r.good; D.sold += r.sold; D.gross += r.gross;
      const b = D.bm[mk] || (D.bm[mk] = { leads: 0, good: 0, sold: 0, gross: 0 });
      b.leads += r.good; b.good += r.good; b.sold += r.sold; b.gross += r.gross;
    } else {
      const um = unmatchedMap.get(r.source) ?? { good: 0, sold: 0, gross: 0 };
      um.good += r.good; um.sold += r.sold; um.gross += r.gross;
      unmatchedMap.set(r.source, um);
    }
  }

  const unmatchedSources = Array.from(unmatchedMap.entries())
    .map(([source, { good, sold, gross }]) => ({ source, leads: good, sold, gross }))
    .sort((a, b) => b.leads - a.leads);
  const unmatchedLeads = unmatchedSources.reduce((s, x) => s + x.leads, 0);
  const unmatchedGross = unmatchedSources.reduce((s, x) => s + x.gross, 0);

  const comb = blank();
  for (const s of data) {
    comb.leads += s.leads; comb.good += s.good; comb.sold += s.sold; comb.gross += s.gross;
    mkeys.forEach((k) => {
      if (s.bm[k]) {
        comb.bm[k].leads += s.bm[k].leads;
        comb.bm[k].good += s.bm[k].good;
        comb.bm[k].sold += s.bm[k].sold;
        comb.bm[k].gross += s.bm[k].gross;
      }
    });
  }
  const combMonthlySpend = data.reduce((s, x) => s + x.monthly, 0);
  const combPeriodSpend = combMonthlySpend * months;

  return {
    data, comb, combMonthlySpend, combPeriodSpend, months, mkeys, mlabels, t, meta,
    unmatchedLeads,
    unmatchedSources,
    unknownStatuses: Array.from(unknownStatusSet).sort(),
    hasGross: comb.gross !== 0 || unmatchedGross !== 0,
  };
}
