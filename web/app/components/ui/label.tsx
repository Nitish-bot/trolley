import type { ReactNode } from "react";

interface LabelProps {
  children: ReactNode;
}

export function Label({ children }: LabelProps) {
  return (
    <span className="text-[9px] tracking-[0.18em] uppercase font-bold text-trolley-amber">
      {children}
    </span>
  );
}
