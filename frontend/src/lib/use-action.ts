"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";

/** A mutation that confirms with a toast (same verb as the button) and refreshes data. */
export function useAction<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[]; onDone?: (r: TResult) => void } = {},
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await Promise.all((opts.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (opts.success) toast(typeof opts.success === "function" ? opts.success(result) : opts.success);
      opts.onDone?.(result);
    },
  });
}
