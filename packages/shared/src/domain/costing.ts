/**
 * Moteur de calcul du prix d'achat (coût unitaire) — règle métier officielle.
 *
 * Règle validée par le gérant :
 *   - Si le stock restant AVANT la réception de l'achat est < 5 unités,
 *     le NOUVEAU prix d'achat devient dominant (il remplace l'ancien).
 *     Justification : il ne reste presque plus de marchandise à l'ancien coût,
 *     l'ancien prix ne doit donc plus peser dans la valorisation.
 *   - Sinon (stock restant >= 5), le prix retenu est la MÉDIANE
 *     (moyenne de deux valeurs) entre l'ancien prix d'achat et le nouveau.
 *
 * Tous les montants sont en centimes (entiers) pour éviter les erreurs de virgule flottante.
 */

/** Seuil en dessous duquel le nouveau prix d'achat écrase l'ancien. */
export const LOW_STOCK_COST_THRESHOLD = 5;

export type CostStrategy =
  | 'initial'    // aucun coût connu auparavant → on prend le nouveau
  | 'dominant'   // stock avant achat < seuil → le nouveau coût s'impose
  | 'median'     // stock avant achat >= seuil → médiane ancien/nouveau
  | 'unchanged'; // coût entrant invalide → on garde l'ancien

export interface CostResolutionInput {
  /** Quantité en stock AVANT l'application de la ligne d'achat. */
  stockBefore: number;
  /** Prix d'achat unitaire actuellement enregistré sur l'article (centimes). */
  currentCost: number;
  /** Prix d'achat unitaire de la nouvelle réception (centimes). */
  incomingCost: number;
  /** Seuil personnalisable (défaut : 5). */
  threshold?: number;
}

export interface CostResolution {
  /** Nouveau prix d'achat à enregistrer sur l'article (centimes). */
  newCost: number;
  /** Prix d'achat avant recalcul (centimes). */
  previousCost: number;
  strategy: CostStrategy;
  /** Explication lisible, journalisée dans l'audit et l'historique des coûts. */
  reason: string;
}

/**
 * Applique la règle métier et renvoie le nouveau prix d'achat + sa justification.
 * Fonction pure : testable et réutilisable côté desktop, serveur et portail web.
 */
export function resolvePurchaseCost(input: CostResolutionInput): CostResolution {
  const threshold = input.threshold ?? LOW_STOCK_COST_THRESHOLD;
  const stockBefore = Number.isFinite(input.stockBefore) ? Math.trunc(input.stockBefore) : 0;
  const previousCost = Math.max(0, Math.round(input.currentCost || 0));
  const incomingCost = Math.round(input.incomingCost || 0);

  if (incomingCost <= 0) {
    return {
      newCost: previousCost,
      previousCost,
      strategy: 'unchanged',
      reason: 'Prix d\'achat entrant nul ou invalide : ancien coût conservé.'
    };
  }

  if (previousCost <= 0) {
    return {
      newCost: incomingCost,
      previousCost,
      strategy: 'initial',
      reason: 'Aucun prix d\'achat connu : le prix de cette réception devient la référence.'
    };
  }

  if (stockBefore < threshold) {
    return {
      newCost: incomingCost,
      previousCost,
      strategy: 'dominant',
      reason: `Stock avant achat (${stockBefore}) < ${threshold} : le nouveau prix d'achat devient dominant.`
    };
  }

  return {
    newCost: Math.round((previousCost + incomingCost) / 2),
    previousCost,
    strategy: 'median',
    reason: `Stock avant achat (${stockBefore}) >= ${threshold} : médiane entre l'ancien et le nouveau prix d'achat.`
  };
}

export const COST_STRATEGY_LABELS: Record<CostStrategy, string> = {
  initial: 'Prix initial',
  dominant: 'Nouveau prix dominant (stock bas)',
  median: 'Médiane ancien / nouveau',
  unchanged: 'Inchangé'
};
