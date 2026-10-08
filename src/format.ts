export const fmtNum = (v: number, digits = 2) =>
  isFinite(v) ? v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '–';

export const fmtMoney = (v: number, cur = '€', digits = 2) => `${fmtNum(v, digits)} ${cur}`;

export const fmtPct = (v: number, digits = 1, withSign = true) =>
  isFinite(v) ? `${withSign && v > 0 ? '+' : ''}${fmtNum(v * 100, digits)} %` : '–';

export const currencySymbol = (c?: string) => (c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : c || '');

export const fmtDateTime = (t: number) => {
  const d = new Date(t);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const fmtDate = (t: number) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const timeAgo = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} Tg.`;
};
