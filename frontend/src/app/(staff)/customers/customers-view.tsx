"use client";

import { toE164 } from "@/lib/phone";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Phone, Search, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Dialog, Empty, ErrorNote, Field, Input, Loading, PageHeader, Pager } from "@/components/ui/kit";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { Customer, Paged } from "@/lib/types";
import { useAction } from "@/lib/use-action";

export function CustomersView() {
  const { user } = useAuth();
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const query = { search, limit: 20, offset, order: { name: "ASC" } };
  const list = useQuery({ queryKey: ["customers", query], queryFn: () => api<Paged<Customer>>("/customers", { query }) });
  const create = useAction(
    (body: object) => api<{ data: Customer & { duplicate: boolean } }>("/customers", { method: "POST", body }),
    {
      success: (r) => (r.data.duplicate ? "This number is already a customer — opening their page" : "Customer added"),
      invalidate: [["customers"]],
      onDone: (r) => {
        setAdding(false);
        router.push(`/customers/${r.data.id}`);
      },
    },
  );

  return (
    <>
      <PageHeader
        title="Customers"
        sub="Vehicle owners and how they like to hear from you."
        actions={
          can(user?.role, "CUSTOMERS_MANAGE") && (
            <Button tone="next" onClick={() => setAdding(true)}>
              <Users className="size-4" aria-hidden />
              Add customer
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
          placeholder="Name, phone or email…"
          className="pl-10"
          aria-label="Search customers"
        />
      </form>

      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : list.data.total === 0 ? (
        <Empty title={search ? `No customer matches "${search}"` : "No customers yet"}>
          Owners are added when you check in their first vehicle.
        </Empty>
      ) : (
        <>
          <div className="overflow-hidden rounded-[18px] border border-[#e8edf3] bg-white shadow-[0_2px_8px_rgba(15,22,35,0.06)]">
            <ul className="divide-y divide-[#f0f3f7]">
              {list.data.data.map((c) => (
                <li key={c.id} className="group">
                  <Link
                    href={`/customers/${c.id}`}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 px-5 py-4 transition-all duration-150 hover:bg-[#f8fafc] sm:grid-cols-[auto_1fr_12rem_8rem_auto]"
                  >
                    {/* Avatar */}
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e8edf3] to-[#d4dce6] text-sm font-bold text-[#3d4d60]">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    {/* Name */}
                    <div className="min-w-0">
                      <p className="font-semibold text-[#0f1623] group-hover:text-[#1d4ed8] transition-colors">{c.name}</p>
                      <p className="text-xs text-[#9baabb] sm:hidden">{c.phone}</p>
                    </div>
                    {/* Phone */}
                    <span className="hidden items-center gap-1.5 text-sm text-[#6b7e94] sm:flex">
                      <Phone className="size-3.5 text-[#9baabb]" aria-hidden />
                      {c.phone}
                    </span>
                    {/* Vehicle count */}
                    <span className="hidden rounded-full bg-[#f0f3f7] px-2.5 py-1 text-center text-xs font-semibold text-[#3d4d60] sm:block">
                      {c.vehicleCount} {c.vehicleCount === 1 ? "vehicle" : "vehicles"}
                    </span>
                    {/* Arrow */}
                    <ArrowRight className="size-4 text-[#d4dce6] transition-transform group-hover:translate-x-0.5 group-hover:text-[#9baabb]" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Pager total={list.data.total} limit={list.data.limit} offset={list.data.offset} onChange={setOffset} />
        </>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add customer">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const email = String(f.get("email") || "").trim();
            create.mutate({
              name: f.get("name"),
              phone: toE164(String(f.get("phone"))),
              email: email || undefined,
              preferredChannels: email ? ["SMS", "EMAIL"] : ["SMS"],
            });
          }}
        >
          <Field label="Full name">{(i) => <Input id={i} name="name" required minLength={2} placeholder="e.g. Rahul Sharma" />}</Field>
          <Field label="Mobile number" hint="10-digit mobile, e.g. 98765 43210">
            {(i, d) => <Input id={i} name="phone" aria-describedby={d} required placeholder="9876543210" />}
          </Field>
          <Field label="Email address (optional)">{(i) => <Input id={i} name="email" type="email" placeholder="optional@email.com" />}</Field>
          <ErrorNote error={create.error} />
          <Button tone="next" type="submit" busy={create.isPending}>
            <UserRound className="size-4" aria-hidden />
            Add customer
          </Button>
        </form>
      </Dialog>
    </>
  );
}
