import type { Metadata } from "next";
import { Suspense } from "react";
import { VehiclesView } from "./vehicles-view";

export const metadata: Metadata = { title: "Vehicles" };

export default function Page() {
  return (
    <Suspense>
      <VehiclesView />
    </Suspense>
  );
}
