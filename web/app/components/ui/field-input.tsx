import type { InputHTMLAttributes } from "react";

type FieldInputProps = InputHTMLAttributes<HTMLInputElement>;

export function FieldInput({ className, ...props }: FieldInputProps) {
  return (
    <input
      {...props}
      className={[
        "bg-trolley-input font-ibm-plex text-xs text-trolley-text-hi",
        "border border-trolley-border focus:border-trolley-amber",
        "rounded-sm px-[11px] py-[7px] outline-none w-full transition-colors",
        "placeholder:text-trolley-text-dim",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
