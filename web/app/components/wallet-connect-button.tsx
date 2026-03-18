"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { StandardConnect, StandardDisconnect } from "@wallet-standard/core";
import {
  type UiWallet,
  type UiWalletAccount,
  uiWalletAccountBelongsToUiWallet,
  useConnect,
  useDisconnect,
  useWallets,
} from "@wallet-standard/react";
import { SelectedWalletAccountContext } from "../context/selected-wallet-account-context";
import Image from "next/image";

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

// ── WalletOption ──────────────────────────────────────────────────────────────
// useConnect must be called per-wallet at the top level of a component,
// so each wallet gets its own component instance.

function WalletOption({
  wallet,
  onSelect,
}: {
  wallet: UiWallet;
  onSelect: (account: UiWalletAccount) => void;
}) {
  const [isConnecting, connect] = useConnect(wallet);

  const handleClick = useCallback(async () => {
    try {
      const accounts = await connect();
      if (accounts[0]) onSelect(accounts[0]);
    } catch (err) {
      console.error("Wallet connect error:", err);
    }
  }, [connect, onSelect]);

  return (
    <button
      onClick={handleClick}
      disabled={isConnecting}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 12px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--trolley-border, #162436)",
        cursor: isConnecting ? "wait" : "pointer",
        fontFamily: "inherit",
        fontSize: 11,
        letterSpacing: "0.08em",
        color: "var(--trolley-text-hi, #c8dff0)",
        textAlign: "left",
        opacity: isConnecting ? 0.5 : 1,
        transition: "background 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!isConnecting) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "rgba(232,160,32,0.08)";
          (e.currentTarget as HTMLButtonElement).style.color =
            "var(--trolley-amber, #e8a020)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        (e.currentTarget as HTMLButtonElement).style.color =
          "var(--trolley-text-hi, #c8dff0)";
      }}
    >
      {wallet.icon ? (
        <Image
          src={wallet.icon}
          alt=""
          width={16}
          height={16}
          style={{ borderRadius: 3, flexShrink: 0 }}
          aria-hidden
        />
      ) : (
        // Fallback icon placeholder
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            background: "rgba(232,160,32,0.15)",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {isConnecting ? "CONNECTING…" : wallet.name}
      </span>
      <span style={{ fontSize: 9, opacity: 0.4 }}>→</span>
    </button>
  );
}

// ── DisconnectButton ──────────────────────────────────────────────────────────
// Same pattern — useDisconnect is per-wallet, so it lives in its own component.

function DisconnectButton({
  wallet,
  onDisconnect,
}: {
  wallet: UiWallet;
  onDisconnect: () => void;
}) {
  const [isDisconnecting, disconnect] = useDisconnect(wallet);

  return (
    <button
      onClick={async () => {
        try {
          await disconnect();
          onDisconnect();
        } catch (err) {
          console.error("Wallet disconnect error:", err);
        }
      }}
      disabled={isDisconnecting}
      style={{
        display: "block",
        width: "100%",
        padding: "8px 12px",
        background: "transparent",
        border: "none",
        cursor: isDisconnecting ? "wait" : "pointer",
        fontFamily: "inherit",
        fontSize: 10,
        letterSpacing: "0.1em",
        color: "var(--trolley-red, #ef4444)",
        textAlign: "left",
        opacity: isDisconnecting ? 0.5 : 1,
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(239,68,68,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {isDisconnecting ? "DISCONNECTING…" : "DISCONNECT"}
    </button>
  );
}

// ── WalletConnectButton ───────────────────────────────────────────────────────

export function WalletConnectButton() {
  const wallets = useWallets();
  const [selectedAccount, setSelectedAccount] = useContext(
    SelectedWalletAccountContext,
  );
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Only show wallets that support connect + disconnect on devnet
  const connectableWallets = wallets.filter(
    (w) =>
      w.features.includes(StandardConnect) &&
      w.features.includes(StandardDisconnect) &&
      w.chains.includes("solana:devnet"),
  );

  // Find the wallet that owns the currently selected account (needed for disconnect)
  const ownerWallet = selectedAccount
    ? wallets.find((w) => uiWalletAccountBelongsToUiWallet(selectedAccount, w))
    : undefined;

  const isConnected = !!selectedAccount;

  // ── Shared panel styles ───────────────────────────────────────────────────

  const panelStyle: React.CSSProperties = {
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    zIndex: 50,
    minWidth: 220,
    background: "var(--trolley-panel, #0b1520)",
    border: "1px solid var(--trolley-border, #162436)",
    borderRadius: 3,
    overflow: "hidden",
  };

  const sectionHeaderStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderBottom: "1px solid var(--trolley-border, #162436)",
    fontSize: 9,
    letterSpacing: "0.18em",
    color: "var(--trolley-amber, #e8a020)",
    fontWeight: 700,
  };

  return (
    <div
      ref={menuRef}
      style={{ position: "relative", fontFamily: "IBM Plex Mono, monospace" }}
    >
      {/* ── Trigger button ── */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 12px",
          background: "transparent",
          border: `1px solid ${isConnected ? "var(--trolley-green, #22c55e)" : "var(--trolley-amber, #e8a020)"}`,
          borderRadius: 3,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.08em",
          color: isConnected
            ? "var(--trolley-green, #22c55e)"
            : "var(--trolley-amber, #e8a020)",
          transition: "background 0.12s",
        }}
      >
        {isConnected ? (
          <>
            {/* Green pulse dot */}
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--trolley-green, #22c55e)",
                flexShrink: 0,
              }}
            />
            <span>{truncate(selectedAccount.address.toString())}</span>
          </>
        ) : (
          <span>CONNECT WALLET</span>
        )}
        <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 2 }}>
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {/* ── Dropdown panel ── */}
      {isOpen && (
        <div style={panelStyle}>
          {isConnected && ownerWallet ? (
            // ── Connected state ──
            <>
              <div
                style={{
                  ...sectionHeaderStyle,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span>CONNECTED</span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--trolley-text-hi, #c8dff0)",
                    letterSpacing: "0.04em",
                    fontWeight: 400,
                    wordBreak: "break-all",
                  }}
                >
                  {selectedAccount.address.toString()}
                </span>
              </div>
              <DisconnectButton
                wallet={ownerWallet}
                onDisconnect={() => {
                  setSelectedAccount(undefined);
                  setIsOpen(false);
                }}
              />
            </>
          ) : connectableWallets.length === 0 ? (
            // ── No wallets detected ──
            <div style={{ padding: "16px 12px", textAlign: "center" }}>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--trolley-text-dim, #304a60)",
                  letterSpacing: "0.08em",
                  lineHeight: 1.7,
                }}
              >
                NO WALLETS DETECTED
                <br />
                <span style={{ fontSize: 9 }}>
                  Install Phantom, Solflare, or Backpack
                </span>
              </p>
            </div>
          ) : (
            // ── Wallet list ──
            <>
              <div style={sectionHeaderStyle}>SELECT WALLET</div>
              {connectableWallets.map((wallet) => (
                <WalletOption
                  key={wallet.name}
                  wallet={wallet}
                  onSelect={(account) => {
                    setSelectedAccount(account);
                    setIsOpen(false);
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
