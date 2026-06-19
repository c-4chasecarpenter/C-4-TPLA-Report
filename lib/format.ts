import { RatingClass, Thresholds } from './types';

export const fmt$ = (n: number | null, dec = 0): string =>
  '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const pct = (n: number | null): string => (n || 0).toFixed(1) + '%';

// lower is better (cost metrics)
export function loBetter(v: number | null, g: number, b: number): RatingClass {
  if (v === null || v === undefined || isNaN(v)) return '';
  if (v < g) return 'good';
  if (v <= b) return 'ok';
  return 'bad';
}

// higher is better (closing rate)
export function hiBetter(v: number | null, g: number, b: number): RatingClass {
  if (v === null || v === undefined || isNaN(v)) return '';
  if (v > g) return 'good';
  if (v < b) return 'bad';
  return 'ok';
}

export interface RowMetrics {
  spend: number; good: number; sold: number;
  cpl: number | null; cpa: number | null; close: number | null;
  cplCls: RatingClass; cpaCls: RatingClass; closeCls: RatingClass;
}

export function metricsRow(spend: number, good: number, sold: number, t: Thresholds): RowMetrics {
  const cpl = good > 0 ? spend / good : null;
  const cpa = sold > 0 ? spend / sold : null;
  const close = good > 0 ? (sold / good) * 100 : null;
  return {
    spend, good, sold, cpl, cpa, close,
    cplCls: loBetter(cpl, t.cpl.good, t.cpl.bad),
    cpaCls: loBetter(cpa, t.cpa.good, t.cpa.bad),
    closeCls: hiBetter(close, t.close.good, t.close.bad),
  };
}

// Map a rating class to the report's color hexes (used by UI and slides builder).
export const RATING_HEX: Record<string, { fg: string; bg: string }> = {
  good: { fg: '#1F7A4D', bg: '#E7F2EC' },
  ok:   { fg: '#B7791F', bg: '#FBF1DE' },
  bad:  { fg: '#B23A48', bg: '#F7E8EA' },
  '':   { fg: '#16181D', bg: '#FFFFFF' },
};
