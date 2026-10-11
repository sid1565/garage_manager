import type { Metadata } from "next";
import { Suspense } from "react";
import { VehicleView } from "./vehicle-view";

export const metadata: Metadata = { title: "Vehicle" };

export default function Page() {
  return (
    <Suspense>
      <VehicleView />
    </Suspense>
  );
}
