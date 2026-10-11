"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useEffect, useMemo } from "react";
import { api } from "@/lib/api";

/**
 * Images behind the API need a bearer token (staff) or come cross-origin (portal), so
 * <img src> can’t load them directly — fetch as a blob and show an object URL.
 */
export function AuthImage({ path, alt, mimeType, anonymous, className }: { path: string; alt: string; mimeType: string; anonymous?: boolean; className?: string }) {
  const blob = useQuery({ queryKey: ["blob", path], queryFn: () => api<Blob>(path, { blob: true, anonymous }), staleTime: Infinity });
  const url = useMemo(() => (blob.data ? URL.createObjectURL(blob.data) : null), [blob.data]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  if (mimeType === "application/pdf") {
    return (
      <a href={url ?? undefined} target="_blank" rel="noreferrer" className={`grid place-items-center bg-concrete text-ink-soft ${className}`}>
        <FileText className="size-6" aria-hidden />
        <span className="sr-only">{alt}</span>
      </a>
    );
  }
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element -- object URL, not optimisable */}
      <img src={url} alt={alt} className={`object-cover ${className}`} />
    </a>
  ) : (
    <span className={`block animate-pulse bg-concrete ${className}`} aria-label={`Loading ${alt}`} />
  );
}
