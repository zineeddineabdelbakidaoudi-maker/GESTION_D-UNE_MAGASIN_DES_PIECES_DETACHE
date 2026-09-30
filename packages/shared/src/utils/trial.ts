import { TRIAL_DURATION_MS } from '../constants/index';
import { TrialState } from '../types/index';

export function calculateTrialState(buildTimestamp: number, currentTimestamp = Date.now()): TrialState {
  const elapsed = currentTimestamp - buildTimestamp;
  const remainingMs = Math.max(0, TRIAL_DURATION_MS - elapsed);
  const isExpired = remainingMs <= 0;

  const totalMinutes = Math.floor(remainingMs / (1000 * 60));
  const remainingHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  // Au-dela de 48 h, « 168h 00m » ne se lit plus : on compte en jours.
  const remainingDays = Math.floor(remainingHours / 24);

  let message = '';
  if (isExpired) {
    message = "Version d'essai expirée — contactez le développeur pour la version complète.";
  } else if (remainingDays >= 1) {
    const heures = remainingHours % 24;
    const jour = remainingDays > 1 ? 'jours' : 'jour';
    message = `VERSION DÉMO — expire dans ${remainingDays} ${jour} ${heures}h`;
  } else if (remainingHours > 0) {
    message = `VERSION DÉMO — expire dans ${remainingHours}h ${remainingMinutes}m`;
  } else {
    message = `VERSION DÉMO — expire dans ${remainingMinutes} minutes !`;
  }

  return {
    isExpired,
    buildTime: buildTimestamp,
    remainingMs,
    remainingHours,
    remainingMinutes,
    remainingDays,
    message
  };
}
