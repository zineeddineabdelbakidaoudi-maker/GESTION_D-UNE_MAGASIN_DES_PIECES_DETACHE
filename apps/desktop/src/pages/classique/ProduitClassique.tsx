import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { invokeIpc, invokeIpcSafe } from '../../api/electronBridge';
import { notify } from '../../lib/notify';
import { formatDZD, type Product } from '@gestion-veloo/shared';
import {
  Plus, Save, Trash2, Undo2, ChevronLeft, ChevronRight, Hash, Layers,
  History, Printer, Calculator, RefreshCw, LogOut, Search, Barcode, Bike,
  Image as ImageIcon, Boxes
} from 'lucide-react';

/**
 * Écran « Produit » dans l'habillage classique.
 *
 * Reprend la disposition des applications de gestion Windows :
 * barre d'icônes à accès rapide en haut, sous-onglets par thème, puis un
 * formulaire où chaque libellé fait face à son champ, et un panneau de
 * statistiques à droite.
 *
 * Toute la logique (chargement, création, modification) passe par les mêmes
 * canaux que l'écran moderne : c'est la même application, un autre habillage.
 */

type SousOnglet = 'maj' | 'codebarres' | 'compat' | 'photo' | 'stock';

const SOUS_ONGLETS: Array<{ id: SousOnglet; label: string }> = [
  { id: 'maj', label: 'Maj Produit' },
  { id: 'codebarres', label: 'Code-Barres' },
  { id: 'compat', label: 'Compatibilités' },
  { id: 'photo', label: 'Photo' },
  { id: 'stock', label: 'Stock & Emplacement' }
];

/** Ligne de formulaire : libellé à gauche, champ en face. */
const Ligne: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="cl-row">
    <label className="cl-label">{label}</label>
    <div className="cl-field">{children}</div>
  </div>
);

/** Bouton de la barre d'accès rapide. */
const BoutonOutil: React.FC<{
  icone: React.ElementType;
  libelle: string;
  touche?: string;
  couleur?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}> = ({ icone: Icone, libelle, touche, couleur = '#1d4f91', onClick, disabled, title }) => (
  <button type="button" className="cl-toolbtn" onClick={onClick} disabled={disabled} title={title || libelle}>
    <span className="cl-toolicon">
      <Icone className="w-5 h-5" style={{ color: disabled ? '#9aa0ac' : couleur }} />
    </span>
    <span>{touche ? `${touche}:${libelle}` : libelle}</span>
  </button>
);

export const ProduitClassique: React.FC = () => {
  const { currentStore, currentUser, capabilities, hasPermission, setActiveTab } = useStore();
  const peutModifier = hasPermission('produits', 'edit');
  const voitCout = capabilities.canSeeCost;

  const [produits, setProduits] = useState<Product[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [index, setIndex] = useState(0);
  const [sousOnglet, setSousOnglet] = useState<SousOnglet>('maj');
  const [categories, setCategories] = useState<any[]>([]);
  const [marques, setMarques] = useState<any[]>([]);
  const [motos, setMotos] = useState<any[]>([]);
  const [couleurs, setCouleurs] = useState<any[]>([]);
  const [qteVendue, setQteVendue] = useState<number | null>(null);
  const [calcOuverte, setCalcOuverte] = useState(false);

  // ── Formulaire ────────────────────────────────────────────────
  const [enEdition, setEnEdition] = useState<Product | null>(null);
  const [autoInc, setAutoInc] = useState(true);
  const [majuscule, setMajuscule] = useState(true);
  const [code, setCode] = useState('');
  const [designation, setDesignation] = useState('');
  const [familleId, setFamilleId] = useState<number | ''>('');
  const [marqueId, setMarqueId] = useState<number | ''>('');
  const [unite, setUnite] = useState('PCS');
  const [emplacement, setEmplacement] = useState('');
  const [couleurId, setCouleurId] = useState<number | ''>('');
  const [prixAchat, setPrixAchat] = useState('');
  const [prixGros, setPrixGros] = useState('');
  const [prixDemiGros, setPrixDemiGros] = useState('');
  const [prixDetail, setPrixDetail] = useState('');
  const [stockInitial, setStockInitial] = useState('0');
  const [stockMin, setStockMin] = useState('0');
  const [codesBarres, setCodesBarres] = useState<string[]>([]);
  const [nouveauCodeBarre, setNouveauCodeBarre] = useState('');
  const [motosCompatibles, setMotosCompatibles] = useState<number[]>([]);
  const [filtreMoto, setFiltreMoto] = useState('');
  const [photo, setPhoto] = useState('');

  const champDesignation = useRef<HTMLInputElement>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [liste, meta] = await Promise.all([
        invokeIpc<Product[]>('get-products', { q: recherche, storeId: currentStore?.id || 1 }),
        invokeIpc<any>('get-metadata')
      ]);
      setProduits(liste || []);
      setCategories(meta?.categories || []);
      setMarques(meta?.brands || []);
      setMotos(meta?.motorcycleModels || []);
      setCouleurs(meta?.colors || []);
      setIndex(i => Math.min(i, Math.max(0, (liste?.length || 1) - 1)));
    } catch (err) {
      notify.error(err, 'Chargement du catalogue impossible');
    } finally {
      setChargement(false);
    }
  }, [recherche, currentStore?.id]);

  useEffect(() => {
    charger();
  }, [charger]);

  const produitCourant = produits[index];

  /** Charge un produit dans le formulaire. */
  const ouvrir = useCallback((p: Product | null) => {
    setEnEdition(p);
    if (!p) {
      setCode('');
      setDesignation('');
      setFamilleId('');
      setMarqueId('');
      setUnite('PCS');
      setEmplacement('');
      setCouleurId('');
      setPrixAchat('');
      setPrixGros('');
      setPrixDemiGros('');
      setPrixDetail('');
      setStockInitial('0');
      setStockMin('0');
      setCodesBarres([]);
      setMotosCompatibles([]);
      setPhoto('');
      setAutoInc(true);
      setQteVendue(null);
      return;
    }
    const cent = (v: any) => (v == null ? '' : (Number(v) / 100).toFixed(2));
    setCode(p.code || '');
    setDesignation(p.name || '');
    setFamilleId((p as any).category_id ?? '');
    setMarqueId((p as any).brand_id ?? '');
    setUnite((p as any).unit || 'PCS');
    setEmplacement(p.location || '');
    setCouleurId((p.colors && p.colors[0] ? (p.colors[0] as any).colorId : '') || '');
    setPrixAchat(cent(p.priceAchat));
    setPrixGros(cent(p.priceGros));
    setPrixDemiGros(cent(p.priceSemiGros));
    setPrixDetail(cent(p.priceDetail));
    setStockInitial(String(p.totalStock ?? 0));
    setStockMin(String((p as any).minStock ?? 0));
    setCodesBarres((p.barcodes || []).map((b: any) => b.barcodeValue));
    setMotosCompatibles((p.compatibleModels || []).map((m: any) => m.id));
    setPhoto('');
    setAutoInc(false);
  }, []);

  useEffect(() => {
    if (produitCourant) ouvrir(produitCourant);
  }, [produitCourant, ouvrir]);

  // Quantité déjà vendue du produit affiché, lue dans les mouvements de stock.
  useEffect(() => {
    if (!enEdition?.id) {
      setQteVendue(null);
      return;
    }
    invokeIpcSafe<any[]>('get-stock-movements', { productId: enEdition.id, movementCode: 91, limit: 500 }, [])
      .then(mv => setQteVendue(mv.reduce((s, m) => s + Math.abs(m.delta || 0), 0)));
  }, [enEdition?.id]);

  // ── Statistiques du panneau de droite ─────────────────────────
  const stats = useMemo(() => {
    const total = produits.length;
    const dispo = produits.filter(p => (p.totalStock ?? 0) > 0).length;
    return {
      montantAchat: produits.reduce((s, p) => s + (p.totalStock ?? 0) * (p.priceAchat ?? 0), 0),
      montantDetail: produits.reduce((s, p) => s + (p.totalStock ?? 0) * (p.priceDetail ?? 0), 0),
      total,
      dispo,
      nonDispo: total - dispo,
      unites: produits.reduce((s, p) => s + (p.totalStock ?? 0), 0)
    };
  }, [produits]);

  // ── Actions de la barre d'icônes ──────────────────────────────
  const nouveau = () => {
    ouvrir(null);
    setSousOnglet('maj');
    setTimeout(() => champDesignation.current?.focus(), 30);
  };

  // L'article tient-il ses quantites couleur par couleur ?
  const suiviParCouleur = Boolean((enEdition as any)?.colorStockTracked);

  const enregistrer = async () => {
    try {
      const enCentimes = (v: string) => Math.round((parseFloat(v || '0') || 0) * 100);
      if (!designation.trim()) throw new Error('La désignation est obligatoire.');
      if (enCentimes(prixDetail) <= 0) throw new Error('Le prix de vente détail est obligatoire.');

      const charge: any = {
        name: majuscule ? designation.toUpperCase().trim() : designation.trim(),
        customCode: !autoInc && code.trim() ? code.trim().toUpperCase() : undefined,
        categoryId: familleId || null,
        brandId: marqueId || null,
        priceAchat: enCentimes(prixAchat),
        priceDetail: enCentimes(prixDetail),
        priceSemiGros: enCentimes(prixDemiGros),
        priceGros: enCentimes(prixGros),
        location: emplacement.toUpperCase().trim(),
        unit: unite || 'PCS',
        minStock: parseInt(stockMin, 10) || 0,
        barcodes: codesBarres,
        compatibleModelIds: motosCompatibles
      };

      // Cet ecran ne gere qu'une couleur. Sur un article dont les quantites
      // sont tenues couleur par couleur, il ne touche ni aux couleurs ni au
      // stock : les omettre laisse le process principal les conserver tels
      // quels, plutot que de les ecraser. La saisie se fait dans l'ecran
      // moderne, section Couleurs.
      if (!suiviParCouleur) {
        charge.colorMode = 'single';
        charge.colorIds = couleurId ? [Number(couleurId)] : [];
        charge.initialStock = { '1': parseInt(stockInitial, 10) || 0 };
      }

      if (enEdition) {
        await invokeIpc('update-product', { ...charge, id: enEdition.id });
        if (photo) await invokeIpc('update-product-photo', { productId: enEdition.id, photoBase64: photo });
        notify.success('Produit modifié', enEdition.code);
      } else {
        const cree = await invokeIpc<any>('create-product', charge);
        if (cree?.id && photo) await invokeIpc('update-product-photo', { productId: cree.id, photoBase64: photo });
        notify.success('Produit créé', cree?.code);
      }
      charger();
    } catch (err) {
      notify.error(err, 'Enregistrement impossible');
    }
  };

  const supprimer = async () => {
    if (!enEdition) return;
    if (!confirm(`Archiver l'article ${enEdition.code} — ${enEdition.name} ?`)) return;
    try {
      await invokeIpc('archive-product', { id: enEdition.id, archived: true });
      notify.success('Article archivé', enEdition.code);
      charger();
    } catch (err) {
      notify.error(err, 'Archivage impossible');
    }
  };

  const annuler = () => {
    if (produitCourant) ouvrir(produitCourant);
    else ouvrir(null);
  };

  const historique = async () => {
    if (!enEdition) return;
    try {
      const h = await invokeIpc<any[]>('get-cost-history', { productId: enEdition.id });
      if (!h.length) {
        notify.info('Historique du prix d\'achat', 'Aucun recalcul enregistré pour cet article.');
        return;
      }
      const dernier = h[0];
      notify.info(
        `Prix d'achat — ${enEdition.code}`,
        `${h.length} recalcul(s). Dernier : ${(dernier.previous_cost / 100).toFixed(2)} → ` +
        `${(dernier.new_cost / 100).toFixed(2)} DA (${dernier.reason})`
      );
    } catch (err) {
      notify.error(err, 'Historique indisponible');
    }
  };

  const ajouterCodeBarre = () => {
    const v = nouveauCodeBarre.trim();
    if (!v) return;
    if (codesBarres.includes(v)) {
      notify.warn('Code-barres déjà présent', v);
      return;
    }
    if (codesBarres.length >= 5) {
      notify.warn('Maximum 5 codes-barres par article');
      return;
    }
    setCodesBarres([...codesBarres, v]);
    setNouveauCodeBarre('');
  };

  const chargerPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      notify.warn('Photo trop volumineuse', 'Maximum 2 Mo.');
      return;
    }
    const lecteur = new FileReader();
    lecteur.onload = () => setPhoto(String(lecteur.result || ''));
    lecteur.readAsDataURL(f);
  };

  const motosFiltrees = motos.filter(m =>
    !filtreMoto.trim() || m.name.toLowerCase().includes(filtreMoto.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'rgb(var(--gv-bg))' }}>
      {/* Barre de titre de la fenêtre métier */}
      <div className="cl-titlebar shrink-0">
        <span>
          Base ouverte : [{currentStore?.name || 'Boutique'}] — Utilisateur : {currentUser?.fullName?.toUpperCase()} — Exercice [
          {new Date().getFullYear()}]
        </span>
      </div>

      {/* Barre d'accès rapide */}
      <div
        className="shrink-0 flex items-start gap-1 px-2 py-1 overflow-x-auto"
        style={{ backgroundImage: 'linear-gradient(#f7f8fb, #e6eaf1)', borderBottom: '1px solid #9aa0ac' }}
      >
        <BoutonOutil icone={Plus} libelle="Nouveau" touche="F1" couleur="#1f7a3d" onClick={nouveau} disabled={!peutModifier} />
        <BoutonOutil icone={Save} libelle="Appliquer" touche="F4" couleur="#1d4f91" onClick={enregistrer} disabled={!peutModifier} />
        <BoutonOutil icone={Trash2} libelle="Supprimer" touche="F2" couleur="#a32020" onClick={supprimer} disabled={!peutModifier || !enEdition} />
        <BoutonOutil icone={Undo2} libelle="Annuler" touche="F6" couleur="#8a6a10" onClick={annuler} />

        <span className="w-px self-stretch mx-1" style={{ backgroundColor: '#bcc2cc' }} />

        <BoutonOutil icone={ChevronLeft} libelle="Précédent" onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index <= 0} />
        <BoutonOutil
          icone={ChevronRight}
          libelle="Suivant"
          onClick={() => setIndex(i => Math.min(produits.length - 1, i + 1))}
          disabled={index >= produits.length - 1}
        />

        <span className="w-px self-stretch mx-1" style={{ backgroundColor: '#bcc2cc' }} />

        <BoutonOutil
          icone={Hash}
          libelle="Chang. N°Prod"
          onClick={() => { setAutoInc(false); notify.info('Code article déverrouillé', 'Saisissez la nouvelle référence, puis Appliquer.'); }}
          disabled={!peutModifier}
        />
        <BoutonOutil icone={Layers} libelle="Liste produits" onClick={() => setActiveTab('produits-liste')} />
        <BoutonOutil icone={History} libelle="Hist. produit" onClick={historique} disabled={!enEdition || !voitCout} />
        <BoutonOutil icone={Printer} libelle="Imprimer" onClick={() => window.print()} />
        <BoutonOutil icone={Calculator} libelle="Calculatrice" onClick={() => setCalcOuverte(o => !o)} />
        <BoutonOutil icone={RefreshCw} libelle="Rafraîchir" onClick={charger} />
        <BoutonOutil icone={LogOut} libelle="Quitter" couleur="#a32020" onClick={() => setActiveTab('pos')} />
      </div>

      {/* Sous-onglets */}
      <div
        className="shrink-0 flex items-end px-2 pt-1"
        style={{ backgroundColor: 'rgb(var(--gv-surface-2))', borderBottom: '1px solid #9aa0ac' }}
      >
        {SOUS_ONGLETS.map(o => (
          <button
            key={o.id}
            type="button"
            className={`cl-subtab ${sousOnglet === o.id ? 'cl-subtab-active' : ''}`}
            onClick={() => setSousOnglet(o.id)}
          >
            {o.label}
          </button>
        ))}

        <div className="ms-auto flex items-center gap-1.5 pb-1">
          <Search className="w-3.5 h-3.5" style={{ color: '#14223c' }} />
          <input
            className="gv-input !py-0.5 !text-[11.5px]"
            style={{ width: '13rem' }}
            placeholder="Rechercher un article…"
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
          />
          <span className="cl-hint">
            {chargement ? 'chargement…' : `${index + 1} / ${produits.length}`}
          </span>
        </div>
      </div>

      {/* Corps : formulaire + statistiques */}
      <div className="flex-1 min-h-0 flex overflow-hidden" style={{ backgroundColor: '#eef1f7' }}>
        <div className="flex-1 min-w-0 overflow-y-auto gv-scroll p-3">
          {sousOnglet === 'maj' && (
            <fieldset className="cl-group">
              <legend>Fiche article</legend>

              <Ligne label="Code Article">
                <input
                  className="gv-input !w-40"
                  value={code}
                  disabled={autoInc}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                />
                <label className="flex items-center gap-1 text-[11.5px]" style={{ color: '#14223c' }}>
                  <input type="checkbox" checked={autoInc} onChange={e => setAutoInc(e.target.checked)} />
                  AUTO INC
                </label>
                <span className="cl-label !text-right ms-4" style={{ minWidth: '9rem' }}>Dernier Code Article</span>
                <input className="gv-input !w-36" value={produits[produits.length - 1]?.code || ''} readOnly />
              </Ligne>

              <Ligne label="Désignation">
                <input
                  ref={champDesignation}
                  className="gv-input"
                  style={{ width: '26rem' }}
                  value={designation}
                  onChange={e => setDesignation(majuscule ? e.target.value.toUpperCase() : e.target.value)}
                />
                <label className="flex items-center gap-1 text-[11.5px]" style={{ color: '#14223c' }}>
                  <input type="checkbox" checked={majuscule} onChange={e => setMajuscule(e.target.checked)} />
                  MAJUSCULE
                </label>
              </Ligne>

              <Ligne label="Famille">
                <select className="gv-input !w-64" value={familleId} onChange={e => setFamilleId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">-- Sélectionner --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="cl-label ms-4" style={{ minWidth: '4rem' }}>Marque</span>
                <select className="gv-input !w-56" value={marqueId} onChange={e => setMarqueId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">-- Sélectionner --</option>
                  {marques.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Ligne>

              <Ligne label="Unité">
                <select className="gv-input !w-28" value={unite} onChange={e => setUnite(e.target.value)}>
                  {['PCS', 'L', 'KG', 'M', 'BOITE', 'PAIRE', 'JEU'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <span className="cl-label ms-4" style={{ minWidth: '6rem' }}>Emplacement</span>
                <input
                  className="gv-input !w-40"
                  value={emplacement}
                  onChange={e => setEmplacement(e.target.value.toUpperCase())}
                  placeholder="Ex. A-01"
                />
                <span className="cl-label ms-4" style={{ minWidth: '4rem' }}>Couleur</span>
                <select className="gv-input !w-44" value={couleurId} onChange={e => setCouleurId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">-- Aucune --</option>
                  {couleurs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Ligne>

              <div className="my-2" style={{ borderTop: '1px solid #c8cdd7' }} />

              <Ligne label="Prix d'achat">
                <input
                  className="gv-input !w-32 text-right"
                  value={voitCout ? prixAchat : ''}
                  disabled={!voitCout}
                  onChange={e => setPrixAchat(e.target.value)}
                />
                <span className="cl-hint">DA — {voitCout ? 'coût de revient courant' : 'masqué pour votre profil'}</span>
              </Ligne>

              <Ligne label="Qté stock">
                <input
                  className="gv-input !w-32 text-right"
                  value={stockInitial}
                  readOnly={suiviParCouleur}
                  onChange={e => setStockInitial(e.target.value)}
                />
                <span className="cl-hint">
                  {suiviParCouleur
                    ? "somme des quantités par couleur — se modifie dans l'écran moderne"
                    : "Total d'unités, toutes boutiques"}
                </span>
                <span className="cl-label ms-4" style={{ minWidth: '7rem' }}>Stock minimum</span>
                <input className="gv-input !w-24 text-right" value={stockMin} onChange={e => setStockMin(e.target.value)} />
                <span className="cl-hint">seuil d'alerte</span>
              </Ligne>

              <div className="my-2" style={{ borderTop: '1px solid #c8cdd7' }} />

              <Ligne label="Prix vente Gros">
                <input className="gv-input !w-32 text-right" value={prixGros} onChange={e => setPrixGros(e.target.value)} />
                <span className="cl-hint">
                  {voitCout && prixAchat && prixGros
                    ? `marge ${(((parseFloat(prixGros) - parseFloat(prixAchat)) / parseFloat(prixAchat)) * 100).toFixed(1)} %`
                    : 'DA'}
                </span>
              </Ligne>

              <Ligne label="Prix vente Demi Gros">
                <input className="gv-input !w-32 text-right" value={prixDemiGros} onChange={e => setPrixDemiGros(e.target.value)} />
                <span className="cl-hint">
                  {voitCout && prixAchat && prixDemiGros
                    ? `marge ${(((parseFloat(prixDemiGros) - parseFloat(prixAchat)) / parseFloat(prixAchat)) * 100).toFixed(1)} %`
                    : 'DA'}
                </span>
              </Ligne>

              <Ligne label="Prix vente Détail">
                <input className="gv-input !w-32 text-right" value={prixDetail} onChange={e => setPrixDetail(e.target.value)} />
                <span className="cl-hint">
                  {voitCout && prixAchat && prixDetail
                    ? `marge ${(((parseFloat(prixDetail) - parseFloat(prixAchat)) / parseFloat(prixAchat)) * 100).toFixed(1)} %`
                    : 'DA'}
                </span>
              </Ligne>
            </fieldset>
          )}

          {sousOnglet === 'codebarres' && (
            <fieldset className="cl-group">
              <legend>Codes-barres de l'article</legend>
              <Ligne label="Nouveau code">
                <input
                  className="gv-input !w-64"
                  value={nouveauCodeBarre}
                  onChange={e => setNouveauCodeBarre(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterCodeBarre(); } }}
                  placeholder="Scannez ou saisissez, puis Entrée"
                />
                <button type="button" className="gv-btn-ghost" onClick={ajouterCodeBarre}>Ajouter</button>
                <span className="cl-hint">{codesBarres.length} / 5</span>
              </Ligne>

              <table className="gv-table mt-3">
                <thead>
                  <tr><th style={{ width: '3rem' }}>N°</th><th>Code-barres</th><th style={{ width: '6rem' }}>Action</th></tr>
                </thead>
                <tbody>
                  {codesBarres.length === 0 ? (
                    <tr><td colSpan={3} className="cl-hint">Aucun code-barres. Le système en génère un à la création.</td></tr>
                  ) : codesBarres.map((bc, i) => (
                    <tr key={bc}>
                      <td>{i + 1}</td>
                      <td className="font-mono">{bc}</td>
                      <td>
                        <button type="button" className="gv-btn-ghost !px-2 !py-0.5"
                          onClick={() => setCodesBarres(codesBarres.filter(x => x !== bc))}>
                          Retirer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </fieldset>
          )}

          {sousOnglet === 'compat' && (
            <fieldset className="cl-group">
              <legend>Motos compatibles</legend>
              <Ligne label="Filtrer">
                <input className="gv-input !w-64" value={filtreMoto} onChange={e => setFiltreMoto(e.target.value)} placeholder="Ex. CG125" />
                <span className="cl-hint">{motosCompatibles.length} modèle(s) sélectionné(s)</span>
              </Ligne>
              <div
                className="mt-2 p-2 grid grid-cols-3 gap-1 overflow-y-auto gv-scroll"
                style={{ maxHeight: '18rem', backgroundColor: '#ffffff', border: '1px solid #8a8f9a' }}
              >
                {motosFiltrees.map(m => (
                  <label key={m.id} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: '#14223c' }}>
                    <input
                      type="checkbox"
                      checked={motosCompatibles.includes(m.id)}
                      onChange={e =>
                        setMotosCompatibles(e.target.checked
                          ? [...motosCompatibles, m.id]
                          : motosCompatibles.filter(x => x !== m.id))}
                    />
                    <Bike className="w-3 h-3" style={{ color: '#1d4f91' }} />
                    {m.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {sousOnglet === 'photo' && (
            <fieldset className="cl-group">
              <legend>Photo de l'article</legend>
              <Ligne label="Fichier">
                <input type="file" accept="image/*" onChange={chargerPhoto} className="text-[11.5px]" />
                <span className="cl-hint">JPEG ou PNG, 2 Mo maximum</span>
              </Ligne>
              <div
                className="mt-2 flex items-center justify-center"
                style={{ height: '16rem', backgroundColor: '#ffffff', border: '1px solid #8a8f9a' }}
              >
                {photo ? (
                  <img src={photo} alt="Aperçu" style={{ maxHeight: '15rem', maxWidth: '100%' }} />
                ) : (
                  <span className="cl-hint flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" /> Aucune photo chargée
                  </span>
                )}
              </div>
            </fieldset>
          )}

          {sousOnglet === 'stock' && (
            <fieldset className="cl-group">
              <legend>Stock par boutique</legend>
              <table className="gv-table">
                <thead>
                  <tr><th>Boutique</th><th style={{ width: '8rem' }}>Quantité</th>{voitCout && <th style={{ width: '12rem' }}>Valeur (prix d'achat)</th>}</tr>
                </thead>
                <tbody>
                  {(enEdition?.stock || []).length === 0 ? (
                    <tr><td colSpan={3} className="cl-hint">Sélectionnez un article pour voir son stock.</td></tr>
                  ) : (enEdition!.stock as any[]).map(st => (
                    <tr key={st.storeId}>
                      <td>Boutique {st.storeId}</td>
                      <td className="font-mono">{st.quantity}</td>
                      {voitCout && <td className="font-mono">{formatDZD(st.quantity * (enEdition!.priceAchat || 0))}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="cl-hint mt-2">
                Les quantités se corrigent depuis l'onglet Stock (un motif est demandé) ou augmentent par un bon d'achat.
              </p>
            </fieldset>
          )}
        </div>

        {/* Panneau de statistiques */}
        <aside
          className="w-72 shrink-0 overflow-y-auto gv-scroll p-2"
          style={{ backgroundColor: '#e9edf5', borderInlineStart: '1px solid #9aa0ac' }}
        >
          <fieldset className="cl-group !mt-2">
            <legend>Stat. produits</legend>
            <p className="text-[11px] mb-1" style={{ color: '#1d4f91', textDecoration: 'underline' }}>
              Stat. pour les produits sélectionnés
            </p>
            {voitCout && (
              <div className="cl-stat">
                <span>Montant global du stock (Prix U)</span>
                <span className="cl-stat-value">{formatDZD(stats.montantAchat, { showCurrency: false })}</span>
              </div>
            )}
            <div className="cl-stat">
              <span>Montant global du stock (Détail)</span>
              <span className="cl-stat-value">{formatDZD(stats.montantDetail, { showCurrency: false })}</span>
            </div>
            <div className="cl-stat"><span>Nbre Total d'articles</span><span className="cl-stat-value">{stats.total}</span></div>
            <div className="cl-stat"><span>Nbre d'articles non disponibles</span><span className="cl-stat-value">{stats.nonDispo}</span></div>
            <div className="cl-stat"><span>Nbre d'articles disponible</span><span className="cl-stat-value">{stats.dispo}</span></div>
            <div className="cl-stat"><span>Total d'unités en stock</span><span className="cl-stat-value">{stats.unites}</span></div>
            <div className="cl-stat">
              <span>Qté vendue du produit en cours</span>
              <span className="cl-stat-value">{qteVendue == null ? '—' : qteVendue}</span>
            </div>
          </fieldset>

          <fieldset className="cl-group">
            <legend>Article en cours</legend>
            <div className="cl-stat"><span>Référence</span><span className="cl-stat-value">{enEdition?.code || 'nouveau'}</span></div>
            <div className="cl-stat"><span>Stock</span><span className="cl-stat-value">{enEdition?.totalStock ?? 0}</span></div>
            <div className="cl-stat"><span>Emplacement</span><span className="cl-stat-value">{enEdition?.location || '—'}</span></div>
            <div className="cl-stat"><span>Codes-barres</span><span className="cl-stat-value">{codesBarres.length}</span></div>
            <div className="cl-stat"><span>Motos compatibles</span><span className="cl-stat-value">{motosCompatibles.length}</span></div>
          </fieldset>

          {calcOuverte && <Calculatrice onFermer={() => setCalcOuverte(false)} />}
        </aside>
      </div>

      {/* Barre d'état */}
      <div
        className="shrink-0 flex items-center justify-between px-2 py-0.5 text-[11px]"
        style={{ backgroundColor: 'rgb(var(--gv-surface-2))', borderTop: '1px solid #9aa0ac', color: '#14223c' }}
      >
        <span className="flex items-center gap-1.5">
          <Boxes className="w-3 h-3" />
          {enEdition ? `Article ${enEdition.code} — ${enEdition.name}` : 'Nouvel article (non enregistré)'}
        </span>
        <span>{peutModifier ? 'Modification autorisée' : 'Consultation seule'}</span>
      </div>
    </div>
  );
};

/** Calculatrice de comptoir, ouverte depuis la barre d'icônes. */
const Calculatrice: React.FC<{ onFermer: () => void }> = ({ onFermer }) => {
  const [expr, setExpr] = useState('');
  const [resultat, setResultat] = useState<string>('0');

  const touches = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+'];

  const calculer = () => {
    // Seuls les chiffres et les quatre opérations sont acceptés : la saisie ne
    // peut donc pas contenir autre chose qu'un calcul.
    if (!/^[\d+\-*/.() ]*$/.test(expr)) {
      setResultat('erreur');
      return;
    }
    try {
      // eslint-disable-next-line no-new-func
      const v = Function(`"use strict"; return (${expr || '0'})`)();
      setResultat(Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : 'erreur');
    } catch {
      setResultat('erreur');
    }
  };

  return (
    <fieldset className="cl-group">
      <legend>Calculatrice</legend>
      <input
        className="gv-input w-full text-right font-mono"
        value={expr}
        onChange={e => setExpr(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); calculer(); } }}
        placeholder="0"
      />
      <div className="text-right font-mono font-bold my-1" style={{ color: '#8a1a1a' }}>{resultat}</div>
      <div className="grid grid-cols-4 gap-1">
        {touches.map(t => (
          <button
            key={t}
            type="button"
            className="gv-btn-ghost !px-0 !py-1 !text-[12px]"
            onClick={() => (t === '=' ? calculer() : setExpr(expr + t))}
          >
            {t}
          </button>
        ))}
        <button type="button" className="gv-btn-ghost !px-0 !py-1 !text-[12px] col-span-2" onClick={() => { setExpr(''); setResultat('0'); }}>
          Effacer
        </button>
        <button type="button" className="gv-btn-ghost !px-0 !py-1 !text-[12px] col-span-2" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </fieldset>
  );
};
