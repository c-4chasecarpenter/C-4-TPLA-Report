'use client';
import { useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { ReportData, PlatformAgg, Thresholds } from '@/lib/types';
import { fmt$, pct, metricsRow } from '@/lib/format';
import { Tiles, Verdict, MonthlyTable, Chart } from './parts';
import ProjectionSlider from './ProjectionSlider';

// ---- Key takeaways ----
type Takeaway = { type: 'scale' | 'cut' | 'watch' | 'info'; headline: string; detail: string };

function generateTakeaways(d: ReportData, showSold: boolean): Takeaway[] {
  const items: Takeaway[] = [];
  const hasSold = d.data.some(s => s.sold > 0);

  for (const s of d.data) {
    if (s.monthly === 0) continue;
    const ps = s.monthly * d.months;
    const r = metricsRow(ps, s.good, s.sold, d.t);

    if (s.good === 0) {
      items.push({
        type: 'watch',
        headline: `${s.name}: No leads tracked this period`,
        detail: `No leads were recorded from ${s.name}. Verify CRM source mapping or confirm the platform was active during this period.`,
      });
    } else if (showSold && hasSold && s.sold === 0) {
      items.push({
        type: 'watch',
        headline: `${s.name}: Leads with no closed deals`,
        detail: `${s.good.toLocaleString()} leads came in from ${s.name} but zero sold units are logged. Either deals aren't closing or they aren't being tracked back to this source — confirm with the sales manager.`,
      });
    } else if (showSold && r.cpaCls === 'bad') {
      items.push({
        type: 'cut',
        headline: `${s.name}: Spend efficiency is below threshold`,
        detail: `At ${fmt$(r.cpa!)}/sale with a ${pct(r.close)} close rate, this platform is above the red threshold. Recommend potentially reducing budget or renegotiating the contract before the next cycle.`,
      });
    } else if (r.cplCls === 'bad' && (!showSold || !hasSold || r.cpaCls !== 'good')) {
      items.push({
        type: 'watch',
        headline: `${s.name}: Lead cost is high`,
        detail: `Cost per good lead is ${fmt$(r.cpl!, 2)} — above the red threshold. The source is generating activity, but at an inefficient rate. Recommend monitoring closely and potentially reducing spend.`,
      });
    } else if (showSold && r.cpaCls === 'good') {
      items.push({
        type: 'scale',
        headline: `${s.name}: Top performer`,
        detail: `Closing at ${pct(r.close)} with a ${fmt$(r.cpa!)}/sale cost — solidly in the green. Recommend potentially increasing budget or requesting more listing placements.`,
      });
    }
  }

  if (d.unmatchedSources.length > 0) {
    const top = d.unmatchedSources[0];
    items.push({
      type: 'info',
      headline: `${d.unmatchedSources.length} source${d.unmatchedSources.length > 1 ? 's' : ''} in your CRM data have no budget assigned`,
      detail: `Largest untracked source: "${top.source}" with ${top.leads.toLocaleString()} good leads${top.sold > 0 ? ` and ${top.sold} sold units` : ''}. If the dealer is paying for these platforms, add them to get a complete picture.`,
    });
  }

  const cr = metricsRow(d.combPeriodSpend, d.comb.good, d.comb.sold, d.t);
  if (d.data.some(s => s.monthly > 0)) {
    if (showSold && cr.cpaCls === 'good') {
      items.unshift({
        type: 'scale',
        headline: 'Overall: Digital spend is healthy',
        detail: `Blended cost per sale of ${fmt$(cr.cpa!)} across all platforms is in the green at a ${pct(cr.close)} close rate. Total investment of ${fmt$(d.combPeriodSpend)} this period is working.`,
      });
    } else if (showSold && cr.cpaCls === 'bad') {
      items.unshift({
        type: 'cut',
        headline: 'Overall: Blended spend is underperforming',
        detail: `Combined cost per sale of ${fmt$(cr.cpa!)} is above your red threshold. Recommend potentially shifting budget away from the weakest platforms and concentrating spend on the top performers.`,
      });
    }
  }

  return items;
}

function generatePlatformTakeaways(s: PlatformAgg, d: ReportData, showSold: boolean): Takeaway[] {
  const items: Takeaway[] = [];
  const hasSold = d.data.some(src => src.sold > 0);
  const ps = s.monthly * d.months;
  const r = metricsRow(ps, s.good, s.sold, d.t);

  if (s.monthly === 0) {
    items.push({
      type: 'info',
      headline: 'No budget configured',
      detail: `No monthly spend has been entered for ${s.name}. Add a monthly spend amount to enable cost-per-lead and cost-per-sale analysis.`,
    });
    return items;
  }

  if (s.good === 0) {
    items.push({
      type: 'watch',
      headline: 'No leads tracked this period',
      detail: `No good leads were recorded from ${s.name}. Verify the CRM source name mapping or confirm this platform was active during the reporting period.`,
    });
    return items;
  }

  if (r.cplCls === 'good') {
    items.push({
      type: 'scale',
      headline: 'Strong cost per good lead',
      detail: `${s.name} is delivering leads at ${fmt$(r.cpl!, 2)}/lead — well within the green threshold.`,
    });
  } else if (r.cplCls === 'bad') {
    items.push({
      type: 'watch',
      headline: 'High cost per good lead',
      detail: `Cost per good lead is ${fmt$(r.cpl!, 2)} — above the red threshold. The platform is generating activity but at an inefficient rate. Monitor closely.`,
    });
  } else if (r.cplCls === 'ok') {
    items.push({
      type: 'watch',
      headline: 'Cost per lead in the middle range',
      detail: `At ${fmt$(r.cpl!, 2)}/lead, ${s.name} is in the amber zone. Recommend monitoring and comparing against other platforms to see if budget could be better allocated.`,
    });
  }

  if (showSold) {
    if (s.sold === 0 && hasSold) {
      items.push({
        type: 'watch',
        headline: 'Leads with no closed deals',
        detail: `${s.good.toLocaleString()} leads came in from ${s.name} but zero sold units are logged. Either deals aren't closing from this source, or they aren't being tracked correctly in the CRM — confirm with the sales manager.`,
      });
    } else if (s.sold > 0) {
      if (r.cpaCls === 'good') {
        items.push({
          type: 'scale',
          headline: 'Top performer',
          detail: `Closing at ${pct(r.close)} with a cost of ${fmt$(r.cpa!)}/sale — solidly in the green. Recommend potentially increasing budget or requesting more listing placements from this vendor.`,
        });
      } else if (r.cpaCls === 'bad') {
        items.push({
          type: 'cut',
          headline: 'Spend efficiency is below threshold',
          detail: `At ${fmt$(r.cpa!)}/sale with a ${pct(r.close)} close rate, this platform is above the red threshold. Recommend potentially reducing budget or renegotiating the contract before the next cycle.`,
        });
      } else if (r.cpaCls === 'ok') {
        items.push({
          type: 'watch',
          headline: 'Performing in the middle range',
          detail: `Cost per sale of ${fmt$(r.cpa!)} is in the amber zone with a ${pct(r.close)} close rate. Recommend monitoring and looking for ways to improve lead nurturing to push this platform into the green.`,
        });
      }
    }
  }

  return items;
}

// ---- Platform horizontal bar charts ----
function PlatformBars({ d, showSold }: { d: ReportData; showSold: boolean }) {
  const t = d.t;
  const hasSoldData = showSold && d.data.some(s => s.sold > 0);

  const leadData = [...d.data].filter(s => s.good > 0).sort((a, b) => b.good - a.good);
  const maxLeads = Math.max(...leadData.map(s => s.good), 1);

  const cplData = d.data
    .filter(s => s.good > 0 && s.monthly > 0)
    .map(s => {
      const ps = s.monthly * d.months;
      const r = metricsRow(ps, s.good, s.sold, t);
      return { name: s.name, val: r.cpl!, cls: r.cplCls };
    })
    .sort((a, b) => a.val - b.val);
  const maxCPL = Math.max(...cplData.map(s => s.val), 1);

  const cpaData = hasSoldData
    ? d.data
        .filter(s => s.sold > 0 && s.monthly > 0)
        .map(s => {
          const ps = s.monthly * d.months;
          const r = metricsRow(ps, s.good, s.sold, t);
          return { name: s.name, val: r.cpa!, cls: r.cpaCls };
        })
        .sort((a, b) => a.val - b.val)
    : [];
  const maxCPA = cpaData.length ? Math.max(...cpaData.map(s => s.val), 1) : 1;

  const colCount = [leadData.length > 0, cplData.length > 0, hasSoldData && cpaData.length > 0].filter(Boolean).length;

  if (!colCount) return null;

  return (
    <div className="card card-pad">
      <div className={`pbars-grid pbars-col-${colCount}`}>
        {leadData.length > 0 && (
          <div className="pbar-group">
            <div className="pbar-gtitle">Good leads by platform</div>
            {leadData.map(s => (
              <div key={s.name} className="pbar-row">
                <div className="pbar-name">{s.name}</div>
                <div className="pbar-track">
                  <div className="pbar-fill pbar-neutral" style={{ width: `${(s.good / maxLeads) * 100}%` }} />
                </div>
                <div className="pbar-num">{s.good.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}

        {cplData.length > 0 && (
          <div className="pbar-group">
            <div className="pbar-gtitle">Cost per good lead <span className="pbar-hint">sorted best first</span></div>
            {cplData.map(s => (
              <div key={s.name} className="pbar-row">
                <div className="pbar-name">{s.name}</div>
                <div className="pbar-track">
                  <div className={`pbar-fill pbar-${s.cls || 'neutral'}`} style={{ width: `${(s.val / maxCPL) * 100}%` }} />
                </div>
                <div className={`pbar-num${s.cls ? ' cpa-' + s.cls : ''}`}>{fmt$(s.val, 2)}</div>
              </div>
            ))}
          </div>
        )}

        {hasSoldData && cpaData.length > 0 && (
          <div className="pbar-group">
            <div className="pbar-gtitle">Cost per sold unit <span className="pbar-hint">sorted best first</span></div>
            {cpaData.map(s => (
              <div key={s.name} className="pbar-row">
                <div className="pbar-name">{s.name}</div>
                <div className="pbar-track">
                  <div className={`pbar-fill pbar-${s.cls || 'neutral'}`} style={{ width: `${(s.val / maxCPA) * 100}%` }} />
                </div>
                <div className={`pbar-num${s.cls ? ' cpa-' + s.cls : ''}`}>{fmt$(s.val)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Shared takeaway card renderer ----
function TakeawayCards({ takeaways }: { takeaways: Takeaway[] }) {
  return (
    <div className="takeaways-grid">
      {takeaways.map((tw, i) => (
        <div key={i} className={`takeaway-item tway-${tw.type}`}>
          <span className="tway-badge">{tw.type === 'scale' ? 'Scale' : tw.type === 'cut' ? 'Reduce' : tw.type === 'watch' ? 'Watch' : 'Note'}</span>
          <div className="tway-headline">{tw.headline}</div>
          <div className="tway-detail">{tw.detail}</div>
        </div>
      ))}
    </div>
  );
}

// ---- All Data Sources table (editable spend) ----
function AllDataSourcesTable({ sources, t, showSold }: {
  sources: ReportData['unmatchedSources'];
  t: ReportData['t'];
  showSold: boolean;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'spend' | 'sold'>('all');
  const [spendMap, setSpendMap] = useState<Record<string, number>>({});

  const H = (c: string) => (showSold ? c : c + ' hidden');

  const filtered = sources
    .filter(s => !search || s.source.toLowerCase().includes(search.toLowerCase()))
    .filter(s => {
      if (filter === 'spend') return (spendMap[s.source] ?? 0) > 0;
      if (filter === 'sold') return s.sold > 0;
      return true;
    });

  return (
    <>
      <div className="ads-toolbar">
        <input
          type="text"
          className="ads-search"
          placeholder="Search sources…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="ads-filter-chips">
          {(['all', 'spend', 'sold'] as const).map(f => (
            <button key={f} className={'ads-chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'spend' ? 'With spend' : 'Has sales'}
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <table className="cmp">
          <thead>
            <tr>
              <th className="l">Source name (as it appears in CRM)</th>
              <th>Monthly spend</th>
              <th>Good leads</th>
              <th>Cost / good lead</th>
              <th className={showSold ? '' : 'hidden'}>Sold</th>
              <th className={showSold ? '' : 'hidden'}>Cost / sold</th>
              <th className={showSold ? '' : 'hidden'}>Closing rate</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => {
              const spendVal = spendMap[s.source] ?? 0;
              const hasCost = spendVal > 0;
              const r = hasCost ? metricsRow(spendVal, s.leads, s.sold, t) : null;
              const close = s.leads > 0 ? (s.sold / s.leads) * 100 : null;
              const closeCls = close === null ? '' : close > t.close.good ? 'good' : close < t.close.bad ? 'bad' : 'ok';
              return (
                <tr key={s.source} className="unmatched-row">
                  <td className="l">
                    <div className="name-cell">
                      <span className="swatch" />
                      <b>{s.source}</b>
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="spend-cell-input"
                      placeholder="—"
                      min={0}
                      value={spendVal > 0 ? spendVal : ''}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        setSpendMap(prev => ({ ...prev, [s.source]: isNaN(v) ? 0 : v }));
                      }}
                    />
                  </td>
                  <td>{s.leads.toLocaleString()}</td>
                  <td className={r?.cplCls ? 'cpa-' + r.cplCls : 'muted'}>{!r || r.cpl === null ? '—' : fmt$(r.cpl, 2)}</td>
                  <td className={showSold ? '' : 'hidden'}>{s.sold.toLocaleString()}</td>
                  <td className={H(r?.cpaCls ? 'cpa-' + r.cpaCls : 'muted')}>{!r || r.cpa === null ? '—' : fmt$(r.cpa)}</td>
                  <td className={H(closeCls ? 'cpa-' + closeCls : '')}>{close === null ? '—' : pct(close)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="ads-no-results">No sources match</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---- Main report ----
export default function Report({ data: d, onEdit }: { data: ReportData; onEdit: (data: ReportData) => void }) {
  const t = d.t;
  const [tab, setTab] = useState('overview');
  const [showSold, setShowSold] = useState(true);
  const [showDlPrompt, setShowDlPrompt] = useState(false);
  const [dlFilename, setDlFilename] = useState('');
  const [dlMode, setDlMode] = useState<'html' | 'pdf'>('html');
  const [pdfBusy, setPdfBusy] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const cr = metricsRow(d.combPeriodSpend, d.comb.good, d.comb.sold, t);

  let bestCpl: string | null = null, bcpl = Infinity, bestCpa: string | null = null, bcpa = Infinity;
  d.data.forEach(s => {
    const ps = s.monthly * d.months;
    if (s.good > 0) { const c = ps / s.good; if (c < bcpl) { bcpl = c; bestCpl = s.name; } }
    if (s.sold > 0) { const c = ps / s.sold; if (c < bcpa) { bcpa = c; bestCpa = s.name; } }
  });

  const rankedCPL = d.data
    .filter(s => s.good > 0 && s.monthly > 0)
    .map(s => { const r = metricsRow(s.monthly * d.months, s.good, s.sold, t); return { name: s.name, val: r.cpl!, cls: r.cplCls }; })
    .sort((a, b) => a.val - b.val);

  const rankedCPA = d.data
    .filter(s => s.sold > 0 && s.monthly > 0)
    .map(s => { const r = metricsRow(s.monthly * d.months, s.good, s.sold, t); return { name: s.name, val: r.cpa!, cls: r.cpaCls }; })
    .sort((a, b) => a.val - b.val);

  const takeaways = generateTakeaways(d, showSold);

  function startDownload(mode: 'html' | 'pdf') {
    const parts = ['TPLA Report', d.meta.deal, d.meta.timeframe].filter(Boolean);
    setDlFilename(parts.join(' - '));
    setDlMode(mode);
    setShowDlPrompt(true);
  }

  function confirmDownload() {
    if (dlMode === 'pdf') doDownloadPdf();
    else doDownload();
  }

  async function doDownload() {
    if (!reportRef.current) return;
    const clone = reportRef.current.cloneNode(true) as HTMLElement;
    clone.querySelector('.report-controls')?.remove();
    clone.querySelector('.dl-prompt')?.remove();

    // Make the tab navigation work in the standalone file (no React/event handlers
    // survive cloneNode). Index each tab + panel in document order, strip any inline
    // display so CSS controls visibility, then a small injected script wires clicks.
    const tabButtons = Array.from(clone.querySelectorAll<HTMLElement>('.tabs .tab'));
    const panels = Array.from(clone.querySelectorAll<HTMLElement>('.panel'));
    tabButtons.forEach((btn, i) => btn.setAttribute('data-tab-index', String(i)));
    panels.forEach((p, i) => {
      p.setAttribute('data-panel-index', String(i));
      p.style.removeProperty('display');
      // first panel active, rest hidden — script re-applies this on load too
      if (i === 0) p.classList.add('active');
      else p.classList.remove('active');
    });

    // Collect all styles: inline <style> tags + fetch linked CSS files (Next.js uses <link> in production)
    const inlineStyles = Array.from(document.querySelectorAll('style')).map(s => s.textContent ?? '').join('\n');
    const linkedStyles = await Promise.all(
      Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
        .filter(l => !l.href.includes('fonts.googleapis'))
        .map(async l => {
          try { const r = await fetch(l.href); return r.ok ? await r.text() : ''; } catch { return ''; }
        })
    );
    const styles = [inlineStyles, ...linkedStyles].join('\n');

    // Embed C-4 logo as base64 so the file works without a server
    let logoSrc = '/logo-c4.png';
    try {
      const r = await fetch('/logo-c4.png');
      if (r.ok) {
        const blob = await r.blob();
        logoSrc = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onloadend = () => res(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }
    } catch { /* use relative path fallback */ }

    const safeTitle = (dlFilename || 'TPLA Report').replace(/[<>&"]/g, c =>
      c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : '&quot;'
    );
    const mastHtml = `<div class="mast"><img src="${logoSrc}" alt="C-4 Analytics" class="mast-logo" /><div class="mast-text"><div class="mast-eyebrow">C-4 Analytics</div><h1>Third Party Lead Source Report</h1></div></div>`;

    const html = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `<title>${safeTitle}</title>`,
      '<link rel="preconnect" href="https://fonts.googleapis.com">',
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      '<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500&display=swap" rel="stylesheet">',
      '<style>',
      styles,
      // Keep the tab bar visible & interactive; only hide the editor controls.
      // The sticky tab bar stays put when not printing. Panel show/hide is left to
      // the original .panel / .panel.active rules so the injected script can toggle.
      '.report-controls,.dl-prompt{display:none!important;}',
      '.tabs{position:static;cursor:default;}',
      '.tab{cursor:pointer;}',
      'body{background:var(--paper);}',
      // When printing, expand every panel and start each tab on its own page.
      '@media print{.tabs{display:none!important;}.panel{display:block!important;}.panel+.panel{break-before:page;page-break-before:always;}.card,.proj,.takeaway-item,.rank-card,.kpi,table{break-inside:avoid;page-break-inside:avoid;}}',
      '</style>',
      '</head>',
      '<body>',
      '<div class="wrap">',
      mastHtml,
      clone.outerHTML,
      '</div>',
      // Vanilla tab switching for the standalone file.
      '<script>',
      '(function(){',
      "var tabs=[].slice.call(document.querySelectorAll('.tabs .tab'));",
      "var panels=[].slice.call(document.querySelectorAll('[data-panel-index]'));",
      'function show(i){i=String(i);',
      "tabs.forEach(function(t){t.classList.toggle('active',t.getAttribute('data-tab-index')===i);});",
      "panels.forEach(function(p){p.classList.toggle('active',p.getAttribute('data-panel-index')===i);});",
      '}',
      "tabs.forEach(function(t){t.addEventListener('click',function(){show(t.getAttribute('data-tab-index'));});});",
      'show(0);',
      '})();',
      '</script>',
      '</body>',
      '</html>',
    ].join('\n');
    const safe = (dlFilename || 'TPLA-Report').replace(/[^a-z0-9\-_ .]/gi, '_');
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowDlPrompt(false);
  }

  // Save as PDF: render the full report (all panels expanded, one tab per page)
  // straight to a downloaded PDF — no browser print dialog.
  async function doDownloadPdf() {
    if (!reportRef.current || pdfBusy) return;
    setPdfBusy(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default as any;

      const clone = reportRef.current.cloneNode(true) as HTMLElement;
      clone.querySelector('.report-controls')?.remove();
      clone.querySelector('.dl-prompt')?.remove();
      clone.querySelector('.tabs')?.remove();

      // Expand every panel; start each tab (after the first) on a new page.
      const panels = Array.from(clone.querySelectorAll<HTMLElement>('.panel'));
      panels.forEach((p, i) => {
        p.classList.add('active');
        p.style.display = 'block';
        if (i > 0) p.classList.add('pdf-break');
      });

      // Flatten the two-column layout: html2canvas renders screen media, so the
      // sticky/overflow rail would clip. Stack data then rail full-width per tab.
      clone.querySelectorAll<HTMLElement>('.panel-body').forEach(b => { b.style.display = 'block'; });
      clone.querySelectorAll<HTMLElement>('.panel-rail').forEach(r => {
        r.style.position = 'static';
        r.style.width = '100%';
        r.style.maxHeight = 'none';
        r.style.overflow = 'visible';
        r.style.marginTop = '18px';
      });

      // Render container at real coordinates (0,0) so html2canvas captures it —
      // a negative/off-screen left makes html2canvas grab empty space (blank PDF).
      // Tuck it behind the page (z-index:-1) and at the document top so it's not seen.
      const container = document.createElement('div');
      container.className = 'wrap pdf-export';
      container.style.cssText = 'width:1120px;background:#fff;position:absolute;left:0;top:0;z-index:-1;padding:0;pointer-events:none;';
      container.innerHTML =
        '<div class="mast" style="margin-bottom:20px;padding-bottom:16px;">' +
        '<img src="/logo-c4.png" alt="C-4 Analytics" class="mast-logo" />' +
        '<div class="mast-text"><div class="mast-eyebrow">C-4 Analytics</div>' +
        '<h1>Third Party Lead Source Report</h1></div></div>';
      container.appendChild(clone);
      document.body.appendChild(container);

      // Make sure web fonts are loaded and we capture from the top of the document.
      try { await (document as any).fonts?.ready; } catch { /* ignore */ }
      window.scrollTo(0, 0);

      const safe = (dlFilename || 'TPLA-Report').replace(/[^a-z0-9\-_ .]/gi, '_');
      try {
        await html2pdf().set({
          margin: [8, 8, 8, 8],
          filename: `${safe}.pdf`,
          image: { type: 'jpeg', quality: 0.97 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 1120, scrollX: 0, scrollY: 0, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
          pagebreak: { mode: ['css', 'legacy'], before: '.pdf-break' },
        }).from(container).save();
      } finally {
        document.body.removeChild(container);
      }
      setShowDlPrompt(false);
    } finally {
      setPdfBusy(false);
    }
  }

  const H = (c: string) => (showSold ? c : c + ' hidden');

  return (
    <div ref={reportRef} className={showSold ? '' : 'hide-sold'}>

      {/* Controls bar — top, above all data */}
      <div className="report-controls">
        <label className="switch">
          <input type="checkbox" checked={showSold} onChange={e => setShowSold(e.target.checked)} />
          <span className="track" />Show sold data
        </label>
        <button className="btn btn-ghost" onClick={() => startDownload('html')}>Download Report HTML</button>
        <button className="btn btn-ghost" onClick={() => startDownload('pdf')}>Save as PDF</button>
        <button className="btn btn-ghost" onClick={() => onEdit(d)}>Edit inputs</button>
        {session?.user && (
          <span className="user-chip">
            {session.user.email}
            <button onClick={() => signOut()}>Sign out</button>
          </span>
        )}
      </div>

      {/* Download filename prompt — shared by HTML and PDF downloads */}
      {showDlPrompt && (
        <div className="dl-prompt">
          <span className="dl-prompt-label">{dlMode === 'pdf' ? 'PDF file name' : 'HTML file name'}</span>
          <input
            type="text"
            className="dl-filename-input"
            value={dlFilename}
            onChange={e => setDlFilename(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmDownload(); if (e.key === 'Escape') setShowDlPrompt(false); }}
            autoFocus
          />
          <button className="btn btn-primary" onClick={confirmDownload} disabled={pdfBusy}>
            {pdfBusy ? 'Generating…' : dlMode === 'pdf' ? 'Download PDF' : 'Download'}
          </button>
          <button className="btn btn-ghost" onClick={() => setShowDlPrompt(false)}>Cancel</button>
        </div>
      )}

      {/* Report header — title and meta (full width) */}
      <div className="report-header">
        <div className="eyebrow">Third Party Lead Source Report</div>
        <div className="report-title">{d.meta.deal || 'Dealership'}</div>
        <div className="report-meta">
          {d.meta.timeframe ? d.meta.timeframe + ' · ' : ''}
          {d.months} month{d.months > 1 ? 's' : ''} of data · generated {today}
        </div>
        {d.meta.description && <div className="report-desc">{d.meta.description}</div>}
      </div>

      {/* Platform tabs */}
      <div className="tabs">
        <button className={'tab' + (tab === 'overview' ? ' active' : '')} onClick={() => setTab('overview')}>Overview</button>
        {d.data.map((s, i) => {
          const ps = s.monthly * d.months;
          const r = metricsRow(ps, s.good, s.sold, t);
          return (
            <button key={i} className={'tab' + (tab === 'p' + i ? ' active' : '')} onClick={() => setTab('p' + i)}>
              <span className={'dot ' + (r.cpaCls && 'cpa-' + r.cpaCls)} />{s.name}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW ── */}
      <div className={'panel' + (tab === 'overview' ? ' active' : '')}>
        <div className="panel-body">
          <div className="panel-content">

          {/* KPI tiles */}
          <div className="kpis">
            <Kpi label="Tracked spend" val={fmt$(d.combPeriodSpend)} foot={`${d.data.length} platform${d.data.length > 1 ? 's' : ''} · ${d.months}mo`} />
            <Kpi label="Good leads" val={d.comb.good.toLocaleString()} foot={`${d.comb.leads.toLocaleString()} total leads`} />
            <Kpi label="Cost / good lead" val={cr.cpl === null ? '—' : fmt$(cr.cpl, 2)} foot="blended" cls={cr.cplCls} />
            <Kpi label="Vehicles sold" val={d.comb.sold.toLocaleString()} foot="all platforms" sold={!showSold} />
            <Kpi label="Cost / sold" val={cr.cpa === null ? '—' : fmt$(cr.cpa)} foot="blended" cls={cr.cpaCls} sold={!showSold} />
            <Kpi label="Closing rate" val={cr.close === null ? '—' : pct(cr.close)} foot="sold of good leads" cls={cr.closeCls} sold={!showSold} />
          </div>

          {/* Rankings */}
          {(rankedCPL.length > 0 || (showSold && rankedCPA.length > 0)) && (
            <>
              <div className="sec-label"><h3>Rankings</h3><span className="note">All configured platforms ranked by efficiency</span></div>
              <div className="rankings-grid">
                {rankedCPL.length > 0 && (
                  <div className="rank-card card">
                    <div className="rank-card-head">Lowest Cost / Good Lead</div>
                    {rankedCPL.map((item, i) => (
                      <div key={item.name} className="rank-item">
                        <span className={`rank-pos rank-pos-${i < 3 ? i + 1 : 'rest'}`}>{i + 1}</span>
                        <span className="rank-name">{item.name}</span>
                        <span className={`rank-val${item.cls ? ' cpa-' + item.cls : ''}`}>{fmt$(item.val, 2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {showSold && rankedCPA.length > 0 && (
                  <div className="rank-card card">
                    <div className="rank-card-head">Lowest Cost / Sold Unit</div>
                    {rankedCPA.map((item, i) => (
                      <div key={item.name} className="rank-item">
                        <span className={`rank-pos rank-pos-${i < 3 ? i + 1 : 'rest'}`}>{i + 1}</span>
                        <span className="rank-name">{item.name}</span>
                        <span className={`rank-val${item.cls ? ' cpa-' + item.cls : ''}`}>{fmt$(item.val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Platform comparison table */}
          <div className="sec-label"><h3>Platform comparison</h3><span className="note">Click any row to open that platform's detail view</span></div>
          <div className="card">
            <table className="cmp">
              <thead>
                <tr>
                  <th className="l">Platform</th>
                  <th>Spend</th>
                  <th>Good leads</th>
                  <th>Cost / good lead</th>
                  <th className={showSold ? '' : 'hidden'}>Sold</th>
                  <th className={showSold ? '' : 'hidden'}>Cost / sold</th>
                  <th className={showSold ? '' : 'hidden'}>Closing rate</th>
                </tr>
              </thead>
              <tbody>
                {d.data.map((s, i) => {
                  const ps = s.monthly * d.months;
                  const r = metricsRow(ps, s.good, s.sold, t);
                  const winCpl = s.name === bestCpl, winCpa = s.name === bestCpa;
                  return (
                    <tr key={i} className={winCpl ? 'winrow' : ''} onClick={() => setTab('p' + i)}>
                      <td className="l">
                        <div className="name-cell">
                          <span className="swatch" />
                          <b>{s.name}</b>
                          {winCpl && <span className="wintag">best cost / lead</span>}
                          <span className="go">view ›</span>
                        </div>
                      </td>
                      <td>{fmt$(ps)}</td>
                      <td>{s.good.toLocaleString()}</td>
                      <td className={r.cplCls && 'cpa-' + r.cplCls}>{r.cpl === null ? '—' : fmt$(r.cpl, 2)}</td>
                      <td className={showSold ? '' : 'hidden'}>{s.sold.toLocaleString()}</td>
                      <td className={H(r.cpaCls && 'cpa-' + r.cpaCls)}>{r.cpa === null ? '—' : fmt$(r.cpa)}{winCpa && <span className="wintag">best</span>}</td>
                      <td className={H(r.closeCls && 'cpa-' + r.closeCls)}>{r.close === null ? '—' : pct(r.close)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Performance at a glance — bar charts */}
          <div className="sec-label"><h3>Performance at a glance</h3><span className="note">Visual comparison across all configured platforms</span></div>
          <PlatformBars d={d} showSold={showSold} />

          {/* Projection slider */}
          {showSold && (
            <>
              <div className="sec-label"><h3>Cost per sale by closing rate</h3><span className="note">All platforms blended — drag the slider to model different closing rate outcomes</span></div>
              <ProjectionSlider spend={d.combPeriodSpend} good={d.comb.good} sold={d.comb.sold} t={t} />
            </>
          )}

          {/* All Data Sources (unmatched) */}
          {d.unmatchedSources.length > 0 && (
            <div className="unmatched-block">
              <div className="sec-label">
                <h3>All Data Sources</h3>
                <span className="note">Sources in your CRM data — enter monthly spend to calculate cost metrics</span>
              </div>
              <AllDataSourcesTable sources={d.unmatchedSources} t={t} showSold={showSold} />
            </div>
          )}

          {/* Monthly breakdown */}
          <div className="sec-label"><h3>All platforms by month</h3><span className="note">Good leads and sold across every configured platform combined</span></div>
          <div className="card">
            <Chart d={d} bm={d.comb.bm} showSold={showSold} />
            <MonthlyTable d={d} monthlySpend={d.combMonthlySpend} bm={d.comb.bm} showSold={showSold} />
          </div>

          </div>{/* /panel-content */}
          <Rail t={t} showSold={showSold} takeaways={takeaways} note="Data-driven recommendations for the dealership GM" />
        </div>{/* /panel-body */}
      </div>

      {/* ── PER PLATFORM ── */}
      {d.data.map((s, i) => {
        const ptw = generatePlatformTakeaways(s, d, showSold);
        return (
          <div className={'panel' + (tab === 'p' + i ? ' active' : '')} key={i}>
            <div className="panel-body">
              <div className="panel-content">
                <div className="panel-head">
                  <div className="h">{s.name}</div>
                  <div className="spend-tag"><b>{fmt$(s.monthly)}</b> / mo &times; {d.months} = <b>{fmt$(s.monthly * d.months)}</b></div>
                </div>
                {showSold && <Verdict spend={s.monthly * d.months} good={s.good} sold={s.sold} t={t} />}
                <Tiles spend={s.monthly * d.months} good={s.good} sold={s.sold} t={t} showSold={showSold} />
                {showSold && (
                  <>
                    <div className="sec-label"><h3>Cost per sale by closing rate</h3><span className="note">{s.name} — drag the slider to model different closing rate outcomes</span></div>
                    <ProjectionSlider spend={s.monthly * d.months} good={s.good} sold={s.sold} t={t} />
                  </>
                )}
                <div className="sec-label"><h3>By month</h3><span className="note">{s.name} performance across the period</span></div>
                <div className="card">
                  <Chart d={d} bm={s.bm} showSold={showSold} />
                  <MonthlyTable d={d} monthlySpend={s.monthly} bm={s.bm} showSold={showSold} />
                </div>
              </div>{/* /panel-content */}
              <Rail t={t} showSold={showSold} takeaways={ptw} note={`${s.name} analysis`} />
            </div>{/* /panel-body */}
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, val, foot, cls, sold }: { label: string; val: string; foot: string; cls?: string; sold?: boolean }) {
  return (
    <div className={'kpi' + (sold ? ' hidden' : '')}>
      <div className="k-label">{label}</div>
      <div className={'k-val ' + (cls ? 'cpa-' + cls : '')}>{val}</div>
      <div className="k-foot">{foot}</div>
    </div>
  );
}

// Compact performance-benchmark key shown top-right of the report header.
function BenchmarkKey({ t, showSold }: { t: Thresholds; showSold: boolean }) {
  return (
    <div className="bench-key">
      <div className="bench-key-title">Performance Benchmarks</div>
      <table>
        <thead>
          <tr>
            <th className="l">Tier</th>
            <th>Cost / lead</th>
            {showSold && <th>Closing</th>}
            {showSold && <th>Cost / sold</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="l"><span className="tier-dot cpa-good" style={{ background: 'var(--cpa-good)' }} />Good</td>
            <td className="cpa-good">Under {fmt$(t.cpl.good)}</td>
            {showSold && <td className="cpa-good">Over {t.close.good}%</td>}
            {showSold && <td className="cpa-good">Under {fmt$(t.cpa.good)}</td>}
          </tr>
          <tr>
            <td className="l"><span className="tier-dot cpa-ok" style={{ background: 'var(--cpa-ok)' }} />Medium</td>
            <td className="cpa-ok">{fmt$(t.cpl.good)}–{fmt$(t.cpl.bad)}</td>
            {showSold && <td className="cpa-ok">{t.close.bad}–{t.close.good}%</td>}
            {showSold && <td className="cpa-ok">{fmt$(t.cpa.good)}–{fmt$(t.cpa.bad)}</td>}
          </tr>
          <tr>
            <td className="l"><span className="tier-dot cpa-bad" style={{ background: 'var(--cpa-bad)' }} />Bad</td>
            <td className="cpa-bad">Over {fmt$(t.cpl.bad)}</td>
            {showSold && <td className="cpa-bad">Under {t.close.bad}%</td>}
            {showSold && <td className="cpa-bad">Over {fmt$(t.cpa.bad)}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Right-side summary rail shown on every tab: benchmarks on top, takeaways below.
function Rail({ t, showSold, takeaways, note }: { t: Thresholds; showSold: boolean; takeaways: Takeaway[]; note: string }) {
  return (
    <aside className="panel-rail">
      <BenchmarkKey t={t} showSold={showSold} />
      {takeaways.length > 0 && (
        <div className="rail-section">
          <div className="rail-title">Key Takeaways</div>
          <div className="rail-note">{note}</div>
          <TakeawayCards takeaways={takeaways} />
        </div>
      )}
    </aside>
  );
}
