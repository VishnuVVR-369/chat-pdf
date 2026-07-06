"use client";

import { Cancel01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

export function GuestSessionBanner({ isGuest }: { isGuest: boolean }) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (!isGuest || isDismissed) {
    return null;
  }

  return (
    <div className="relative z-30 border-b border-amber-400/15 bg-[#151006] px-4 py-2.5 text-amber-100 shadow-[0_10px_30px_-24px_rgba(245,158,11,0.8)]">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-200">
          <HugeiconsIcon icon={UserGroupIcon} size={15} strokeWidth={1.8} />
        </span>
        <p className="min-w-0 flex-1 text-sm leading-5 text-amber-100/90">
          You are signed in as a guest. Guest sign-ins have stricter rate
          limits.
        </p>
        <button
          aria-label="Dismiss guest sign-in banner"
          className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-amber-100/70 transition-colors hover:bg-amber-100/10 hover:text-amber-50"
          onClick={() => setIsDismissed(true)}
          type="button"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
