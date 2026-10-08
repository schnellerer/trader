/** Vereinfachte deutsche Abgeltungsteuer auf Kursgewinne (nur zur Orientierung, keine Steuerberatung) */
export const ALLOWANCE = 1000; // Sparerpauschbetrag pro Person und Jahr (seit 2023)

export type ChurchTax = 0 | 0.08 | 0.09;

/** Gesamtsteuersatz: 25 % + 5,5 % Soli (+ ggf. Kirchensteuer, die die Steuer selbst mindert) */
export function taxRate(church: ChurchTax = 0): number {
  const base = 0.25 / (1 + 0.25 * church);
  return base * (1 + 0.055 + church);
}

export function netAfterTax(gain: number, church: ChurchTax = 0, allowance = ALLOWANCE) {
  const taxable = Math.max(0, gain - allowance);
  const tax = taxable * taxRate(church);
  return { gain, taxable, tax, net: gain - tax, rate: taxRate(church) };
}
