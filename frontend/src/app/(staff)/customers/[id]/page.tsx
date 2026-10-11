import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomerView } from "./customer-view";

export const metadata: Metadata = { title: "Customer" };

export default function Page() {
  return (
    <Suspense>
      <CustomerView />
    </Suspense>
  );
}
