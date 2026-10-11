"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Phone, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AuthImage } from "@/components/ui/auth-image";
import { Button, ErrorNote, Loading, Plate, Textarea, cx } from "@/components/ui/kit";
import { ApiError, apiData } from "@/lib/api";
import { LIFECYCLE, STATUS_LABEL, date, money, when } from "@/lib/format";
import type { PortalEstimate, PortalView as View, Severity } from "@/lib/types";

const SEVERITY_TEXT: Record<Severity, string> = {
  LOW: "Can wait",
  MEDIUM: "Should be fixed soon",
  HIGH: "Needs attention",
  CRITICAL: "Unsafe to drive",
};

export function PortalView() {
  const { token } = useParams<{ token: string }>();
  const view = useQuery({
    queryKey: ["portal", token],
    queryFn: () => apiData<View>(`/portal/${token}`, { anonymous: true }),
    retry: false,
  });

  if (view.isPending) return <div className="grid min-h-dvh place-items-center"><Loading label="Loading your vehicle" /></div>;
  if (view.error) {
    const code = view.error instanceof ApiError ? view.error.code : "";
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
        <h1 className="text-4xl font-semibold">{code === "LINK_EXPIRED" ? "This link has expired" : "This link isn’t valid"}</h1>
        <p className="text-ink-soft">
          {code === "LINK_EXPIRED"
            ? "Links stop working after a few days, or when the garage sends a newer one. Check your latest message from the garage, or call them."
            : "Check that you opened the full link from your text message."}
        </p>
      </main>
    );
  }

  const v = view.data;
  const current = LIFECYCLE.indexOf(v.status);
  const reachedAt = new Map(v.timeline.map((t) => [t.status, t.at]));

  return (
    <div className="min-h-dvh bg-concrete pb-40">
      <header className="bg-ink px-5 pb-8 pt-5 text-white">
        <div className="mx-auto max-w-xl">
          <p className="text-white/70">{v.garage.name}</p>
          <div className="mt-6">
            <Plate number={v.vehicle.registrationNumber} size="xl" />
          </div>
          <p className="mt-4 font-display text-2xl font-semibold">{v.vehicle.make} {v.vehicle.model}</p>
          <p className="text-white/70">Hi {v.customerFirstName}, here’s where your car is. Job <span className="whitespace-nowrap">{v.jobNumber}</span>.</p>
        </div>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-8 px-5 pt-8">
        {v.status === "CANCELLED" ? (
          <p className="rounded-panel bg-stop-soft p-4 text-stop">This job was closed by the garage. Call them if that’s unexpected.</p>
        ) : (
          <section aria-labelledby="progress">
            <h2 id="progress" className="mb-4 text-2xl font-semibold">Progress</h2>
            <ol className="flex flex-col">
              {LIFECYCLE.map((step, i) => {
                const state = i < current ? "done" : i === current ? "now" : "next";
                return (
                  <li key={step} className="grid grid-cols-[1.25rem_1fr] gap-x-3" aria-current={state === "now" ? "step" : undefined}>
                    <span className="flex flex-col items-center">
                      <span className={cx("mt-1 size-3.5 rounded-full border-2", state === "done" && "border-ink bg-ink", state === "now" && "size-4 border-ink bg-signal", state === "next" && "border-line bg-panel")} aria-hidden />
                      {i < LIFECYCLE.length - 1 && <span className={cx("w-0.5 flex-1", i < current ? "bg-ink" : "bg-line")} aria-hidden />}
                    </span>
                    <span className={cx("pb-4", state === "next" && "text-ink-faint")}>
                      <span className={cx(state === "now" && "font-semibold")}>{STATUS_LABEL[step]}</span>
                      {reachedAt.get(step) && <span className="ml-2 text-sm text-ink-faint">{when(reachedAt.get(step))}</span>}
                      {state === "now" && step === "AWAITING_APPROVAL" && <span className="block text-sm text-ink-soft">Waiting for your decision below.</span>}
                      {state === "now" && step === "READY_FOR_PICKUP" && <span className="block text-sm text-ink-soft">Your car is ready. Come by any time during opening hours.</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
            {v.promisedDeliveryAt && current < LIFECYCLE.indexOf("READY_FOR_PICKUP") && (
              <p className="text-ink-soft">Expected ready: {when(v.promisedDeliveryAt)}</p>
            )}
          </section>
        )}

        {v.problems.length > 0 && (
          <section aria-labelledby="found">
            <h2 id="found" className="mb-4 text-2xl font-semibold">What we found</h2>
            <ul className="flex flex-col gap-4">
              {v.problems.map((p) => (
                <li key={p.id} className="rounded-panel bg-panel p-4">
                  <p className={cx("text-sm font-semibold", p.severity === "CRITICAL" ? "text-stop" : p.severity === "HIGH" ? "text-ink" : "text-ink-soft")}>{SEVERITY_TEXT[p.severity]}</p>
                  <h3 className="mt-0.5 font-sans text-lg font-semibold">{p.title}</h3>
                  {p.description && <p className="mt-1 text-ink-soft">{p.description}</p>}
                  {p.photos.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {p.photos.map((ph) => (
                        <AuthImage key={ph.id} anonymous path={`/portal/${token}/${ph.path}`} mimeType={ph.mimeType} alt={ph.caption ?? p.title} className="aspect-square w-full rounded-control" />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {v.estimate && <EstimateBlock token={token} estimate={v.estimate} problems={v.problems} />}

        {v.invoice && (
          <section aria-labelledby="bill" className="rounded-panel bg-panel p-4">
            <h2 id="bill" className="text-2xl font-semibold">Bill {v.invoice.invoiceNumber}</h2>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 tabular-nums">
              <dt className="text-ink-soft">Total</dt><dd className="text-right">{money(v.invoice.total)}</dd>
              <dt className="text-ink-soft">Paid</dt><dd className="text-right">{money(v.invoice.amountPaid)}</dd>
              <dt className="font-semibold">Left to pay</dt><dd className="text-right font-display text-2xl font-semibold">{money(v.invoice.balanceDue)}</dd>
            </dl>
          </section>
        )}

        <a href={`tel:${v.garage.phone}`} className="flex items-center justify-center gap-2 rounded-control border border-line bg-panel py-3 font-medium">
          <Phone className="size-4" aria-hidden /> Call {v.garage.name}
        </a>
        {v.garage.address && <p className="-mt-4 text-center text-sm text-ink-faint">{v.garage.address}</p>}
      </main>
    </div>
  );
}

function EstimateBlock({ token, estimate, problems }: { token: string; estimate: PortalEstimate; problems: View["problems"] }) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<Record<string, boolean>>(Object.fromEntries(estimate.items.map((i) => [i.id, true])));
  const [remark, setRemark] = useState("");
  const respond = useMutation({
    mutationFn: () =>
      apiData<PortalEstimate>(`/portal/${token}/estimate/response`, {
        method: "POST",
        anonymous: true,
        body: { decisions: estimate.items.map((i) => ({ lineItemId: i.id, approved: choice[i.id] })), remark: remark.trim() || undefined },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal", token] }),
  });
  const titleFor = (problemId: string | null) => problems.find((p) => p.id === problemId)?.title;
  const rate = Number(estimate.taxRate);
  const approvedSub = estimate.items.filter((i) => choice[i.id]).reduce((s, i) => s + Number(i.lineTotal), 0);
  const approvedTotal = (approvedSub * (1 + rate / 100)).toFixed(2);
  const answered = estimate.respondedAt !== null;

  return (
    <section aria-labelledby="estimate">
      <h2 id="estimate" className="text-2xl font-semibold">{answered ? "Your decision" : "Approve the work"}</h2>
      <p className="mb-4 mt-1 text-ink-soft">
        {estimate.canRespond
          ? `Choose what you want us to do. Prices include parts and labour; ${rate}% tax is added. Valid until ${date(estimate.validUntil)}.`
          : answered
            ? `Thanks — you replied on ${date(estimate.respondedAt)}.`
            : "This estimate is no longer open for a decision. Check your latest message from the garage."}
      </p>
      <ul className="flex flex-col gap-2">
        {estimate.items.map((i) => {
          const on = estimate.canRespond ? choice[i.id] : i.approvalState === "APPROVED";
          return (
            <li key={i.id} className={cx("rounded-panel bg-panel p-4", !on && (estimate.canRespond || answered) && "opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{i.description}</p>
                  <p className="text-sm text-ink-faint">
                    {i.itemType === "LABOUR" ? "Labour" : "Part"}
                    {titleFor(i.problemId) ? ` · fixes ${titleFor(i.problemId)?.toLowerCase()}` : ""}
                  </p>
                </div>
                <p className="font-display text-xl font-semibold tabular-nums">{money(i.lineTotal, estimate.currency)}</p>
              </div>
              {estimate.canRespond ? (
                <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={`Decision for ${i.description}`}>
                  <button type="button" role="radio" aria-checked={on} onClick={() => setChoice((c) => ({ ...c, [i.id]: true }))}
                    className={cx("flex h-11 items-center justify-center gap-1.5 rounded-control border font-medium", on ? "border-ink bg-ink text-white" : "border-line text-ink-soft")}>
                    <Check className="size-4" aria-hidden /> Do this
                  </button>
                  <button type="button" role="radio" aria-checked={!on} onClick={() => setChoice((c) => ({ ...c, [i.id]: false }))}
                    className={cx("flex h-11 items-center justify-center gap-1.5 rounded-control border font-medium", !on ? "border-ink bg-ink text-white" : "border-line text-ink-soft")}>
                    <X className="size-4" aria-hidden /> Skip
                  </button>
                </div>
              ) : (
                answered && <p className={cx("mt-2 text-sm font-medium", i.approvalState === "APPROVED" ? "text-go" : "text-ink-faint")}>{i.approvalState === "APPROVED" ? "Approved" : "Skipped"}</p>
              )}
            </li>
          );
        })}
      </ul>

      {estimate.canRespond && (
        <>
          <label className="mt-4 block">
            <span className="text-sm text-ink-soft">Anything to tell the garage? (optional)</span>
            <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={1000} className="mt-1" placeholder="Please call me before fitting new tyres" />
          </label>
          {/* Sticky decision bar: the total updates as you choose. */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel px-5 py-3">
            <div className="mx-auto flex max-w-xl items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-ink-soft">You’ll pay, incl. tax</p>
                <p className="font-display text-3xl font-semibold leading-none tabular-nums">{money(approvedTotal, estimate.currency)}</p>
              </div>
              <Button tone="next" className="h-12 px-5" busy={respond.isPending} onClick={() => respond.mutate()}>
                Send my decision
              </Button>
            </div>
            <div className="mx-auto max-w-xl"><ErrorNote error={respond.error} /></div>
          </div>
        </>
      )}
      {answered && estimate.approvedTotal && (
        <p className="mt-4 rounded-panel bg-go-soft p-4">Approved work: <strong>{money(estimate.approvedTotal, estimate.currency)}</strong> including tax. We’ll text you when it’s ready.</p>
      )}
    </section>
  );
}
