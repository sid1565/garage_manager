"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns3,
  Filter,
  LayoutGrid,
  List,
  Phone,
  RotateCcw,
  Search,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Empty,
  ErrorNote,
  Input,
  LinkButton,
  Loading,
  PageHeader,
  Pager,
  Plate,
  Select,
  StatusBadge,
  cx,
} from "@/components/ui/kit";
import { api, apiData } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LIFECYCLE, STATUS_LABEL, when } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { DashboardSummary, JobListItem, JobStatus, Paged } from "@/lib/types";

const BAYS = LIFECYCLE.filter((s) => s !== "DELIVERED");
const LIMIT = 100;

/* Stage accent colors for kanban columns */
const BAY_ACCENT: Record<JobStatus, { bg: string; border: string; dot: string; header: string }> = {
  CHECKED_IN:        { bg: "bg-[#f8fafc]",        border: "border-[#cbd5e1]", dot: "bg-[#64748b]",  header: "text-[#334155]" },
  DIAGNOSING:        { bg: "bg-[#eff6ff]",        border: "border-[#bfdbfe]", dot: "bg-[#3b82f6]",  header: "text-[#1e40af]" },
  AWAITING_APPROVAL: { bg: "bg-[#fffbeb]",        border: "border-[#fde68a]", dot: "bg-[#f59e0b]",  header: "text-[#92400e]" },
  APPROVED:          { bg: "bg-[#f0fdf4]",        border: "border-[#bbf7d0]", dot: "bg-[#22c55e]",  header: "text-[#166534]" },
  IN_PROGRESS:       { bg: "bg-[#f0fdf4]",        border: "border-[#bbf7d0]", dot: "bg-[#16a34a]",  header: "text-[#15803d]" },
  QUALITY_CHECK:     { bg: "bg-[#faf5ff]",        border: "border-[#e9d5ff]", dot: "bg-[#8b5cf6]",  header: "text-[#5b21b6]" },
  READY_FOR_PICKUP:  { bg: "bg-[#ecfeff]",        border: "border-[#a5f3fc]", dot: "bg-[#06b6d4]",  header: "text-[#155e75]" },
  DELIVERED:         { bg: "bg-[#f8fafc]",        border: "border-[#cbd5e1]", dot: "bg-[#374151]",  header: "text-[#1e293b]" },
  CANCELLED:         { bg: "bg-[#fff5f5]",        border: "border-[#fecaca]", dot: "bg-[#dc2626]",  header: "text-[#b91c1c]" },
};

export function JobBoard() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const rawView = params.get("view");
  const view: "cards" | "bays" | "list" =
    rawView === "list" ? "list" : rawView === "bays" ? "bays" : "cards";

  const status = params.get("status") as JobStatus | null;
  const mine = params.get("mine") === "true";
  const overdue = params.get("overdue") === "true";
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [offset, setOffset] = useState(0);
  const [activeBaysOnly, setActiveBaysOnly] = useState(true);

  const baysScrollRef = useRef<HTMLDivElement>(null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next}`, { scroll: false });
    setOffset(0);
  };

  const clearAllFilters = () => {
    setSearch("");
    router.replace(pathname, { scroll: false });
    setOffset(0);
  };

  useEffect(() => {
    setSearch(params.get("search") ?? "");
  }, [params]);

  useEffect(() => {
    const currentParam = params.get("search") ?? "";
    if (search.trim() === currentParam) return;
    const timer = setTimeout(() => {
      setParam("search", search.trim() || null);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const summary = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiData<DashboardSummary>("/dashboard/summary"),
  });

  const query = {
    openOnly: !status,
    status: status ?? undefined,
    assignedToMe: mine || undefined,
    overdue: overdue || undefined,
    search: params.get("search") ?? undefined,
    limit: view === "list" ? 25 : LIMIT,
    offset: view === "list" ? offset : 0,
    order: view === "list" ? { createdAt: "DESC" } : { promisedDeliveryAt: "ASC" },
  };

  const jobs = useQuery({
    queryKey: ["job-cards", query],
    queryFn: () => api<Paged<JobListItem>>("/job-cards", { query }),
  });

  const hasFilters = Boolean(status || mine || overdue || params.get("search"));

  const getStageCount = (bay: JobStatus) => {
    if (mine || overdue || params.get("search")) {
      return jobs.data?.data.filter((j) => j.status === bay).length ?? 0;
    }
    return (
      summary.data?.jobsByStatus.find((r) => r.status === bay)?.count ??
      jobs.data?.data.filter((j) => j.status === bay).length ??
      0
    );
  };

  const totalOpenCount = useMemo(() => {
    if (mine || overdue || params.get("search")) {
      return jobs.data?.total ?? 0;
    }
    return summary.data?.openJobs ?? jobs.data?.total ?? 0;
  }, [mine, overdue, params, jobs.data, summary.data]);

  const overdueCount = summary.data?.overdue ?? jobs.data?.data.filter((j) => j.isOverdue).length ?? 0;

  const baysWithJobs = useMemo(() => {
    if (!jobs.data?.data) return [];
    return BAYS.filter((bay) => jobs.data.data.some((j) => j.status === bay));
  }, [jobs.data?.data]);

  const displayedBays = activeBaysOnly && baysWithJobs.length > 0 ? baysWithJobs : BAYS;

  const scrollBays = (direction: "left" | "right") => {
    if (baysScrollRef.current) {
      const offsetWidth = baysScrollRef.current.clientWidth;
      const scrollAmount = direction === "left" ? -offsetWidth * 0.75 : offsetWidth * 0.75;
      baysScrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <>
      <PageHeader
        title="Job Board"
        sub={
          jobs.data
            ? `${jobs.data.total} ${status ? STATUS_LABEL[status].toLowerCase() : "open"} vehicle${jobs.data.total === 1 ? "" : "s"} in workshop`
            : " "
        }
        actions={can(user?.role, "JOB_CARDS_MANAGE") && (
          <LinkButton href="/job-cards/new" tone="next">
            <Zap className="size-4" aria-hidden />
            Check in vehicle
          </LinkButton>
        )}
      />

      {/* ── Stage Pipeline Filter ─────────────────────────────────────────── */}
      <div className="mb-5 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-1 rounded-[14px] border border-[#e8edf3] bg-white p-1.5 shadow-[0_2px_8px_rgba(15,22,35,0.06)]">
          {/* All Open */}
          <button
            type="button"
            onClick={() => setParam("status", null)}
            className={cx(
              "inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-sm font-semibold transition-all duration-200",
              !status
                ? "bg-[#0f1623] text-white shadow-sm"
                : "text-[#6b7e94] hover:bg-[#f0f3f7] hover:text-[#0f1623]",
            )}
          >
            <span>All Open</span>
            <span
              className={cx(
                "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                !status ? "bg-white/20 text-white" : "bg-[#f0f3f7] text-[#6b7e94]",
              )}
            >
              {totalOpenCount}
            </span>
          </button>

          <div className="mx-1 h-5 w-px bg-[#e8edf3]" aria-hidden />

          {/* Stage pills */}
          {BAYS.map((bay) => {
            const count = getStageCount(bay);
            const isSelected = status === bay;
            const hasCars = count > 0;
            const accent = BAY_ACCENT[bay];
            return (
              <button
                key={bay}
                type="button"
                onClick={() => setParam("status", isSelected ? null : bay)}
                className={cx(
                  "inline-flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium transition-all duration-200",
                  isSelected
                    ? "bg-[#0f1623] text-white shadow-sm"
                    : hasCars
                    ? `${accent.bg} ${accent.header} hover:opacity-90 border ${accent.border}`
                    : "text-[#9baabb] hover:bg-[#f0f3f7] hover:text-[#6b7e94]",
                )}
              >
                <span className="flex items-center gap-1.5">
                  {hasCars && !isSelected && (
                    <span className={cx("size-2 rounded-full", accent.dot)} aria-hidden />
                  )}
                  {STATUS_LABEL[bay]}
                </span>
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                    isSelected
                      ? "bg-white/20 text-white"
                      : hasCars
                      ? `${accent.dot} text-white`
                      : "bg-[#f0f3f7] text-[#9baabb]",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Search & Filter Toolbar ───────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-64 flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9baabb]"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Plate, job #, customer or phone…"
              className="pl-10 pr-9"
              aria-label="Search jobs"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(""); setParam("search", null); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#9baabb] hover:bg-[#f0f3f7] hover:text-[#0f1623] transition-colors"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Stage select for small screens */}
          <Select
            value={status ?? ""}
            onChange={(e) => setParam("status", e.target.value || null)}
            className="w-auto text-sm"
            aria-label="Filter stage"
          >
            <option value="">All open stages</option>
            {[...LIFECYCLE, "CANCELLED" as const].map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </Select>

          {/* My jobs toggle */}
          <Toggle
            on={mine}
            onClick={() => setParam("mine", mine ? null : "true")}
            icon={<UserRound className="size-3.5" />}
          >
            My jobs
          </Toggle>

          {/* Overdue toggle */}
          <Toggle
            on={overdue}
            onClick={() => setParam("overdue", overdue ? null : "true")}
            icon={<Clock className="size-3.5" />}
            badge={
              overdueCount > 0 ? (
                <span className="rounded-full bg-[#dc2626] px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {overdueCount}
                </span>
              ) : undefined
            }
          >
            Overdue
          </Toggle>

          {/* Clear filters */}
          {hasFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-medium text-[#6b7e94] hover:bg-[#f0f3f7] hover:text-[#0f1623] transition-colors"
            >
              <RotateCcw className="size-3.5" /> Clear filters
            </button>
          )}
        </div>

        {/* View mode switcher */}
        <div
          className="flex rounded-[10px] border border-[#e8edf3] bg-white p-1 shadow-xs"
          role="group"
          aria-label="Layout mode"
        >
          <ViewToggle on={view === "cards"} onClick={() => setParam("view", "cards")} icon={<LayoutGrid className="size-4" />} label="Cards" />
          <ViewToggle on={view === "bays"} onClick={() => setParam("view", "bays")} icon={<Columns3 className="size-4" />} label="Bays" />
          <ViewToggle on={view === "list"} onClick={() => setParam("view", "list")} icon={<List className="size-4" />} label="List" />
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {jobs.isPending ? (
        <Loading />
      ) : jobs.error ? (
        <ErrorNote error={jobs.error} />
      ) : jobs.data.total === 0 ? (
        <Empty
          title={hasFilters ? "No matching jobs found" : "The workshop is currently empty"}
          action={
            hasFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[#0f1623] px-4 text-sm font-medium text-white hover:bg-[#1a2535] transition-colors"
              >
                <RotateCcw className="size-4" /> Reset filters
              </button>
            ) : (
              can(user?.role, "JOB_CARDS_MANAGE") && (
                <LinkButton href="/job-cards/new" tone="next">
                  <Zap className="size-4" aria-hidden />
                  Check in a vehicle
                </LinkButton>
              )
            )
          }
        >
          {hasFilters
            ? "Try adjusting your search or clearing stage filters."
            : "Check in the first vehicle to generate a job card and track its progress."}
        </Empty>
      ) : view === "cards" ? (
        /* ── Cards View ───────────────────────────────────────────────────── */
        <div className="space-y-8 animate-fade-in">
          {!status ? (
            BAYS.map((bay) => {
              const inBay = jobs.data.data.filter((j) => j.status === bay);
              if (inBay.length === 0) return null;
              const accent = BAY_ACCENT[bay];
              return (
                <section key={bay} className="space-y-3" aria-label={STATUS_LABEL[bay]}>
                  <div className="flex items-center justify-between pb-2">
                    <h2 className="flex items-center gap-2.5 text-base font-bold text-[#0f1623]">
                      <span className={cx("size-2.5 rounded-full", accent.dot)} aria-hidden />
                      {STATUS_LABEL[bay]}
                      <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-bold", accent.bg, accent.header, "border", accent.border)}>
                        {inBay.length}
                      </span>
                    </h2>
                    <button
                      type="button"
                      onClick={() => setParam("status", bay)}
                      className="text-xs font-semibold text-[#1d4ed8] hover:underline transition-all"
                    >
                      Focus bay →
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {inBay.map((j) => (
                      <JobCard key={j.id} job={j} />
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {jobs.data.data.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          )}
        </div>
      ) : view === "bays" ? (
        /* ── Bays View ────────────────────────────────────────────────────── */
        <div className="animate-fade-in">
          {/* Bays toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#e8edf3] bg-white px-4 py-3 text-sm shadow-xs">
            <label className="flex cursor-pointer items-center gap-2 text-[#3d4d60] hover:text-[#0f1623]">
              <input
                type="checkbox"
                checked={activeBaysOnly}
                onChange={(e) => setActiveBaysOnly(e.target.checked)}
                className="size-4 rounded accent-[#f59e0b]"
              />
              <span className="font-semibold">Active bays only</span>
              <span className="text-xs text-[#9baabb]">
                ({baysWithJobs.length} of {BAYS.length} bays active)
              </span>
            </label>
            {!activeBaysOnly && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#9baabb]">Navigate:</span>
                <button
                  type="button"
                  onClick={() => scrollBays("left")}
                  aria-label="Scroll bays left"
                  className="rounded-[8px] border border-[#e8edf3] bg-white p-1.5 text-[#6b7e94] hover:bg-[#f0f3f7] hover:text-[#0f1623] transition-colors"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollBays("right")}
                  aria-label="Scroll bays right"
                  className="rounded-[8px] border border-[#e8edf3] bg-white p-1.5 text-[#6b7e94] hover:bg-[#f0f3f7] hover:text-[#0f1623] transition-colors"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </div>

          {/* Columns */}
          <div
            ref={baysScrollRef}
            className={cx(
              "flex gap-4 pb-4",
              activeBaysOnly
                ? "flex-wrap md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "bays overflow-x-auto",
            )}
          >
            {displayedBays.map((bay) => {
              const inBay = jobs.data.data.filter((j) => j.status === bay);
              const hasCars = inBay.length > 0;
              const accent = BAY_ACCENT[bay];
              return (
                <section
                  key={bay}
                  className={cx(
                    "flex flex-col rounded-[18px] border-2 p-3.5 transition-all duration-200",
                    activeBaysOnly ? "w-full" : "w-80 shrink-0",
                    hasCars ? `${accent.border} ${accent.bg}` : "border-[#e8edf3] bg-[#fafbfc] opacity-70 hover:opacity-100",
                  )}
                  aria-label={STATUS_LABEL[bay]}
                >
                  <header className="mb-3 flex items-center justify-between">
                    <h2 className={cx("flex items-center gap-2 text-sm font-bold", accent.header)}>
                      <span className={cx("size-2.5 rounded-full", hasCars ? accent.dot : "bg-[#d4dce6]")} aria-hidden />
                      {STATUS_LABEL[bay]}
                    </h2>
                    <span
                      className={cx(
                        "rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums",
                        hasCars ? `${accent.dot} text-white` : "bg-[#e8edf3] text-[#9baabb]",
                      )}
                    >
                      {inBay.length}
                    </span>
                  </header>
                  <div className="flex flex-1 flex-col gap-2.5">
                    {inBay.map((j) => (
                      <JobCard key={j.id} job={j} compact />
                    ))}
                    {inBay.length === 0 && (
                      <div className="flex flex-1 items-center justify-center rounded-[12px] border-2 border-dashed border-[#e8edf3] bg-white/50 py-8 text-xs text-[#9baabb]">
                        No vehicles here
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── List View ────────────────────────────────────────────────────── */
        <div className="animate-fade-in">
          <div className="overflow-hidden rounded-[18px] border border-[#e8edf3] bg-white shadow-[0_2px_8px_rgba(15,22,35,0.06)]">
            <ul className="divide-y divide-[#f0f3f7]">
              {jobs.data.data.map((j) => (
                <li key={j.id} className="group">
                  <Link
                    href={`/job-cards/${j.id}`}
                    className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 px-5 py-4 transition-all duration-150 hover:bg-[#f8fafc] md:grid-cols-[10rem_1fr_12rem_8.5rem_9.5rem_auto]"
                  >
                    <Plate number={j.vehicle.registrationNumber} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#0f1623]">
                        {j.vehicle.make} {j.vehicle.model}
                      </p>
                      <p className="truncate text-xs text-[#6b7e94]">
                        {j.customer.name}
                        {j.customer.phone && ` · ${j.customer.phone}`}
                      </p>
                    </div>
                    <div><StatusBadge status={j.status} /></div>
                    <div className="font-mono text-xs text-[#9baabb]">#{j.jobNumber}</div>
                    <div className={cx("text-xs font-semibold", j.isOverdue ? "text-[#dc2626]" : "text-[#6b7e94]")}>
                      {when(j.promisedDeliveryAt)}
                    </div>
                    <div className="hidden text-right text-[#9baabb] transition-transform group-hover:translate-x-0.5 md:block">
                      <ArrowRight className="size-4" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Pager
            total={jobs.data.total}
            limit={jobs.data.limit}
            offset={jobs.data.offset}
            onChange={setOffset}
          />
        </div>
      )}
    </>
  );
}

/* ── Premium Job Card ─────────────────────────────────────────────────────── */
function JobCard({ job, compact }: { job: JobListItem; compact?: boolean }) {
  const accent = BAY_ACCENT[job.status];
  return (
    <Link
      href={`/job-cards/${job.id}`}
      className={cx(
        "group relative flex flex-col rounded-[18px] border-2 bg-white transition-all duration-200",
        "hover:shadow-[0_8px_28px_rgba(15,22,35,0.12)] hover:-translate-y-0.5",
        "shadow-[0_2px_8px_rgba(15,22,35,0.06)]",
        job.isOverdue ? "border-[#fca5a5]" : accent.border,
        compact ? "p-3" : "p-4",
      )}
    >
      {/* Status accent strip at top */}
      <div className={cx("absolute left-0 right-0 top-0 h-0.5 rounded-t-[16px]", accent.dot)} aria-hidden />

      <div>
        {/* Top: Plate & status */}
        <div className="flex items-start justify-between gap-2 pt-1">
          <Plate number={job.vehicle.registrationNumber} size="sm" />
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={job.status} />
            {job.isOverdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fee2e2] px-2 py-0.5 text-[10px] font-bold text-[#dc2626]">
                <AlertTriangle className="size-3" /> Overdue
              </span>
            )}
          </div>
        </div>

        {/* Vehicle & job # */}
        <div className="mt-3">
          <h3 className="text-sm font-bold text-[#0f1623] transition-colors group-hover:text-[#1d4ed8]">
            {job.vehicle.make} {job.vehicle.model}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-[#9baabb]">#{job.jobNumber}</p>
        </div>

        {/* Customer & phone */}
        {!compact && (
          <div className="mt-3 flex items-center justify-between rounded-[8px] bg-[#f8fafc] px-2.5 py-2 text-xs">
            <span className="truncate font-medium text-[#3d4d60]">{job.customer.name}</span>
            {job.customer.phone && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  window.location.href = `tel:${job.customer.phone}`;
                }}
                className="ml-2 inline-flex shrink-0 cursor-pointer items-center gap-1 text-[#6b7e94] hover:text-[#1d4ed8]"
                title="Call customer"
              >
                <Phone className="size-3" />
                {job.customer.phone}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-[#f0f3f7] pt-2.5 text-xs">
        <span className="flex max-w-[140px] items-center gap-1.5 truncate">
          <div
            className={cx(
              "flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
              job.assignedMechanic
                ? "bg-[#f0f3f7] text-[#3d4d60]"
                : "bg-[#fef3c7] text-[#92400e]",
            )}
          >
            {job.assignedMechanic
              ? job.assignedMechanic.name.charAt(0).toUpperCase()
              : "?"}
          </div>
          <span className={cx("truncate font-medium", job.assignedMechanic ? "text-[#3d4d60]" : "text-[#f59e0b]")}>
            {job.assignedMechanic?.name ?? "Unassigned"}
          </span>
        </span>
        <span className={cx("flex shrink-0 items-center gap-1 font-semibold", job.isOverdue ? "text-[#dc2626]" : "text-[#6b7e94]")}>
          <Clock className="size-3" />
          {when(job.promisedDeliveryAt)}
        </span>
      </div>
    </Link>
  );
}

/* ── Toggle Buttons ───────────────────────────────────────────────────────── */
function Toggle({
  on, onClick, icon, badge, children,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-sm font-medium transition-all duration-150",
        on
          ? "border-[#0f1623] bg-[#0f1623] text-white shadow-sm"
          : "border-[#d4dce6] bg-white text-[#6b7e94] hover:border-[#9baabb] hover:text-[#0f1623]",
      )}
    >
      {icon}
      <span>{children}</span>
      {badge}
    </button>
  );
}

function ViewToggle({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={label}
      className={cx(
        "inline-flex h-8 w-9 items-center justify-center rounded-[8px] text-sm font-medium transition-all duration-150",
        on
          ? "bg-[#0f1623] text-white shadow-xs"
          : "text-[#9baabb] hover:bg-[#f0f3f7] hover:text-[#3d4d60]",
      )}
    >
      {icon}
    </button>
  );
}
