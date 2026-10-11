"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Car,
  CheckCircle2,
  Clock,
  IndianRupee,
  TrendingUp,
  Wrench,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { ErrorNote, LinkButton, Loading, PageHeader, Plate, StatusBadge, cx } from "@/components/ui/kit";
import { api, apiData } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LIFECYCLE, STATUS_LABEL, humanize, money, when } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { DashboardSummary, JobListItem, Paged } from "@/lib/types";

/* Stage colors for the pipeline strip */
const STAGE_CONFIG: Record<string, { bg: string; text: string; border: string; icon: React.ElementType }> = {
  CHECKED_IN:        { bg: "bg-[#f1f5f9]",  text: "text-[#475569]",  border: "border-[#cbd5e1]", icon: Car },
  DIAGNOSING:        { bg: "bg-[#eff6ff]",  text: "text-[#1e40af]",  border: "border-[#bfdbfe]", icon: Wrench },
  AWAITING_APPROVAL: { bg: "bg-[#fffbeb]",  text: "text-[#92400e]",  border: "border-[#fde68a]", icon: Clock },
  APPROVED:          { bg: "bg-[#f0fdf4]",  text: "text-[#166534]",  border: "border-[#bbf7d0]", icon: CheckCircle2 },
  IN_PROGRESS:       { bg: "bg-[#f0fdf4]",  text: "text-[#15803d]",  border: "border-[#86efac]", icon: Zap },
  QUALITY_CHECK:     { bg: "bg-[#faf5ff]",  text: "text-[#5b21b6]",  border: "border-[#e9d5ff]", icon: CheckCircle2 },
  READY_FOR_PICKUP:  { bg: "bg-[#ecfeff]",  text: "text-[#0e7490]",  border: "border-[#a5f3fc]", icon: Car },
  DELIVERED:         { bg: "bg-[#f8fafc]",  text: "text-[#1e293b]",  border: "border-[#cbd5e1]", icon: CheckCircle2 },
  CANCELLED:         { bg: "bg-[#fff5f5]",  text: "text-[#b91c1c]",  border: "border-[#fecaca]", icon: AlertTriangle },
};

const STAGE_DOT: Record<string, string> = {
  CHECKED_IN: "bg-[#64748b]",
  DIAGNOSING: "bg-[#3b82f6]",
  AWAITING_APPROVAL: "bg-[#f59e0b]",
  APPROVED: "bg-[#22c55e]",
  IN_PROGRESS: "bg-[#16a34a]",
  QUALITY_CHECK: "bg-[#8b5cf6]",
  READY_FOR_PICKUP: "bg-[#06b6d4]",
  DELIVERED: "bg-[#374151]",
  CANCELLED: "bg-[#dc2626]",
};

export function DashboardView() {
  const { user } = useAuth();
  const summary = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiData<DashboardSummary>("/dashboard/summary"),
  });
  const urgent = useQuery({
    queryKey: ["job-cards", "overdue"],
    queryFn: () =>
      api<Paged<JobListItem>>("/job-cards", {
        query: { overdue: true, limit: 8, order: { promisedDeliveryAt: "ASC" } },
      }),
  });

  if (summary.isPending) return <Loading />;
  if (summary.error) return <ErrorNote error={summary.error} />;
  const s = summary.data;
  const count = (status: string) => s.jobsByStatus.find((r) => r.status === status)?.count ?? 0;
  const stages = LIFECYCLE.filter((st) => st !== "DELIVERED");
  const overdueCount = s.overdue ?? 0;
  const totalOpen = s.openJobs ?? 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Today's Workshop"
        sub={`${totalOpen} vehicles in · ${s.dueToday} promised for today${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`}
        actions={
          can(user?.role, "JOB_CARDS_MANAGE") && (
            <LinkButton href="/job-cards/new" tone="next">
              <Zap className="size-4" aria-hidden />
              Check in vehicle
            </LinkButton>
          )
        }
      />

      {/* ── KPI Cards Row ─────────────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Open jobs"
          value={totalOpen}
          icon={<Car className="size-5" />}
          color="blue"
          href="/job-cards"
        />
        <KpiCard
          label="Due today"
          value={s.dueToday}
          icon={<Clock className="size-5" />}
          color={s.dueToday > 0 ? "amber" : "neutral"}
          href="/job-cards?overdue=true"
        />
        <KpiCard
          label="Overdue"
          value={overdueCount}
          icon={<AlertTriangle className="size-5" />}
          color={overdueCount > 0 ? "red" : "neutral"}
          href="/job-cards?overdue=true"
        />
        <KpiCard
          label="Need approval"
          value={count("AWAITING_APPROVAL")}
          icon={<CheckCircle2 className="size-5" />}
          color={count("AWAITING_APPROVAL") > 0 ? "amber" : "neutral"}
          href="/job-cards?status=AWAITING_APPROVAL"
        />
      </div>

      {/* ── Stage Pipeline Strip ──────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-[#0f1623]">Pipeline overview</h2>
          <Link href="/job-cards" className="text-sm font-semibold text-[#1d4ed8] hover:underline">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {stages.map((stage) => {
            const n = count(stage);
            const cfg = STAGE_CONFIG[stage] ?? { bg: "bg-[#f8fafc]", text: "text-[#374151]", border: "border-[#e8edf3]", icon: Car };
            const needsYou = (stage === "AWAITING_APPROVAL" || stage === "READY_FOR_PICKUP") && n > 0;
            const StageIcon = cfg.icon;
            return (
              <Link
                key={stage}
                href={`/job-cards?status=${stage}`}
                className={cx(
                  "group flex flex-col gap-2.5 rounded-[16px] border-2 p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                  needsYou
                    ? "border-[#f59e0b] bg-[#fffbeb] shadow-[0_0_0_3px_rgba(245,158,11,0.15)]"
                    : `${cfg.border} ${cfg.bg}`,
                )}
              >
                <div className="flex items-center justify-between">
                  <StageIcon className={cx("size-4", cfg.text, "opacity-70")} aria-hidden />
                  {needsYou && (
                    <span className="rounded-full bg-[#f59e0b] px-1.5 py-0.5 text-[9px] font-bold text-[#0c1322] animate-pulse-glow">
                      ACTION
                    </span>
                  )}
                </div>
                <span className={cx("font-display text-4xl font-bold leading-none", n === 0 ? "text-[#d4dce6]" : cfg.text)}>
                  {n}
                </span>
                <span className={cx("text-xs font-semibold leading-tight", n > 0 ? cfg.text : "text-[#9baabb]")}>
                  {STATUS_LABEL[stage]}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Bottom Panels ─────────────────────────────────────────────────── */}
      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Overdue vehicles */}
        <div className="overflow-hidden rounded-[18px] border border-[#e8edf3] bg-white shadow-[0_2px_8px_rgba(15,22,35,0.06)]">
          <div className="flex items-center justify-between border-b border-[#f0f3f7] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-[8px] bg-[#fee2e2]">
                <AlertTriangle className="size-4 text-[#dc2626]" aria-hidden />
              </div>
              <h2 className="font-bold text-[#0f1623]">Past promised time</h2>
            </div>
            <Link href="/job-cards?overdue=true" className="text-sm font-semibold text-[#dc2626] hover:underline">
              All overdue
            </Link>
          </div>
          <div className="p-5">
            {urgent.data?.data.length ? (
              <ul className="-my-1 divide-y divide-[#f0f3f7]">
                {urgent.data.data.map((j) => (
                  <li key={j.id}>
                    <Link
                      href={`/job-cards/${j.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3.5 transition-all hover:bg-[#fff5f5] rounded-[10px] -mx-2 px-2"
                    >
                      <Plate number={j.vehicle.registrationNumber} size="sm" />
                      <span className="min-w-32 flex-1 font-medium text-[#0f1623] text-sm">
                        {j.vehicle.make} {j.vehicle.model}
                      </span>
                      <StatusBadge status={j.status} />
                      <span className="text-sm font-bold text-[#dc2626] flex items-center gap-1">
                        <Clock className="size-3.5" aria-hidden />
                        {when(j.promisedDeliveryAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-[#f0fdf4]">
                  <CheckCircle2 className="size-6 text-[#16a34a]" />
                </div>
                <p className="font-semibold text-[#0f1623]">All on time</p>
                <p className="text-sm text-[#6b7e94]">Every open job is within its promised window.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Revenue panel */}
          {s.revenue && (
            <div className="overflow-hidden rounded-[18px] border border-[#e8edf3] bg-white shadow-[0_2px_8px_rgba(15,22,35,0.06)]">
              <div className="flex items-center gap-2.5 border-b border-[#f0f3f7] px-5 py-4">
                <div className="flex size-8 items-center justify-center rounded-[8px] bg-[#f0fdf4]">
                  <IndianRupee className="size-4 text-[#16a34a]" aria-hidden />
                </div>
                <h2 className="font-bold text-[#0f1623]">Money in</h2>
              </div>
              <div className="p-5">
                <dl className="grid grid-cols-2 gap-4">
                  <div className="rounded-[12px] border border-[#e8edf3] bg-[#f8fafc] p-3">
                    <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#9baabb]">Today</dt>
                    <dd className="font-display text-3xl font-bold text-[#0f1623]">
                      {money(s.revenue.today, s.revenue.currency)}
                    </dd>
                  </div>
                  <div className="rounded-[12px] border border-[#e8edf3] bg-[#f8fafc] p-3">
                    <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#9baabb]">This month</dt>
                    <dd className="font-display text-3xl font-bold text-[#0f1623]">
                      {money(s.revenue.thisMonth, s.revenue.currency)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {/* Top problems panel */}
          <div className="overflow-hidden rounded-[18px] border border-[#e8edf3] bg-white shadow-[0_2px_8px_rgba(15,22,35,0.06)]">
            <div className="flex items-center gap-2.5 border-b border-[#f0f3f7] px-5 py-4">
              <div className="flex size-8 items-center justify-center rounded-[8px] bg-[#eff6ff]">
                <BarChart3 className="size-4 text-[#1d4ed8]" aria-hidden />
              </div>
              <h2 className="font-bold text-[#0f1623]">Breaking this month</h2>
            </div>
            <div className="p-5">
              {s.topProblemCategories.length ? (
                <ul className="flex flex-col gap-3">
                  {s.topProblemCategories.map((c) => {
                    const max = s.topProblemCategories[0].count;
                    const pct = Math.round((c.count / max) * 100);
                    return (
                      <li key={c.category}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-[#0f1623]">{humanize(c.category)}</span>
                          <span className="font-bold tabular-nums text-[#3d4d60]">{c.count}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[#f0f3f7]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-[#6b7e94]">Problems recorded in the last 30 days will show here.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── KPI Card ─────────────────────────────────────────────────────────────── */
function KpiCard({
  label,
  value,
  icon,
  color,
  href,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "blue" | "amber" | "red" | "green" | "neutral";
  href: string;
}) {
  const colorMap = {
    blue:    { bg: "bg-[#eff6ff]", icon: "text-[#1d4ed8]", value: "text-[#1e40af]", border: "border-[#bfdbfe]" },
    amber:   { bg: "bg-[#fffbeb]", icon: "text-[#d97706]", value: "text-[#92400e]", border: "border-[#fde68a]" },
    red:     { bg: "bg-[#fff5f5]", icon: "text-[#dc2626]", value: "text-[#b91c1c]", border: "border-[#fecaca]" },
    green:   { bg: "bg-[#f0fdf4]", icon: "text-[#16a34a]", value: "text-[#166534]", border: "border-[#bbf7d0]" },
    neutral: { bg: "bg-white",     icon: "text-[#6b7e94]", value: "text-[#0f1623]", border: "border-[#e8edf3]" },
  };
  const c = colorMap[color];
  return (
    <Link
      href={href}
      className={cx(
        "group flex flex-col gap-3 rounded-[18px] border-2 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        c.bg,
        c.border,
      )}
    >
      <div className={cx("transition-transform duration-200 group-hover:scale-110", c.icon)}>
        {icon}
      </div>
      <div>
        <div className={cx("font-display text-4xl font-bold leading-none", c.value)}>{value}</div>
        <div className="mt-1 text-xs font-semibold text-[#9baabb] uppercase tracking-wide">{label}</div>
      </div>
    </Link>
  );
}
