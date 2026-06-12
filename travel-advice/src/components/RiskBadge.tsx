import type { NormalizedLevel } from "@/types";
import { LEVEL_LABELS_NL } from "@/lib/normalize-risk";
import { clsx } from "clsx";

const STYLES: Record<NormalizedLevel, string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-300",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
  orange: "bg-orange-100 text-orange-800 border-orange-300",
  red: "bg-red-100 text-red-800 border-red-300",
  unknown: "bg-gray-100 text-gray-500 border-gray-200",
};

const DOT_STYLES: Record<NormalizedLevel, string> = {
  green: "bg-emerald-500",
  yellow: "bg-yellow-400",
  orange: "bg-orange-400",
  red: "bg-red-500",
  unknown: "bg-gray-300",
};

interface Props {
  level: NormalizedLevel;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function RiskBadge({ level, showLabel = true, size = "md" }: Props) {
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5 gap-1",
    md: "text-sm px-2 py-1 gap-1.5",
    lg: "text-base px-3 py-1.5 gap-2",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border font-medium",
        STYLES[level],
        sizeClasses[size]
      )}
    >
      <span className={clsx("rounded-full flex-shrink-0", DOT_STYLES[level], {
        "w-2 h-2": size === "sm",
        "w-2.5 h-2.5": size === "md",
        "w-3 h-3": size === "lg",
      })} />
      {showLabel && LEVEL_LABELS_NL[level]}
    </span>
  );
}

export function RiskDot({ level }: { level: NormalizedLevel }) {
  const title = LEVEL_LABELS_NL[level];
  return (
    <span
      title={title}
      className={clsx(
        "inline-block w-4 h-4 rounded-full border-2 border-white shadow-sm",
        DOT_STYLES[level]
      )}
    />
  );
}
