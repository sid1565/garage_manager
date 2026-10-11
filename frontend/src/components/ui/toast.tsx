"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";

interface Toast {
  id: number;
  tone: "ok" | "error";
  text: string;
}

const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

/** Confirms an action with the same verb as its button ("Estimate sent"). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="animate-slide-up pointer-events-auto flex max-w-md items-center gap-3 rounded-[14px] border border-white/10 bg-[#0f1623]/95 px-4 py-3.5 text-sm text-white shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md"
          >
            {t.tone === "ok" ? (
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f59e0b]/20">
                <CheckCircle2 className="size-4 text-[#f59e0b]" aria-hidden />
              </div>
            ) : (
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#dc2626]/20">
                <XCircle className="size-4 text-[#ff8a80]" aria-hidden />
              </div>
            )}
            <span className="font-medium">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
