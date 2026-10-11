"use client";

import { toE164 } from "@/lib/phone";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorNote, Field, Input } from "@/components/ui/kit";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const fields = error instanceof ApiError ? error.fieldErrors : {};

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await register({
        garageName: String(f.get("garageName")),
        garagePhone: toE164(String(f.get("garagePhone"))),
        city: String(f.get("city") || "") || undefined,
        name: String(f.get("name")),
        email: String(f.get("email")),
        password: String(f.get("password")),
      });
      router.replace("/settings?welcome=1");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Garage name" error={fields.garageName}>{(id) => <Input id={id} name="garageName" required minLength={2} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Garage phone" hint="Landline or mobile" error={fields.garagePhone}>
          {(id, d) => <Input id={id} name="garagePhone" aria-describedby={d} placeholder="020 2456 7890" inputMode="tel" required />}
        </Field>
        <Field label="City">{(id) => <Input id={id} name="city" />}</Field>
      </div>
      <Field label="Your name" error={fields.name}>{(id) => <Input id={id} name="name" required minLength={2} />}</Field>
      <Field label="Email" error={fields.email}>{(id) => <Input id={id} name="email" type="email" autoComplete="username" required />}</Field>
      <Field label="Password" hint="At least 8 characters, with a letter and a number" error={fields.password}>
        {(id, d) => <Input id={id} name="password" type="password" autoComplete="new-password" aria-describedby={d} required minLength={8} />}
      </Field>
      <ErrorNote error={error} />
      <Button tone="next" type="submit" busy={busy} className="mt-2 h-11">
        Create garage
      </Button>
      <p className="text-sm text-ink-soft">
        Already set up?{" "}
        <Link href="/login" className="font-medium text-steel underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
