import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { Row, AggregatedRow, ParseResult } from './types';

const normH = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---- Raw CSV ----

function parseRawCSV(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data as string[][]),
      error: () => reject(new Error('Could not read that CSV.')),
    });
  });
}

// ---- Aggregated format ----

function findAggHeaderRow(data: string[][]): number {
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i].map(normH);
    if (row.some((c) => c === 'goodleads') && row.some((c) => c === 'sold')) return i;
  }
  return -1;
}

const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function inferMonth(fileName: string): string | undefined {
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

// ---- DealerSocket wide format (Tracking Codes / Marketing Channels) ----

type DSVariant = 'tracking' | 'channel';

function findDealerSocketHeaderRow(data: string[][]): { hIdx: number; variant: DSVariant } | null {
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i].map(normH);
    if (row.some((c) => c === 'trackingnewleads') && row.some((c) => c === 'trackingsold')) {
      return { hIdx: i, variant: 'tracking' };
    }
    if (row.some((c) => c === 'marketingchannelnewprospects') && row.some((c) => c === 'marketingchannelsold')) {
      return { hIdx: i, variant: 'channel' };
    }
  }
  return null;
}

function parseDealerSocketWide(data: string[][], hIdx: number, variant: DSVariant, fileName: string): AggregatedRow[] {
  const headers = data[hIdx].map(normH);
  const col = (name: string) => headers.findIndex((h) => h === name);

  const srcIdx  = variant === 'tracking' ? col('tracking')                  : col('marketingchannel');
  const leadIdx = variant === 'tracking' ? col('trackingnewleads')           : col('marketingchannelnewprospects');
  const soldIdx = variant === 'tracking' ? col('trackingsold')               : col('marketingchannelsold');

  if (srcIdx < 0 || leadIdx < 0 || soldIdx < 0) return [];

  const month = inferMonth(fileName);
  // Accumulate because the same tracking code appears once per Source category row
  const acc = new Map<string, { good: number; sold: number }>();

  for (const row of data.slice(hIdx + 1)) {
    const src = (row[srcIdx] ?? '').trim();
    if (!src) continue;
    const leads = parseInt(row[leadIdx] ?? '') || 0;
    const sold  = parseInt(row[soldIdx]  ?? '') || 0;
    if (leads + sold === 0) continue;
    const prev = acc.get(src) ?? { good: 0, sold: 0 };
    prev.good += leads;
    prev.sold += sold;
    acc.set(src, prev);
  }

  return Array.from(acc.entries()).map(([source, { good, sold }]) => ({
    source, good, sold, bad: 0, dup: 0, month,
  }));
}

// ---- OMeara / standard aggregated format ----

const SKIP_SRC = (sn: string) =>
  !sn ||
  sn.endsWith('subtotal') ||
  sn.endsWith('total') ||
  sn === 'allinternet' ||
  sn === 'grandtotal';

function parseAggregated(data: string[][], hIdx: number, fileName: string): AggregatedRow[] {
  const headers = data[hIdx].map(normH);
  const idx = (name: string) => headers.findIndex((h) => h === name);

  const srcIdx = idx('source');
  const goodIdx = idx('goodleads');
  const badIdx = idx('badleads');
  const dupIdx = idx('duplicateleads');
  const soldIdx = idx('sold');

  if (srcIdx < 0 || goodIdx < 0 || soldIdx < 0) return [];

  const month = inferMonth(fileName);
  const rows: AggregatedRow[] = [];

  for (const row of data.slice(hIdx + 1)) {
    const src = (row[srcIdx] ?? '').trim();
    const sn = src.toLowerCase().replace(/[^a-z]/g, '');
    if (SKIP_SRC(sn)) continue;

    const good = parseInt(row[goodIdx] ?? '') || 0;
    const sold = parseInt(row[soldIdx] ?? '') || 0;
    const bad = badIdx >= 0 ? (parseInt(row[badIdx] ?? '') || 0) : 0;
    const dup = dupIdx >= 0 ? (parseInt(row[dupIdx] ?? '') || 0) : 0;

    if (good + sold + bad + dup === 0) continue;
    rows.push({ source: src, good, sold, bad, dup, month });
  }
  return rows;
}

// ---- Desk log ----

function rawToRows(data: string[][]): Row[] {
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .map((row) => {
      const obj: Row = {};
      headers.forEach((h, i) => { if (h.trim()) obj[h.trim()] = row[i] ?? ''; });
      return obj;
    })
    .filter((r) => Object.values(r).some((v) => String(v).trim()));
}

// ---- Excel (assumed desk log) ----

async function parseExcel(file: File): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target!.result as ArrayBuffer;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];
        const headers: string[] = [];
        const rows: Row[] = [];
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            row.eachCell({ includeEmpty: true }, (cell) => headers.push(String(cell.value ?? '')));
          } else {
            const obj: Row = {};
            row.eachCell({ includeEmpty: true }, (cell, col) => {
              obj[headers[col - 1]] = cell.value ?? '';
            });
            rows.push(obj);
          }
        });
        resolve(rows);
      } catch {
        reject(new Error('Could not read that Excel file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsArrayBuffer(file);
  });
}

// ---- Public API ----

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'xlsx' || ext === 'xls') {
    const rows = await parseExcel(file);
    if (!rows.length) throw new Error('That file came through empty.');
    return { kind: 'desklog', rows, fileName: file.name };
  }

  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    const raw = await parseRawCSV(file);
    if (!raw.length) throw new Error('That file came through empty.');

    const ds = findDealerSocketHeaderRow(raw);
    if (ds) {
      const rows = parseDealerSocketWide(raw, ds.hIdx, ds.variant, file.name);
      if (!rows.length) throw new Error('Detected DealerSocket format but found no data rows.');
      return { kind: 'aggregated', rows, fileName: file.name };
    }

    const aggIdx = findAggHeaderRow(raw);
    if (aggIdx >= 0) {
      const rows = parseAggregated(raw, aggIdx, file.name);
      if (!rows.length) throw new Error('Detected aggregated format but found no data rows.');
      return { kind: 'aggregated', rows, fileName: file.name };
    }

    const rows = rawToRows(raw);
    if (!rows.length) throw new Error('That file came through empty.');
    return { kind: 'desklog', rows, fileName: file.name };
  }

  throw new Error('Unsupported file type. Use CSV, Excel (.xlsx, .xls), or TSV.');
}
