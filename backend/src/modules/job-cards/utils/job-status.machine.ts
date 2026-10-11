import { UserRole } from '../../../common/enums';
import { apiError } from '../../../common/helpers/api-error.helper';
import { JobCardStatus, TERMINAL_JOB_STATUSES } from '../enums/job-card-status.enum';

const S = JobCardStatus;

/**
 * Spec §3.1 lifecycle. Edges reachable through POST /job-cards/:id/status ("manual").
 * AWAITING_APPROVAL / APPROVED are driven by estimates, DELIVERED by /deliver,
 * CANCELLED by /cancel — those transitions go through `assertSystemTransition`.
 */
const MANUAL_EDGES = new Map<JobCardStatus, readonly JobCardStatus[]>([
  [S.CHECKED_IN, [S.DIAGNOSING]],
  [S.APPROVED, [S.IN_PROGRESS]],
  [S.IN_PROGRESS, [S.QUALITY_CHECK]],
  [S.QUALITY_CHECK, [S.READY_FOR_PICKUP, S.IN_PROGRESS]], // QC failed → rework
  [S.READY_FOR_PICKUP, [S.IN_PROGRESS]], // owner reports an issue at pickup
]);

const SYSTEM_EDGES = new Map<JobCardStatus, readonly JobCardStatus[]>([
  [S.CHECKED_IN, [S.DIAGNOSING]], // first problem recorded
  [S.DIAGNOSING, [S.AWAITING_APPROVAL]], // estimate sent
  [S.IN_PROGRESS, [S.AWAITING_APPROVAL]], // additional-work estimate sent (UC-9 1b)
  [S.AWAITING_APPROVAL, [S.APPROVED, S.DIAGNOSING]], // owner approved / rejected
  [S.READY_FOR_PICKUP, [S.DELIVERED]],
]);

/** Mechanics may only make this one move, on jobs assigned to them (AC-13.3). */
const MECHANIC_EDGE: readonly [JobCardStatus, JobCardStatus] = [S.IN_PROGRESS, S.QUALITY_CHECK];

export const isTerminal = (status: JobCardStatus): boolean =>
  TERMINAL_JOB_STATUSES.includes(status);

const transitionError = (from: JobCardStatus, to: JobCardStatus): Error =>
  apiError('INVALID_STATUS_TRANSITION', { from, to });

export const manualTargets = (from: JobCardStatus, role: UserRole): JobCardStatus[] => {
  if (role === UserRole.MECHANIC) return from === MECHANIC_EDGE[0] ? [MECHANIC_EDGE[1]] : [];
  return [...(MANUAL_EDGES.get(from) ?? [])];
};

/** Validates a user-requested move (UC-13). Role-specific rules on top of the graph. */
export const assertManualTransition = (
  from: JobCardStatus,
  to: JobCardStatus,
  role: UserRole,
): void => {
  if (!(MANUAL_EDGES.get(from) ?? []).includes(to)) throw transitionError(from, to);
  if (role === UserRole.MECHANIC && (from !== MECHANIC_EDGE[0] || to !== MECHANIC_EDGE[1])) {
    throw apiError('MECHANIC_TRANSITION_NOT_ALLOWED');
  }
};

/** Validates a move made by the system as a side effect (estimate sent, approval, delivery). */
export const assertSystemTransition = (from: JobCardStatus, to: JobCardStatus): void => {
  if (to === S.CANCELLED) {
    if (isTerminal(from)) throw transitionError(from, to);
    return;
  }
  if (!(SYSTEM_EDGES.get(from) ?? []).includes(to)) throw transitionError(from, to);
};
