"use client";

import { toE164 } from "@/lib/phone";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Button, ErrorNote, Field, Input, Loading, PageHeader, Panel } from "@/components/ui/kit";
import { apiData } from "@/lib/api";
import type { Garage } from "@/lib/types";
import { useAction } from "@/lib/use-action";

export function SettingsView() {
  const welcome = useSearchParams().get("welcome") === "1";
  const garage = useQuery({ queryKey: ["garage"], queryFn: () => apiData<Garage>("/garages/current") });
  const save = useAction((body: object) => apiData<Garage>("/garages/current", { method: "PATCH", body }), { success: "Settings saved", invalidate: [["garage"]] });

  if (garage.isPending) return <Loading />;
  if (garage.error) return <ErrorNote error={garage.error} />;
  const g = garage.data;

  return (
    <>
      <PageHeader title="Garage settings" sub="What appears on estimates, invoices and the owner’s phone." />
      {welcome && (
        <p className="mb-6 max-w-2xl rounded-panel border border-signal bg-signal-soft px-4 py-3">
          Your garage is set up. Check your tax rate and address below, then add your team from the Staff page.
        </p>
      )}
      <form
        className="grid max-w-4xl gap-6 lg:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const s = (k: string) => String(f.get(k) ?? "").trim();
          save.mutate({
            name: s("name"), phone: toE164(s("phone")), email: s("email") || undefined, addressLine: s("addressLine") || undefined,
            city: s("city") || undefined, state: s("state") || undefined, postalCode: s("postalCode") || undefined,
            taxRegistrationNumber: s("gstin") || undefined, taxRate: s("taxRate"), timezone: s("timezone"),
          });
        }}
      >
        <Panel title="Garage">
          <div className="flex flex-col gap-3">
            <Field label="Name">{(i) => <Input id={i} name="name" defaultValue={g.name} required />}</Field>
            <Field label="Phone">{(i) => <Input id={i} name="phone" defaultValue={g.phone} required />}</Field>
            <Field label="Email">{(i) => <Input id={i} name="email" type="email" defaultValue={g.email ?? ""} />}</Field>
            <Field label="Address">{(i) => <Input id={i} name="addressLine" defaultValue={g.addressLine ?? ""} />}</Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="City">{(i) => <Input id={i} name="city" defaultValue={g.city ?? ""} />}</Field>
              <Field label="State">{(i) => <Input id={i} name="state" defaultValue={g.state ?? ""} />}</Field>
              <Field label="PIN">{(i) => <Input id={i} name="postalCode" defaultValue={g.postalCode ?? ""} />}</Field>
            </div>
          </div>
        </Panel>
        <Panel title="Billing">
          <div className="flex flex-col gap-3">
            <Field label="Tax rate (%)" hint="Applied to new estimates and invoices">
              {(i, d) => <Input id={i} name="taxRate" inputMode="decimal" defaultValue={g.taxRate} aria-describedby={d} required className="font-display text-xl" />}
            </Field>
            <Field label="GSTIN">{(i) => <Input id={i} name="gstin" defaultValue={g.taxRegistrationNumber ?? ""} />}</Field>
            <Field label="Time zone" hint="Used for “due today” and service reminders">
              {(i, d) => <Input id={i} name="timezone" defaultValue={g.timezone} aria-describedby={d} required />}
            </Field>
            <p className="text-sm text-ink-soft">Currency: {g.currency}</p>
          </div>
        </Panel>
        <div className="flex flex-col gap-3 lg:col-span-2">
          <ErrorNote error={save.error} />
          <Button tone="ink" type="submit" busy={save.isPending} className="self-start">Save settings</Button>
        </div>
      </form>
    </>
  );
}
