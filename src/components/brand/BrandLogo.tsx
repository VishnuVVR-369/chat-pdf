import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  logoClassName?: string;
  priority?: boolean;
  textClassName?: string;
};

export function BrandLogo({
  className,
  logoClassName,
  priority = false,
  textClassName,
}: BrandLogoProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Image
        alt="ChatPDF logo"
        className={cn("h-9 w-9", logoClassName)}
        height={1024}
        priority={priority}
        src="/logo.svg"
        unoptimized
        width={1024}
      />
      <span
        className={cn("text-lg font-semibold tracking-tight", textClassName)}
      >
        ChatPDF
      </span>
    </span>
  );
}
