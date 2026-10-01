/**
 * Prix plancher : une vente ne peut pas descendre sous le prix d'achat.
 *
 * La règle vaut pour les deux chemins par lesquels le prix peut baisser à la
 * caisse — la modification du prix unitaire d'une ligne, et la remise appliquée
 * au pied du ticket. Les deux sont contrôlés ici, et la même fonction est
 * appelée côté interface (pour empêcher la saisie) et côté process principal
 * (pour refuser la vente) : l'interface ne peut pas être contournée.
 *
 * Tous les montants sont en centimes.
 */

/** Une ligne telle qu'elle existe au panier, réduite à ce que la règle exige. */
export interface SaleLineForFloor {
  qty: number;
  /** Prix unitaire demandé. */
  unitPrice: number;
  /** Prix d'achat courant de l'article. */
  unitCost: number;
  /** Pour le message d'erreur. */
  label?: string;
}

export interface PriceFloorViolation {
  label: string;
  unitPrice: number;
  unitCost: number;
}

/**
 * Prix unitaire acceptable pour une ligne ?
 *
 * Un article dont le prix d'achat est inconnu (0) n'est pas contraint : on ne
 * dispose d'aucun plancher, et refuser la vente bloquerait la caisse.
 */
export function isUnitPriceAllowed(unitPrice: number, unitCost: number): boolean {
  if (!Number.isFinite(unitPrice) || !Number.isFinite(unitCost)) return false;
  if (unitCost <= 0) return true;
  return unitPrice >= unitCost;
}

/** Lignes dont le prix unitaire passe sous le prix d'achat. */
export function findPriceFloorViolations(lines: SaleLineForFloor[]): PriceFloorViolation[] {
  const violations: PriceFloorViolation[] = [];
  for (const line of lines) {
    if (!isUnitPriceAllowed(line.unitPrice, line.unitCost)) {
      violations.push({
        label: line.label || 'Article',
        unitPrice: line.unitPrice,
        unitCost: line.unitCost
      });
    }
  }
  return violations;
}

/** Coût de revient total du panier. */
export function totalCostOf(lines: SaleLineForFloor[]): number {
  return lines.reduce((sum, l) => sum + Math.max(0, l.unitCost) * Math.max(0, l.qty), 0);
}

/** Sous-total du panier. */
export function subtotalOf(lines: SaleLineForFloor[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * Math.max(0, l.qty), 0);
}

/**
 * Remise maximale qui laisse le ticket au-dessus du coût de revient.
 *
 * Les articles sans prix d'achat connu ne contribuent pas au plancher : la
 * remise reste possible sur eux à hauteur de leur prix de vente.
 */
export function maxDiscountFor(lines: SaleLineForFloor[]): number {
  const marge = subtotalOf(lines) - totalCostOf(lines);
  return Math.max(0, marge);
}

export interface DiscountCheck {
  allowed: boolean;
  /** Remise effectivement applicable. */
  maxDiscount: number;
  subtotal: number;
  totalCost: number;
}

/** La remise demandée laisse-t-elle la vente au-dessus du coût de revient ? */
export function checkDiscount(lines: SaleLineForFloor[], discount: number): DiscountCheck {
  const subtotal = subtotalOf(lines);
  const totalCost = totalCostOf(lines);
  const maxDiscount = Math.max(0, subtotal - totalCost);
  return {
    allowed: discount <= maxDiscount,
    maxDiscount,
    subtotal,
    totalCost
  };
}
