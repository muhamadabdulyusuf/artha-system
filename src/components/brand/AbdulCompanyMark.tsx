import Image from "next/image";
import AbdulCompanyLogo from "@/image/ABDUL_COMPANY-j3SShBh9.png";

type AbdulCompanyMarkProps = {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  subtitle?: string;
  className?: string;
};

const SIZE_CLASS: Record<NonNullable<AbdulCompanyMarkProps["size"]>, string> = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

export function AbdulCompanyMark({
  size = "md",
  showText = true,
  subtitle = "Control Stock System",
  className = "",
}: AbdulCompanyMarkProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className={`${SIZE_CLASS[size]} flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]`}
      >
        <Image
          src={AbdulCompanyLogo}
          alt="Abdul Company"
          className="h-full w-full object-contain"
          priority={size === "lg"}
        />
      </div>
      {showText ? (
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-slate-900">Abdul Company</p>
          <p className="mt-0.5 text-xs font-medium leading-tight text-slate-500">{subtitle}</p>
        </div>
      ) : null}
    </div>
  );
}
