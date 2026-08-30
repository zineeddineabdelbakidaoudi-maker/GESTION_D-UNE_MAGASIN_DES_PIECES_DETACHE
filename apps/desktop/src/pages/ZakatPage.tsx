import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { formatDZD } from '@gestion-veloo/shared';
import { Calculator, CheckCircle2, Bookmark, Info, HelpCircle, Sparkles } from 'lucide-react';

export const ZakatPage: React.FC = () => {
  const { capital, lang } = useStore();
  const isAr = lang === 'ar';

  const [cashOnHand, setCashOnHand] = useState<string>('500000');
  const [receivables, setReceivables] = useState<number>(0);
  const [shortTermDebts, setShortTermDebts] = useState<number>(0);
  const [nisabThreshold, setNisabThreshold] = useState<number>(100000000);
  const [snapshots, setSnapshots] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      invokeIpc<any[]>('get-clients'),
      invokeIpc<any[]>('get-suppliers')
    ]).then(([clients, suppliers]) => {
      const rec = clients?.reduce((sum, c) => sum + (c.currentDebt || 0), 0) || 0;
      const deb = suppliers?.reduce((sum, s) => sum + (s.currentDebt || 0), 0) || 0;
      setReceivables(rec);
      setShortTermDebts(deb);
    });
  }, []);

  const cashCentimes = Math.round((parseFloat(cashOnHand) || 0) * 100);
  const netZakatable = Math.max(0, capital + cashCentimes + receivables - shortTermDebts);
  const isAboveNisab = netZakatable >= nisabThreshold;
  const zakatDue = isAboveNisab ? Math.round(netZakatable * 0.025) : 0;

  const handleSaveSnapshot = () => {
    const newSnap = {
      id: Date.now(),
      date: new Date().toLocaleDateString('fr-DZ'),
      netZakatable,
      zakatDue,
      capital,
      cashOnHand: cashCentimes
    };
    setSnapshots([newSnap, ...snapshots]);
    alert(isAr ? 'تم أرشفة تقييم الزكاة بنجاح!' : 'Évaluation Zakat archivée avec succès !');
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-400" />
            <span>{isAr ? 'حساب الزكاة على عروض التجارة' : 'Calculateur de Zakat Commerciale'}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isAr ? 'حساب دقيق لزكاة عروض التجارة وفق المعادلة الشرعية (2.5% من الوعاء الصافي)' : 'Calcul conforme de la Zakat sur les marchandises destinées au commerce (2,5% de l\'assiette nette).'}
          </p>
        </div>

        <button
          onClick={handleSaveSnapshot}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20"
        >
          <Bookmark className="w-4 h-4" />
          <span>{isAr ? 'أرشفة التقييم' : 'Archiver l\'Évaluation'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Parameters */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>{isAr ? 'عناصر وعاء الزكاة (الصافي الخاضع)' : 'Composantes de l\'Assiette Zakatable'}</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Capital Stock */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                <label className="text-[11px] font-semibold text-slate-400">{isAr ? '1. رأس مال السلع والبضائع (بسعر الشراء)' : '1. Capital Marchandises (Prix d\'Achat)'}</label>
                <div className="text-base font-black text-emerald-400 font-mono mt-1">{formatDZD(capital)}</div>
              </div>

              {/* Liquidities */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                <label className="text-[11px] font-semibold text-slate-400">{isAr ? '2. السيولة النقدية المتوفرة (دج)' : '2. Liquidités & Caisse Disponibles (DA)'}</label>
                <input
                  type="number"
                  value={cashOnHand}
                  onChange={e => setCashOnHand(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-black font-mono text-white outline-none"
                />
              </div>

              {/* Receivables */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                <label className="text-[11px] font-semibold text-slate-400">{isAr ? '3. ديون للقبض (ديون الزبائن المرجوة)' : '3. Créances Récupérables (Dettes Clients)'}</label>
                <div className="text-base font-black text-blue-400 font-mono mt-1">{formatDZD(receivables)}</div>
              </div>

              {/* Debts */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                <label className="text-[11px] font-semibold text-slate-400">{isAr ? '4. ديون الدفع (مستحقات الموردين)' : '4. Dettes à Court Terme (Dettes Fournisseurs)'}</label>
                <div className="text-base font-black text-rose-400 font-mono mt-1">-{formatDZD(shortTermDebts)}</div>
              </div>
            </div>

            {/* Formula Explanation */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
              <div className="font-bold text-slate-300">{isAr ? 'المعادلة الشرعية لحساب وعاء الزكاة :' : 'Formule de calcul appliquée :'}</div>
              <p className="font-mono text-emerald-400 text-[11px]">
                {isAr 
                  ? 'الوعاء الصافي = رأس المال + السيولة + ديون القبض - ديون الدفع' 
                  : 'Assiette Nette = (Capital Marchandises + Caisse + Créances) - Dettes Fournisseurs'}
              </p>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Calculation Output */}
        <div className="space-y-4">
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-white">{isAr ? 'نتيجة تقييم الزكاة' : 'Résultat de l\'Évaluation'}</h3>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-1 text-center">
              <span className="text-xs text-slate-400 font-semibold">{isAr ? 'الوعاء الصافي الخاضع للزكاة' : 'Assiette Nette Zakatable'}</span>
              <div className="text-xl font-black text-white font-mono">{formatDZD(netZakatable)}</div>
            </div>

            <div className="p-4 bg-emerald-950/40 rounded-xl border border-emerald-800/50 space-y-1 text-center">
              <span className="text-xs text-emerald-300 font-semibold">{isAr ? 'مقدار الزكاة الواجب إخراجها (2.5%)' : 'Montant de la Zakat Due (2,5%)'}</span>
              <div className="text-2xl font-black text-emerald-400 font-mono">{formatDZD(zakatDue)}</div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-xl text-xs border border-slate-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-slate-300 font-medium">
                {isAboveNisab 
                  ? (isAr ? 'المال بلغ النصاب الشرعي وتجب فيه الزكاة.' : 'Le seuil du Nissab est atteint, la Zakat est obligatoire.')
                  : (isAr ? 'المال لم يبلغ النصاب بعد.' : 'L\'assiette est inférieure au Nissab.')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
