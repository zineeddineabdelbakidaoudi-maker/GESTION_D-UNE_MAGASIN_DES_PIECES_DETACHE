import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { Modal } from './ui';
import { KeyRound, ShieldAlert } from 'lucide-react';

interface Props {
  open: boolean;
  /** Imposé après une réinitialisation par le propriétaire : la modale n'est pas annulable. */
  forced?: boolean;
  onClose: () => void;
  onDone: () => void;
}

export const ChangePasswordModal: React.FC<Props> = ({ open, forced, onClose, onDone }) => {
  const { pushToast, notifyError } = useStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 6;
  const blocked = saving || !current || next.length < 6 || next !== confirm;

  const submit = async () => {
    setSaving(true);
    try {
      await invokeIpc('auth-change-password', { currentPassword: current, newPassword: next });
      pushToast({ kind: 'success', title: 'Mot de passe modifié', description: 'Il sera demandé à votre prochaine connexion.' });
      setCurrent('');
      setNext('');
      setConfirm('');
      onDone();
    } catch (err) {
      notifyError(err, 'Changement impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={forced ? 'Nouveau mot de passe requis' : 'Changer mon mot de passe'}
      subtitle={
        forced
          ? 'Votre mot de passe a été réinitialisé par le propriétaire. Définissez-en un nouveau pour continuer.'
          : 'Le changement est inscrit au journal d\'audit.'
      }
      icon={forced ? ShieldAlert : KeyRound}
      width="max-w-md"
      onClose={forced ? () => {} : onClose}
      footer={
        <>
          {!forced && <button className="gv-btn-ghost" onClick={onClose}>Annuler</button>}
          <button className="gv-btn-primary" disabled={blocked} onClick={submit}>
            {saving ? 'Enregistrement…' : 'Valider'}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <label className="gv-label">Mot de passe actuel</label>
          <input className="gv-input" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="gv-label">Nouveau mot de passe</label>
          <input className="gv-input" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} />
          {tooShort && <p className="text-[10px] text-amber-500 mt-1">6 caractères minimum.</p>}
        </div>
        <div>
          <label className="gv-label">Confirmer le nouveau mot de passe</label>
          <input className="gv-input" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          {mismatch && <p className="text-[10px] text-rose-500 mt-1">Les deux saisies ne correspondent pas.</p>}
        </div>
      </div>
    </Modal>
  );
};
