import { Pill } from "./ui/pill";
import { TROLLEY_PROGRAM_ADDRESS } from "@client/programs";
import { WalletConnectButton } from "./wallet-connect-button";

export function Header() {
  return (
    <div className="bg-trolley-panel border-b border-trolley-border px-6 py-2.5 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3.5">
        <span className="text-sm text-trolley-amber font-bold tracking-[0.12em] font-ibm-plex">
          TROLLEY
        </span>
        <span className="text-trolley-border text-xs">/</span>
        <span className="text-[10px] text-trolley-text-dim tracking-widest">
          ON-CHAIN RBAC
        </span>
        <span className="text-trolley-border text-xs">/</span>
        <Pill>
          {TROLLEY_PROGRAM_ADDRESS.slice(0, 4)}…
          {TROLLEY_PROGRAM_ADDRESS.slice(-4)}
        </Pill>
      </div>
      <div>
        <WalletConnectButton />
      </div>
    </div>
  );
}
