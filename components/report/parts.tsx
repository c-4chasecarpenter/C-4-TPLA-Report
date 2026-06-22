'use client';
import { ReportData, Thresholds } from '@/lib/types';
import { fmt$, pct, metricsRow, RowMetrics } from '@/lib/format';

export function LegendTable({ t, sold }: { t: Thresholds; sold: boolean }) {
  const so = (c: string) => (sold ? c : c + ' hidden');
  return (
    <table className="legend">
      <thead><tr><th className="l">Performance tier</th><th>Cost per good lead</th>
        <th className={sold ? '' : 'hidden'}>Closing rate</th><th className={sold ? '' : 'hidden'}>Cost per sold</th></tr></thead>
      <tbody>
        <tr><td className="l"><span className="tier-dot cpa-good" /><b>Good</b></td><td className="cpa-good">Under {fmt$(t.cpl.good)}</td><td className={'cpa-good ' + (sold ? '' : 'hidden')}>Over {t.close.good}%</td><td className={'cpa-good ' + (sold ? '' : 'hidden')}>Under {fmt$(t.cpa.good)}</td></tr>
        <tr><td className="l"><span className="tier-dot cpa-ok" /><b>Medium</b></td><td className="cpa-ok">{fmt$(t.cpl.good)} to {fmt$(t.cpl.bad)}</td><td className={'cpa-ok ' + (sold ? '' : 'hidden')}>{t.close.bad}% to {t.close.good}%</td><td className={'cpa-ok ' + (sold ? '' : 'hidden')}>{fmt$(t.cpa.good)} to {fmt$(t.cpa.bad)}</td></tr>
        <tr><td className="l"><span className="tier-dot cpa-bad" /><b>Bad</b></td><td className="cpa-bad">Over {fmt$(t.cpl.bad)}</td><td className={'cpa-bad ' + (sold ? '' : 'hidden')}>Under {t.close.bad}%</td><td className={'cpa-bad ' + (sold ? '' : 'hidden')}>Over {fmt$(t.cpa.bad)}</td></tr>
      </tbody>
    </table>
  );
}

export function Kpi({ label, val, foot, cls, sold }: { label: string; val: string; foot: string; cls?: string; sold?: boolean }) {
  return (
    <div className={'kpi' + (sold ? ' hidden' : '')}>
      <div className="k-label">{label}</div>
      <div className={'k-val ' + (cls ? 'cpa-' + cls : '')}>{val}</div>
      <div className="k-foot">{foot}</div>
    </div>
  );
}

export function Tiles({ spend, good, sold, t, showSold }: { spend: number; good: number; sold: number; t: Thresholds; showSold: boolean }) {
  const r = metricsRow(spend, good, sold, t);
  const cls = (c: string) => 't-val ' + c;
  return (
    <div className="tiles">
      <div className="tile"><div className="t-lab">Period spend</div><div className="t-val">{fmt$(spend)}</div></div>
      <div className="tile"><div className="t-lab">Good leads</div><div className="t-val">{good.toLocaleString()}</div></div>
      <div className="tile"><div className="t-lab">Cost / good lead</div><div className={cls(r.cplCls && 'cpa-' + r.cplCls)}>{r.cpl === null ? '\u2014' : fmt$(r.cpl, 2)}</div></div>
      {showSold && <>
        <div className="tile"><div className="t-lab">Vehicles sold</div><div className="t-val">{sold.toLocaleString()}</div></div>
        <div className="tile"><div className="t-lab">Cost / sold</div><div className={cls(r.cpaCls && 'cpa-' + r.cpaCls)}>{r.cpa === null ? '\u2014' : fmt$(r.cpa)}</div></div>
        <div className="tile"><div className="t-lab">Closing rate</div><div className={cls(r.closeCls && 'cpa-' + r.closeCls)}>{r.close === null ? '\u2014' : pct(r.close)}</div></div>
      </>}
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

export function MonthlyTable({ d, monthlySpend, bm, showSold }: { d: ReportData; monthlySpend: number; bm: ReportData['comb']['bm']; showSold: boolean }) {
  let bestKey: string | null = null, best = Infinity;
  d.mkeys.forEach((k) => { const b = bm[k]; if (b.good > 0) { const c = monthlySpend / b.good; if (c < best) { best = c; bestKey = k; } } });
  const tg = d.mkeys.reduce((s, k) => s + bm[k].good, 0);
  const ts = d.mkeys.reduce((s, k) => s + bm[k].sold, 0);
  const psp = monthlySpend * d.months;
  const tr = metricsRow(psp, tg, ts, d.t);
  const H = (c: string) => (showSold ? c : c + ' hidden');
  return (
    <table className="mtab">
      <thead><tr><th className="l">Month</th><th>Spend</th><th>Good leads</th>
        <th className={showSold ? '' : 'hidden'}>Sold</th><th>Cost / good lead</th>
        <th className={showSold ? '' : 'hidden'}>Cost / sold</th><th className={showSold ? '' : 'hidden'}>Closing rate</th></tr></thead>
      <tbody>
        {d.mkeys.map((k, i) => {
          const b = bm[k]; const r = metricsRow(monthlySpend, b.good, b.sold, d.t); const isBest = k === bestKey;
          return (
            <tr key={k}>
              <td className="l">{d.mlabels[i]}</td><td>{fmt$(monthlySpend)}</td><td>{b.good.toLocaleString()}</td>
              <td className={showSold ? '' : 'hidden'}>{b.sold.toLocaleString()}</td>
              <td className={(r.cplCls && 'cpa-' + r.cplCls) + (isBest ? ' best' : '')}>{r.cpl === null ? '\u2014' : fmt$(r.cpl, 2)}{isBest && <span className="mk">best</span>}</td>
              <td className={H(r.cpaCls && 'cpa-' + r.cpaCls)}>{r.cpa === null ? '\u2014' : fmt$(r.cpa)}</td>
              <td className={H(r.closeCls && 'cpa-' + r.closeCls)}>{r.close === null ? '\u2014' : pct(r.close)}</td>
            </tr>
          );
        })}
        <tr className="tot-row">
          <td className="l">Period total</td><td>{fmt$(psp)}</td><td>{tg.toLocaleString()}</td>
          <td className={showSold ? '' : 'hidden'}>{ts.toLocaleString()}</td>
          <td className={tr.cplCls && 'cpa-' + tr.cplCls}>{tr.cpl === null ? '\u2014' : fmt$(tr.cpl, 2)}</td>
          <td className={H(tr.cpaCls && 'cpa-' + tr.cpaCls)}>{tr.cpa === null ? '\u2014' : fmt$(tr.cpa)}</td>
          <td className={H(tr.closeCls && 'cpa-' + tr.closeCls)}>{tr.close === null ? '\u2014' : pct(tr.close)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function Chart({ d, bm, showSold }: { d: ReportData; bm: ReportData['comb']['bm']; showSold: boolean }) {
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
                {showSold && <>
                  <rect x={cx + 2} y={y(sv)} width={bw} height={H - padB - y(sv)} rx={3} fill="#FD5900" />
                  <text x={cx + bw / 2 + 2} y={y(sv) - 6} textAnchor="middle" fontSize="10" fill="#FD5900" fontFamily="Hanken Grotesk, Helvetica Neue, Arial, sans-serif" fontWeight="700">{sv}</text>
                </>}
                <text x={cx} y={H - padB + 18} textAnchor="middle" fontSize="11" fill="#8E8382" fontFamily="Hanken Grotesk, Helvetica Neue, Arial, sans-serif">{d.mlabels[i]}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="chart-legend">
        <span><span className="lswatch" style={{ background: '#131010' }} />Good leads</span>
        {showSold && <span><span className="lswatch" style={{ background: 'var(--orange)' }} />Vehicles sold</span>}
      </div>
    </>
  );
}
