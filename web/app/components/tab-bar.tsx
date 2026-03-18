import type { TabId } from "../types/trolley";
import { Btn } from "./ui/button";

interface TabBarProps {
  tab: TabId;
  onTabChange: (id: TabId) => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "admin", label: "⬡  ADMIN TERMINAL" },
  { id: "user", label: "⬢  USER CLEARANCE" },
];

export function TabBar({ tab, onTabChange }: TabBarProps) {
  return (
    <div className="bg-trolley-panel border-b border-trolley-border flex">
      {TABS.map(({ id, label }) => (
        <Btn
          key={id}
          onClick={() => onTabChange(id)}
          className={[
            "bg-transparent border-0 border-b-2 py-2.5 px-6",
            "font-ibm-plex text-[10px] font-semibold tracking-[0.14em] transition-colors",
            tab === id
              ? "text-trolley-amber border-trolley-amber"
              : "text-trolley-text-dim border-transparent",
          ].join(" ")}
          style={{ cursor: "pointer" }}
        >
          {label}
        </Btn>
      ))}
    </div>
  );
}
