// Real, debounced violation detection for continuous exam proctoring — replaces the old
// monitoringProfiles.ts canned-sequence simulator. Mirrors exam_proctor.py's
// ViolationLog.strike() semantics: N consecutive bad checks confirm one violation episode;
// a good check resets the streak so a single blurry frame never trips anything.

export type ViolationType =
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'LOOKING_AWAY'
  | 'IDENTITY_MISMATCH'
  | 'TAB_HIDDEN'
  | 'SCREEN_SHARE_STOPPED'
  | 'MIC_UNAVAILABLE'
  | 'SUSPICIOUS_AUDIO';
export type ViolationSeverity = 'warning' | 'critical';

export interface ConfirmedViolation {
  type: ViolationType;
  severity: ViolationSeverity;
  message: string;
}

const SEVERITY: Record<ViolationType, ViolationSeverity> = {
  NO_FACE: 'warning',
  MULTIPLE_FACES: 'critical',
  LOOKING_AWAY: 'warning',
  IDENTITY_MISMATCH: 'critical',
  TAB_HIDDEN: 'warning',
  SCREEN_SHARE_STOPPED: 'critical',
  MIC_UNAVAILABLE: 'warning',
  SUSPICIOUS_AUDIO: 'warning',
};

const MESSAGES: Record<ViolationType, string> = {
  NO_FACE: 'No face detected in frame.',
  MULTIPLE_FACES: 'Multiple faces detected in frame.',
  LOOKING_AWAY: 'Candidate appears to be looking away from the screen.',
  IDENTITY_MISMATCH: 'Face did not match the enrolled identity.',
  TAB_HIDDEN: 'Browser tab lost focus or was hidden.',
  SCREEN_SHARE_STOPPED: 'Screen sharing was stopped.',
  MIC_UNAVAILABLE: 'Microphone access was lost or revoked.',
  SUSPICIOUS_AUDIO: 'Sustained loud noise or talking detected.',
};

const STRIKES_TO_CONFIRM = 3;

export interface StrikeTracker {
  /** Registers one bad check for `type`. Returns a confirmed violation on the Nth consecutive strike, else null. */
  strike: (type: ViolationType) => ConfirmedViolation | null;
  /** Registers one good check for `type`, resetting its streak. */
  clear: (type: ViolationType) => void;
  clearAll: () => void;
}

export function createStrikeTracker(strikesRequired = STRIKES_TO_CONFIRM): StrikeTracker {
  const strikes = new Map<ViolationType, number>();

  function strike(type: ViolationType): ConfirmedViolation | null {
    const next = (strikes.get(type) ?? 0) + 1;
    // Resets on confirmation (rather than latching) so a violation that never clears — e.g. the
    // candidate walks away and never comes back — keeps re-confirming every `strikesRequired`
    // checks instead of firing exactly once and then going silent for the rest of the exam.
    if (next >= strikesRequired) {
      strikes.set(type, 0);
      return { type, severity: SEVERITY[type], message: MESSAGES[type] };
    }
    strikes.set(type, next);
    return null;
  }

  function clear(type: ViolationType) {
    strikes.set(type, 0);
  }

  function clearAll() {
    strikes.clear();
  }

  return { strike, clear, clearAll };
}

export const WARN_AT = 3;
export const AUTO_SUBMIT_AT = 10;

export interface ViolationPolicyResult {
  count: number;
  shouldWarn: boolean;
  shouldAutoSubmit: boolean;
}

/** Counts confirmed violations across a session and flags the warn/auto-submit thresholds. */
export function createViolationPolicy(options: { warnAt?: number; autoSubmitAt?: number } = {}) {
  const warnAt = options.warnAt ?? WARN_AT;
  const autoSubmitAt = options.autoSubmitAt ?? AUTO_SUBMIT_AT;
  let confirmedCount = 0;

  function record(): ViolationPolicyResult {
    confirmedCount += 1;
    return {
      count: confirmedCount,
      shouldWarn: confirmedCount === warnAt,
      shouldAutoSubmit: confirmedCount >= autoSubmitAt,
    };
  }

  function getCount() {
    return confirmedCount;
  }

  return { record, getCount };
}
