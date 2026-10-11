"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button, Dialog, Empty, ErrorNote, Field, Input, LinkButton, Loading, Panel, Plate, StatusBadge } from "@/components/ui/kit";
import { api, apiData } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, humanize, km, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Paged, ServiceHistoryItem, VehicleDetail } from "@/lib/types";
import { useAction } from "@/lib/use-action";

export function VehicleView() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const vehicle = useQuery({ queryKey: ["vehicle", id], queryFn: () => apiData<VehicleDetail>(`/vehicles/${id}`) });
  const history = useQuery({ queryKey: ["vehicle", id, "history"], queryFn: () => api<Paged<ServiceHistoryItem>>(`/vehicles/${id}/service-history`, { query: { limit: 50 } }) });
  const update = useAction((body: object) => api(`/vehicles/${id}`, { method: "PATCH", body }), {
    success: "Vehicle updated",
    invalidate: [["vehicle", id], ["vehicles"]],
    onDone: () => setEditing(false),
  });

  if (vehicle.isPending) return <Loading />;
  if (vehicle.error) return <ErrorNote error={vehicle.error} />;
  const v = vehicle.data;

  return (
    <>
      <Link href="/vehicles" className="text-sm text-steel hover:underline">Vehicles</Link>
      <div className="mb-8 mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Plate number={v.registrationNumber} size="lg" />
        <div className="flex-1">
          <h1 className="text-3xl font-semibold">{v.make} {v.model} {v.variant ?? ""}</h1>
          <p className="text-ink-soft">
            Owned by <Link href={`/customers/${v.owner.id}`} className="text-steel hover:underline">{v.owner.name}</Link> · {v.owner.phone}
          </p>
        </div>
        {v.openJobCard ? (
          <LinkButton href={`/job-cards/${v.openJobCard.id}`} tone="next">Open job {v.openJobCard.jobNumber}</LinkButton>
        ) : (
          can(user?.role, "JOB_CARDS_MANAGE") && v.status === "ACTIVE" && <LinkButton href={`/job-cards/new?vehicleId=${v.id}`} tone="next">Check in this vehicle</LinkButton>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Panel title="Details" action={can(user?.role, "VEHICLES_MANAGE") && <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>}>
          <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
            <dt className="text-ink-soft">Fuel</dt><dd>{humanize(v.fuelType)}</dd>
            <dt className="text-ink-soft">Year</dt><dd>{v.manufactureYear ?? "—"}</dd>
            <dt className="text-ink-soft">Colour</dt><dd>{v.color ?? "—"}</dd>
            <dt className="text-ink-soft">Odometer</dt><dd>{km(v.odometerKm)}</dd>
            <dt className="text-ink-soft">VIN</dt><dd className="break-all">{v.vin ?? "—"}</dd>
            <dt className="text-ink-soft">Next service</dt><dd>{date(v.nextServiceDate)}</dd>
          </dl>
        </Panel>
        <Panel title="Service history">
          {history.data?.data.length ? (
            <ol className="flex flex-col divide-y divide-line-soft">
              {history.data.data.map((h) => (
                <li key={h.jobCardId}>
                  <Link href={`/job-cards/${h.jobCardId}`} className="grid gap-1 py-3 hover:bg-concrete/40 sm:grid-cols-[8rem_1fr_auto] sm:gap-4">
                    <span className="text-ink-soft">{date(h.createdAt)}</span>
                    <span>
                      <span className="font-medium">{h.problemTitles.length ? h.problemTitles.join(", ") : h.customerComplaints}</span>
                      <span className="mt-0.5 block"><StatusBadge status={h.status} /></span>
                    </span>
                    <span className="text-right">
                      <span className="block font-display text-xl font-semibold">{money(h.invoiceTotal)}</span>
                      <span className="text-sm text-ink-faint">{km(h.checkinOdometerKm)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="First visit">Completed jobs and what they cost will appear here.</Empty>
          )}
        </Panel>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit vehicle">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const s = (k: string) => String(f.get(k) ?? "").trim();
            update.mutate({
              registrationNumber: s("reg"), make: s("make"), model: s("model"), color: s("color") || undefined,
              odometerKm: Number(s("odometer")), nextServiceDate: s("next") || undefined,
            });
          }}
        >
          <div className="sm:col-span-2"><Field label="Registration number">{(i) => <Input id={i} name="reg" defaultValue={v.registrationNumber} className="font-display text-lg uppercase tracking-wider" required />}</Field></div>
          <Field label="Make">{(i) => <Input id={i} name="make" defaultValue={v.make} required />}</Field>
          <Field label="Model">{(i) => <Input id={i} name="model" defaultValue={v.model} required />}</Field>
          <Field label="Colour">{(i) => <Input id={i} name="color" defaultValue={v.color ?? ""} />}</Field>
          <Field label="Odometer (km)">{(i) => <Input id={i} name="odometer" type="number" min={v.odometerKm} defaultValue={v.odometerKm} required />}</Field>
          <div className="sm:col-span-2"><Field label="Next service due">{(i) => <Input id={i} name="next" type="date" defaultValue={v.nextServiceDate ?? ""} />}</Field></div>
          <div className="sm:col-span-2"><ErrorNote error={update.error} /></div>
          <Button tone="ink" type="submit" busy={update.isPending} className="sm:col-span-2">Save changes</Button>
        </form>
      </Dialog>
    </>
  );
}
