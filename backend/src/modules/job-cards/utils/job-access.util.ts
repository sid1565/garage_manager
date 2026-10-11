import { EntityManager } from 'typeorm';
import { UserRole } from '../../../common/enums';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IAuthUser } from '../../../common/interfaces';
import { JobCard } from '../entities/job-card.entity';
import { JobStatusHistory } from '../entities/job-status-history.entity';
import { JobCardStatus } from '../enums/job-card-status.enum';
import { isTerminal } from './job-status.machine';

/** Statuses in which diagnosis (problems/photos) may be recorded or changed (UC-9). */
const DIAGNOSIS_STATUSES: readonly JobCardStatus[] = [
  JobCardStatus.CHECKED_IN,
  JobCardStatus.DIAGNOSING,
  JobCardStatus.IN_PROGRESS,
];

/**
 * tenant:same-garage for job cards (and everything reached through them: problems,
 * attachments, estimates). Another garage's job is indistinguishable from a missing one.
 * `lock` takes a row lock for the rest of the transaction (status changes are serialised).
 */
export const findJobInGarage = async (
  manager: EntityManager,
  garageId: string,
  jobCardId: string,
  lock = false,
): Promise<JobCard> => {
  const job = await manager.getRepository(JobCard).findOne({
    where: { id: jobCardId, garageId },
    ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
  });
  if (!job) throw apiError('NOT_FOUND');
  return job;
};

export const assertNotClosed = (job: JobCard): void => {
  if (isTerminal(job.status)) throw apiError('JOB_CLOSED');
};

/** Ownership rule assigned-mechanic (AC-9.2, AC-13.3). Other roles pass. */
export const assertAssignedIfMechanic = (user: IAuthUser, job: JobCard): void => {
  if (user.role === UserRole.MECHANIC && job.assignedMechanicId !== user.id) {
    throw apiError('NOT_ASSIGNED_MECHANIC');
  }
};

/** Closed → JOB_CLOSED; outside diagnosis statuses → JOB_NOT_EDITABLE; then assigned-mechanic. */
export const assertDiagnosisWritable = (user: IAuthUser, job: JobCard): void => {
  assertNotClosed(job);
  if (!DIAGNOSIS_STATUSES.includes(job.status)) throw apiError('JOB_NOT_EDITABLE');
  assertAssignedIfMechanic(user, job);
};

/**
 * Applies a status change and appends history in the caller's transaction. Callers MUST
 * validate the transition first (job-status.machine). `changedById` null = owner link/system.
 */
export const applyStatusChange = async (
  manager: EntityManager,
  job: JobCard,
  to: JobCardStatus,
  changedById: string | null,
  note: string | null = null,
): Promise<JobCard> => {
  const from = job.status;
  job.status = to;
  if (isTerminal(to)) job.closedAt = new Date();
  const saved = await manager.getRepository(JobCard).save(job);
  await manager.getRepository(JobStatusHistory).insert({
    jobCardId: job.id,
    fromStatus: from,
    toStatus: to,
    changedById,
    note,
  });
  return saved;
};
