/**
 * Currency utilities for Algerian Dinar (DZD)
 * Internal storage is in centimes (integer) to avoid floating point math errors.
 * 1 DA = 100 centimes.
 */

export function centimesToDZD(centimes: number): number {
  return (centimes || 0) / 100;
}

export function dzdToCentimes(dzd: number): number {
  return Math.round((dzd || 0) * 100);
}

export function formatDZD(centimes: number, options?: { showCurrency?: boolean }): string {
  const dzd = centimesToDZD(centimes);
  const formatted = new Intl.NumberFormat('fr-DZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(dzd);

  if (options?.showCurrency === false) {
    return formatted;
  }
  return `${formatted} DA`;
}

export function parseDZDInput(input: string | number): number {
  if (typeof input === 'number') {
    return dzdToCentimes(input);
  }
  const clean = input.replace(/[^\d.,-]/g, '').replace(',', '.');
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return 0;
  return dzdToCentimes(parsed);
}
