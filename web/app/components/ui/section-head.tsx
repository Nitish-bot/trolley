interface SectionHeadProps {
  idx: number;
  title: string;
}

export function SectionHead({ idx, title }: SectionHeadProps) {
  return (
    <div className="flex items-center gap-2.5 mb-3.5">
      <span className="text-[9px] text-trolley-amber-mid tracking-[0.2em] min-w-[16px]">
        {String(idx).padStart(2, "0")}
      </span>
      <span className="text-[10px] text-trolley-text-hi tracking-[0.14em] font-bold">
        {title.toUpperCase()}
      </span>
      <div className="flex-1 border-b border-dashed border-trolley-border" />
    </div>
  );
}
