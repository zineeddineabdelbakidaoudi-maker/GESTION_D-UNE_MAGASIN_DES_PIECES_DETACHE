import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { Modal, PageHeader, EmptyState, LoadingState, AccessDenied, StatCard } from '../components/ui';
import {
  AUDIT_ACTION_LABELS, AUDIT_SEVERITY_LABELS, MODULE_LABELS,
  type AuditSeverity
} from '@gestion-veloo/shared';
import {
  ScrollText, Search, Filter, Download, RefreshCw, ShieldAlert, Activity,
  CloudOff, LogIn, ChevronLeft, ChevronRight, Eye
} from 'lucide-react';

interface AuditChange { field: string; label?: string; before: unknown; after: unknown }

interface AuditEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  storeId: number | null;
  storeName: string | null;
  action: string;
  module: string;
  entityType: string | null;
  entityId: number | null;
  severity: AuditSeverity;
  summary: string;
  changes: AuditChange[] | null;
  metadata: Record<string, unknown> | null;
  deviceId: string | null;
  appVersion: string | null;
  syncedAt: string | null;
  createdAt: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  info: 'gv-badge-neutral',
  notice: 'gv-badge-accent',
  warning: 'gv-badge-warning',
  critical: 'gv-badge-danger'
};

const PAGE_SIZE = 50;

/** Les montants du journal sont stockés en centimes ; on les rend lisibles à l'affichage. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export const JournalPage: React.FC = () => {
  const { hasPermission, notifyError, pushToast } = useStore();
  const canView = hasPermission('journal', 'view');

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [filterOptions, setFilterOptions] = useState<{ modules: string[]; actions: string[]; users: any[] }>({ modules: [], actions: [], users: [] });
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invokeIpc<{ entries: AuditEntry[]; total: number }>('get-audit-log', {
        search: debouncedSearch || undefined,
        module: moduleFilter || undefined,
        action: actionFilter || undefined,
        severity: severityFilter || undefined,
        userId: userFilter ? Number(userFilter) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE
      });
      setEntries(res.entries || []);
      setTotal(res.total || 0);
    } catch (err) {
      notifyError(err, 'Lecture du journal impossible');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, moduleFilter, actionFilter, severityFilter, userFilter, dateFrom, dateTo, page, notifyError]);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [canView, load]);

  useEffect(() => {
    if (!canView) return;
    invokeIpc<any>('get-audit-stats').then(setStats).catch(() => {});
    invokeIpc<any>('get-audit-filters').then(setFilterOptions).catch(() => {});
  }, [canView]);

  const resetFilters = () => {
    setSearch('');
    setModuleFilter('');
    setActionFilter('');
    setSeverityFilter('');
    setUserFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(0);
  };

  /** Export CSV de la sélection courante, pour archivage ou contrôle externe. */
  const exportCsv = async () => {
    try {
      const res = await invokeIpc<{ entries: AuditEntry[] }>('get-audit-log', {
        search: debouncedSearch || undefined,
        module: moduleFilter || undefined,
        action: actionFilter || undefined,
        severity: severityFilter || undefined,
        userId: userFilter ? Number(userFilter) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: 1000
      });

      const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['ID', 'Date', 'Utilisateur', 'Boutique', 'Module', 'Action', 'Gravité', 'Résumé', 'Poste', 'Modifications'];
      const rows = (res.entries || []).map(e => [
        e.id,
        new Date(e.createdAt).toLocaleString('fr-DZ'),
        e.userName || '—',
        e.storeName || '—',
        MODULE_LABELS[e.module as keyof typeof MODULE_LABELS] || e.module,
        AUDIT_ACTION_LABELS[e.action as keyof typeof AUDIT_ACTION_LABELS] || e.action,
        AUDIT_SEVERITY_LABELS[e.severity] || e.severity,
        e.summary,
        e.deviceId || '—',
        (e.changes || []).map(c => `${c.label || c.field}: ${renderValue(c.before)} → ${renderValue(c.after)}`).join(' | ')
      ].map(escape).join(';'));

      // BOM UTF-8 : indispensable pour qu'Excel affiche correctement les accents.
      const blob = new Blob(['﻿' + [header.map(escape).join(';'), ...rows].join('\r\n')], {
        type: 'text/csv;charset=utf-8;'
      });
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader
        title="Journal d'Audit"
        subtitle="Registre en ajout seul : chaque opération, son auteur, son avant/après."
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

      <div className="flex-1 overflow-y-auto gv-scroll p-5 space-y-4">
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Entrées totales" value={stats.total?.toLocaleString('fr-DZ') ?? 0} icon={Activity} tone="accent" />
            <StatCard label="Aujourd'hui" value={stats.today ?? 0} icon={ScrollText} />
            <StatCard
              label="Événements critiques"
              value={stats.bySeverity?.critical ?? 0}
              icon={ShieldAlert}
              tone={(stats.bySeverity?.critical ?? 0) > 0 ? 'danger' : 'neutral'}
            />
            <StatCard
              label="Échecs connexion (7 j)"
              value={stats.failedLogins7d ?? 0}
              icon={LogIn}
              tone={(stats.failedLogins7d ?? 0) > 0 ? 'warning' : 'neutral'}
            />
            <StatCard
              label="En attente de sync"
              value={stats.pendingSync ?? 0}
              icon={CloudOff}
              hint="Non encore transmis au portail"
              tone={(stats.pendingSync ?? 0) > 0 ? 'warning' : 'success'}
            />
          </div>
        )}

        <div className="gv-card !p-3.5">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-blue-500" />
            <span className="text-[11px] font-black uppercase tracking-wide">Filtres</span>
            <button className="text-[10px] gv-muted hover:underline ms-auto" onClick={resetFilters}>Réinitialiser</button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-7 gap-2.5">
            <div className="col-span-2 relative">
              <Search className="w-4 h-4 gv-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                className="gv-input ps-9 !py-2"
                placeholder="Rechercher (résumé, utilisateur…)"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="gv-input !py-2" value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPage(0); }}>
              <option value="">Tous les modules</option>
              {filterOptions.modules.map(m => (
                <option key={m} value={m}>{MODULE_LABELS[m as keyof typeof MODULE_LABELS] || m}</option>
              ))}
            </select>
            <select className="gv-input !py-2" value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }}>
              <option value="">Toutes les actions</option>
              {filterOptions.actions.map(a => (
                <option key={a} value={a}>{AUDIT_ACTION_LABELS[a as keyof typeof AUDIT_ACTION_LABELS] || a}</option>
              ))}
            </select>
            <select className="gv-input !py-2" value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setPage(0); }}>
              <option value="">Toutes gravités</option>
              {Object.entries(AUDIT_SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="gv-input !py-2" value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(0); }}>
              <option value="">Tous les utilisateurs</option>
              {filterOptions.users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="gv-input !py-2" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} />
              <input type="date" className="gv-input !py-2" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} />
            </div>
          </div>
        </div>

        <div className="gv-card !p-0 overflow-hidden">
          {loading ? (
            <LoadingState label="Lecture du journal…" />
          ) : entries.length === 0 ? (
            <EmptyState title="Aucune entrée" description="Aucun événement ne correspond à ces filtres." icon={ScrollText} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="gv-table">
                  <thead>
                    <tr>
                      <th className="w-20">Date</th>
                      <th className="w-36">Utilisateur</th>
                      <th className="w-32">Module</th>
                      <th className="w-40">Action</th>
                      <th>Détail</th>
                      <th className="w-24">Gravité</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => (
                      <tr key={entry.id} className="cursor-pointer" onClick={() => setSelected(entry)}>
                        <td className="font-mono text-[10px] gv-muted whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleDateString('fr-DZ')}
                          <br />
                          {new Date(entry.createdAt).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="font-semibold text-[11px]">{entry.userName || 'Système'}</td>
                        <td className="text-[11px] gv-muted">
                          {MODULE_LABELS[entry.module as keyof typeof MODULE_LABELS] || entry.module}
                        </td>
                        <td className="text-[11px] font-semibold">
                          {AUDIT_ACTION_LABELS[entry.action as keyof typeof AUDIT_ACTION_LABELS] || entry.action}
                        </td>
                        <td className="text-[11px] leading-snug">{entry.summary}</td>
                        <td>
                          <span className={SEVERITY_BADGE[entry.severity] || 'gv-badge-neutral'}>
                            {AUDIT_SEVERITY_LABELS[entry.severity] || entry.severity}
                          </span>
                        </td>
                        <td className="text-center">
                          <Eye className="w-3.5 h-3.5 gv-muted inline" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: '1px solid rgb(var(--gv-border))' }}
              >
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
      </div>

      <Modal
        open={Boolean(selected)}
        title={selected ? (AUDIT_ACTION_LABELS[selected.action as keyof typeof AUDIT_ACTION_LABELS] || selected.action) : ''}
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
                ['Module', MODULE_LABELS[selected.module as keyof typeof MODULE_LABELS] || selected.module],
                ['Gravité', AUDIT_SEVERITY_LABELS[selected.severity] || selected.severity],
                ['Objet', selected.entityType ? `${selected.entityType} #${selected.entityId ?? '—'}` : '—'],
                ['Poste', selected.deviceId || '—'],
                ['Version', selected.appVersion || '—'],
                ['Synchronisé', selected.syncedAt ? new Date(selected.syncedAt).toLocaleString('fr-DZ') : 'Pas encore']
              ].map(([label, value]) => (
                <div key={label as string} className="gv-card-flat !p-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider gv-muted">{label}</p>
                  <p className="text-[11px] font-semibold mt-0.5 break-words">{value}</p>
                </div>
              ))}
            </div>

            {selected.changes && selected.changes.length > 0 && (
              <div>
                <p className="gv-label">Valeurs modifiées</p>
                <div className="gv-card-flat !p-0 overflow-hidden">
                  <table className="gv-table">
                    <thead>
                      <tr>
                        <th>Champ</th>
                        <th>Avant</th>
                        <th>Après</th>
                      </tr>
                    </thead>
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
                <pre
                  className="gv-card-flat !p-3 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed"
                  style={{ maxHeight: '16rem' }}
                >
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
