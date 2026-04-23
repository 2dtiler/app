import * as React from "react";

import { cn } from "@/utils/cn";

function Input({
  className,
  type,
  id,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      id={id}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-xl border border-input bg-transparent px-3 py-2 font-mono text-sm tracking-[0.02em] text-foreground outline-none transition-colors placeholder:text-text-disabled file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-mono file:text-[11px] file:uppercase file:tracking-[0.08em] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:border-foreground",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
