// html2pdf.js ships no type definitions; declare the module so TS is satisfied.
// We only use it via a small chained API (set/from/save), so `any` is sufficient.
declare module 'html2pdf.js';
