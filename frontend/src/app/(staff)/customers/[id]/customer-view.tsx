"use client";

import { toE164 } from "@/lib/phone";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { OwnerVehicleForm } from "@/components/forms/owner-vehicle-form";
import { Button, Dialog, Empty, ErrorNote, Field, Input, Loading, Panel, Plate, Textarea } from "@/components/ui/kit";
import { api, apiData } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Channel, CustomerDetail } from "@/lib/types";
import { useAction } from "@/lib/use-action";

export function CustomerView() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const customer = useQuery({ queryKey: ["customer", id], queryFn: () => apiData<CustomerDetail>(`/customers/${id}`) });
  const update = useAction((body: object) => api(`/customers/${id}`, { method: "PATCH", body }), {
    success: "Customer updated",
    invalidate: [["customer", id], ["customers"]],
    onDone: () => setEditing(false),
  });

  if (customer.isPending) return <Loading />;
  if (customer.error) return <ErrorNote error={customer.error} />;
  const c = customer.data;
  const manage = can(user?.role, "CUSTOMERS_MANAGE");

  return (
    <>
      <Link href="/customers" className="text-sm text-steel hover:underline">Customers</Link>
      <div className="mb-8 mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">{c.name}</h1>
          <p className="mt-1 flex flex-wrap gap-4 text-ink-soft">
            <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-steel hover:underline"><Phone className="size-4" aria-hidden />{c.phone}</a>
            {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-steel hover:underline"><Mail className="size-4" aria-hidden />{c.email}</a>}
            <span>Customer since {date(c.createdAt)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {manage && <Button onClick={() => setEditing(true)}>Edit</Button>}
          {can(user?.role, "VEHICLES_MANAGE") && <Button tone="ink" onClick={() => setAdding(true)}>Add vehicle</Button>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-label="Vehicles">
          {c.vehicles.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {c.vehicles.map((v) => (
                <li key={v.id}>
                  <Link href={`/vehicles/${v.id}`} className="flex flex-col gap-3 rounded-panel border border-line bg-panel p-4 hover:border-ink-faint">
                    <Plate number={v.registrationNumber} />
                    <span className="font-medium">{v.make} {v.model}{v.status === "INACTIVE" && <span className="ml-2 text-sm font-normal text-ink-faint">Inactive</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No vehicles yet" action={can(user?.role, "VEHICLES_MANAGE") && <Button tone="ink" onClick={() => setAdding(true)}>Add vehicle</Button>} />
          )}
        </section>
        <Panel title="How to reach them">
          <p>{c.preferredChannels.map((ch) => (ch === "SMS" ? "Text message" : "Email")).join(" and ")}</p>
          {c.address && <p className="mt-3 text-ink-soft">{c.address}</p>}
          {c.notes && <p className="mt-3 rounded-control bg-concrete px-3 py-2 text-sm">{c.notes}</p>}
        </Panel>
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title={`Add a vehicle for ${c.name}`}>
        <OwnerVehicleForm
          customerId={c.id}
          onCreated={(v) => {
            setAdding(false);
            router.push(`/vehicles/${v.id}`);
          }}
        />
      </Dialog>
      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit customer">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const channels: Channel[] = ["SMS", ...(f.get("emailUpdates") ? (["EMAIL"] as Channel[]) : [])];
            update.mutate({
              name: f.get("name"), phone: toE164(String(f.get("phone"))), email: String(f.get("email") || "") || undefined,
              address: String(f.get("address") || "") || undefined, notes: String(f.get("notes") || "") || undefined,
              preferredChannels: channels,
            });
          }}
        >
          <Field label="Name">{(i) => <Input id={i} name="name" defaultValue={c.name} required />}</Field>
          <Field label="Mobile number">{(i) => <Input id={i} name="phone" defaultValue={c.phone} required />}</Field>
          <Field label="Email">{(i) => <Input id={i} name="email" type="email" defaultValue={c.email ?? ""} />}</Field>
          <label className="flex items-center gap-2"><input type="checkbox" name="emailUpdates" defaultChecked={c.preferredChannels.includes("EMAIL")} className="size-4 accent-[#1c2430]" /> Also send updates by email</label>
          <Field label="Address">{(i) => <Textarea id={i} name="address" defaultValue={c.address ?? ""} />}</Field>
          <Field label="Notes for staff">{(i) => <Textarea id={i} name="notes" defaultValue={c.notes ?? ""} />}</Field>
          <ErrorNote error={update.error} />
          <Button tone="ink" type="submit" busy={update.isPending}>Save changes</Button>
        </form>
      </Dialog>
    </>
  );
}
