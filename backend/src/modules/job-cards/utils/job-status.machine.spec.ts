import { HttpException } from '@nestjs/common';
import { UserRole } from '../../../common/enums';
import { JobCardStatus as S } from '../enums/job-card-status.enum';
import {
  assertManualTransition,
  assertSystemTransition,
  manualTargets,
} from './job-status.machine';

const code = (fn: () => void): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return ((e as HttpException).getResponse() as { errorCode: string }).errorCode;
  }
};

describe('job status machine (spec §3.1)', () => {
  it('AC-13.1 APPROVED → IN_PROGRESS is allowed for staff', () => {
    expect(
      code(() => assertManualTransition(S.APPROVED, S.IN_PROGRESS, UserRole.SERVICE_ADVISOR)),
    ).toBeUndefined();
  });

  it('AC-13.2 CHECKED_IN → DELIVERED is rejected', () => {
    expect(
      code(() => assertManualTransition(S.CHECKED_IN, S.DELIVERED, UserRole.GARAGE_ADMIN)),
    ).toBe('INVALID_STATUS_TRANSITION');
  });

  it('AC-13.3 mechanic: only IN_PROGRESS → QUALITY_CHECK', () => {
    expect(
      code(() => assertManualTransition(S.IN_PROGRESS, S.QUALITY_CHECK, UserRole.MECHANIC)),
    ).toBeUndefined();
    expect(
      code(() => assertManualTransition(S.QUALITY_CHECK, S.READY_FOR_PICKUP, UserRole.MECHANIC)),
    ).toBe('MECHANIC_TRANSITION_NOT_ALLOWED');
    expect(manualTargets(S.APPROVED, UserRole.MECHANIC)).toEqual([]);
  });

  it('IN_PROGRESS cannot be reached manually from DIAGNOSING (needs approval first)', () => {
    expect(
      code(() => assertManualTransition(S.DIAGNOSING, S.IN_PROGRESS, UserRole.GARAGE_ADMIN)),
    ).toBe('INVALID_STATUS_TRANSITION');
  });

  it('system edges: estimate flow, delivery, cancellation', () => {
    expect(code(() => assertSystemTransition(S.DIAGNOSING, S.AWAITING_APPROVAL))).toBeUndefined();
    expect(code(() => assertSystemTransition(S.AWAITING_APPROVAL, S.DIAGNOSING))).toBeUndefined();
    expect(code(() => assertSystemTransition(S.READY_FOR_PICKUP, S.DELIVERED))).toBeUndefined();
    expect(code(() => assertSystemTransition(S.IN_PROGRESS, S.CANCELLED))).toBeUndefined();
    expect(code(() => assertSystemTransition(S.DELIVERED, S.CANCELLED))).toBe(
      'INVALID_STATUS_TRANSITION',
    );
  });
});
