import { Car, CheckCircle2, Shield, Wrench } from "lucide-react";
import { Plate, StatusBadge } from "@/components/ui/kit";
import type { JobStatus } from "@/lib/types";

const SAMPLE: { plate: string; car: string; status: JobStatus }[] = [
  { plate: "MH12AB1234", car: "Maruti Swift", status: "AWAITING_APPROVAL" },
  { plate: "KA05MN4821", car: "Hyundai Creta", status: "IN_PROGRESS" },
  { plate: "DL3CAF0919", car: "Honda City", status: "READY_FOR_PICKUP" },
];

const FEATURES = [
  { icon: CheckCircle2, text: "Digital job cards from check-in to delivery" },
  { icon: Car, text: "Vehicle history and service tracking" },
  { icon: Shield, text: "Owners approve work from a link on their phone" },
];

/** Split frame for sign-in screens: premium workshop panel on the left, form on the right. */
export function AuthFrame({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      {/* ── Left: Brand panel ─────────────────────────────────────────────── */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex"
        style={{ background: "linear-gradient(155deg, #0c1322 0%, #0f1a2e 50%, #0c1a3a 100%)" }}
      >
        {/* Subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
          aria-hidden
        />

        {/* Amber glow orbs */}
        <div className="pointer-events-none absolute -left-20 top-20 size-72 rounded-full bg-[#f59e0b]/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 right-10 size-56 rounded-full bg-[#1d4ed8]/15 blur-3xl" aria-hidden />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-[12px] bg-[#f59e0b] shadow-[0_0_24px_rgba(245,158,11,0.5)]">
            <Wrench className="size-6 text-[#0c1322]" aria-hidden />
          </div>
          <div>
            <span className="block font-display text-2xl font-bold leading-tight">Garage Manager</span>
            <span className="block text-[11px] font-semibold tracking-widest text-[#f59e0b]/70 uppercase">Workshop Pro</span>
          </div>
        </div>

        {/* Main headline */}
        <div className="relative">
          <p className="max-w-md font-display text-5xl font-bold leading-[1.05] tracking-tight">
            Every car that comes in, from check-in to{" "}
            <span className="text-[#f59e0b]">handover.</span>
          </p>

          {/* Live vehicles sample */}
          <div className="mt-10 flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Live workshop</p>
            {SAMPLE.map((s) => (
              <div
                key={s.plate}
                className="flex items-center gap-4 rounded-[14px] border border-white/8 bg-white/5 px-4 py-3 backdrop-blur-sm"
              >
                <Plate number={s.plate} />
                <span className="flex-1 text-sm font-medium text-white/75">{s.car}</span>
                <span className="[&_span]:!text-white/60 [&_span]:!bg-white/8">
                  <StatusBadge status={s.status} />
                </span>
              </div>
            ))}
          </div>

          {/* Feature list */}
          <ul className="mt-10 flex flex-col gap-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/50">
                <Icon className="size-4 shrink-0 text-[#f59e0b]/60" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom tagline */}
        <p className="relative text-xs text-white/25">
          Trusted by garages across India · No app required for customers
        </p>
      </aside>

      {/* ── Right: Form ───────────────────────────────────────────────────── */}
      <main className="flex items-center justify-center bg-[#f0f3f7] px-5 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-[10px] bg-[#0c1322]">
              <Wrench className="size-5 text-[#f59e0b]" aria-hidden />
            </div>
            <span className="font-display text-xl font-bold text-[#0f1623]">Garage Manager</span>
          </div>

          {/* Form card */}
          <div className="rounded-[20px] border border-[#e8edf3] bg-white p-8 shadow-[0_4px_24px_rgba(15,22,35,0.08)]">
            <h1 className="font-display text-3xl font-bold text-[#0f1623]">{title}</h1>
            <p className="mt-2 text-sm text-[#6b7e94]">{sub}</p>
            <div className="mt-7">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
