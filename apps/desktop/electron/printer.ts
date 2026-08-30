import { Sale, StoreSettings, Store, formatDZD } from '@gestion-veloo/shared';

export interface ThermalReceiptData {
  sale: Sale;
  store: Store;
  settings: StoreSettings;
  cashierName: string;
}

export function formatThermalReceiptText(data: ThermalReceiptData): string {
  const { sale, store, settings, cashierName } = data;
  const divider = '------------------------------------------------';
  const doubleDivider = '================================================';

  const lines: string[] = [];

  // Header (Centered)
  lines.push(`               ${settings.storeName || store.name}               `);
  if (settings.address || store.address) {
    lines.push(`        ${settings.address || store.address}        `);
  }
  if (settings.phone || store.phone) {
    lines.push(`            Tél : ${settings.phone || store.phone}            `);
  }
  if (settings.nif) {
    lines.push(`NIF : ${settings.nif}  |  NIS : ${settings.nis || '-'}`);
    lines.push(`RC : ${settings.rc || '-'}  |  AI : ${settings.articleImposition || '-'}`);
  }
  lines.push(doubleDivider);

  // Ticket Meta
  const dateStr = new Date(sale.createdAt).toLocaleString('fr-DZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  lines.push(`Ticket N° : #${sale.id.toString().padStart(6, '0')}          Date: ${dateStr}`);
  lines.push(`Caissier  : ${cashierName}`);
  if (sale.client) {
    lines.push(`Client    : ${sale.client.name} ${sale.client.isFidele ? '(Fidèle)' : ''}`);
  }
  lines.push(divider);

  // Column Header
  lines.push(`Article                      Qté   P.U (DA)   Total (DA)`);
  lines.push(divider);

  // Line items
  if (sale.items) {
    for (const it of sale.items) {
      const name = (it.product?.name || `Art #${it.productId}`).slice(0, 24).padEnd(25, ' ');
      const qty = it.qty.toString().padStart(4, ' ');
      const pu = (it.unitPrice / 100).toFixed(2).padStart(10, ' ');
      const tot = (it.lineTotal / 100).toFixed(2).padStart(11, ' ');
      lines.push(`${name} ${qty} ${pu} ${tot}`);
    }
  }

  lines.push(divider);

  // Totals
  const subtotalStr = formatDZD(sale.subtotal).padStart(15, ' ');
  lines.push(`Sous-total : ${subtotalStr}`);

  if (sale.discount && sale.discount > 0) {
    lines.push(`Remise     : -${formatDZD(sale.discount).padStart(14, ' ')}`);
  }

  const totalStr = formatDZD(sale.total).padStart(15, ' ');
  lines.push(`TOTAL NET  : ${totalStr}`);

  lines.push(divider);
  lines.push(`Mode Règlement : ${sale.paymentType.toUpperCase()}`);
  lines.push(`Montant Versé  : ${formatDZD(sale.amountPaid).padStart(15, ' ')}`);
  if (sale.amountCredit > 0) {
    lines.push(`Reste à Crédit : ${formatDZD(sale.amountCredit).padStart(15, ' ')}`);
  }

  lines.push(doubleDivider);
  lines.push(`      ${settings.receiptFooter || 'Merci de votre visite et à bientôt !'}      `);
  lines.push(`          Système Multi-Boutique Cycles & Motos          \n\n\n`);

  return lines.join('\n');
}
