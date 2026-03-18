import type { ReactNode, MouseEventHandler, CSSProperties } from "react";

type BtnVariant = "default" | "danger" | "green";

interface BtnProps {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  variant?: BtnVariant;
  small?: boolean;
  className?: string; // 1. Add className to the interface
  style?: CSSProperties;
}

const variantClasses: Record<BtnVariant, string> = {
  default: "border-trolley-amber text-trolley-amber hover:bg-trolley-amber/10",
  danger: "border-trolley-red text-trolley-red hover:bg-trolley-red/10",
  green: "border-trolley-green text-trolley-green hover:bg-trolley-green/10",
};

export function Btn({
  children,
  onClick,
  disabled,
  variant = "default",
  small,
  className = "", // 2. Destructure with a default empty string
  style,
}: BtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "border rounded-sm font-ibm-plex font-medium tracking-[0.08em] transition-colors whitespace-nowrap",
        small ? "text-[10px] px-2 py-1" : "text-[12px] px-4 py-1.75",
        disabled ? "opacity-35 cursor-not-allowed" : "cursor-pointer",
        variantClasses[variant],
        className, // 3. Add the custom className to the array
      ].join(" ")}
      style={style}
    >
      {children}
    </button>
  );
}
