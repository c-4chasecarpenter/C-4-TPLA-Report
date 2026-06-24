// Generalized ingestion detection — turns a raw string[][] grid from ANY CRM
// export into the canonical AggregatedRow[] (or recognises a headerless
// desk-log). Role-scores columns by name + 2-row super-header band instead of
// matching hardcoded vendor signatures. See docs/ingestion-v2.md.

import { AggregatedRow, Row, AggColMap } from './types';
import { parseMoney, parseCount } from './gross';

const norm = (s: any) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---- month inference (shared with parse.ts) ----
const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
export function inferMonth(fileName: string): string | undefined {
  const n = fileName.toLowerCase();
  const ym = n.match(/(\d{4})[\-_](\d{1,2})/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, '0')}`;
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (n.startsWith(MONTH_NAMES[i]) || n.includes(`-${MONTH_NAMES[i]}-`) || n.includes(`_${MONTH_NAMES[i]}_`)) {
      return `${new Date().getFullYear()}-${String(i + 1).padStart(2, '0')}`;
    }
  }
  return undefined;
}

// Total / subtotal / grand-total rows to drop.
const SKIP_SRC = (sn: string) =>
  !sn ||
  sn.endsWith('subtotal') ||
  sn.endsWith('total') ||
  sn === 'allinternet' ||
  sn === 'grandtotal';

// Generic lead-TYPE labels that appear as duplicate child sub-rows under a
// parent source in DealerSocket "Group" reports (skip when they duplicate the
// parent's lead count). NOT real sources like "Internet Lead" / "Phone Up".
const GENERIC_TYPE = new Set(['internet', 'phone', 'walkin', 'email', 'chat', 'sms', 'text', 'showroom', 'fax']);

// ================= aggregated detection =================

export interface AggHeader { idx: number; header: string[]; band: string[]; }

// Forward-fill a sparse super-header band row so each column gets its band label.
function bandFill(row: string[]): string[] {
  const out: string[] = [];
  let last = '';
  for (const c of row) {
    const v = String(c ?? '').trim();
    if (v) last = v;
    out.push(last);
  }
  return out;
}

// Find the real header row within the first ~25 rows: a row that names a source
// AND at least one metric (leads/sold). Returns the row + forward-filled band.
export function findAggHeader(grid: string[][]): AggHeader | null {
  const limit = Math.min(grid.length, 25);
  for (let i = 0; i < limit; i++) {
    const cells = (grid[i] ?? []).map((c) => String(c ?? ''));
    if (cells.filter((c) => c.trim()).length < 2) continue;
    const ctx = cells.map(norm);
    const hasSource = ctx.some((c) => c.includes('source') || c.includes('group'));
    const hasLeads = ctx.some((c) => c === 'leads' || c.endsWith('leads') || c.includes('totallead') || c.includes('opportunit') || c.includes('newlead') || c.includes('prospect'));
    const hasSold = ctx.some((c) => c.includes('sold') || c.includes('unit'));
    if (hasSource && (hasLeads || hasSold)) {
      const band = i > 0 ? bandFill((grid[i - 1] ?? []).map((c) => String(c ?? ''))) : [];
      return { idx: i, header: cells, band };
    }
  }
  return null;
}

function buildMapping(h: AggHeader): AggColMap | null {
  const header = h.header;
  const rawLower = header.map((x) => String(x ?? '').toLowerCase());
  const ctx = header.map((x, i) => norm((h.band[i] ?? '') + ' ' + x));
  const isPct = (i: number) => /%|percent|ratio|\brate\b|\bavg\b|average|\bper\b/.test(rawLower[i]);

  let sourceIdx = ctx.findIndex((c) => c.includes('source') || c.includes('group'));
  if (sourceIdx < 0) sourceIdx = 0;

  const find = (pred: (c: string, i: number) => boolean) =>
    ctx.findIndex((c, i) => i !== sourceIdx && pred(c, i));

  const goodIdx = find((c) => c.includes('goodlead'));
  const badIdx = find((c) => c.includes('badlead') && !c.includes('other'));
  const dupIdx = find((c) => c.includes('duplicate'));
  const leadsIdx = find((c, i) =>
    !isPct(i) && (
      c.includes('totallead') ||
      c.includes('totalopportunit') || c.includes('netopportunit') ||
      c.includes('newlead') ||
      (c.endsWith('leads') && !c.includes('good') && !c.includes('bad') && !c.includes('duplicate') && !c.includes('other'))
    ));

  // sold — priority: "sold from leads" > units(sold) > "total sold" > bare sold.
  const soldOk = (c: string, i: number) =>
    !isPct(i) && !c.includes('appointment') && !c.includes('day') && !c.includes('ratio') && !c.includes('avg');
  let soldIdx = find((c, i) => soldOk(c, i) && c.includes('soldfromlead'));
  if (soldIdx < 0) soldIdx = find((c, i) => soldOk(c, i) && c.includes('sold') && c.includes('unit'));
  if (soldIdx < 0) soldIdx = find((c, i) => soldOk(c, i) && c.includes('totalsold'));
  if (soldIdx < 0) soldIdx = find((c, i) => soldOk(c, i) && c.includes('sold'));

  // gross — collect "gross" columns; prefer a single grand total; never sum
  // front+back+total. PVR/avg columns are per-deal → flagged, not summed.
  const grossCand: number[] = [];
  let sawPvr = false;
  ctx.forEach((c, i) => {
    if (isPct(i) || !c.includes('gross')) return;
    if (c.includes('pvr')) { sawPvr = true; grossCand.push(i); return; }
    if (c.includes('avg') || c.includes('average') || c.includes('perdeal')) return;
    grossCand.push(i);
  });
  let grossIdx: number[] = [];
  let pvr = false;
  if (grossCand.length) {
    if (sawPvr) {
      // DealerSocket "Opportunities": use the Total Gross PVR (× sold later).
      const tot = grossCand.find((i) => ctx[i].includes('total') && ctx[i].includes('pvr'));
      grossIdx = tot != null ? [tot] : [grossCand[grossCand.length - 1]];
      pvr = true;
    } else {
      const grand = grossCand.filter((i) =>
        ctx[i].includes('total') && !ctx[i].includes('front') && !ctx[i].includes('back') && !ctx[i].includes('vehicle'));
      grossIdx = grand.length ? [grand[0]] : grossCand;
    }
  }

  // Need a usable mapping: a source plus at least one of leads/good/sold.
  if (sourceIdx < 0 || (leadsIdx < 0 && goodIdx < 0 && soldIdx < 0)) return null;
  return { sourceIdx, leadsIdx, goodIdx, badIdx, dupIdx, soldIdx, grossIdx, pvr };
}

// Detection result the UI consumes: where the header is, its labels, and the
// chosen column mapping (which the user may override before re-parsing).
export interface AggDetection {
  headerIdx: number;
  header: string[];   // raw labels at the header row
  band: string[];     // forward-filled super-header band (or [])
  labels: string[];   // display labels = "Band · Header"
  map: AggColMap;
}

export function detectAggregated(grid: string[][]): AggDetection | null {
  const found = findAggHeader(grid);
  if (!found) return null;
  const map = buildMapping(found);
  if (!map) return null;
  const labels = found.header.map((hh, i) => {
    const b = (found.band[i] ?? '').trim();
    const t = String(hh ?? '').trim();
    return b && b.toLowerCase() !== t.toLowerCase() ? `${b} · ${t}` : t;
  });
  return { headerIdx: found.idx, header: found.header, band: found.band, labels, map };
}

// Parse a grid into canonical rows using an explicit mapping (the detector's or
// a user-overridden one). Pure — same input always yields the same rows.
export function parseRowsWithMapping(
  grid: string[][],
  headerIdx: number,
  m: AggColMap,
  fileName: string,
): AggregatedRow[] {
  const month = inferMonth(fileName);
  const rows: AggregatedRow[] = [];
  // DealerSocket "Group" reports break a parent source into generic lead-type
  // child rows (Internet/Phone/…) whose leads/sold/gross are a SUBSET of the
  // parent's. Skip such a row while the running child totals stay within the
  // parent — this catches multi-child breakdowns (Internet 91 + Phone 1 = 92)
  // without swallowing a standalone source that merely happens to be named
  // "Internet" but carries sold/gross the parent above does not.
  let parentLeads = NaN, parentSold = 0, parentGross = 0;
  let childLeads = 0, childSold = 0, childGross = 0;
  const EPS = 0.5;

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const cells = grid[r] ?? [];
    const srcRaw = String(cells[m.sourceIdx] ?? '').trim();
    if (!srcRaw) continue;
    const sn = srcRaw.toLowerCase().replace(/[^a-z]/g, '');
    if (SKIP_SRC(sn)) continue;

    const leads = m.leadsIdx >= 0 ? parseCount(cells[m.leadsIdx]) : 0;
    const bad = m.badIdx >= 0 ? parseCount(cells[m.badIdx]) : 0;
    const dup = m.dupIdx >= 0 ? parseCount(cells[m.dupIdx]) : 0;
    const good = m.goodIdx >= 0 ? parseCount(cells[m.goodIdx]) : Math.max(0, leads - bad - dup);
    const sold = m.soldIdx >= 0 ? parseCount(cells[m.soldIdx]) : 0;
    let gross = m.grossIdx.reduce((s, i) => s + (i >= 0 ? parseMoney(cells[i]) : 0), 0);
    if (m.pvr) gross = gross * sold; // PVR is per-deal → total = avg × units

    if (
      GENERIC_TYPE.has(sn) && !isNaN(parentLeads) &&
      childLeads + leads <= parentLeads &&
      childSold + sold <= parentSold &&
      childGross + gross <= parentGross + EPS
    ) {
      childLeads += leads; childSold += sold; childGross += gross;
      continue; // a lead-type breakdown of the parent above
    }

    if (good + sold + bad + dup + leads === 0 && gross === 0) continue;
    rows.push({ source: srcRaw, good, sold, bad, dup, gross, month });
    parentLeads = leads; parentSold = sold; parentGross = gross;
    childLeads = 0; childSold = 0; childGross = 0;
  }

  return rows;
}

// Try to detect + parse a grid as an aggregated report. Returns rows or null.
export function parseAggregatedGrid(grid: string[][], fileName: string): AggregatedRow[] | null {
  const d = detectAggregated(grid);
  if (!d) return null;
  const rows = parseRowsWithMapping(grid, d.headerIdx, d.map, fileName);
  return rows.length ? rows : null;
}

// ================= headerless desk-log =================

const STATUS_VOCAB = new Set([
  'sold','sale','lost','bad','active','won','dead','open','new','working',
  'duplicate','junk','spam','invalid','closed','contacted','pending','fresh',
]);
const DATE_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/;

export interface HeaderlessRoles { sourceCol: number; statusCol: number; dateCol: number; }

// A grid is a headerless desk-log if row 0 carries no header keywords but a
// column votes overwhelmingly as lead statuses (Sold/Lost/Bad/Active…).
export function detectHeaderless(grid: string[][]): HeaderlessRoles | null {
  if (grid.length < 2) return null;
  const row0 = (grid[0] ?? []).map(norm);
  const headerish = row0.some((c) =>
    c.includes('source') || c.includes('status') || c.includes('leadtype') || c.includes('date') || c.includes('gross') || c.includes('lead'));
  if (headerish) return null;

  const ncol = Math.max(...grid.slice(0, 40).map((r) => r.length));
  const window = Math.min(grid.length, 40);

  let statusCol = -1, bestHits = 0;
  for (let c = 0; c < ncol; c++) {
    let hits = 0, tot = 0;
    for (let r = 0; r < window; r++) {
      const v = norm((grid[r] ?? [])[c]);
      if (!v) continue;
      tot++;
      if (STATUS_VOCAB.has(v)) hits++;
    }
    if (tot > 0 && hits / tot > 0.5 && hits > bestHits) { bestHits = hits; statusCol = c; }
  }
  if (statusCol < 0) return null;

  let dateCol = -1;
  for (let c = 0; c < ncol; c++) {
    let hits = 0, tot = 0;
    for (let r = 0; r < window; r++) {
      const v = String((grid[r] ?? [])[c] ?? '').trim();
      if (!v) continue;
      tot++;
      if (DATE_RE.test(v)) hits++;
    }
    if (tot > 0 && hits / tot > 0.5) { dateCol = c; break; }
  }

  // Source = first text-ish column that isn't the status or date column.
  let sourceCol = 0;
  for (let c = 0; c < ncol; c++) {
    if (c === statusCol || c === dateCol) continue;
    sourceCol = c;
    break;
  }
  return { sourceCol, statusCol, dateCol };
}

export function headerlessToRows(grid: string[][], roles: HeaderlessRoles): Row[] {
  const ncol = Math.max(...grid.map((r) => r.length));
  const names: string[] = [];
  for (let c = 0; c < ncol; c++) {
    if (c === roles.sourceCol) names.push('Lead Source');
    else if (c === roles.statusCol) names.push('Lead Status Type');
    else if (c === roles.dateCol) names.push('Lead Origination Date');
    else names.push('Column ' + (c + 1));
  }
  return grid
    .map((r) => {
      const o: Row = {};
      names.forEach((n, i) => { o[n] = r[i] ?? ''; });
      return o;
    })
    .filter((r) => Object.values(r).some((v) => String(v).trim()));
}
