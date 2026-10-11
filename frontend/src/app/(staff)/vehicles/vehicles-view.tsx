"use client";

import { useQuery } from "@tanstack/react-query";
import { Car, Search, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OwnerVehicleForm } from "@/components/forms/owner-vehicle-form";
import { Button, Dialog, Empty, ErrorNote, Input, Loading, PageHeader, Pager, Plate, cx } from "@/components/ui/kit";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, km } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Paged, Vehicle } from "@/lib/types";

export function VehiclesView() {
  const { user } = useAuth();
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const query = { search, limit: 20, offset, order: { createdAt: "DESC" } };
  const list = useQuery({ queryKey: ["vehicles", query], queryFn: () => api<Paged<Vehicle>>("/vehicles", { query }) });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Vehicles"
        sub="Every car your garage has seen."
        actions={
          can(user?.role, "VEHICLES_MANAGE") && (
            <Button
              tone="next"
              onClick={() => setAdding(true)}
            >
              <Car className="size-4" aria-hidden />
              Add vehicle
            </Button>
          )
        }
      />

      {/* Search */}
      <form
        className="relative mb-6 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setSearch(term.trim());
        }}
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9baabb]" aria-hidden />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search plate, owner name or phone…"
          className="pl-10"
          aria-label="Search vehicles"
        />
      </form>

      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : list.data.total === 0 ? (
        <Empty title={search ? `No vehicle matches "${search}"` : "No vehicles yet"}>
          Vehicles are added when you check them in or from an owner's page.
        </Empty>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.data.data.map((v) => {
              const due = v.nextServiceDate && v.nextServiceDate <= today;
              return (
                <li key={v.id}>
                  <Link
                    href={`/vehicles/${v.id}`}
                    className={cx(
                      "group relative flex h-full flex-col gap-4 rounded-[18px] border-2 bg-white p-5 transition-all duration-200",
                      "hover:shadow-[0_8px_28px_rgba(15,22,35,0.10)] hover:-translate-y-0.5",
                      "shadow-[0_2px_8px_rgba(15,22,35,0.06)]",
                      due ? "border-[#fca5a5]" : "border-[#e8edf3]",
                    )}
                  >
                    {/* Service due ribbon */}
                    {due && (
                      <div className="absolute right-0 top-0 overflow-hidden rounded-tr-[16px] rounded-bl-[10px]">
                        <div className="bg-[#dc2626] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                          Service due
                        </div>
                      </div>
                    )}

                    {/* Plate */}
                    <Plate number={v.registrationNumber} />

                    {/* Vehicle info */}
                    <div className="flex-1">
                      <p className="font-bold text-[#0f1623] group-hover:text-[#1d4ed8] transition-colors">
                        {v.make} {v.model}
                        {v.manufactureYear ? (
                          <span className="ml-1.5 text-sm font-normal text-[#9baabb]">{v.manufactureYear}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-sm text-[#6b7e94]">
                        {v.owner.name}
                        {v.owner.phone && (
                          <span className="ml-2 text-[#9baabb]">· {v.owner.phone}</span>
                        )}
                      </p>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between rounded-[10px] bg-[#f8fafc] px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-[#6b7e94]">
                        <Wrench className="size-3.5 text-[#9baabb]" aria-hidden />
                        {km(v.odometerKm)}
                      </span>
                      {v.nextServiceDate && (
                        <span className={cx("font-semibold", due ? "text-[#dc2626]" : "text-[#6b7e94]")}>
                          {due ? "⚠ " : ""}Service {date(v.nextServiceDate)}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pager total={list.data.total} limit={list.data.limit} offset={list.data.offset} onChange={setOffset} />
        </>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add vehicle">
        <OwnerVehicleForm
          onCreated={(v) => {
            setAdding(false);
            router.push(`/vehicles/${v.id}`);
          }}
        />
      </Dialog>
    </>
  );
}
