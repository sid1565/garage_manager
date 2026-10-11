import { EAdminModule, EUserModule, UserRole } from '../enums';

export type SectionKey = EAdminModule | EUserModule;

const ALL_USER_SECTIONS = Object.values(EUserModule);

/**
 * Role → section permission matrix read by SectionGuard. PUBLISHED by the auth
 * stage (output/garage-auth-design.md §3) — the API designer assigns from this
 * catalog and must route back here rather than invent sections.
 * Row-level rules (e.g. "mechanic only on assigned jobs") are enforced in services.
 */
export const SECTION_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<SectionKey>>> = {
  [UserRole.PLATFORM_ADMIN]: new Set<SectionKey>(Object.values(EAdminModule)),
  [UserRole.GARAGE_ADMIN]: new Set<SectionKey>(ALL_USER_SECTIONS),
  [UserRole.SERVICE_ADVISOR]: new Set<SectionKey>(
    ALL_USER_SECTIONS.filter(
      (s) =>
        ![
          EUserModule.GARAGE_PROFILE_MANAGE,
          EUserModule.STAFF_MANAGE,
          EUserModule.DELIVER_ON_CREDIT,
          EUserModule.DASHBOARD_REVENUE,
          EUserModule.AUDIT_LOG_VIEW,
        ].includes(s),
    ),
  ),
  [UserRole.MECHANIC]: new Set<SectionKey>([
    EUserModule.GARAGE_PROFILE_VIEW,
    EUserModule.CUSTOMERS_VIEW,
    EUserModule.VEHICLES_VIEW,
    EUserModule.JOB_CARDS_VIEW,
    EUserModule.JOB_STATUS_UPDATE,
    EUserModule.DIAGNOSIS_RECORD,
    EUserModule.ESTIMATES_VIEW,
    EUserModule.DASHBOARD_VIEW,
  ]),
};
