import type { Metadata } from "next";
import { Suspense } from "react";
import { JobBoard } from "./job-board";

export const metadata: Metadata = { title: "Job board" };

export default function Page() {
  return (
    <Suspense>
      <JobBoard />
    </Suspense>
  );
}
