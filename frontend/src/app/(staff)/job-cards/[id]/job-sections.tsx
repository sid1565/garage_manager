"use client";

import { useQuery } from "@tanstack/react-query";
import { Camera, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { AuthImage } from "@/components/ui/auth-image";
import { Button, Dialog, Empty, ErrorNote, Field, Input, Panel, Select, Textarea, cx } from "@/components/ui/kit";
import { api, apiData } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, humanize, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import { useAction } from "@/lib/use-action";
import type {
  Estimate, Invoice, JobDetail, LineItemType, PaymentMethod, Problem, ProblemCategory, Severity,
} from "@/lib/types";

const SEVERITY_STYLE: Record<Severity, string> = {
  LOW: "bg-concrete text-ink-soft",
  MEDIUM: "bg-steel-soft text-steel",
  HIGH: "bg-signal-soft text-ink",
  CRITICAL: "bg-stop-soft text-stop",
};
const CATEGORIES: ProblemCategory[] = [
  "ENGINE", "BRAKES", "SUSPENSION", "STEERING", "ELECTRICAL", "AIR_CONDITIONING", "TRANSMISSION", "COOLING", "EXHAUST", "TYRES", "BODY", "OTHER",
];
const DIAGNOSIS_STAGES = ["CHECKED_IN", "DIAGNOSING", "IN_PROGRESS"];

/* ── Problems & photos (UC-9) ─────────────────────────────────────────── */
export function ProblemsSection({ job, formOpen, setFormOpen }: { job: JobDetail; formOpen: boolean; setFormOpen: (o: boolean) => void }) {
  const { user } = useAuth();
  const problems = useQuery({ queryKey: ["job", job.id, "problems"], queryFn: () => apiData<Problem[]>(`/job-cards/${job.id}/problems`) });
  const mayRecord =
    can(user?.role, "DIAGNOSIS_RECORD") &&
    DIAGNOSIS_STAGES.includes(job.status) &&
    (user?.role !== "MECHANIC" || job.assignedMechanic?.id === user.id);
  const invalidate = [["job", job.id]];
  const add = useAction(
    (body: object) => api(`/job-cards/${job.id}/problems`, { method: "POST", body }),
    { success: "Problem recorded", invalidate, onDone: () => setFormOpen(false) },
  );
  const remove = useAction((id: string) => api(`/job-cards/${job.id}/problems/${id}`, { method: "DELETE" }), { success: "Problem removed", invalidate });
  const upload = useAction(
    ({ problemId, file }: { problemId: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("problemId", problemId);
      return api(`/job-cards/${job.id}/attachments`, { method: "POST", body: form });
    },
    { success: "Photo added", invalidate },
  );

  return (
    <Panel
      title="What we found"
      action={mayRecord && !formOpen && <Button size="sm" onClick={() => setFormOpen(true)}><Plus className="size-4" aria-hidden /> Record a problem</Button>}
    >
      {formOpen && (
        <form
          className="mb-5 grid gap-3 rounded-control bg-concrete/60 p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            add.mutate({ title: f.get("title"), description: f.get("description") || undefined, severity: f.get("severity"), category: f.get("category") });
          }}
        >
          <div className="sm:col-span-2">
            <Field label="Problem">{(id) => <Input id={id} name="title" required minLength={2} placeholder="Front brake pads worn" autoFocus />}</Field>
          </div>
          <Field label="How serious">
            {(id) => (
              <Select id={id} name="severity" defaultValue="MEDIUM">
                {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as Severity[]).map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Area">
            {(id) => (
              <Select id={id} name="category" defaultValue="ENGINE">
                {CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Details for the owner (optional)">{(id) => <Textarea id={id} name="description" placeholder="2 mm left; the disc is scored" />}</Field>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button tone="ink" type="submit" busy={add.isPending}>Save problem</Button>
            <Button type="button" onClick={() => setFormOpen(false)}>Cancel</Button>
          </div>
          <div className="sm:col-span-2"><ErrorNote error={add.error} /></div>
        </form>
      )}

      {problems.data?.length === 0 && !formOpen ? (
        <p className="text-ink-soft">Nothing recorded yet. Problems you add here are what the owner sees on their phone.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft">
          {problems.data?.map((p) => (
            <li key={p.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", SEVERITY_STYLE[p.severity])}>{humanize(p.severity)}</span>
                <h3 className="flex-1 font-sans text-base font-semibold">{p.title}</h3>
                <span className="text-sm text-ink-faint">{humanize(p.category)}</span>
              </div>
              {p.description && <p className="mt-1 max-w-prose text-ink-soft">{p.description}</p>}
              {p.requiresNewEstimate && <p className="mt-1 text-sm font-medium text-ink">Found during the repair — needs a new estimate</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {p.attachments.map((a) => (
                  <AuthImage key={a.id} path={`/job-cards/${job.id}/attachments/${a.id}/download`} mimeType={a.mimeType} alt={a.caption ?? p.title} className="size-20 rounded-control border border-line" />
                ))}
                {mayRecord && <PhotoButton busy={upload.isPending} onFile={(file) => upload.mutate({ problemId: p.id, file })} />}
                {mayRecord && !p.locked && (
                  <Button size="sm" tone="danger" className="ml-auto" busy={remove.isPending && remove.variables === p.id} onClick={() => remove.mutate(p.id)} aria-label={`Remove ${p.title}`}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={upload.error ?? remove.error} />
    </Panel>
  );
}

function PhotoButton({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="grid size-20 place-items-center rounded-control border border-dashed border-line text-ink-faint hover:border-ink-faint hover:text-ink disabled:opacity-50"
      >
        <span className="flex flex-col items-center gap-1 text-xs"><Camera className="size-5" aria-hidden />Add photo</span>
      </button>
    </>
  );
}

/* ── Estimate (UC-11, UC-12 2a) ───────────────────────────────────────── */
interface DraftLine { itemType: LineItemType; description: string; quantity: string; unitPrice: string; problemId: string }

export function EstimateSection({ job, editorOpen, setEditorOpen, verbalOpen, setVerbalOpen }: {
  job: JobDetail; editorOpen: boolean; setEditorOpen: (o: boolean) => void; verbalOpen: boolean; setVerbalOpen: (o: boolean) => void;
}) {
  const { user } = useAuth();
  const latestId = job.latestEstimate?.id;
  const estimate = useQuery({ queryKey: ["estimate", latestId], enabled: !!latestId, queryFn: () => apiData<Estimate>(`/estimates/${latestId}`) });
  const problems = useQuery({ queryKey: ["job", job.id, "problems"], queryFn: () => apiData<Problem[]>(`/job-cards/${job.id}/problems`) });
  const invalidate = [["job", job.id], ["estimate"], ["job-cards"]];
  const send = useAction((id: string) => api(`/estimates/${id}/send`, { method: "POST", body: {} }), { success: "Estimate sent to the owner", invalidate });
  const e = estimate.data;
  const canManage = can(user?.role, "ESTIMATES_MANAGE");

  return (
    <Panel
      title={e ? `Estimate · version ${e.version}` : "Estimate"}
      action={e && <span className="text-sm text-ink-soft">{humanize(e.status)}{e.validUntil && e.status === "SENT" ? `, valid until ${date(e.validUntil)}` : ""}</span>}
    >
      {!e ? (
        <Empty title="No estimate yet">
          {job.status === "CHECKED_IN" ? "Record what you found first, then price the work." : "Price the parts and labour; the owner approves each line from their phone."}
        </Empty>
      ) : (
        <>
          <table className="w-full text-left">
            <thead className="text-sm text-ink-soft">
              <tr className="border-b border-line-soft">
                <th className="pb-2 font-medium">Item</th>
                <th className="hidden pb-2 text-right font-medium sm:table-cell">Qty</th>
                <th className="hidden pb-2 text-right font-medium sm:table-cell">Rate</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {e.items?.map((i) => (
                <tr key={i.id} className={cx("border-b border-line-soft", i.approvalState === "REJECTED" && "text-ink-faint line-through")}>
                  <td className="py-2.5">
                    {i.description}
                    <span className="block text-sm text-ink-faint no-underline">
                      {i.itemType === "LABOUR" ? "Labour" : "Part"}
                      {i.approvalState !== "PENDING" && ` · ${i.approvalState === "APPROVED" ? "approved" : "declined"}`}
                    </span>
                  </td>
                  <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{Number(i.quantity)}</td>
                  <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{money(i.unitPrice)}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(i.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr><td colSpan={3} className="hidden pt-3 text-right text-ink-soft sm:table-cell">Subtotal</td><td className="pt-3 text-right">{money(e.subtotal)}</td></tr>
              <tr><td colSpan={3} className="hidden text-right text-ink-soft sm:table-cell">Tax {Number(e.taxRate)}%</td><td className="text-right">{money(e.taxAmount)}</td></tr>
              <tr className="font-display text-2xl font-semibold"><td colSpan={3} className="hidden pt-1 text-right sm:table-cell">Total</td><td className="pt-1 text-right">{money(e.total)}</td></tr>
              {e.approvedTotal && (
                <tr className="text-go"><td colSpan={3} className="hidden text-right sm:table-cell">Approved by owner</td><td className="text-right font-semibold">{money(e.approvedTotal)}</td></tr>
              )}
            </tfoot>
          </table>
          {e.customerRemark && <p className="mt-4 rounded-control bg-concrete px-3 py-2">Owner says: “{e.customerRemark}”</p>}
          {e.verbalApprovalNote && <p className="mt-2 text-sm text-ink-soft">Recorded by staff: {e.verbalApprovalNote}</p>}
          {e.status === "DRAFT" && canManage && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button tone="ink" busy={send.isPending} onClick={() => send.mutate(e.id)}>Send estimate to owner</Button>
              <Button onClick={() => setEditorOpen(true)}>Edit lines</Button>
            </div>
          )}
          <ErrorNote error={send.error} />
        </>
      )}

      <Dialog open={editorOpen} onClose={() => setEditorOpen(false)} title={e?.status === "DRAFT" ? "Edit estimate" : "New estimate"}>
        <EstimateEditor
          jobId={job.id}
          draft={e?.status === "DRAFT" ? e : null}
          problems={problems.data ?? []}
          onDone={() => setEditorOpen(false)}
        />
      </Dialog>
      {e && (
        <Dialog open={verbalOpen} onClose={() => setVerbalOpen(false)} title="Record the owner’s decision">
          <VerbalApproval estimate={e} jobId={job.id} onDone={() => setVerbalOpen(false)} />
        </Dialog>
      )}
    </Panel>
  );
}

function EstimateEditor({ jobId, draft, problems, onDone }: { jobId: string; draft: Estimate | null; problems: Problem[]; onDone: () => void }) {
  const [lines, setLines] = useState<DraftLine[]>(
    draft?.items?.map((i) => ({ itemType: i.itemType, description: i.description, quantity: String(Number(i.quantity)), unitPrice: i.unitPrice, problemId: i.problemId ?? "" })) ??
      problems.map((p) => ({ itemType: "PART" as const, description: p.title, quantity: "1", unitPrice: "", problemId: p.id })),
  );
  const save = useAction(
    () => {
      const body = { items: lines.map((l) => ({ ...l, problemId: l.problemId || undefined, description: l.description.trim() })) };
      return draft
        ? api(`/estimates/${draft.id}`, { method: "PUT", body })
        : api(`/job-cards/${jobId}/estimates`, { method: "POST", body });
    },
    { success: "Estimate saved", invalidate: [["job", jobId], ["estimate"]], onDone },
  );
  const set = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const preview = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
      className="flex flex-col gap-3"
    >
      {lines.map((l, i) => (
        <fieldset key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-control border border-line p-3">
          <Input aria-label="Description" value={l.description} onChange={(e) => set(i, { description: e.target.value })} required placeholder="Brake pads (set)" />
          <Select aria-label="Type" value={l.itemType} onChange={(e) => set(i, { itemType: e.target.value as LineItemType })} className="w-28">
            <option value="PART">Part</option>
            <option value="LABOUR">Labour</option>
          </Select>
          <div className="col-span-2 grid grid-cols-[5rem_1fr_auto] gap-2">
            <Input aria-label="Quantity" inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} required />
            <Input aria-label="Rate" inputMode="decimal" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} required placeholder="Rate (₹)" />
            <Button type="button" tone="danger" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
          {problems.length > 0 && (
            <Select aria-label="Fixes problem" value={l.problemId} onChange={(e) => set(i, { problemId: e.target.value })} className="col-span-2">
              <option value="">Not linked to a problem</option>
              {problems.map((p) => <option key={p.id} value={p.id}>Fixes: {p.title}</option>)}
            </Select>
          )}
        </fieldset>
      ))}
      <Button type="button" onClick={() => setLines((ls) => [...ls, { itemType: "LABOUR", description: "", quantity: "1", unitPrice: "", problemId: "" }])}>
        <Plus className="size-4" aria-hidden /> Add a line
      </Button>
      <p className="text-right text-ink-soft">Before tax: <span className="font-display text-xl font-semibold text-ink">{money(preview.toFixed(2))}</span></p>
      <ErrorNote error={save.error} />
      <Button tone="ink" type="submit" busy={save.isPending} disabled={lines.length === 0}>Save estimate</Button>
    </form>
  );
}

function VerbalApproval({ estimate, jobId, onDone }: { estimate: Estimate; jobId: string; onDone: () => void }) {
  const [decisions, setDecisions] = useState<Record<string, boolean>>(Object.fromEntries((estimate.items ?? []).map((i) => [i.id, true])));
  const record = useAction(
    (body: object) => api(`/estimates/${estimate.id}/verbal-approval`, { method: "POST", body }),
    { success: "Owner’s decision recorded", invalidate: [["job", jobId], ["estimate"], ["job-cards"]], onDone },
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        record.mutate({ decisions: Object.entries(decisions).map(([lineItemId, approved]) => ({ lineItemId, approved })), note: f.get("note") });
      }}
      className="flex flex-col gap-3"
    >
      <p className="text-ink-soft">Use this when the owner agreed by phone or at the counter.</p>
      {estimate.items?.map((i) => (
        <label key={i.id} className="flex items-center gap-3 rounded-control border border-line p-3">
          <input type="checkbox" className="size-5 accent-[#1c2430]" checked={decisions[i.id]} onChange={(e) => setDecisions((d) => ({ ...d, [i.id]: e.target.checked }))} />
          <span className="flex-1">{i.description}</span>
          <span className="tabular-nums">{money(i.lineTotal)}</span>
        </label>
      ))}
      <Field label="How did they agree?" hint="Required — kept in the audit log">
        {(id, d) => <Textarea id={id} name="note" aria-describedby={d} required minLength={3} placeholder="Owner approved by phone at 11:40" />}
      </Field>
      <ErrorNote error={record.error} />
      <Button tone="ink" type="submit" busy={record.isPending}>Record decision</Button>
    </form>
  );
}

/* ── Invoice & payments (UC-15) ───────────────────────────────────────── */
export function InvoiceSection({ job, payOpen, setPayOpen, invoiceOpen, setInvoiceOpen }: {
  job: JobDetail; payOpen: boolean; setPayOpen: (o: boolean) => void; invoiceOpen: boolean; setInvoiceOpen: (o: boolean) => void;
}) {
  const { user } = useAuth();
  const invoiceId = job.invoice?.id;
  const invoice = useQuery({ queryKey: ["invoice", invoiceId], enabled: !!invoiceId, queryFn: () => apiData<Invoice>(`/invoices/${invoiceId}`) });
  const invalidate = [["job", job.id], ["invoice"], ["job-cards"], ["dashboard"]];
  const create = useAction((body: object) => api(`/job-cards/${job.id}/invoice`, { method: "POST", body }), { success: "Invoice created", invalidate, onDone: () => setInvoiceOpen(false) });
  const pay = useAction((body: object) => api(`/invoices/${invoiceId}/payments`, { method: "POST", body }), { success: "Payment recorded", invalidate, onDone: () => setPayOpen(false) });
  const inv = invoice.data;
  if (!inv && job.status !== "READY_FOR_PICKUP") return null;

  return (
    <Panel title={inv ? `Invoice ${inv.invoiceNumber}` : "Invoice"} action={inv && <span className="text-sm text-ink-soft">{humanize(inv.status)}</span>}>
      {!inv ? (
        <Empty title="Ready to bill" action={can(user?.role, "INVOICES_MANAGE") && <Button tone="ink" onClick={() => setInvoiceOpen(true)}>Create invoice</Button>}>
          The invoice includes every line the owner approved. Add anything extra and a discount before you create it.
        </Empty>
      ) : (
        <>
          <ul className="divide-y divide-line-soft">
            {inv.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-4 py-2"><span>{i.description}</span><span className="tabular-nums">{money(i.lineTotal, inv.currency)}</span></li>
            ))}
          </ul>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 tabular-nums">
            <dt className="text-ink-soft">Subtotal</dt><dd className="text-right">{money(inv.subtotal, inv.currency)}</dd>
            {Number(inv.discount) > 0 && (<><dt className="text-ink-soft">Discount</dt><dd className="text-right">−{money(inv.discount, inv.currency)}</dd></>)}
            <dt className="text-ink-soft">Tax {Number(inv.taxRate)}%</dt><dd className="text-right">{money(inv.taxAmount, inv.currency)}</dd>
            <dt className="font-display text-2xl font-semibold">Total</dt><dd className="text-right font-display text-2xl font-semibold">{money(inv.total, inv.currency)}</dd>
            <dt className="text-ink-soft">Paid</dt><dd className="text-right">{money(inv.amountPaid, inv.currency)}</dd>
            <dt className="font-semibold">Balance due</dt><dd className={cx("text-right font-semibold", Number(inv.balanceDue) > 0 ? "text-stop" : "text-go")}>{money(inv.balanceDue, inv.currency)}</dd>
          </dl>
          {inv.payments.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 border-t border-line-soft pt-3 text-sm text-ink-soft">
              {inv.payments.map((p) => (
                <li key={p.id}>{money(p.amount, inv.currency)} by {humanize(p.method)} on {date(p.receivedAt)}{p.reference ? `, ref ${p.reference}` : ""} — {p.receivedBy.name}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="Create invoice">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const extra = String(f.get("extraDesc") || "").trim();
            create.mutate({
              discount: f.get("discount") || undefined,
              notes: f.get("notes") || undefined,
              extraItems: extra ? [{ itemType: "PART", description: extra, quantity: "1", unitPrice: String(f.get("extraPrice")) }] : undefined,
            });
          }}
        >
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <Field label="Extra item (optional)">{(id) => <Input id={id} name="extraDesc" placeholder="Wiper fluid top-up" />}</Field>
            <Field label="Price">{(id) => <Input id={id} name="extraPrice" inputMode="decimal" placeholder="150" />}</Field>
          </div>
          <Field label="Discount (₹)">{(id) => <Input id={id} name="discount" inputMode="decimal" placeholder="0" />}</Field>
          <Field label="Note on the invoice">{(id) => <Textarea id={id} name="notes" />}</Field>
          <ErrorNote error={create.error} />
          <Button tone="ink" type="submit" busy={create.isPending}>Create invoice</Button>
        </form>
      </Dialog>

      {inv && (
        <Dialog open={payOpen} onClose={() => setPayOpen(false)} title="Record payment">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              pay.mutate({ amount: f.get("amount"), method: f.get("method") as PaymentMethod, reference: f.get("reference") || undefined });
            }}
          >
            <Field label="Amount" hint={`Balance due ${money(inv.balanceDue, inv.currency)}`}>
              {(id, d) => <Input id={id} name="amount" inputMode="decimal" defaultValue={inv.balanceDue} aria-describedby={d} required className="font-display text-xl" />}
            </Field>
            <Field label="Paid by">
              {(id) => (
                <Select id={id} name="method" defaultValue="UPI">
                  {(["UPI", "CASH", "CARD", "BANK_TRANSFER", "OTHER"] as PaymentMethod[]).map((m) => <option key={m} value={m}>{m === "UPI" ? "UPI" : humanize(m)}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Reference (optional)">{(id) => <Input id={id} name="reference" placeholder="UPI transaction id" />}</Field>
            <ErrorNote error={pay.error} />
            <Button tone="ink" type="submit" busy={pay.isPending}>Record payment</Button>
          </form>
        </Dialog>
      )}
    </Panel>
  );
}
