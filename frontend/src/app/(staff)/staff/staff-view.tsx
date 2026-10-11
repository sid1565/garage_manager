"use client";

import { toE164 } from "@/lib/phone";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Dialog, ErrorNote, Field, Input, Loading, PageHeader, Select, cx } from "@/components/ui/kit";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { can, ROLE_LABEL } from "@/lib/permissions";
import type { Paged, Staff } from "@/lib/types";
import { useAction } from "@/lib/use-action";

export function StaffView() {
  const { user } = useAuth();
  const manage = can(user?.role, "STAFF_MANAGE");
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<Staff | null>(null);
  const list = useQuery({ queryKey: ["staff", "all"], queryFn: () => api<Paged<Staff>>("/staff", { query: { limit: 100, order: { name: "ASC" } } }) });
  const invalidate = [["staff"]];
  const create = useAction((body: object) => api("/staff", { method: "POST", body }), { success: "Staff member added", invalidate, onDone: () => setAdding(false) });
  const setStatus = useAction(({ id, status }: { id: string; status: string }) => api(`/staff/${id}/status`, { method: "PATCH", body: { status } }), {
    success: "Access updated",
    invalidate,
  });
  const setRole = useAction(({ id, role }: { id: string; role: string }) => api(`/staff/${id}`, { method: "PATCH", body: { role } }), { success: "Role changed", invalidate });
  const reset = useAction(({ id, temporaryPassword }: { id: string; temporaryPassword: string }) => api(`/staff/${id}/reset-password`, { method: "POST", body: { temporaryPassword } }), {
    success: "Temporary password set",
    invalidate,
    onDone: () => setResetFor(null),
  });

  return (
    <>
      <PageHeader title="Staff" sub="Who can sign in, and what they can do." actions={manage && <Button tone="ink" onClick={() => setAdding(true)}>Add staff member</Button>} />
      {list.isPending ? <Loading /> : list.error ? <ErrorNote error={list.error} /> : (
        <ul className="divide-y divide-line-soft rounded-panel border border-line bg-panel">
          {list.data.data.map((s) => (
            <li key={s.id} className={cx("flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3", s.status === "INACTIVE" && "opacity-60")}>
              <div className="min-w-48 flex-1">
                <p className="font-medium">{s.name}{s.id === user?.id && <span className="ml-2 text-sm font-normal text-ink-faint">You</span>}</p>
                <p className="text-sm text-ink-soft">{s.email}</p>
              </div>
              {manage && s.id !== user?.id ? (
                <Select aria-label={`Role for ${s.name}`} value={s.role} onChange={(e) => setRole.mutate({ id: s.id, role: e.target.value })} className="h-9 w-44">
                  {(["GARAGE_ADMIN", "SERVICE_ADVISOR", "MECHANIC"] as const).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
              ) : (
                <span className="w-44 text-ink-soft">{ROLE_LABEL[s.role]}</span>
              )}
              <span className="w-44 text-sm text-ink-faint">
                {s.status === "INACTIVE" ? "No access" : s.mustChangePassword ? "Hasn’t signed in yet" : `Last in ${dateTime(s.lastLoginAt)}`}
              </span>
              {manage && s.id !== user?.id && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setResetFor(s)}>Reset password</Button>
                  <Button size="sm" tone={s.status === "ACTIVE" ? "danger" : "quiet"} onClick={() => setStatus.mutate({ id: s.id, status: s.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}>
                    {s.status === "ACTIVE" ? "Remove access" : "Restore access"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={setStatus.error ?? setRole.error} />

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add staff member">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({ name: f.get("name"), email: f.get("email"), phone: f.get("phone") ? toE164(String(f.get("phone"))) : undefined, role: f.get("role"), temporaryPassword: f.get("password") });
          }}
        >
          <Field label="Name">{(i) => <Input id={i} name="name" required minLength={2} />}</Field>
          <Field label="Email" hint="They sign in with this">{(i, d) => <Input id={i} name="email" type="email" aria-describedby={d} required />}</Field>
          <Field label="Mobile (optional)">{(i) => <Input id={i} name="phone" placeholder="98123 45678" inputMode="tel" />}</Field>
          <Field label="Role">
            {(i) => (
              <Select id={i} name="role" defaultValue="MECHANIC">
                <option value="MECHANIC">Mechanic — diagnoses and repairs assigned jobs</option>
                <option value="SERVICE_ADVISOR">Service advisor — runs the counter, estimates and billing</option>
                <option value="GARAGE_ADMIN">Garage admin — everything, including staff and revenue</option>
              </Select>
            )}
          </Field>
          <Field label="Temporary password" hint="Give it to them in person. They must change it when they first sign in.">
            {(i, d) => <Input id={i} name="password" type="text" autoComplete="off" aria-describedby={d} required minLength={8} />}
          </Field>
          <ErrorNote error={create.error} />
          <Button tone="ink" type="submit" busy={create.isPending}>Add staff member</Button>
        </form>
      </Dialog>

      <Dialog open={!!resetFor} onClose={() => setResetFor(null)} title={`Reset password for ${resetFor?.name ?? ""}`}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (resetFor) reset.mutate({ id: resetFor.id, temporaryPassword: String(new FormData(e.currentTarget).get("password")) });
          }}
        >
          <p className="text-ink-soft">They’ll be signed out everywhere and asked to choose a new password.</p>
          <Field label="Temporary password">{(i) => <Input id={i} name="password" autoComplete="off" required minLength={8} />}</Field>
          <ErrorNote error={reset.error} />
          <Button tone="ink" type="submit" busy={reset.isPending}>Set temporary password</Button>
        </form>
      </Dialog>
    </>
  );
}
