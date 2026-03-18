import type { ReactNode } from "react";

type PillColor = "amber" | "green" | "muted";

interface PillProps {
  children: ReactNode;
  color?: PillColor;
}

const colorClasses: Record<PillColor, string> = {
  amber: "text-trolley-amber border-trolley-amber/25",
  green: "text-trolley-green border-trolley-green/25",
  muted: "text-trolley-text-dim border-trolley-text-dim/25",
};

export function Pill({ children, color = "amber" }: PillProps) {
  return (
    <span
      className={`text-[10px] tracking-[0.1em] border px-2 py-0.5 rounded-sm ${colorClasses[color]}`}
    >
      {children}
    </span>
  );
}
