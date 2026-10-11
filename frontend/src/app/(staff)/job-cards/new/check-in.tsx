"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { OwnerVehicleForm } from "@/components/forms/owner-vehicle-form";
import { Button, ErrorNote, Field, Input, Loading, PageHeader, Panel, Plate, Select, Textarea, cx } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { api, apiData } from "@/lib/api";
import { km } from "@/lib/format";
import type { JobDetail, Paged, Staff, Vehicle } from "@/lib/types";

export function CheckIn() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const searchParams = useSearchParams();
  const preset = searchParams.get("vehicleId");

  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Vehicle | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const found = useQuery({
    queryKey: ["vehicles", "pick", search],
    queryFn: () => api<Paged<Vehicle>>("/vehicles", { query: { search, limit: 8 } }),
    enabled: search.length >= 2,
  });

  // Fetch preset vehicle from URL ?vehicleId=...
  const vehicleQuery = useQuery({
    queryKey: ["vehicle", preset],
    queryFn: () => apiData<Vehicle>(`/vehicles/${preset}`),
    enabled: Boolean(preset),
  });

  // Sync picked vehicle whenever preset query loads data
  useEffect(() => {
    if (preset && vehicleQuery.data) {
      setPicked(vehicleQuery.data);
    }
  }, [preset, vehicleQuery.data]);

  // When preset parameter changes to a different vehicle, clear previous picked vehicle
  useEffect(() => {
    if (preset) {
      if (picked && picked.id !== preset) {
        setPicked(null);
      }
    }
  }, [preset]);

  const mechanics = useQuery({
    queryKey: ["staff", "mechanics"],
    queryFn: () => api<Paged<Staff>>("/staff", { query: { role: "MECHANIC", status: "ACTIVE", limit: 100 } }),
  });

  const chooseAnother = () => {
    setPicked(null);
    router.replace("/job-cards/new", { scroll: false });
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) return;
    const f = new FormData(e.currentTarget);
    const promised = String(f.get("promised") || "");
    setBusy(true);
    setError(null);
    try {
      const job = await apiData<JobDetail>("/job-cards", {
        method: "POST",
        body: {
          vehicleId: picked.id,
          checkinOdometerKm: Number(f.get("odometer")),
          fuelLevel: f.get("fuel") || undefined,
          customerComplaints: String(f.get("complaints")),
          promisedDeliveryAt: promised ? new Date(promised).toISOString() : undefined,
          assignedMechanicId: f.get("mechanic") || undefined,
        },
      });
      toast(`Checked in as ${job.jobNumber}. The owner has been sent a tracking link.`);
      queryClient.invalidateQueries({ queryKey: ["job-cards"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle", picked.id] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setBusy(false);
      router.push(`/job-cards/${job.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Check in a vehicle" sub="Find the car by its plate, or add it if it’s new to the garage." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Vehicle">
          {preset && vehicleQuery.isPending && !picked ? (
            <Loading label="Loading vehicle details" />
          ) : picked ? (
            <div className="flex flex-col items-start gap-3">
              <Plate number={picked.registrationNumber} size="lg" />
              <p className="text-lg font-semibold">{picked.make} {picked.model}</p>
              <p className="text-ink-soft">{picked.owner.name} · {picked.owner.phone}</p>
              <p className="text-sm text-ink-faint">Last odometer {km(picked.odometerKm)}</p>
              <Button size="sm" onClick={chooseAnother}>Choose another vehicle</Button>
            </div>
          ) : adding ? (
            <>
              <OwnerVehicleForm
                onCreated={(v) => {
                  setPicked(v);
                  setAdding(false);
                  toast("Vehicle saved");
                }}
              />
              <Button size="sm" className="mt-3" onClick={() => setAdding(false)}>Back to search</Button>
            </>
          ) : (
            <>
              <form
                className="relative"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(term.trim());
                }}
              >
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
                <Input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} onBlur={() => setSearch(term.trim())} placeholder="Plate, owner name or phone" className="pl-9" aria-label="Find vehicle" />
              </form>
              {found.isFetching && <Loading label="Searching" />}
              {found.data && (
                <ul className="mt-3 flex flex-col gap-2">
                  {found.data.data.map((v) => (
                    <li key={v.id}>
                      <button type="button" onClick={() => setPicked(v)} className="flex w-full items-center gap-3 rounded-control border border-line p-3 text-left hover:border-ink-faint">
                        <Plate number={v.registrationNumber} size="sm" />
                        <span className="flex-1 font-medium">{v.make} {v.model}<span className="block text-sm font-normal text-ink-faint">{v.owner.name} · {v.owner.phone}</span></span>
                      </button>
                    </li>
                  ))}
                  {found.data.total === 0 && <li className="text-ink-soft">No vehicle matches “{search}”.</li>}
                </ul>
              )}
              <Button tone="ink" className="mt-4" onClick={() => setAdding(true)}>Add a new vehicle</Button>
            </>
          )}
        </Panel>

        <Panel title="Job card">
          <form onSubmit={onSubmit} className={cx("flex flex-col gap-4", !picked && "pointer-events-none opacity-50")} inert={!picked}>
            <Field label="What the owner reports">
              {(id) => <Textarea id={id} name="complaints" required placeholder="Brake noise from the front left; AC not cooling" />}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Odometer now (km)" hint={picked ? `Last recorded ${km(picked.odometerKm)}` : undefined}>
                {(id, d) => <Input id={id} name="odometer" type="number" min={picked?.odometerKm ?? 0} defaultValue={picked?.odometerKm} key={picked?.id} aria-describedby={d} required />}
              </Field>
              <Field label="Fuel level">
                {(id) => (
                  <Select id={id} name="fuel" defaultValue="">
                    <option value="">Not noted</option>
                    <option value="EMPTY">Empty</option>
                    <option value="QUARTER">¼</option>
                    <option value="HALF">½</option>
                    <option value="THREE_QUARTER">¾</option>
                    <option value="FULL">Full</option>
                  </Select>
                )}
              </Field>
              <Field label="Promised for">{(id) => <Input id={id} name="promised" type="datetime-local" />}</Field>
              <Field label="Mechanic">
                {(id) => (
                  <Select id={id} name="mechanic" defaultValue="">
                    <option value="">Assign later</option>
                    {mechanics.data?.data.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <ErrorNote error={error} />
            <Button tone="next" type="submit" busy={busy} disabled={!picked} className="h-11 self-start">
              Open job card
            </Button>
          </form>
        </Panel>
      </div>
    </>
  );
}
