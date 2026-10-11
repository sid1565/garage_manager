import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckIn } from "./check-in";

export const metadata: Metadata = { title: "Check in" };

export default function Page() {
  return (
    <Suspense>
      <CheckIn />
    </Suspense>
  );
}
