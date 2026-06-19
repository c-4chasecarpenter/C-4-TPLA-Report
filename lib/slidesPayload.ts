import { ReportData, SlidesPayload, TableBlock, Tile, PlatformSlide, Cell } from './types';
import { fmt$, pct, metricsRow, loBetter } from './format';

export function buildSlidesPayload(d: ReportData, showSold: boolean): SlidesPayload {
  const t = d.t;
  const cr = metricsRow(d.combPeriodSpend, d.comb.good, d.comb.sold, t);

  // legend
  const legend: TableBlock = {
    header: ['Performance tier', 'Cost per good lead', 'Closing rate', 'Cost per sold'],
    soldCols: [2, 3],
    rows: [
      { cells: [{ text: 'Good' }, { text: `Under ${fmt$(t.cpl.good)}`, cls: 'good' }, { text: `Over ${t.close.good}%`, cls: 'good' }, { text: `Under ${fmt$(t.cpa.good)}`, cls: 'good' }] },
      { cells: [{ text: 'Medium' }, { text: `${fmt$(t.cpl.good)} to ${fmt$(t.cpl.bad)}`, cls: 'ok' }, { text: `${t.close.bad}% to ${t.close.good}%`, cls: 'ok' }, { text: `${fmt$(t.cpa.good)} to ${fmt$(t.cpa.bad)}`, cls: 'ok' }] },
      { cells: [{ text: 'Bad' }, { text: `Over ${fmt$(t.cpl.bad)}`, cls: 'bad' }, { text: `Under ${t.close.bad}%`, cls: 'bad' }, { text: `Over ${fmt$(t.cpa.bad)}`, cls: 'bad' }] },
    ],
  };

  // KPIs
  const kpis: Tile[] = [
    { label: 'Tracked spend', value: fmt$(d.combPeriodSpend) },
    { label: 'Good leads', value: d.comb.good.toLocaleString() },
    { label: 'Cost / good lead', value: cr.cpl === null ? '\u2014' : fmt$(cr.cpl, 2), cls: cr.cplCls },
    { label: 'Vehicles sold', value: d.comb.sold.toLocaleString(), soldOnly: true },
    { label: 'Cost / sold', value: cr.cpa === null ? '\u2014' : fmt$(cr.cpa), cls: cr.cpaCls, soldOnly: true },
    { label: 'Closing rate', value: cr.close === null ? '\u2014' : pct(cr.close), cls: cr.closeCls, soldOnly: true },
  ];

  // comparison
  const comparison: TableBlock = {
    header: ['Platform', 'Spend', 'Good leads', 'Cost / good lead', 'Sold', 'Cost / sold', 'Closing rate'],
    soldCols: [4, 5, 6],
    rows: d.data.map((s) => {
      const ps = s.monthly * d.months;
      const r = metricsRow(ps, s.good, s.sold, t);
      const cells: Cell[] = [
        { text: s.name }, { text: fmt$(ps) }, { text: s.good.toLocaleString() },
        { text: r.cpl === null ? '\u2014' : fmt$(r.cpl, 2), cls: r.cplCls },
        { text: s.sold.toLocaleString() },
        { text: r.cpa === null ? '\u2014' : fmt$(r.cpa), cls: r.cpaCls },
        { text: r.close === null ? '\u2014' : pct(r.close), cls: r.closeCls },
      ];
      return { cells };
    }),
  };

  const monthlyBlock = (monthlySpend: number, bm: ReportData['comb']['bm']): TableBlock => ({
    header: ['Month', 'Spend', 'Good leads', 'Sold', 'Cost / good lead', 'Cost / sold', 'Closing rate'],
    soldCols: [3, 5, 6],
    rows: (() => {
      const rows = d.mkeys.map((k, i) => {
        const b = bm[k]; const r = metricsRow(monthlySpend, b.good, b.sold, t);
        return { cells: [
          { text: d.mlabels[i] }, { text: fmt$(monthlySpend) }, { text: b.good.toLocaleString() },
          { text: b.sold.toLocaleString() },
          { text: r.cpl === null ? '\u2014' : fmt$(r.cpl, 2), cls: r.cplCls },
          { text: r.cpa === null ? '\u2014' : fmt$(r.cpa), cls: r.cpaCls },
          { text: r.close === null ? '\u2014' : pct(r.close), cls: r.closeCls },
        ] as Cell[] };
      });
      const tg = d.mkeys.reduce((s, k) => s + bm[k].good, 0);
      const ts = d.mkeys.reduce((s, k) => s + bm[k].sold, 0);
      const psp = monthlySpend * d.months; const r = metricsRow(psp, tg, ts, t);
      rows.push({ cells: [
        { text: 'Period total' }, { text: fmt$(psp) }, { text: tg.toLocaleString() }, { text: ts.toLocaleString() },
        { text: r.cpl === null ? '\u2014' : fmt$(r.cpl, 2), cls: r.cplCls },
        { text: r.cpa === null ? '\u2014' : fmt$(r.cpa), cls: r.cpaCls },
        { text: r.close === null ? '\u2014' : pct(r.close), cls: r.closeCls },
      ] as Cell[] });
      return rows;
    })(),
  });

  // platforms
  const platforms: PlatformSlide[] = d.data.map((s) => {
    const ps = s.monthly * d.months;
    const r = metricsRow(ps, s.good, s.sold, t);
    const tiles: Tile[] = [
      { label: 'Period spend', value: fmt$(ps) },
      { label: 'Good leads', value: s.good.toLocaleString() },
      { label: 'Cost / good lead', value: r.cpl === null ? '\u2014' : fmt$(r.cpl, 2), cls: r.cplCls },
      { label: 'Vehicles sold', value: s.sold.toLocaleString(), soldOnly: true },
      { label: 'Cost / sold', value: r.cpa === null ? '\u2014' : fmt$(r.cpa), cls: r.cpaCls, soldOnly: true },
      { label: 'Closing rate', value: r.close === null ? '\u2014' : pct(r.close), cls: r.closeCls, soldOnly: true },
    ];

    let verdict: PlatformSlide['verdict'] = null;
    if (r.cpa === null) {
      verdict = { tier: '', text: 'No vehicles sold from this platform in the period, so cost per sale cannot be rated yet.' };
    } else if (r.cpaCls === 'good') {
      verdict = { tier: 'good', text: `Strong. Cost per sale of ${fmt$(r.cpa)} is in the green and closing rate is ${pct(r.close)}.` };
    } else if (r.cpaCls === 'ok') {
      verdict = { tier: 'ok', text: `Acceptable. Cost per sale of ${fmt$(r.cpa)} sits in the middle band. Closing rate is ${pct(r.close)}.` };
    } else {
      verdict = { tier: 'bad', text: `Review this spend. Cost per sale of ${fmt$(r.cpa)} is above the red threshold. Closing rate is ${pct(r.close)}.` };
    }

    // projection: Current + benchmark closing rates
    let projection: TableBlock | null = null;
    if (s.good > 0) {
      const curRate = s.sold > 0 ? (s.sold / s.good) * 100 : null;
      const rateSet: { label: string; rate: number }[] = [];
      if (curRate) rateSet.push({ label: `Current (${curRate.toFixed(1)}%)`, rate: curRate });
      [5, 10, 15, 20].forEach((rr) => rateSet.push({ label: `${rr}%`, rate: rr }));
      projection = {
        header: ['Closing rate', 'Projected sales', 'Cost per sale'],
        rows: rateSet.map(({ label, rate }) => {
          const sales = s.good * (rate / 100);
          const cpa = sales > 0 ? ps / sales : null;
          return { cells: [
            { text: label },
            { text: '~' + Math.round(sales).toLocaleString() },
            { text: cpa === null ? '\u2014' : fmt$(cpa), cls: loBetter(cpa, t.cpa.good, t.cpa.bad) },
          ] as Cell[] };
        }),
      };
    }

    return { name: s.name, spendLabel: `${fmt$(s.monthly)}/mo x ${d.months} = ${fmt$(ps)}`, tiles, verdict, projection, monthly: monthlyBlock(s.monthly, s.bm) };
  });

  return {
    deal: d.meta.deal || 'Dealership',
    timeframe: d.meta.timeframe || '',
    description: d.meta.description || '',
    months: d.months,
    generatedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    showSold,
    thresholds: t,
    legend, kpis, comparison,
    combinedMonthly: monthlyBlock(d.combMonthlySpend, d.comb.bm),
    platforms,
  };
}
