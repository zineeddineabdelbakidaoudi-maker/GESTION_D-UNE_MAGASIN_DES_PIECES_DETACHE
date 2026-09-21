import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';
import { useUiStore } from '../store/useUiStore';
import { Modal, PageHeader, EmptyState, LoadingState, AccessDenied, StatCard } from '../components/ui';
import {
  AUDIT_ACTION_LABELS, AUDIT_SEVERITY_LABELS, MODULE_LABELS, COST_STRATEGY_LABELS, formatDZD
} from '@gestion-veloo/shared';
import {
  ScrollText, Search, Filter, Download, RefreshCw, ShieldAlert, Activity,
  LogIn, ChevronLeft, ChevronRight, Eye, MonitorSmartphone, Coins, ShieldCheck, ShieldOff
} from 'lucide-react';

interface AuditChange { field: string; label?: string; before: unknown; after: unknown }

interface JournalEntry {
  id: number;
  localId: number;
  deviceId: string;
  userId: number | null;
  userName: string | null;
  storeId: number | null;
  storeName: string | null;
  action: string;
  module: string;
  entityType: string | null;
  entityId: number | null;
  severity: string;
  summary: string;
  changes: AuditChange[] | null;
  metadata: Record<string, unknown> | null;
  appVersion: string | null;
  createdAt: string;
  receivedAt: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  info: 'gv-badge-neutral',
  notice: 'gv-badge-accent',
  warning: 'gv-badge-warning',
  critical: 'gv-badge-danger'
};

const PAGE_SIZE = 50;

const label = (dict: Record<string, string>, key: string) => dict[key] || key;
const renderValue = (v: unknown) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

type Tab = 'journal' | 'devices' | 'costs';

export const JournalPage: React.FC = () => {
  const { hasPermission } = useAuthStore();
  const { pushToast, notifyError } = useUiStore();
  const canView = hasPermission('journal', 'view');

  const [tab, setTab] = useState<Tab>('journal');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [filterOptions, setFilterOptions] = useState<{ modules: string[]; actions: string[]; users: any[]; devices: string[] }>({
    modules: [], actions: [], users: [], devices: []
  });
  const [costs, setCosts] = useState<any[]>([]);
  const [selected, setSelected] = useState<JournalEntry | null>(null);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = useCallback((limit: number, offset: number) => {
    const params = new URLSearchParams();
    if (debounced) params.set('search', debounced);
    if (moduleFilter) params.set('module', moduleFilter);
    if (actionFilter) params.set('action', actionFilter);
    if (severityFilter) params.set('severity', severityFilter);
    if (userFilter) params.set('userId', userFilter);
    if (deviceFilter) params.set('deviceId', deviceFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return params.toString();
  }, [debounced, moduleFilter, actionFilter, severityFilter, userFilter, deviceFilter, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ entries: JournalEntry[]; total: number }>(
        `/journal?${buildQuery(PAGE_SIZE, page * PAGE_SIZE)}`
      );
      setEntries(res.entries || []);
      setTotal(res.total || 0);
    } catch (err) {
      notifyError(err, 'Lecture du journal impossible');
    } finally {
      setLoading(false);
    }
  }, [buildQuery, page, notifyError]);

  useEffect(() => {
    if (canView && tab === 'journal') load();
  }, [canView, tab, load]);

  useEffect(() => {
    if (!canView) return;
    apiRequest<any>('/journal/stats').then(setStats).catch(() => {});
    apiRequest<any>('/journal/filters').then(setFilterOptions).catch(() => {});
  }, [canView]);

  useEffect(() => {
    if (!canView || tab !== 'costs') return;
    apiRequest<any[]>('/journal/cost-history?limit=300').then(setCosts).catch(err => notifyError(err, 'Historique des prix indisponible'));
  }, [canView, tab, notifyError]);

  const resetFilters = () => {
    setSearch(''); setModuleFilter(''); setActionFilter(''); setSeverityFilter('');
    setUserFilter(''); setDeviceFilter(''); setDateFrom(''); setDateTo(''); setPage(0);
  };

  const exportCsv = async () => {
    try {
      const res = await apiRequest<{ entries: JournalEntry[] }>(`/journal?${buildQuery(1000, 0)}`);
      const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['ID', 'Date', 'Utilisateur', 'Boutique', 'Poste', 'Module', 'Action', 'Gravité', 'Résumé', 'Modifications'];
      const rows = (res.entries || []).map(e => [
        e.id,
        new Date(e.createdAt).toLocaleString('fr-DZ'),
        e.userName || '—',
        e.storeName || '—',
        e.deviceId || '—',
        label(MODULE_LABELS as any, e.module),
        label(AUDIT_ACTION_LABELS as any, e.action),
        label(AUDIT_SEVERITY_LABELS as any, e.severity),
        e.summary,
        (e.changes || []).map(c => `${c.label || c.field}: ${renderValue(c.before)} → ${renderValue(c.after)}`).join(' | ')
      ].map(escape).join(';'));

      const blob = new Blob(['﻿' + [header.map(escape).join(';'), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      pushToast({ kind: 'success', title: 'Journal exporté', description: `${rows.length} entrée(s) au format CSV.` });
    } catch (err) {
      notifyError(err, 'Export impossible');
    }
  };

  if (!canView) return <AccessDenied module={MODULE_LABELS.journal} />;

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'journal', label: "Journal d'audit", icon: ScrollText },
    { id: 'costs', label: "Prix d'achat", icon: Coins },
    { id: 'devices', label: 'Caisses connectées', icon: MonitorSmartphone }
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Supervision & Traçabilité"
        subtitle="Toutes les opérations des caisses, consolidées et horodatées."
        icon={ScrollText}
        actions={
          <>
            <button className="gv-btn-ghost" onClick={load} title="Actualiser">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button className="gv-btn-ghost" onClick={exportCsv}>
              <Download className="w-4 h-4" /> Exporter CSV
            </button>
          </>
        }
      />

      <div className="p-5 space-y-4">
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Entrées consolidées" value={(stats.total ?? 0).toLocaleString('fr-DZ')} icon={Activity} tone="accent" />
            <StatCard label="Aujourd'hui" value={stats.today ?? 0} icon={ScrollText} />
            <StatCard
              label="Événements critiques"
              value={stats.bySeverity?.critical ?? 0}
              icon={ShieldAlert}
              tone={(stats.bySeverity?.critical ?? 0) > 0 ? 'danger' : 'neutral'}
            />
            <StatCard
              label="Avertissements"
              value={stats.bySeverity?.warning ?? 0}
              icon={LogIn}
              tone={(stats.bySeverity?.warning ?? 0) > 0 ? 'warning' : 'neutral'}
            />
            <StatCard label="Caisses connectées" value={stats.devices?.length ?? 0} icon={MonitorSmartphone} tone="success" />
          </div>
        )}

        <div className="flex items-center gap-2">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={tab === t.id ? 'gv-btn-primary' : 'gv-btn-ghost'}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'journal' && (
          <>
            <div className="gv-card !p-3.5">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-blue-500" />
                <span className="text-[11px] font-black uppercase tracking-wide">Filtres</span>
                <button className="text-[10px] gv-muted hover:underline ms-auto" onClick={resetFilters}>Réinitialiser</button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="col-span-2 lg:col-span-1 relative">
                  <Search className="w-4 h-4 gv-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input className="gv-input ps-9 !py-2" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select className="gv-input !py-2" value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPage(0); }}>
                  <option value="">Tous les modules</option>
                  {filterOptions.modules.map(m => <option key={m} value={m}>{label(MODULE_LABELS as any, m)}</option>)}
                </select>
                <select className="gv-input !py-2" value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }}>
                  <option value="">Toutes les actions</option>
                  {filterOptions.actions.map(a => <option key={a} value={a}>{label(AUDIT_ACTION_LABELS as any, a)}</option>)}
                </select>
                <select className="gv-input !py-2" value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setPage(0); }}>
                  <option value="">Toutes gravités</option>
                  {Object.entries(AUDIT_SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className="gv-input !py-2" value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(0); }}>
                  <option value="">Tous les utilisateurs</option>
                  {filterOptions.users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <select className="gv-input !py-2" value={deviceFilter} onChange={e => { setDeviceFilter(e.target.value); setPage(0); }}>
                  <option value="">Toutes les caisses</option>
                  {filterOptions.devices.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <input type="date" className="gv-input !py-2" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
                  <input type="date" className="gv-input !py-2" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} />
                </div>
              </div>
            </div>

            <div className="gv-card !p-0 overflow-hidden">
              {loading ? (
                <LoadingState label="Lecture du journal…" />
              ) : entries.length === 0 ? (
                <EmptyState
                  title="Aucune entrée"
                  description="Aucun événement ne correspond à ces filtres. Les caisses transmettent leur journal à chaque synchronisation."
                  icon={ScrollText}
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="gv-table">
                      <thead>
                        <tr>
                          <th className="w-20">Date</th>
                          <th className="w-32">Utilisateur</th>
                          <th className="w-28">Boutique</th>
                          <th className="w-32">Module</th>
                          <th className="w-40">Action</th>
                          <th>Détail</th>
                          <th className="w-24">Gravité</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map(entry => (
                          <tr key={entry.id} className="cursor-pointer" onClick={() => setSelected(entry)}>
                            <td className="font-mono text-[10px] gv-muted whitespace-nowrap">
                              {new Date(entry.createdAt).toLocaleDateString('fr-DZ')}<br />
                              {new Date(entry.createdAt).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="font-semibold text-[11px]">{entry.userName || 'Système'}</td>
                            <td className="text-[11px] gv-muted">{entry.storeName || '—'}</td>
                            <td className="text-[11px] gv-muted">{label(MODULE_LABELS as any, entry.module)}</td>
                            <td className="text-[11px] font-semibold">{label(AUDIT_ACTION_LABELS as any, entry.action)}</td>
                            <td className="text-[11px] leading-snug">{entry.summary}</td>
                            <td>
                              <span className={SEVERITY_BADGE[entry.severity] || 'gv-badge-neutral'}>
                                {label(AUDIT_SEVERITY_LABELS as any, entry.severity)}
                              </span>
                            </td>
                            <td className="text-center"><Eye className="w-3.5 h-3.5 gv-muted inline" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgb(var(--gv-border))' }}>
                    <span className="text-[11px] gv-muted">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} sur {total.toLocaleString('fr-DZ')} entrées
                    </span>
                    <div className="flex items-center gap-2">
                      <button className="gv-btn-ghost !px-2.5 !py-1.5" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-[11px] font-bold">{page + 1} / {lastPage + 1}</span>
                      <button className="gv-btn-ghost !px-2.5 !py-1.5" disabled={page >= lastPage} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {tab === 'costs' && (
          <div className="gv-card !p-0 overflow-hidden">
            <div className="px-4 py-3 text-[11px] gv-muted" style={{ borderBottom: '1px solid rgb(var(--gv-border))' }}>
              Chaque recalcul de prix d'achat déclenché par une réception, avec la règle appliquée et le stock qui l'a déterminée.
            </div>
            {costs.length === 0 ? (
              <EmptyState title="Aucun recalcul enregistré" description="L'historique se remplit dès qu'une caisse synchronise un bon d'achat." icon={Coins} />
            ) : (
              <div className="overflow-x-auto">
                <table className="gv-table">
                  <thead>
                    <tr>
                      <th className="w-20">Date</th>
                      <th>Article</th>
                      <th className="text-center w-24">Stock avant</th>
                      <th className="text-right w-28">Ancien prix</th>
                      <th className="text-right w-28">Prix reçu</th>
                      <th className="text-right w-28">Prix retenu</th>
                      <th>Règle appliquée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.map((c: any) => (
                      <tr key={c.id}>
                        <td className="font-mono text-[10px] gv-muted">{new Date(c.created_at).toLocaleDateString('fr-DZ')}</td>
                        <td>
                          <div className="font-bold text-[11px]">{c.productName || `Article #${c.product_id}`}</div>
                          <div className="text-[10px] gv-muted font-mono">{c.productCode}</div>
                        </td>
                        <td className="text-center font-mono font-bold">{c.stock_before}</td>
                        <td className="text-right font-mono gv-muted">{formatDZD(c.previous_cost)}</td>
                        <td className="text-right font-mono">{formatDZD(c.incoming_cost)}</td>
                        <td className="text-right font-mono font-black text-blue-500">{formatDZD(c.new_cost)}</td>
                        <td className="text-[10px] leading-snug">
                          <span className={c.strategy === 'dominant' ? 'gv-badge-warning' : c.strategy === 'median' ? 'gv-badge-accent' : 'gv-badge-neutral'}>
                            {label(COST_STRATEGY_LABELS as any, c.strategy)}
                          </span>
                          <div className="gv-muted mt-1">{c.reason}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'devices' && (
          <div className="space-y-4">
            <div className="gv-card !p-0 overflow-hidden">
              <div className="px-4 py-3 text-[11px] font-black uppercase tracking-wide" style={{ borderBottom: '1px solid rgb(var(--gv-border))' }}>
                Postes de caisse
              </div>
              {!stats?.devices?.length ? (
                <EmptyState title="Aucune caisse enregistrée" description="Une caisse apparaît ici après sa première synchronisation." icon={MonitorSmartphone} />
              ) : (
                <table className="gv-table">
                  <thead>
                    <tr>
                      <th>Identifiant du poste</th>
                      <th>Boutique</th>
                      <th>Version</th>
                      <th className="text-center">Envois</th>
                      <th>Dernière activité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.devices.map((d: any) => (
                      <tr key={d.deviceId}>
                        <td className="font-mono font-bold text-[11px]">{d.deviceId}</td>
                        <td className="text-[11px] gv-muted">#{d.storeId ?? '—'}</td>
                        <td className="text-[11px] gv-muted">{d.appVersion || '—'}</td>
                        <td className="text-center font-mono font-bold">{d.totalBatches}</td>
                        <td className="text-[11px] font-mono gv-muted">{new Date(d.lastSeenAt).toLocaleString('fr-DZ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="gv-card !p-0 overflow-hidden">
              <div className="px-4 py-3 text-[11px] font-black uppercase tracking-wide" style={{ borderBottom: '1px solid rgb(var(--gv-border))' }}>
                Derniers envois reçus
              </div>
              {!stats?.lastBatches?.length ? (
                <EmptyState title="Aucun envoi" icon={RefreshCw} />
              ) : (
                <table className="gv-table">
                  <thead>
                    <tr>
                      <th>Reçu le</th>
                      <th>Poste</th>
                      <th>Authentifié</th>
                      <th>Contenu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.lastBatches.map((b: any) => (
                      <tr key={b.id}>
                        <td className="font-mono text-[10px] gv-muted">{new Date(b.receivedAt).toLocaleString('fr-DZ')}</td>
                        <td className="font-mono text-[11px]">{b.deviceId}</td>
                        <td>
                          {b.authenticated ? (
                            <span className="gv-badge-success"><ShieldCheck className="w-3 h-3" />Clé valide</span>
                          ) : (
                            <span className="gv-badge-warning"><ShieldOff className="w-3 h-3" />Sans clé</span>
                          )}
                        </td>
                        <td className="text-[10px] font-mono gv-muted">
                          {b.counts
                            ? Object.entries(b.counts).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'rien de nouveau'
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(selected)}
        title={selected ? label(AUDIT_ACTION_LABELS as any, selected.action) : ''}
        subtitle={selected ? `Entrée #${selected.id} — ${new Date(selected.createdAt).toLocaleString('fr-DZ')}` : ''}
        icon={ScrollText}
        width="max-w-3xl"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed font-semibold">{selected.summary}</p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ['Utilisateur', selected.userName || 'Système'],
                ['Boutique', selected.storeName || '—'],
                ['Module', label(MODULE_LABELS as any, selected.module)],
                ['Gravité', label(AUDIT_SEVERITY_LABELS as any, selected.severity)],
                ['Objet', selected.entityType ? `${selected.entityType} #${selected.entityId ?? '—'}` : '—'],
                ['Poste', selected.deviceId || '—'],
                ['Version', selected.appVersion || '—'],
                ['Reçu le', new Date(selected.receivedAt).toLocaleString('fr-DZ')]
              ].map(([k, v]) => (
                <div key={k as string} className="gv-card-flat !p-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider gv-muted">{k}</p>
                  <p className="text-[11px] font-semibold mt-0.5 break-words">{v}</p>
                </div>
              ))}
            </div>

            {selected.changes && selected.changes.length > 0 && (
              <div>
                <p className="gv-label">Valeurs modifiées</p>
                <div className="gv-card-flat !p-0 overflow-hidden">
                  <table className="gv-table">
                    <thead><tr><th>Champ</th><th>Avant</th><th>Après</th></tr></thead>
                    <tbody>
                      {selected.changes.map((c, i) => (
                        <tr key={i}>
                          <td className="font-semibold">{c.label || c.field}</td>
                          <td className="font-mono text-rose-500">{renderValue(c.before)}</td>
                          <td className="font-mono text-emerald-500">{renderValue(c.after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selected.metadata && Object.keys(selected.metadata).length > 0 && (
              <div>
                <p className="gv-label">Contexte technique</p>
                <pre className="gv-card-flat !p-3 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed" style={{ maxHeight: '16rem' }}>
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
