import React from 'react';
import { useUiStore } from '../store/useUiStore';
import {
  X, CheckCircle2, AlertTriangle, Info, XCircle, Inbox, Loader2, ShieldAlert
} from 'lucide-react';

/* ────────────────────────────── Notifications ────────────────────────────── */

const TOAST_STYLES: Record<string, { icon: React.ElementType; ring: string; tint: string }> = {
  success: { icon: CheckCircle2, ring: 'border-emerald-500/40', tint: 'text-emerald-500' },
  error: { icon: XCircle, ring: 'border-rose-500/40', tint: 'text-rose-500' },
  warning: { icon: AlertTriangle, ring: 'border-amber-500/40', tint: 'text-amber-500' },
  info: { icon: Info, ring: 'border-blue-500/40', tint: 'text-blue-500' }
};

/**
 * File de notifications globale. Remplace les `alert()` bloquants, qui gèlent
 * la caisse et ne laissent aucune trace lisible à l'écran.
 */
export const Toaster: React.FC = () => {
  const { toasts, dismissToast } = useUiStore();
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-5 end-5 z-[100] flex flex-col gap-2.5 w-[22rem] max-w-[calc(100vw-2.5rem)]">
      {toasts.map(toast => {
        const style = TOAST_STYLES[toast.kind] || TOAST_STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            role="status"
            className={`gv-card !p-3.5 gv-animate-in flex items-start gap-3 ${style.ring}`}
            style={{ boxShadow: 'var(--gv-shadow-lg)' }}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${style.tint}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-snug">{toast.title}</p>
              {toast.description && (
                <p className="text-[11px] gv-muted mt-1 leading-relaxed break-words">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="gv-muted hover:opacity-70 shrink-0"
              aria-label="Fermer la notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

/* ────────────────────────────── Modale ────────────────────────────── */

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  width?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ open, title, subtitle, icon: Icon, width = 'max-w-2xl', onClose, footer, children }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="gv-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`gv-modal ${width}`} role="dialog" aria-modal="true" aria-label={title}>
        <header
          className="flex items-start gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgb(var(--gv-border))' }}
        >
          {Icon && (
            <div className="w-9 h-9 rounded-xl bg-blue-600/15 text-blue-500 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black tracking-tight truncate">{title}</h2>
            {subtitle && <p className="text-[11px] gv-muted mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="gv-muted hover:opacity-70 p-1" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto gv-scroll px-5 py-4">{children}</div>

        {footer && (
          <footer
            className="px-5 py-3.5 flex items-center justify-end gap-2.5 shrink-0"
            style={{ borderTop: '1px solid rgb(var(--gv-border))', backgroundColor: 'rgb(var(--gv-surface-2))' }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

/* ────────────────────────────── Confirmation ────────────────────────────── */

interface ConfirmProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Motif obligatoire : utilisé pour les opérations sensibles tracées au journal. */
  requireReason?: boolean;
  reasonLabel?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export const ConfirmDialog: React.FC<ConfirmProps> = ({
  open, title, message, confirmLabel = 'Confirmer', danger, requireReason, reasonLabel = 'Motif (obligatoire)', onCancel, onConfirm
}) => {
  const [reason, setReason] = React.useState('');
  React.useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const blocked = requireReason && reason.trim().length < 3;

  return (
    <Modal
      open={open}
      title={title}
      icon={danger ? ShieldAlert : Info}
      width="max-w-md"
      onClose={onCancel}
      footer={
        <>
          <button className="gv-btn-ghost" onClick={onCancel}>Annuler</button>
          <button
            className={danger ? 'gv-btn-danger' : 'gv-btn-primary'}
            disabled={blocked}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-xs leading-relaxed">{message}</p>
      {requireReason && (
        <div className="mt-4">
          <label className="gv-label">{reasonLabel}</label>
          <textarea
            className="gv-input min-h-[80px] resize-y"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Cette justification sera enregistrée au journal d'audit."
          />
          {blocked && <p className="text-[10px] text-amber-500 mt-1.5">Au moins 3 caractères sont requis.</p>}
        </div>
      )}
    </Modal>
  );
};

/* ────────────────────────────── États vides / chargement ────────────────────────────── */

export const EmptyState: React.FC<{ title: string; description?: string; icon?: React.ElementType; action?: React.ReactNode }> = ({
  title, description, icon: Icon = Inbox, action
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div
      className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
      style={{ backgroundColor: 'rgb(var(--gv-surface-2))', color: 'rgb(var(--gv-text-muted))' }}
    >
      <Icon className="w-7 h-7" />
    </div>
    <p className="text-sm font-bold">{title}</p>
    {description && <p className="text-xs gv-muted mt-1.5 max-w-sm leading-relaxed">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Chargement…' }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3">
    <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
    <p className="text-xs gv-muted font-semibold">{label}</p>
  </div>
);

/** Écran affiché quand un module est ouvert sans la permission de consultation. */
export const AccessDenied: React.FC<{ module?: string }> = ({ module }) => (
  <div className="h-full flex items-center justify-center p-8">
    <div className="gv-card max-w-md text-center !p-8">
      <div className="w-14 h-14 rounded-2xl bg-rose-500/12 text-rose-500 flex items-center justify-center mx-auto mb-4">
        <ShieldAlert className="w-7 h-7" />
      </div>
      <h2 className="text-sm font-black">Accès non autorisé</h2>
      <p className="text-xs gv-muted mt-2 leading-relaxed">
        Votre profil ne dispose pas du droit de consultation{module ? ` sur le module « ${module} »` : ''}.
        Demandez au propriétaire de vous l'accorder depuis « Droits & Utilisateurs ».
      </p>
    </div>
  </div>
);

/* ────────────────────────────── Indicateurs ────────────────────────────── */

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ElementType;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}

const TONE_COLORS: Record<string, string> = {
  neutral: 'rgb(var(--gv-text-muted))',
  accent: 'rgb(var(--gv-accent))',
  success: 'rgb(var(--gv-success))',
  warning: 'rgb(var(--gv-warning))',
  danger: 'rgb(var(--gv-danger))'
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, hint, icon: Icon, tone = 'neutral' }) => (
  <div className="gv-card !p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider gv-muted truncate">{label}</p>
        <p className="gv-kpi-value mt-1.5" style={{ color: TONE_COLORS[tone] }}>{value}</p>
        {hint && <p className="text-[10px] gv-muted mt-1 truncate">{hint}</p>}
      </div>
      {Icon && (
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${TONE_COLORS[tone]} 14%, transparent)`, color: TONE_COLORS[tone] }}
        >
          <Icon className="w-4.5 h-4.5" />
        </div>
      )}
    </div>
  </div>
);

/** Bandeau de titre réutilisé en tête de chaque module. */
export const PageHeader: React.FC<{ title: string; subtitle?: string; icon?: React.ElementType; actions?: React.ReactNode }> = ({
  title, subtitle, icon: Icon, actions
}) => (
  <div
    className="flex items-center justify-between gap-4 px-5 py-3.5 shrink-0"
    style={{ borderBottom: '1px solid rgb(var(--gv-border))', backgroundColor: 'rgb(var(--gv-surface))' }}
  >
    <div className="flex items-center gap-3 min-w-0">
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-blue-600/12 text-blue-500 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="text-sm font-black tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-[11px] gv-muted truncate">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);
