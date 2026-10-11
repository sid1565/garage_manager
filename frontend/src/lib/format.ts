import type { JobStatus } from "./types";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/** "1534.00" → "₹1,534.00". Money stays a string until display. */
export const money = (value: string | null | undefined, currency = "INR"): string => {
  if (value === null || value === undefined) return "—";
  let fmt = moneyFormatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2 });
    moneyFormatters.set(currency, fmt);
  }
  return fmt.format(Number(value));
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

export const date = (value: string | null | undefined): string => (value ? dateFmt.format(new Date(value)) : "—");
export const dateTime = (value: string | null | undefined): string => (value ? dateTimeFmt.format(new Date(value)) : "—");

/** "Today, 5:30 pm" / "Tomorrow, 10:00 am" / "12 Oct, 4:00 pm". */
export const when = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(value);
  const today = new Date();
  const diff = Math.round((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86400000);
  if (diff === 0) return `Today, ${timeFmt.format(d)}`;
  if (diff === 1) return `Tomorrow, ${timeFmt.format(d)}`;
  if (diff === -1) return `Yesterday, ${timeFmt.format(d)}`;
  return dateTimeFmt.format(d);
};

export const km = (value: number): string => `${new Intl.NumberFormat("en-IN").format(value)} km`;

/** "IN_PROGRESS" → "In progress". */
export const humanize = (value: string): string =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");

export const STATUS_LABEL: Record<JobStatus, string> = {
  CHECKED_IN: "Checked in",
  DIAGNOSING: "Diagnosing",
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  IN_PROGRESS: "In progress",
  QUALITY_CHECK: "Quality check",
  READY_FOR_PICKUP: "Ready for pickup",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** The workshop lifecycle in order (spec §3.1). CANCELLED is off the track. */
export const LIFECYCLE: JobStatus[] = [
  "CHECKED_IN",
  "DIAGNOSING",
  "AWAITING_APPROVAL",
  "APPROVED",
  "IN_PROGRESS",
  "QUALITY_CHECK",
  "READY_FOR_PICKUP",
  "DELIVERED",
];

/** Input-friendly "YYYY-MM-DDTHH:mm" in local time for <input type="datetime-local">. */
export const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
