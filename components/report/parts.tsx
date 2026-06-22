'use client';
import { ReactNode } from 'react';
import { ReportData, Thresholds } from '@/lib/types';
import { fmt$, pct, metricsRow, roas, fmtMult, fmtSigned$, profitCls } from '@/lib/format';

// Sold / gross visibility is driven entirely by root classes (.hide-sold,
// .hide-gross) on stable marker classes (.sold-col/.sold-only, .gross-col/
// .gross-only). The ×↔$ profit switch is driven by .show-dollars. This keeps
// every toggle a single class flip, so they also work in the downloaded HTML.

// Two header cells (Gross + Return/Profit) — always rendered, hidden via CSS.
export function GrossThs() {
  return (<><th className="gross-col">Gross</th><th className="gross-col">Return / Profit</th></>);
}

// Matching body cells. The profit cell carries both representations.
export function GrossTds({ gross, spend }: { gross: number; spend: number }) {
  const r = roas(gross, spend);
  const net = gross - spend;
  const pc = profitCls(gross, spend);
  return (
    <>
      <td className="gross-col">{fmt$(gross)}</td>
      <td className={'gross-col' + (pc ? ' cpa-' + pc : '')}>
        <span className="profit-roas">{fmtMult(r)}</span>
        <span className="profit-dollars">{fmtSigned$(net)}</span>
      </td>
    </>
  );
}

export function Kpi({ label, val, foot, cls, only }: { label: string; val: ReactNode; foot: string; cls?: string; only?: 'sold' | 'gross' }) {
  return (
    <div className={'kpi' + (only ? ' ' + only + '-only' : '')}>
      <div className="k-label">{label}</div>
      <div className={'k-val ' + (cls ? 'cpa-' + cls : '')}>{val}</div>
      <div className="k-foot">{foot}</div>
    </div>
  );
}

// A KPI value that shows return-on-spend or net profit per the .show-dollars toggle.
export function ProfitKpiVal({ gross, spend }: { gross: number; spend: number }) {
  return (
    <>
      <span className="profit-roas">{fmtMult(roas(gross, spend))}</span>
      <span className="profit-dollars">{fmtSigned$(gross - spend)}</span>
    </>
  );
}

export function Tiles({ spend, good, sold, gross, t }: { spend: number; good: number; sold: number; gross: number; t: Thresholds }) {
  const r = metricsRow(spend, good, sold, t);
  const cls = (c: string) => 't-val ' + c;
  return (
    <div className="tiles">
      <div className="tile"><div className="t-lab">Period spend</div><div className="t-val">{fmt$(spend)}</div></div>
      <div className="tile"><div className="t-lab">Good leads</div><div className="t-val">{good.toLocaleString()}</div></div>
      <div className="tile"><div className="t-lab">Cost / good lead</div><div className={cls(r.cplCls && 'cpa-' + r.cplCls)}>{r.cpl === null ? '—' : fmt$(r.cpl, 2)}</div></div>
      <div className="tile sold-only"><div className="t-lab">Vehicles sold</div><div className="t-val">{sold.toLocaleString()}</div></div>
      <div className="tile sold-only"><div className="t-lab">Cost / sold</div><div className={cls(r.cpaCls && 'cpa-' + r.cpaCls)}>{r.cpa === null ? '—' : fmt$(r.cpa)}</div></div>
      <div className="tile sold-only"><div className="t-lab">Closing rate</div><div className={cls(r.closeCls && 'cpa-' + r.closeCls)}>{r.close === null ? '—' : pct(r.close)}</div></div>
      <div className="tile gross-only"><div className="t-lab">Gross</div><div className="t-val">{fmt$(gross)}</div></div>
      <div className="tile gross-only"><div className="t-lab">Return / Profit</div><div className={cls(profitCls(gross, spend) && 'cpa-' + profitCls(gross, spend))}><span className="profit-roas">{fmtMult(roas(gross, spend))}</span><span className="profit-dollars">{fmtSigned$(gross - spend)}</span></div></div>
    </div>
  );
}

export function Verdict({ spend, good, sold, t }: { spend: number; good: number; sold: number; t: Thresholds }) {
  const r = metricsRow(spend, good, sold, t);
  if (r.cpa === null) return <div className="verdict v-na"><span className="vd" /><span>No vehicles sold from this platform in the period, so cost per sale cannot be rated yet. Cost per good lead is <b>{r.cpl === null ? 'not available' : fmt$(r.cpl, 2)}</b>.</span></div>;
  const map: Record<string, [string, JSX.Element]> = {
    good: ['v-good', <span key="g"><b>Strong.</b> Cost per sale of <b>{fmt$(r.cpa)}</b> is in the green and closing rate is <b>{pct(r.close)}</b>.</span>],
    ok: ['v-ok', <span key="o"><b>Acceptable.</b> Cost per sale of <b>{fmt$(r.cpa)}</b> sits in the middle band. Closing rate is <b>{pct(r.close)}</b>.</span>],
    bad: ['v-bad', <span key="b"><b>Review this spend.</b> Cost per sale of <b>{fmt$(r.cpa)}</b> is above your red threshold. Closing rate is <b>{pct(r.close)}</b>.</span>],
  };
  const [v, msg] = map[r.cpaCls];
  return <div className={'verdict ' + v}><span className="vd" />{msg}</div>;
}

export function MonthlyTable({ d, monthlySpend, bm }: { d: ReportData; monthlySpend: number; bm: ReportData['comb']['bm'] }) {
  let bestKey: string | null = null, best = Infinity;
  d.mkeys.forEach((k) => { const b = bm[k]; if (b.good > 0) { const c = monthlySpend / b.good; if (c < best) { best = c; bestKey = k; } } });
  const tg = d.mkeys.reduce((s, k) => s + bm[k].good, 0);
  const ts = d.mkeys.reduce((s, k) => s + bm[k].sold, 0);
  const tgr = d.mkeys.reduce((s, k) => s + bm[k].gross, 0);
  const psp = monthlySpend * d.months;
  const tr = metricsRow(psp, tg, ts, d.t);
  return (
    <table className="mtab">
      <thead><tr><th className="l">Month</th><th>Spend</th><th>Good leads</th>
        <th className="sold-col">Sold</th><th>Cost / good lead</th>
        <th className="sold-col">Cost / sold</th><th className="sold-col">Closing rate</th>
        <GrossThs /></tr></thead>
      <tbody>
        {d.mkeys.map((k, i) => {
          const b = bm[k]; const r = metricsRow(monthlySpend, b.good, b.sold, d.t); const isBest = k === bestKey;
          return (
            <tr key={k}>
              <td className="l">{d.mlabels[i]}</td><td>{fmt$(monthlySpend)}</td><td>{b.good.toLocaleString()}</td>
              <td className="sold-col">{b.sold.toLocaleString()}</td>
              <td className={(r.cplCls && 'cpa-' + r.cplCls) + (isBest ? ' best' : '')}>{r.cpl === null ? '—' : fmt$(r.cpl, 2)}{isBest && <span className="mk">best</span>}</td>
              <td className={'sold-col ' + (r.cpaCls && 'cpa-' + r.cpaCls)}>{r.cpa === null ? '—' : fmt$(r.cpa)}</td>
              <td className={'sold-col ' + (r.closeCls && 'cpa-' + r.closeCls)}>{r.close === null ? '—' : pct(r.close)}</td>
              <GrossTds gross={b.gross} spend={monthlySpend} />
            </tr>
          );
        })}
        <tr className="tot-row">
          <td className="l">Period total</td><td>{fmt$(psp)}</td><td>{tg.toLocaleString()}</td>
          <td className="sold-col">{ts.toLocaleString()}</td>
          <td className={tr.cplCls && 'cpa-' + tr.cplCls}>{tr.cpl === null ? '—' : fmt$(tr.cpl, 2)}</td>
          <td className={'sold-col ' + (tr.cpaCls && 'cpa-' + tr.cpaCls)}>{tr.cpa === null ? '—' : fmt$(tr.cpa)}</td>
          <td className={'sold-col ' + (tr.closeCls && 'cpa-' + tr.closeCls)}>{tr.close === null ? '—' : pct(tr.close)}</td>
          <GrossTds gross={tgr} spend={psp} />
        </tr>
      </tbody>
    </table>
  );
}

export function Chart({ d, bm }: { d: ReportData; bm: ReportData['comb']['bm'] }) {
  if (d.mkeys.length < 2 && d.mkeys[0] === 'all') return null;
  const W = 900, H = 230, padL = 24, padR = 16, padT = 22, padB = 40;
  const n = d.mkeys.length, gw = (W - padL - padR) / n;
  const maxV = Math.max(1, ...d.mkeys.map((k) => Math.max(bm[k].good, bm[k].sold)));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / maxV);
  return (
    <>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--line)" />
          {d.mkeys.map((k, i) => {
            const cx = padL + gw * i + gw / 2, bw = Math.min(30, gw * 0.32);
            const gv = bm[k].good, sv = bm[k].sold;
            return (
              <g key={k}>
                <rect x={cx - bw - 2} y={y(gv)} width={bw} height={H - padB - y(gv)} rx={3} fill="#131010" />
                <text x={cx - bw / 2 - 2} y={y(gv) - 6} textAnchor="middle" fontSize="10" fill="#453F3F" fontFamily="Hanken Grotesk, Helvetica Neue, Arial, sans-serif" fontWeight="700">{gv}</text>
                <rect className="sold-only" x={cx + 2} y={y(sv)} width={bw} height={H - padB - y(sv)} rx={3} fill="#FD5900" />
                <text className="sold-only" x={cx + bw / 2 + 2} y={y(sv) - 6} textAnchor="middle" fontSize="10" fill="#FD5900" fontFamily="Hanken Grotesk, Helvetica Neue, Arial, sans-serif" fontWeight="700">{sv}</text>
                <text x={cx} y={H - padB + 18} textAnchor="middle" fontSize="11" fill="#8E8382" fontFamily="Hanken Grotesk, Helvetica Neue, Arial, sans-serif">{d.mlabels[i]}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="chart-legend">
        <span><span className="lswatch" style={{ background: '#131010' }} />Good leads</span>
        <span className="sold-only"><span className="lswatch" style={{ background: 'var(--orange)' }} />Vehicles sold</span>
      </div>
    </>
  );
}
