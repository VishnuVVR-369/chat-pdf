import * as React from "react";
import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<"input"> & {
  containerClassName?: string;
  startSlot?: React.ReactNode;
  endSlot?: React.ReactNode;
};

function Input({
  className,
  containerClassName,
  startSlot,
  endSlot,
  type = "text",
  ...props
}: InputProps) {
  if (!startSlot && !endSlot) {
    return (
      <input
        data-slot="input"
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-stone-200 transition-colors outline-none placeholder:text-stone-600",
          "focus-visible:border-amber-400/30 focus-visible:bg-white/[0.05] focus-visible:shadow-[0_0_12px_-3px_rgba(245,158,11,0.15)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      />
    );
  }

  return (
    <label
      className={cn(
        "group relative flex h-9 w-full items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-sm text-stone-200 transition-colors",
        "focus-within:border-amber-400/30 focus-within:bg-white/[0.05] focus-within:shadow-[0_0_12px_-3px_rgba(245,158,11,0.15)]",
        containerClassName,
      )}
    >
      {startSlot && (
        <span className="pointer-events-none flex h-full w-9 shrink-0 items-center justify-center text-stone-600 group-focus-within:text-amber-400/70">
          {startSlot}
        </span>
      )}
      <input
        data-slot="input"
        type={type}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent pr-3 text-sm text-stone-200 outline-none placeholder:text-stone-600 disabled:cursor-not-allowed disabled:opacity-60",
          startSlot ? "pl-0" : "pl-3",
          className,
        )}
        {...props}
      />
      {endSlot && (
        <span className="flex h-full shrink-0 items-center pr-1.5">
          {endSlot}
        </span>
      )}
    </label>
  );
}

export { Input };
