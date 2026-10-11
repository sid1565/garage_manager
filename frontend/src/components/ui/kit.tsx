"use client";

import { AlertCircle, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import Link from "next/link";
import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "@/lib/api";
import { LIFECYCLE, STATUS_LABEL } from "@/lib/format";
import type { JobStatus } from "@/lib/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

/* ── Buttons ─────────────────────────────────────────────────────────────── */
type Tone = "next" | "ink" | "quiet" | "danger";

const TONES: Record<Tone, string> = {
  next: "btn-amber",
  ink: "bg-[#0f1623] text-white hover:bg-[#1a2535] shadow-sm",
  quiet: "bg-white text-[#3d4d60] border border-[#d4dce6] hover:border-[#6b7e94] hover:bg-[#f8fafc] shadow-xs",
  danger: "bg-white text-[#dc2626] border border-[#d4dce6] hover:border-[#dc2626] hover:bg-[#fee2e2] shadow-xs",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  busy?: boolean;
  size?: "sm" | "md";
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = "quiet", busy, size = "md", className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        "rounded-[10px]",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({ href, tone = "quiet", children, className }: { href: string; tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-medium transition-all duration-200",
        TONES[tone],
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ── Form fields ─────────────────────────────────────────────────────────── */
const control =
  "rounded-[10px] border border-[#d4dce6] bg-white px-3.5 text-[#0f1623] placeholder:text-[#9baabb] transition-all duration-150 " +
  "focus:border-[#f59e0b] focus:outline-none focus:ring-3 focus:ring-[#f59e0b]/20 " +
  "hover:border-[#9baabb] " +
  "aria-invalid:border-[#dc2626] aria-invalid:ring-[#dc2626]/20 shadow-xs";

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string, describedBy?: string) => React.ReactNode }) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[#3d4d60]">
        {label}
      </label>
      {children(id, describedBy)}
      {error ? (
        <p id={`${id}-err`} className="flex items-center gap-1 text-sm text-[#dc2626]">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-[#6b7e94]">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(control, "h-10", !/\bw-/.test(className ?? "") && "w-full", className)} {...rest} />;
});
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cx(control, "h-10 pr-8 cursor-pointer", !/\bw-/.test(className ?? "") && "w-full", className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(control, "min-h-24 w-full py-2.5", className)} {...rest} />;
});

/** Shows an API error in the interface's voice; validation details listed under it. */
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const api = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-[12px] border border-[#dc2626]/25 bg-[#fff5f5] px-4 py-3 text-sm text-[#dc2626] shadow-xs">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        {api?.message ?? "Something went wrong. Try again."}
        {api?.body.details?.length ? (
          <ul className="mt-1 list-disc pl-4 text-[#dc2626]/80">
            {api.body.details.map((d) => (
              <li key={d.field + d.issue}>{d.issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/* ── Surfaces ────────────────────────────────────────────────────────────── */
export function Panel({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("overflow-hidden rounded-[18px] border border-[#e8edf3] bg-white shadow-[0_2px_8px_0_rgba(15,22,35,0.07)]", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-[#f0f3f7] px-5 py-4">
          {title && <h2 className="text-lg font-semibold text-[#0f1623]">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, actions }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[2.1rem] font-bold tracking-tight text-[#0f1623] md:text-[2.6rem]">{title}</h1>
        {sub && <p className="mt-1 text-[#6b7e94]">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[18px] border-2 border-dashed border-[#d4dce6] bg-white/60 p-10">
      <p className="font-display text-xl font-bold text-[#0f1623]">{title}</p>
      {children && <p className="max-w-prose text-sm text-[#6b7e94]">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-12 text-[#6b7e94]" role="status">
      <div className="relative size-8">
        <div className="absolute inset-0 rounded-full border-2 border-[#e8edf3]" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#f59e0b]" />
      </div>
      <span className="text-sm font-medium">{label}…</span>
    </div>
  );
}

/* ── Number plate: the one ornament ─────────────────────────────────────── */
export function Plate({ number, size = "md" }: { number: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const fontSize = { sm: "0.95rem", md: "1.2rem", lg: "1.75rem", xl: "clamp(2.4rem, 11vw, 3.6rem)" }[size];
  return (
    <span className="plate" style={{ fontSize }} aria-label={`Registration ${number}`}>
      <span className="plate__strip" aria-hidden>
        IND
      </span>
      <span className="plate__text">{formatPlate(number)}</span>
    </span>
  );
}

/** "MH12AB1234" → "MH 12 AB 1234" (state · district · series · number). */
export const formatPlate = (raw: string): string => {
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/.exec(raw);
  return m ? [m[1], m[2], m[3], m[4]].filter(Boolean).join(" ") : raw;
};

/* ── Job status ─────────────────────────────────────────────────────────── */
const STATUS_DOT: Record<JobStatus, string> = {
  CHECKED_IN:        "status-dot-CHECKED_IN",
  DIAGNOSING:        "status-dot-DIAGNOSING",
  AWAITING_APPROVAL: "status-dot-AWAITING_APPROVAL",
  APPROVED:          "status-dot-APPROVED",
  IN_PROGRESS:       "status-dot-IN_PROGRESS",
  QUALITY_CHECK:     "status-dot-QUALITY_CHECK",
  READY_FOR_PICKUP:  "status-dot-READY_FOR_PICKUP",
  DELIVERED:         "status-dot-DELIVERED",
  CANCELLED:         "status-dot-CANCELLED",
};

const STATUS_BG: Record<JobStatus, string> = {
  CHECKED_IN:        "bg-[#6b7e94]/15 text-[#4a5d72]",
  DIAGNOSING:        "bg-[#3b82f6]/15 text-[#1d4ed8]",
  AWAITING_APPROVAL: "bg-[#f59e0b]/15 text-[#92400e]",
  APPROVED:          "bg-[#10b981]/15 text-[#047857]",
  IN_PROGRESS:       "bg-[#16a34a]/15 text-[#15803d]",
  QUALITY_CHECK:     "bg-[#8b5cf6]/15 text-[#6d28d9]",
  READY_FOR_PICKUP:  "bg-[#06b6d4]/15 text-[#0e7490]",
  DELIVERED:         "bg-[#374151]/15 text-[#1f2937]",
  CANCELLED:         "bg-[#dc2626]/15 text-[#b91c1c]",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_BG[status])}>
      <span className={cx("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** The lifecycle as a track: done steps in ink, the current one in amber. */
export function StatusTrack({ status, vertical = false }: { status: JobStatus; vertical?: boolean }) {
  if (status === "CANCELLED") return <StatusBadge status={status} />;
  const current = LIFECYCLE.indexOf(status);
  return (
    <ol className={cx("flex gap-1", vertical ? "flex-col" : "flex-row overflow-x-auto")} aria-label="Job progress">
      {LIFECYCLE.map((step, i) => {
        const state = i < current ? "done" : i === current ? "now" : "next";
        return (
          <li
            key={step}
            aria-current={state === "now" ? "step" : undefined}
            className={cx("flex min-w-0 items-center gap-2", !vertical && "flex-1 flex-col items-stretch")}
          >
            <span
              className={cx(
                "block rounded-full transition-all duration-300",
                vertical ? "size-3 shrink-0" : "h-1.5 w-full",
                state === "done" && "bg-[#0f1623]",
                state === "now" && "bg-[#f59e0b]",
                state === "next" && "bg-[#e8edf3]",
              )}
              aria-hidden
            />
            <span
              className={cx(
                "truncate text-xs",
                vertical ? "" : "hidden lg:block",
                state === "now" ? "font-bold text-[#0f1623]" : state === "done" ? "text-[#3d4d60]" : "text-[#9baabb]",
              )}
            >
              {STATUS_LABEL[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Dialog (React Portal Modal) ─────────────────────────────────────────── */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0f1623]/60 backdrop-blur-md transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog container */}
      <div className="animate-slide-up relative z-10 w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-[20px] border border-white/50 bg-white text-[#0f1623] shadow-[0_24px_64px_rgba(15,22,35,0.25)]">
        {/* Header with amber accent */}
        <div className="flex items-center justify-between border-b border-[#f0f3f7] bg-[#fafbfc] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="h-5 w-1 rounded-full bg-[#f59e0b]" aria-hidden />
            <h2 id="dialog-title" className="text-lg font-bold text-[#0f1623]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] p-1.5 text-[#6b7e94] transition-all hover:bg-[#f0f3f7] hover:text-[#0f1623] cursor-pointer"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[75dvh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Pagination for limit/offset lists. */
export function Pager({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  return (
    <div className="mt-5 flex items-center justify-between text-sm text-[#6b7e94]">
      <span className="text-xs">
        Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="inline-flex size-8 items-center justify-center rounded-[8px] border border-[#d4dce6] bg-white text-[#3d4d60] transition-all hover:bg-[#f0f3f7] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-3 text-xs font-medium text-[#0f1623]">{page} / {totalPages}</span>
        <button
          onClick={() => onChange(offset + limit)}
          disabled={offset + limit >= total}
          className="inline-flex size-8 items-center justify-center rounded-[8px] border border-[#d4dce6] bg-white text-[#3d4d60] transition-all hover:bg-[#f0f3f7] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
