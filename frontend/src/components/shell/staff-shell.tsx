"use client";

import {
  Car,
  ChevronRight,
  ClipboardList,
  Gauge,
  LogOut,
  Settings,
  Shield,
  Users,
  UserRound,
  Wrench,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loading, cx } from "@/components/ui/kit";
import { useAuth } from "@/lib/auth";
import { can, ROLE_LABEL } from "@/lib/permissions";

const NAV = [
  { href: "/dashboard", label: "Today", icon: Gauge, desc: "Workshop overview" },
  { href: "/job-cards", label: "Job board", icon: ClipboardList, desc: "Active vehicles" },
  { href: "/vehicles", label: "Vehicles", icon: Car, desc: "All garage vehicles" },
  { href: "/customers", label: "Customers", icon: UserRound, desc: "Customer database" },
];

/** Guards every staff page: restores the session, forces temporary-password changes. */
export function StaffShell({ children }: { children: React.ReactNode }) {
  const { status, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "signed-out") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (status === "signed-in" && user?.mustChangePassword) router.replace("/change-password");
  }, [status, user, router, pathname]);

  if (status !== "signed-in" || !user || user.mustChangePassword) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#e8edf4]">
        <Loading label="Opening the workshop" />
      </div>
    );
  }

  const extra = [
    ...(can(user.role, "STAFF_VIEW") ? [{ href: "/staff", label: "Staff", icon: Users, desc: "Team management" }] : []),
    ...(can(user.role, "GARAGE_PROFILE_MANAGE") ? [{ href: "/settings", label: "Settings", icon: Settings, desc: "Garage settings" }] : []),
  ];
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const allNav = [...NAV, ...extra];

  return (
    <div className="min-h-dvh bg-workshop md:grid md:grid-cols-[15.5rem_1fr]">
      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside
        className="sticky top-0 hidden h-dvh flex-col md:flex"
        style={{
          background: "linear-gradient(180deg, #0c1322 0%, #0f1a2e 60%, #111827 100%)",
          boxShadow: "4px 0 24px rgba(15,22,35,0.22)",
        }}
      >
        {/* Logo */}
        <Link href="/job-cards" className="group flex items-center gap-3 px-5 py-6">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-[#f59e0b] shadow-[0_0_16px_rgba(245,158,11,0.4)] transition-all duration-200 group-hover:shadow-[0_0_24px_rgba(245,158,11,0.6)]">
            <Wrench className="size-5 text-[#0c1322]" aria-hidden />
          </div>
          <div>
            <span className="block font-display text-xl font-bold leading-tight text-white">
              Garage Manager
            </span>
            <span className="block text-[11px] font-medium tracking-widest text-[#f59e0b]/70 uppercase">
              Workshop Pro
            </span>
          </div>
        </Link>

        {/* Garage name badge */}
        <div className="mx-4 mb-4 flex items-center gap-2 rounded-[10px] border border-white/8 bg-white/5 px-3 py-2">
          <div className="size-2 rounded-full bg-[#10b981] animate-pulse-glow" aria-hidden />
          <span className="truncate text-sm font-medium text-white/70">{user.garageName}</span>
          <span className="ml-auto rounded-full bg-[#10b981]/20 px-2 py-0.5 text-[10px] font-semibold text-[#10b981]">LIVE</span>
        </div>

        {/* Nav items */}
        <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-3" aria-label="Main">
          {allNav.map(({ href, label, icon: Icon, desc }) => {
            const isActive = active(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "group flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm transition-all duration-200",
                  isActive
                    ? "bg-[#f59e0b]/15 text-white"
                    : "text-white/55 hover:bg-white/5 hover:text-white/90",
                )}
              >
                <div
                  className={cx(
                    "flex size-8 shrink-0 items-center justify-center rounded-[8px] transition-all duration-200",
                    isActive
                      ? "bg-[#f59e0b] shadow-[0_2px_8px_rgba(245,158,11,0.4)]"
                      : "bg-white/8 group-hover:bg-white/12",
                  )}
                >
                  <Icon
                    className={cx("size-4", isActive ? "text-[#0c1322]" : "text-white/60 group-hover:text-white/90")}
                    aria-hidden
                  />
                </div>
                <div className="min-w-0">
                  <div className={cx("font-semibold leading-tight", isActive ? "text-white" : "")}>{label}</div>
                  <div className="text-[11px] text-white/35 leading-tight truncate">{desc}</div>
                </div>
                {isActive && (
                  <ChevronRight className="ml-auto size-3.5 text-[#f59e0b]/60 shrink-0" aria-hidden />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-4 h-px bg-white/8" />

        {/* User footer */}
        <div className="p-4">
          <div className="flex items-center gap-3 rounded-[12px] bg-white/5 border border-white/8 p-3">
            {/* Avatar */}
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f59e0b] to-[#d97706] text-sm font-bold text-[#0c1322]">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="flex items-center gap-1 text-[11px] text-white/45">
                <Shield className="size-3" aria-hidden />
                {ROLE_LABEL[user.role]}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void logout().then(() => router.replace("/login"))}
              className="flex size-8 items-center justify-center rounded-[8px] text-white/40 transition-all hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>

          {/* Version tag */}
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-white/20">
            <Zap className="size-3" aria-hidden />
            Garage Manager v1.0
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 text-white md:hidden"
        style={{ background: "linear-gradient(180deg, #0c1322, #0f1a2e)" }}
      >
        <span className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-[7px] bg-[#f59e0b]">
            <Wrench className="size-4 text-[#0c1322]" aria-hidden />
          </div>
          <span className="font-display text-xl font-bold">{user.garageName ?? "Garage Manager"}</span>
        </span>
        <div className="flex items-center gap-2">
          {extra.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-label={label} className="flex size-8 items-center justify-center rounded-[8px] text-white/60 hover:bg-white/10 hover:text-white">
              <Icon className="size-5" />
            </Link>
          ))}
          <button
            type="button"
            aria-label="Sign out"
            onClick={() => void logout().then(() => router.replace("/login"))}
            className="flex size-8 items-center justify-center rounded-[8px] text-white/60 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      {/* Main content area */}
      <main className="mx-auto w-full max-w-[90rem] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">{children}</main>

      {/* ── Mobile tab bar ──────────────────────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[#e8edf3] bg-white md:hidden"
        style={{ boxShadow: "0 -4px 20px rgba(15,22,35,0.08)" }}
        aria-label="Main"
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive = active(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cx(
                "flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors",
                isActive ? "text-[#0f1623]" : "text-[#9baabb]",
              )}
            >
              <div className={cx(
                "flex size-7 items-center justify-center rounded-[8px] transition-all",
                isActive ? "bg-[#f59e0b]/15" : "",
              )}>
                <Icon className={cx("size-4.5", isActive ? "text-[#f59e0b]" : "")} aria-hidden />
              </div>
              <span className={cx("text-[11px] font-medium", isActive && "text-[#0f1623] font-semibold")}>{label}</span>
              {isActive && <span className="mt-0.5 h-0.5 w-5 rounded-full bg-[#f59e0b]" aria-hidden />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
