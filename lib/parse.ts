import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { Row, AggregatedRow, ParseResult } from './types';
import { resolveGrossIdx, parseMoney } from './gross';
import { parseAggregatedGrid, detectHeaderless, headerlessToRows, inferMonth } from './detect';

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

  const grossIdx = resolveGrossIdx(headers);
  const month = inferMonth(fileName);
  // Accumulate because the same tracking code appears once per Source category row
  const acc = new Map<string, { good: number; sold: number; gross: number }>();

  for (const row of data.slice(hIdx + 1)) {
    const src = (row[srcIdx] ?? '').trim();
    if (!src) continue;
    const leads = parseInt(row[leadIdx] ?? '') || 0;
    const sold  = parseInt(row[soldIdx]  ?? '') || 0;
    const gross = grossIdx.reduce((g, i) => g + parseMoney(row[i]), 0);
    if (leads + sold === 0 && gross === 0) continue;
    const prev = acc.get(src) ?? { good: 0, sold: 0, gross: 0 };
    prev.good += leads;
    prev.sold += sold;
    prev.gross += gross;
    acc.set(src, prev);
  }

  return Array.from(acc.entries()).map(([source, { good, sold, gross }]) => ({
    source, good, sold, gross, bad: 0, dup: 0, month,
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

  const grossIdx = resolveGrossIdx(headers);
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
    const gross = grossIdx.reduce((g, i) => g + parseMoney(row[i]), 0);

    if (good + sold + bad + dup === 0 && gross === 0) continue;
    rows.push({ source: src, good, sold, bad, dup, gross, month });
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

    // Generalized aggregated detection (DealerSocket Group/Opportunities,
    // Cox/VinSolutions flat, etc.) — role-scores columns instead of matching
    // hardcoded vendor signatures.
    const aggRows = parseAggregatedGrid(raw, file.name);
    if (aggRows) return { kind: 'aggregated', rows: aggRows, fileName: file.name };

    // Headerless desk-log (export dropped its header row).
    const headerless = detectHeaderless(raw);
    if (headerless) {
      const rows = headerlessToRows(raw, headerless);
      if (rows.length) return { kind: 'desklog', rows, fileName: file.name };
    }

    const rows = rawToRows(raw);
    if (!rows.length) throw new Error('That file came through empty.');
    return { kind: 'desklog', rows, fileName: file.name };
  }

  throw new Error('Unsupported file type. Use CSV, Excel (.xlsx, .xls), or TSV.');
}
