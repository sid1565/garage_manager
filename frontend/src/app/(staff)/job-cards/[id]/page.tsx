import type { Metadata } from "next";
import { Suspense } from "react";
import { JobView } from "./job-view";

export const metadata: Metadata = { title: "Job card" };

export default function Page() {
  return (
    <Suspense>
      <JobView />
    </Suspense>
  );
}
