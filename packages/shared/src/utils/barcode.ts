/**
 * Barcode and Product Code Utilities
 */

export function formatProductCode(id: number): string {
  return `ART-${id.toString().padStart(5, '0')}`;
}

export function parseProductCode(code: string): number | null {
  const match = code.trim().toUpperCase().match(/^ART-(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Generates an internal Code128 / EAN13 barcode string
 * Format: 200 + 8 digits + 1 checksum digit (or Code128 numeric identifier)
 */
export function generateBarcodeValue(seedNumber?: number): string {
  const rand = seedNumber ? seedNumber.toString().padStart(8, '0') : Math.floor(10000000 + Math.random() * 90000000).toString();
  const base = `200${rand.slice(-8)}`;
  
  // Calculate modulo 10 checksum
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    const digit = parseInt(base[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checksum = (10 - (sum % 10)) % 10;
  return `${base}${checksum}`;
}
