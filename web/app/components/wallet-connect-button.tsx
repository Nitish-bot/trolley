"use client";

import {
  useConnectWallet,
  useDisconnectWallet,
  useWallet,
} from "@solana/react-hooks";
import { useState } from "react";
import { Btn } from "./ui/button";

const CONNECTORS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "wallet-standard:phantom", label: "Phantom" },
  { id: "wallet-standard:solflare", label: "Solflare" },
  { id: "wallet-standard:backpack", label: "Backpack" },
  { id: "wallet-standard:metamask", label: "MetaMask" },
];

function truncate(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const wallet = useWallet();
  const connectWallet = useConnectWallet();
  const disconnectWallet = useDisconnectWallet();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const isConnected = wallet.status === "connected";
  const address = isConnected
    ? wallet.session.account.address.toString()
    : null;

  async function handleConnect(connectorId: string) {
    setError(null);
    try {
      await connectWallet(connectorId);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect");
    }
  }

  async function handleDisconnect() {
    setError(null);
    try {
      await disconnectWallet();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to disconnect");
    }
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <Btn
        onClick={() => setOpen((prev) => !prev)}
        className={[
          "flex items-center gap-2 border rounded-sm px-3 py-1.75",
          "font-ibm-plex text-[11px] font-medium tracking-[0.08em] transition-colors cursor-pointer",
          isConnected
            ? "border-trolley-green text-trolley-green hover:bg-trolley-green/10"
            : "border-trolley-amber text-trolley-amber hover:bg-trolley-amber/10",
        ].join(" ")}
        small
      >
        {isConnected ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-trolley-green shrink-0" />
            <span>{truncate(address!)}</span>
          </>
        ) : (
          <span>CONNECT WALLET</span>
        )}
        <span className="text-[9px] opacity-60 ml-0.5">{open ? "▲" : "▼"}</span>
      </Btn>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-20 w-56 bg-trolley-panel border border-trolley-border rounded-sm">
          {isConnected ? (
            <>
              {/* Connected address */}
              <div className="px-3 py-2.5 border-b border-trolley-border">
                <div className="text-[9px] text-trolley-amber tracking-[0.18em] uppercase font-bold mb-1">
                  Connected
                </div>
                <div className="text-[11px] text-trolley-text-hi font-ibm-plex truncate">
                  {address}
                </div>
              </div>
              {/* Disconnect */}
              <div className="p-2">
                <Btn
                  onClick={() => void handleDisconnect()}
                  className="w-full border border-trolley-red text-trolley-red rounded-sm px-3 py-1.5 font-ibm-plex text-[10px] tracking-[0.08em] hover:bg-trolley-red/10 transition-colors"
                  small
                >
                  DISCONNECT
                </Btn>
              </div>
            </>
          ) : (
            <>
              {/* Wallet list label */}
              <div className="px-3 pt-2.5 pb-1.5 border-b border-trolley-border">
                <span className="text-[9px] text-trolley-amber tracking-[0.18em] uppercase font-bold">
                  Select Wallet
                </span>
              </div>
              {/* Wallet options */}
              <div className="p-2 flex flex-col gap-1">
                {CONNECTORS.map((connector) => (
                  <Btn
                    key={connector.id}
                    onClick={() => void handleConnect(connector.id)}
                    className="flex items-center justify-between w-full border border-trolley-border text-trolley-text-hi rounded-sm px-3 py-1.5 font-ibm-plex text-[11px] hover:border-trolley-amber hover:text-trolley-amber hover:bg-trolley-amber/10 transition-colors"
                    small
                  >
                    <span>{connector.label}</span>
                    <span className="text-[9px] text-trolley-text-dim">→</span>
                  </Btn>
                ))}
              </div>
            </>
          )}
          {error && (
            <div className="px-3 pb-2.5 text-[10px] text-trolley-red tracking-[0.06em]">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
