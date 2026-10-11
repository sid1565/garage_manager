import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Garage settings" };

export default function Page() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
