import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = { title: "Today" };

export default function Page() {
  return (
    <Suspense>
      <DashboardView />
    </Suspense>
  );
}
