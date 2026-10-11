import type { Metadata } from "next";
import { Suspense } from "react";
import { StaffView } from "./staff-view";

export const metadata: Metadata = { title: "Staff" };

export default function Page() {
  return (
    <Suspense>
      <StaffView />
    </Suspense>
  );
}
