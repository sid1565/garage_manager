import { Suspense } from "react";
import { StaffShell } from "@/components/shell/staff-shell";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <StaffShell>{children}</StaffShell>
    </Suspense>
  );
}
