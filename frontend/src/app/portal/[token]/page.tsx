import type { Metadata } from "next";
import { Suspense } from "react";
import { PortalView } from "./portal-view";

export const metadata: Metadata = {
  title: "Your vehicle",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Page() {
  return (
    <Suspense>
      <PortalView />
    </Suspense>
  );
}
