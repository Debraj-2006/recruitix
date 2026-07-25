// Canonical violation type -> severity map, mirroring the client's `SEVERITY` const in
// src/utils/proctorEngine.ts. Severity (and therefore the integrity-score deduction) is always
// computed from this server-side map, never trusted from the client's request body — a buggy or
// modified client could otherwise self-report 'critical' for a trivial event.
export const VIOLATION_SEVERITY = {
  NO_FACE: 'warning',
  MULTIPLE_FACES: 'critical',
  LOOKING_AWAY: 'warning',
  IDENTITY_MISMATCH: 'critical',
  TAB_HIDDEN: 'warning',
  SCREEN_SHARE_STOPPED: 'critical',
  MIC_UNAVAILABLE: 'warning',
  SUSPICIOUS_AUDIO: 'warning',
};

export function severityForType(type) {
  return VIOLATION_SEVERITY[type] ?? null;
}
