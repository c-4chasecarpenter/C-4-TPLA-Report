import { google } from 'googleapis';
import { Cell, SlidesPayload, TableBlock, Tile } from './types';
import { RATING_HEX } from './format';

// Slide canvas in points (16:9 default = 720 x 405 pt). API uses EMU: 1pt = 12700 EMU.
const PT = 12700;
const W = 720, H = 405, MARGIN = 36;

const PALETTE = {
  ink: '#16181D', petrol: '#134E5E', petrolDeep: '#0C3A47',
  paper: '#F4F2EC', line: '#E4E1D8', muted: '#6B7280', white: '#FFFFFF',
};

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue: parseInt(h.slice(4, 6), 16) / 255,
  };
}

let _id = 0;
const newId = (p: string) => `${p}_${Date.now().toString(36)}_${_id++}`;

// Accumulates batchUpdate requests as we describe the deck.
class Deck {
  requests: any[] = [];

  addSlide(): string {
    const id = newId('slide');
    this.requests.push({ createSlide: { objectId: id, slideLayoutReference: { predefinedLayout: 'BLANK' } } });
    return id;
  }

  rect(slide: string, x: number, y: number, w: number, h: number, fill: string, opts: { line?: string } = {}) {
    const id = newId('rect');
    this.requests.push({
      createShape: {
        objectId: id, shapeType: 'RECTANGLE',
        elementProperties: {
          pageObjectId: slide,
          size: { width: { magnitude: w * PT, unit: 'EMU' }, height: { magnitude: h * PT, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: x * PT, translateY: y * PT, unit: 'EMU' },
        },
      },
    });
    this.requests.push({ updateShapeProperties: { objectId: id, fields: 'shapeBackgroundFill.solidFill.color,outline.outlineFill.solidFill.color,outline.weight',
      shapeProperties: {
        shapeBackgroundFill: { solidFill: { color: { rgbColor: hexToRgb(fill) } } },
        outline: opts.line
          ? { outlineFill: { solidFill: { color: { rgbColor: hexToRgb(opts.line) } } }, weight: { magnitude: 1 * PT, unit: 'EMU' } }
          : { propertyState: 'NOT_RENDERED' },
      } } });
    return id;
  }

  text(slide: string, x: number, y: number, w: number, h: number, content: string,
       opts: { size?: number; color?: string; bold?: boolean; align?: 'START' | 'CENTER' | 'END' } = {}) {
    const id = newId('txt');
    this.requests.push({
      createShape: {
        objectId: id, shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slide,
          size: { width: { magnitude: w * PT, unit: 'EMU' }, height: { magnitude: h * PT, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: x * PT, translateY: y * PT, unit: 'EMU' },
        },
      },
    });
    this.requests.push({ insertText: { objectId: id, text: content, insertionIndex: 0 } });
    this.requests.push({ updateTextStyle: {
      objectId: id, textRange: { type: 'ALL' },
      style: {
        fontSize: { magnitude: opts.size ?? 12, unit: 'PT' },
        bold: !!opts.bold,
        foregroundColor: { opaqueColor: { rgbColor: hexToRgb(opts.color ?? PALETTE.ink) } },
        fontFamily: 'Arial',
      },
      fields: 'fontSize,bold,foregroundColor,fontFamily',
    } });
    if (opts.align) {
      this.requests.push({ updateParagraphStyle: {
        objectId: id, textRange: { type: 'ALL' },
        style: { alignment: opts.align }, fields: 'alignment',
      } });
    }
    return id;
  }

  table(slide: string, x: number, y: number, w: number, block: TableBlock, showSold: boolean) {
    // filter sold columns if hidden
    const drop = new Set(showSold ? [] : (block.soldCols || []));
    const keep = block.header.map((_, i) => i).filter((i) => !drop.has(i));
    const header = keep.map((i) => block.header[i]);
    const rows = block.rows.map((r) => ({ cells: keep.map((i) => r.cells[i]) }));

    const nCols = header.length;
    const nRows = rows.length + 1;
    const id = newId('tbl');
    this.requests.push({
      createTable: {
        objectId: id, rows: nRows, columns: nCols,
        elementProperties: {
          pageObjectId: slide,
          size: { width: { magnitude: w * PT, unit: 'EMU' }, height: { magnitude: (nRows * 22) * PT, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: x * PT, translateY: y * PT, unit: 'EMU' },
        },
      },
    });
    // header row
    header.forEach((htext, c) => {
      this.cell(id, 0, c, htext, { bg: PALETTE.petrol, fg: PALETTE.white, bold: true, size: 9, align: c === 0 ? 'START' : 'END' });
    });
    // data rows
    rows.forEach((r, ri) => {
      r.cells.forEach((cell, c) => {
        const col = cell.cls ? RATING_HEX[cell.cls] : null;
        this.cell(id, ri + 1, c, cell.text, {
          bg: col && cell.cls ? col.bg : PALETTE.white,
          fg: col && cell.cls ? col.fg : PALETTE.ink,
          bold: !!cell.cls,
          size: 9.5,
          align: c === 0 ? 'START' : 'END',
        });
      });
    });
    return id;
  }

  private cell(tableId: string, r: number, c: number, text: string,
               s: { bg: string; fg: string; bold: boolean; size: number; align: 'START' | 'CENTER' | 'END' }) {
    const loc = { rowIndex: r, columnIndex: c };
    if (text) this.requests.push({ insertText: { objectId: tableId, cellLocation: loc, text, insertionIndex: 0 } });
    this.requests.push({ updateTableCellProperties: {
      objectId: tableId, tableRange: { location: loc, rowSpan: 1, columnSpan: 1 },
      tableCellProperties: { tableCellBackgroundFill: { solidFill: { color: { rgbColor: hexToRgb(s.bg) } } } },
      fields: 'tableCellBackgroundFill.solidFill.color',
    } });
    if (text) {
      this.requests.push({ updateTextStyle: {
        objectId: tableId, cellLocation: loc, textRange: { type: 'ALL' },
        style: { fontSize: { magnitude: s.size, unit: 'PT' }, bold: s.bold,
          foregroundColor: { opaqueColor: { rgbColor: hexToRgb(s.fg) } }, fontFamily: 'Arial' },
        fields: 'fontSize,bold,foregroundColor,fontFamily',
      } });
      this.requests.push({ updateParagraphStyle: {
        objectId: tableId, cellLocation: loc, textRange: { type: 'ALL' },
        style: { alignment: s.align }, fields: 'alignment',
      } });
    }
  }

  tiles(slide: string, x: number, y: number, totalW: number, tiles: Tile[], showSold: boolean) {
    const list = tiles.filter((t) => showSold || !t.soldOnly);
    const n = list.length || 1;
    const gap = 10;
    const tw = (totalW - gap * (n - 1)) / n;
    const th = 66;
    list.forEach((t, i) => {
      const tx = x + i * (tw + gap);
      this.rect(slide, tx, y, tw, th, PALETTE.white, { line: PALETTE.line });
      this.text(slide, tx + 8, y + 8, tw - 16, 14, t.label.toUpperCase(), { size: 7, color: PALETTE.muted, bold: true });
      const fg = t.cls ? RATING_HEX[t.cls].fg : PALETTE.ink;
      this.text(slide, tx + 8, y + 26, tw - 16, 26, t.value, { size: 16, color: fg, bold: true });
    });
  }
}

export function buildRequests(p: SlidesPayload): any[] {
  const d = new Deck();

  // 1. TITLE
  const s1 = d.addSlide();
  d.rect(s1, 0, 0, W, H, PALETTE.petrol);
  d.rect(s1, MARGIN, 150, 60, 5, '#7FD0C4');
  d.text(s1, MARGIN, 168, W - 2 * MARGIN, 50, p.deal, { size: 34, color: PALETTE.white, bold: true });
  d.text(s1, MARGIN, 222, W - 2 * MARGIN, 24, 'Third Party Lead Source Analysis', { size: 18, color: '#CFE0E3' });
  const subBits = [p.timeframe, `${p.months} months of data`, `Generated ${p.generatedDate}`].filter(Boolean);
  d.text(s1, MARGIN, 252, W - 2 * MARGIN, 20, subBits.join('   .   '), { size: 11, color: '#A9C4C9' });

  // 2. PERFORMANCE KEY
  const s2 = d.addSlide();
  d.text(s2, MARGIN, 28, W - 2 * MARGIN, 24, 'Performance key', { size: 20, color: PALETTE.ink, bold: true });
  d.text(s2, MARGIN, 54, W - 2 * MARGIN, 16, 'Every cost per lead, closing rate, and cost per sale figure in this deck is rated against these tiers.', { size: 11, color: PALETTE.muted });
  d.table(s2, MARGIN, 92, W - 2 * MARGIN, p.legend, p.showSold);

  // 3. OVERVIEW
  const s3 = d.addSlide();
  d.text(s3, MARGIN, 24, W - 2 * MARGIN, 24, 'Overview . all third parties', { size: 20, color: PALETTE.ink, bold: true });
  d.tiles(s3, MARGIN, 60, W - 2 * MARGIN, p.kpis, p.showSold);
  d.text(s3, MARGIN, 140, W - 2 * MARGIN, 16, 'Platform comparison', { size: 12, color: PALETTE.ink, bold: true });
  d.table(s3, MARGIN, 162, W - 2 * MARGIN, p.comparison, p.showSold);

  // 4. COMBINED MONTHLY
  const s4 = d.addSlide();
  d.text(s4, MARGIN, 24, W - 2 * MARGIN, 24, 'Month by month . all platforms combined', { size: 20, color: PALETTE.ink, bold: true });
  d.table(s4, MARGIN, 64, W - 2 * MARGIN, p.combinedMonthly, p.showSold);

  // 5+. PER PLATFORM
  for (const pl of p.platforms) {
    const sx = d.addSlide();
    d.text(sx, MARGIN, 24, W - 2 * MARGIN - 200, 24, pl.name, { size: 20, color: PALETTE.ink, bold: true });
    d.text(sx, W - MARGIN - 220, 30, 220, 16, pl.spendLabel, { size: 10, color: PALETTE.muted, align: 'END' });
    let y = 60;
    if (p.showSold && pl.verdict) {
      const col = RATING_HEX[pl.verdict.tier || ''];
      d.rect(sx, MARGIN, y, W - 2 * MARGIN, 30, col.bg);
      d.text(sx, MARGIN + 12, y + 8, W - 2 * MARGIN - 24, 16, pl.verdict.text, { size: 11, color: col.fg, bold: true });
      y += 42;
    }
    d.tiles(sx, MARGIN, y, W - 2 * MARGIN, pl.tiles, p.showSold);
    y += 80;
    if (p.showSold && pl.projection) {
      d.text(sx, MARGIN, y, W - 2 * MARGIN, 16, 'Cost per sale by closing rate', { size: 12, color: PALETTE.ink, bold: true });
      d.table(sx, MARGIN, y + 22, (W - 2 * MARGIN) * 0.6, pl.projection, p.showSold);
    }
  }

  return d.requests;
}

export async function generateDeck(accessToken: string, payload: SlidesPayload): Promise<string> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const slides = google.slides({ version: 'v1', auth });

  const created = await slides.presentations.create({
    requestBody: { title: `${payload.deal} - Third Party Lead Analysis` },
  });
  const presentationId = created.data.presentationId!;
  const defaultSlideId = created.data.slides?.[0]?.objectId;

  const requests = buildRequests(payload);
  // remove the default blank slide the API creates
  if (defaultSlideId) requests.push({ deleteObject: { objectId: defaultSlideId } });

  // Slides batchUpdate handles large request sets; chunk to stay well within limits.
  const CHUNK = 400;
  for (let i = 0; i < requests.length; i += CHUNK) {
    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: requests.slice(i, i + CHUNK) },
    });
  }

  return `https://docs.google.com/presentation/d/${presentationId}/edit`;
}
