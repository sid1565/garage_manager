"use client";

import { toE164 } from "@/lib/phone";
import { useState } from "react";
import { Button, ErrorNote, Field, Input, Select } from "@/components/ui/kit";
import { apiData } from "@/lib/api";
import type { Customer, FuelType, Vehicle } from "@/lib/types";

const FUELS: FuelType[] = ["PETROL", "DIESEL", "CNG", "ELECTRIC", "HYBRID", "LPG", "OTHER"];

/**
 * Adds a vehicle — to an existing owner (customerId) or together with a new owner.
 * Re-uses an existing owner with the same phone (the API returns duplicate: true).
 */
export function OwnerVehicleForm({ customerId, onCreated }: { customerId?: string; onCreated: (v: Vehicle) => void }) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      let ownerId = customerId;
      if (!ownerId) {
        const email = s("email");
        const owner = await apiData<Customer & { duplicate: boolean }>("/customers", {
          method: "POST",
          body: { name: s("name"), phone: toE164(s("phone")), email: email || undefined, preferredChannels: email ? ["SMS", "EMAIL"] : ["SMS"] },
        });
        ownerId = owner.id;
      }
      const vehicle = await apiData<Vehicle>("/vehicles", {
        method: "POST",
        body: {
          customerId: ownerId,
          registrationNumber: s("registrationNumber"),
          make: s("make"),
          model: s("model"),
          fuelType: s("fuelType"),
          manufactureYear: s("year") ? Number(s("year")) : undefined,
          odometerKm: s("odometer") ? Number(s("odometer")) : undefined,
        },
      });
      onCreated(vehicle);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {!customerId && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 font-display text-lg font-semibold">Owner</legend>
          <Field label="Name">{(id) => <Input id={id} name="name" required minLength={2} />}</Field>
          <Field label="Mobile number" hint="We text updates here">
            {(id, d) => <Input id={id} name="phone" aria-describedby={d} placeholder="98765 43210" inputMode="tel" required />}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Email (optional)">{(id) => <Input id={id} name="email" type="email" />}</Field>
          </div>
        </fieldset>
      )}
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg font-semibold">Vehicle</legend>
        <div className="sm:col-span-2">
          <Field label="Registration number">{(id) => <Input id={id} name="registrationNumber" placeholder="MH 12 AB 1234" className="font-display text-lg uppercase tracking-wider" required />}</Field>
        </div>
        <Field label="Make">{(id) => <Input id={id} name="make" placeholder="Maruti" required />}</Field>
        <Field label="Model">{(id) => <Input id={id} name="model" placeholder="Swift" required />}</Field>
        <Field label="Fuel">
          {(id) => (
            <Select id={id} name="fuelType" defaultValue="PETROL">
              {FUELS.map((x) => (
                <option key={x} value={x}>{x.charAt(0) + x.slice(1).toLowerCase()}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Year">{(id) => <Input id={id} name="year" type="number" min={1950} max={2100} />}</Field>
        <Field label="Odometer (km)">{(id) => <Input id={id} name="odometer" type="number" min={0} />}</Field>
      </fieldset>
      <ErrorNote error={error} />
      <Button tone="ink" type="submit" busy={busy} className="self-start">
        Save vehicle
      </Button>
    </form>
  );
}
