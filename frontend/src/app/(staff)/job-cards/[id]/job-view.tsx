"use client";

import { useQuery } from "@tanstack/react-query";
import { Phone, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button, Dialog, ErrorNote, Field, Input, Loading, Panel, Plate, Select, StatusTrack, Textarea, cx } from "@/components/ui/kit";
import { api, apiData } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STATUS_LABEL, dateTime, humanize, km, when } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { JobDetail, JobStatus, NotificationRow, Paged, Staff, StatusHistory } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { EstimateSection, InvoiceSection, ProblemsSection } from "./job-sections";

const STATUS_VERB: Partial<Record<JobStatus, string>> = {
  DIAGNOSING: "Start diagnosis",
  IN_PROGRESS: "Start work",
  QUALITY_CHECK: "Send to quality check",
  READY_FOR_PICKUP: "Mark ready for pickup",
};

export function JobView() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const role = user?.role;
  const job = useQuery({ queryKey: ["job", id], queryFn: () => apiData<JobDetail>(`/job-cards/${id}`) });

  // Dialog/form state lives here so the "next step" button can open any of them.
  const [problemForm, setProblemForm] = useState(false);
  const [estimateEditor, setEstimateEditor] = useState(false);
  const [verbal, setVerbal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(false);
  const [payForm, setPayForm] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState<null | "paid" | "credit">(null);

  const invalidate = [["job", id], ["job-cards"], ["dashboard"]];
  const move = useAction(
    (status: JobStatus) => api(`/job-cards/${id}/status`, { method: "POST", body: { status } }),
    { success: (r) => `Moved to ${STATUS_LABEL[(r as { data: JobDetail }).data.status].toLowerCase()}`, invalidate },
  );
  const send = useAction((estimateId: string) => api(`/estimates/${estimateId}/send`, { method: "POST", body: {} }), {
    success: "Estimate sent to the owner",
    invalidate: [...invalidate, ["estimate"]],
  });

  if (job.isPending) return <Loading />;
  if (job.error) return <ErrorNote error={job.error} />;
  const j = job.data;
  const closed = j.status === "DELIVERED" || j.status === "CANCELLED";
  const est = j.latestEstimate;

  // The one thing to do next, in safety yellow.
  let next: { label: string; run: () => void; busy?: boolean } | null = null;
  if (!closed) {
    if (j.status === "CHECKED_IN" && can(role, "DIAGNOSIS_RECORD")) next = { label: "Record a problem", run: () => setProblemForm(true) };
    else if (j.status === "DIAGNOSING" && can(role, "ESTIMATES_MANAGE"))
      next = est?.status === "DRAFT"
        ? { label: "Send estimate to owner", run: () => send.mutate(est.id), busy: send.isPending }
        : { label: "Create estimate", run: () => setEstimateEditor(true) };
    else if (j.status === "AWAITING_APPROVAL" && can(role, "ESTIMATES_VERBAL_APPROVAL")) next = { label: "Record owner’s decision", run: () => setVerbal(true) };
    else if (j.status === "READY_FOR_PICKUP" && can(role, "INVOICES_MANAGE")) {
      if (!j.invoice) next = { label: "Create invoice", run: () => setInvoiceForm(true) };
      else if (j.invoice.status !== "PAID") next = { label: "Record payment", run: () => setPayForm(true) };
      else next = { label: "Hand over vehicle", run: () => setDeliverOpen("paid") };
    } else {
      const target = j.allowedTransitions.find((t) => STATUS_VERB[t] && t !== "DIAGNOSING");
      if (target) next = { label: STATUS_VERB[target]!, run: () => move.mutate(target), busy: move.isPending };
    }
    if (j.status === "IN_PROGRESS" && est && can(role, "ESTIMATES_MANAGE") && est.status === "DRAFT")
      next = { label: "Send extra-work estimate", run: () => send.mutate(est.id), busy: send.isPending };
  }

  return (
    <>
      <header className="mb-6 flex flex-col gap-5">
        <Link href="/job-cards" className="text-sm text-steel hover:underline">Job board</Link>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Plate number={j.vehicle.registrationNumber} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold">{j.vehicle.make} {j.vehicle.model}</h1>
            <p className="text-ink-soft">
              <Link href={`/customers/${j.customer.id}`} className="hover:underline">{j.customer.name}</Link>
              <a href={`tel:${j.customer.phone}`} className="ml-3 inline-flex items-center gap-1 text-steel hover:underline">
                <Phone className="size-3.5" aria-hidden /> {j.customer.phone}
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {next && <Button tone="next" className="h-11" busy={next.busy} onClick={next.run}>{next.label}</Button>}
            {!closed && can(role, "NOTIFICATIONS_SEND") && (
              <Button className="h-11" onClick={() => setNotifyOpen(true)}><Send className="size-4" aria-hidden /> Message owner</Button>
            )}
          </div>
        </div>
        <StatusTrack status={j.status} />
        {j.status === "CANCELLED" && <p className="rounded-control bg-stop-soft px-3 py-2 text-stop">Cancelled: {j.cancellationReason}</p>}
        {j.isOverdue && <p className="rounded-control bg-stop-soft px-3 py-2 text-stop">Promised {when(j.promisedDeliveryAt)} — the owner is waiting.</p>}
        <ErrorNote error={move.error ?? send.error} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <ProblemsSection job={j} formOpen={problemForm} setFormOpen={setProblemForm} />
          <EstimateSection job={j} editorOpen={estimateEditor} setEditorOpen={setEstimateEditor} verbalOpen={verbal} setVerbalOpen={setVerbal} />
          <InvoiceSection job={j} payOpen={payForm} setPayOpen={setPayForm} invoiceOpen={invoiceForm} setInvoiceOpen={setInvoiceForm} />
        </div>
        <aside className="flex flex-col gap-6">
          <JobFacts job={j} />
          {can(role, "NOTIFICATIONS_VIEW") && <OwnerMessages jobId={j.id} />}
          <History jobId={j.id} />
          {!closed && (
            <div className="flex flex-col gap-2">
              {j.status === "READY_FOR_PICKUP" && j.invoice && j.invoice.status !== "PAID" && can(role, "DELIVER_ON_CREDIT") && (
                <Button onClick={() => setDeliverOpen("credit")}>Hand over with balance due</Button>
              )}
              {can(role, "JOB_CARDS_MANAGE") && !j.invoice && <Button tone="danger" onClick={() => setCancelOpen(true)}>Cancel job</Button>}
            </div>
          )}
        </aside>
      </div>

      <NotifyDialog open={notifyOpen} onClose={() => setNotifyOpen(false)} job={j} />
      <CancelDialog open={cancelOpen} onClose={() => setCancelOpen(false)} jobId={j.id} />
      <DeliverDialog mode={deliverOpen} onClose={() => setDeliverOpen(null)} jobId={j.id} />
    </>
  );
}

function JobFacts({ job }: { job: JobDetail }) {
  const { user } = useAuth();
  const mechanics = useQuery({
    queryKey: ["staff", "mechanics"],
    enabled: can(user?.role, "JOB_ASSIGN"),
    queryFn: () => api<Paged<Staff>>("/staff", { query: { role: "MECHANIC", status: "ACTIVE", limit: 100 } }),
  });
  const assign = useAction(
    (mechanicId: string | null) => api(`/job-cards/${job.id}/assignee`, { method: "PATCH", body: { mechanicId } }),
    { success: "Mechanic assigned", invalidate: [["job", job.id], ["job-cards"]] },
  );
  const closed = job.status === "DELIVERED" || job.status === "CANCELLED";
  const rows: [string, React.ReactNode][] = [
    ["Job", job.jobNumber],
    ["Checked in", dateTime(job.createdAt)],
    ["Promised", <span key="p" className={cx(job.isOverdue && "font-medium text-stop")}>{when(job.promisedDeliveryAt)}</span>],
    ["Odometer", km(job.checkinOdometerKm)],
    ["Fuel", job.fuelLevel ? humanize(job.fuelLevel).replace("Three quarter", "¾").replace("Quarter", "¼").replace("Half", "½") : "Not noted"],
    ["Opened by", job.openedBy.name],
  ];
  return (
    <Panel title="Job">
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-[0.95rem]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-soft">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <dt className="text-ink-soft">Mechanic</dt>
        <dd>
          {can(user?.role, "JOB_ASSIGN") && !closed ? (
            <Select
              aria-label="Mechanic"
              value={job.assignedMechanic?.id ?? ""}
              onChange={(e) => assign.mutate(e.target.value || null)}
              disabled={assign.isPending}
              className="h-9"
            >
              <option value="">Unassigned</option>
              {mechanics.data?.data.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          ) : (
            job.assignedMechanic?.name ?? "Unassigned"
          )}
        </dd>
      </dl>
      <div className="mt-4 border-t border-line-soft pt-3">
        <p className="text-sm text-ink-soft">Owner reported</p>
        <p className="mt-1">{job.customerComplaints}</p>
      </div>
      <ErrorNote error={assign.error} />
    </Panel>
  );
}

const NOTIF_STATUS: Record<NotificationRow["status"], string> = { QUEUED: "Sending", SENDING: "Sending", SENT: "Delivered", FAILED: "Failed" };

function OwnerMessages({ jobId }: { jobId: string }) {
  const messages = useQuery({
    queryKey: ["job", jobId, "notifications"],
    queryFn: () => api<Paged<NotificationRow>>("/notifications", { query: { jobCardId: jobId, limit: 20 } }),
    refetchInterval: (q) => (q.state.data?.data.some((n) => n.status === "QUEUED" || n.status === "SENDING") ? 4000 : false),
  });
  const retry = useAction((id: string) => api(`/notifications/${id}/retry`, { method: "POST" }), { success: "Message queued again", invalidate: [["job", jobId, "notifications"]] });
  return (
    <Panel title="Messages to owner">
      {messages.data?.data.length ? (
        <ul className="flex flex-col gap-3">
          {messages.data.data.map((n) => (
            <li key={n.id} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{humanize(n.type)}</span>
                <span className={cx(n.status === "FAILED" ? "text-stop" : n.status === "SENT" ? "text-go" : "text-ink-faint")}>
                  {n.channel === "SMS" ? "SMS" : "Email"} · {NOTIF_STATUS[n.status]}
                </span>
              </div>
              <p className="text-ink-faint">{dateTime(n.createdAt)}</p>
              {n.status === "FAILED" && (
                <Button size="sm" className="mt-1" busy={retry.isPending && retry.variables === n.id} onClick={() => retry.mutate(n.id)}>
                  <RotateCcw className="size-3.5" aria-hidden /> Try again
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">The owner gets a text when the car is checked in, when you send an estimate and when it’s ready.</p>
      )}
    </Panel>
  );
}

function History({ jobId }: { jobId: string }) {
  const history = useQuery({ queryKey: ["job", jobId, "history"], queryFn: () => apiData<StatusHistory[]>(`/job-cards/${jobId}/status-history`) });
  return (
    <Panel title="History">
      <ol className="relative flex flex-col gap-3 border-l-2 border-line pl-4">
        {history.data?.map((h) => (
          <li key={h.id} className="text-sm">
            <span className="absolute -left-[5px] mt-1.5 size-2 rounded-full bg-ink" aria-hidden />
            <p className="font-medium">{STATUS_LABEL[h.toStatus]}</p>
            <p className="text-ink-faint">{dateTime(h.createdAt)} · {h.changedBy?.name ?? "Owner via link"}</p>
            {h.note && <p className="text-ink-soft">{h.note}</p>}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function NotifyDialog({ open, onClose, job }: { open: boolean; onClose: () => void; job: JobDetail }) {
  const notify = useAction(
    (body: object) => api(`/job-cards/${job.id}/notifications`, { method: "POST", body }),
    { success: "Message sent to the owner", invalidate: [["job", job.id, "notifications"]], onDone: onClose },
  );
  return (
    <Dialog open={open} onClose={onClose} title="Message the owner">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          notify.mutate({ type: f.get("type"), message: f.get("message") || undefined });
        }}
      >
        <Field label="What to tell them">
          {(id) => (
            <Select id={id} name="type" defaultValue={job.problemCount ? "PROBLEMS_FOUND" : "JOB_CHECKED_IN"}>
              <option value="PROBLEMS_FOUND" disabled={!job.problemCount}>What we found (with photos)</option>
              <option value="JOB_CHECKED_IN">Tracking link for this job</option>
              <option value="READY_FOR_PICKUP" disabled={job.status !== "READY_FOR_PICKUP"}>Ready for pickup</option>
            </Select>
          )}
        </Field>
        <Field label="Add a personal note (optional)">{(id) => <Textarea id={id} name="message" maxLength={500} placeholder="Please call us before 6 pm." />}</Field>
        <p className="text-sm text-ink-soft">Sent by SMS and email using the owner’s preferences, with a link to view the job.</p>
        <ErrorNote error={notify.error} />
        <Button tone="ink" type="submit" busy={notify.isPending}>Send message</Button>
      </form>
    </Dialog>
  );
}

function CancelDialog({ open, onClose, jobId }: { open: boolean; onClose: () => void; jobId: string }) {
  const cancel = useAction((reason: string) => api(`/job-cards/${jobId}/cancel`, { method: "POST", body: { reason } }), {
    success: "Job cancelled",
    invalidate: [["job", jobId], ["job-cards"], ["dashboard"]],
    onDone: onClose,
  });
  return (
    <Dialog open={open} onClose={onClose} title="Cancel this job">
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); cancel.mutate(String(new FormData(e.currentTarget).get("reason"))); }}>
        <p className="text-ink-soft">The owner’s links stop working and the car leaves the board. This can’t be undone.</p>
        <Field label="Reason">{(id) => <Textarea id={id} name="reason" required minLength={3} placeholder="Owner took the car elsewhere" />}</Field>
        <ErrorNote error={cancel.error} />
        <Button tone="danger" type="submit" busy={cancel.isPending}>Cancel job</Button>
      </form>
    </Dialog>
  );
}

function DeliverDialog({ mode, onClose, jobId }: { mode: null | "paid" | "credit"; onClose: () => void; jobId: string }) {
  const deliver = useAction(
    (body: { note?: string; nextServiceDate?: string }) =>
      api(`/job-cards/${jobId}/${mode === "credit" ? "deliver-on-credit" : "deliver"}`, { method: "POST", body }),
    { success: "Vehicle handed over", invalidate: [["job", jobId], ["job-cards"], ["dashboard"]], onDone: onClose },
  );
  return (
    <Dialog open={mode !== null} onClose={onClose} title={mode === "credit" ? "Hand over with balance due" : "Hand over vehicle"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          deliver.mutate({ note: String(f.get("note") || "") || undefined, nextServiceDate: String(f.get("next") || "") || undefined });
        }}
      >
        <Field label="Next service due (optional)" hint="We’ll remind the owner a week before">
          {(id, d) => <Input id={id} name="next" type="date" aria-describedby={d} />}
        </Field>
        <Field label={mode === "credit" ? "Why is the balance open?" : "Note (optional)"}>
          {(id) => <Textarea id={id} name="note" required={mode === "credit"} minLength={mode === "credit" ? 3 : undefined} />}
        </Field>
        <ErrorNote error={deliver.error} />
        <Button tone="next" type="submit" busy={deliver.isPending}>Hand over vehicle</Button>
      </form>
    </Dialog>
  );
}
