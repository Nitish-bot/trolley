import type { ReactNode, SelectHTMLAttributes } from "react";

interface FieldSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

export function FieldSelect({ children, ...props }: FieldSelectProps) {
  return (
    <select
      {...props}
      className="bg-trolley-input font-ibm-plex text-xs text-trolley-text-hi border border-trolley-border rounded-sm px-[11px] py-[7px] outline-none w-full cursor-pointer"
    >
      {children}
    </select>
  );
}
