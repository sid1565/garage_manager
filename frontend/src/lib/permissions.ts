import type { Role } from "./types";

/**
 * UI mirror of backend SECTION_PERMISSIONS (backend/src/common/constants/section-permissions.ts).
 * Only hides controls a role can't use — the API remains the authority.
 */
export type Section =
  | "GARAGE_PROFILE_MANAGE" | "STAFF_VIEW" | "STAFF_MANAGE" | "CUSTOMERS_MANAGE" | "VEHICLES_MANAGE"
  | "JOB_CARDS_MANAGE" | "JOB_ASSIGN" | "JOB_STATUS_UPDATE" | "DIAGNOSIS_RECORD" | "ESTIMATES_MANAGE"
  | "ESTIMATES_VERBAL_APPROVAL" | "NOTIFICATIONS_VIEW" | "NOTIFICATIONS_SEND" | "INVOICES_VIEW"
  | "INVOICES_MANAGE" | "PAYMENTS_RECORD" | "DELIVER_ON_CREDIT" | "AUDIT_LOG_VIEW";

const ADVISOR_DENIED: Section[] = ["GARAGE_PROFILE_MANAGE", "STAFF_MANAGE", "DELIVER_ON_CREDIT", "AUDIT_LOG_VIEW"];
const MECHANIC_ALLOWED: Section[] = ["JOB_STATUS_UPDATE", "DIAGNOSIS_RECORD"];

export const can = (role: Role | undefined, section: Section): boolean => {
  switch (role) {
    case "GARAGE_ADMIN":
      return true;
    case "SERVICE_ADVISOR":
      return !ADVISOR_DENIED.includes(section);
    case "MECHANIC":
      return MECHANIC_ALLOWED.includes(section);
    default:
      return false;
  }
};

export const ROLE_LABEL: Record<Role, string> = {
  PLATFORM_ADMIN: "Platform admin",
  GARAGE_ADMIN: "Garage admin",
  SERVICE_ADVISOR: "Service advisor",
  MECHANIC: "Mechanic",
};
