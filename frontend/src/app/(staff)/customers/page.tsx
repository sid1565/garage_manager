import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomersView } from "./customers-view";

export const metadata: Metadata = { title: "Customers" };

export default function Page() {
  return (
    <Suspense>
      <CustomersView />
    </Suspense>
  );
}
