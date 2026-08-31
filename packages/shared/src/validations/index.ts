import { z } from 'zod';
import { COLOR_MODES, PRICE_TIERS, PAYMENT_METHODS, SYSTEM_MODULES } from '../constants';

export const loginSchema = z.object({
  username: z.string().min(1, 'Nom d\'utilisateur requis'),
  password: z.string().min(1, 'Mot de passe requis')
});

export const productCreateSchema = z.object({
  name: z.string().min(1, 'Désignation de la pièce requise'),
  categoryId: z.number().optional().nullable(),
  brandId: z.number().optional().nullable(),
  priceAchat: z.number().min(0, 'Prix d\'achat invalide'),
  priceDetail: z.number().min(0, 'Prix détail invalide'),
  priceSemiGros: z.number().min(0, 'Prix semi-gros invalide'),
  priceGros: z.number().min(0, 'Prix gros invalide'),
  colorMode: z.enum(COLOR_MODES),
  location: z.string().optional().default(''),
  barcodes: z.array(z.string().min(1)).max(5, 'Maximum 5 codes-barres par produit').optional(),
  colorIds: z.array(z.number()).optional(),
  mergeColorIds: z.array(z.number()).optional(), // for merged mode
  compatibleModelIds: z.array(z.number()).optional(),
  initialStock: z.record(z.string(), z.number()).optional() // storeId -> quantity
});
export const createProductSchema = productCreateSchema;

export const purchaseCreateSchema = z.object({
  storeId: z.number().min(1),
  supplierId: z.number().min(1, 'Sélectionnez un fournisseur'),
  userId: z.number().min(1).optional(),
  paymentType: z.enum(PAYMENT_METHODS),
  amountPaid: z.number().min(0),
  items: z.array(z.object({
    productId: z.number().min(1),
    qty: z.number().min(1, 'Quantité minimum 1'),
    unitCost: z.number().min(0)
  })).min(1, 'Ajoutez au moins un article')
});
export const createPurchaseSchema = purchaseCreateSchema;

export const saleCreateSchema = z.object({
  storeId: z.number().min(1),
  clientId: z.number().optional().nullable(),
  userId: z.number().min(1).optional(),
  cashSessionId: z.number().optional().nullable(),
  discount: z.number().min(0).default(0),
  amountPaid: z.number().min(0),
  paymentType: z.enum(PAYMENT_METHODS),
  items: z.array(z.object({
    productId: z.number().min(1),
    productColorId: z.number().optional().nullable(),
    priceTier: z.enum(PRICE_TIERS),
    qty: z.number().min(1),
    unitPrice: z.number().min(0),
    lineTotal: z.number().min(0)
  })).min(1, 'Le panier est vide')
});
export const createSaleSchema = saleCreateSchema;

export const returnCreateSchema = z.object({
  saleId: z.number().min(1),
  storeId: z.number().min(1).optional(),
  userId: z.number().min(1).optional(),
  items: z.array(z.object({
    saleItemId: z.number().min(1),
    qtyReturned: z.number().min(1),
    unitPrice: z.number().min(0),
    lineTotal: z.number().min(0)
  })).min(1, 'Sélectionnez au moins un article à retourner')
});
export const processReturnSchema = returnCreateSchema;

export const clientCreateSchema = z.object({
  name: z.string().min(1, 'Nom du client requis'),
  phone: z.string().default(''),
  address: z.string().default(''),
  isFidele: z.boolean().default(false),
  creditLimit: z.number().min(0).default(0)
});
export const createClientSchema = clientCreateSchema;

export const supplierCreateSchema = z.object({
  name: z.string().min(1, 'Nom du fournisseur requis'),
  phone: z.string().default(''),
  address: z.string().default('')
});
export const createSupplierSchema = supplierCreateSchema;

export const clientVersementSchema = z.object({
  amount: z.number().min(1, 'Montant supérieur à zéro requis'),
  note: z.string().optional()
});

export const supplierVersementSchema = z.object({
  amount: z.number().min(1, 'Montant supérieur à zéro requis'),
  note: z.string().optional()
});

export const versementCreateSchema = z.object({
  partyType: z.enum(['client', 'supplier']),
  partyId: z.number().min(1),
  amount: z.number().min(1, 'Montant supérieur à zéro requis'),
  note: z.string().optional()
});

export const adjustStockSchema = z.object({
  productId: z.number().min(1),
  storeId: z.number().min(1),
  newQuantity: z.number().min(0),
  note: z.string().optional()
});

export const transferStockSchema = z.object({
  fromStoreId: z.number().min(1),
  toStoreId: z.number().min(1),
  productId: z.number().min(1),
  qty: z.number().min(1, 'Quantité minimum 1'),
  userId: z.number().min(1).optional(),
  note: z.string().optional()
});
export const stockTransferSchema = transferStockSchema;

export const userCreateSchema = z.object({
  fullName: z.string().min(1, 'Nom requis'),
  username: z.string().min(1, 'Identifiant requis'),
  password: z.string().min(1, 'Mot de passe requis'),
  storeId: z.union([z.number(), z.string()]).transform(v => Number(v) || null).optional().nullable(),
  role: z.string().default('cashier'),
  permissions: z.array(z.object({
    module: z.string(),
    canView: z.union([z.boolean(), z.number()]).transform(v => Boolean(v)),
    canEdit: z.union([z.boolean(), z.number()]).transform(v => Boolean(v))
  })).optional()
});
export const createUserSchema = userCreateSchema;

export const updateUserPermissionsSchema = z.object({
  permissions: z.array(z.object({
    module: z.string(),
    canView: z.union([z.boolean(), z.number()]).transform(v => Boolean(v)),
    canEdit: z.union([z.boolean(), z.number()]).transform(v => Boolean(v))
  }))
});

export const storeSettingsSchema = z.object({
  storeName: z.string().min(1),
  address: z.string().default(''),
  phone: z.string().default(''),
  logoUrl: z.string().optional().nullable(),
  printerType: z.enum(['usb', 'network', 'none']).default('none'),
  printerTarget: z.string().default(''),
  receiptFooter: z.string().default(''),
  taxRate: z.number().default(0),
  nif: z.string().optional().default(''),
  nis: z.string().optional().default(''),
  rc: z.string().optional().default(''),
  articleImposition: z.string().optional().default(''),
  avgPriceMode: z.boolean().optional().default(true)
});
export const updateSettingsSchema = storeSettingsSchema;
