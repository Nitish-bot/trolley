"use client";

import { useState, useMemo, useCallback } from "react";
import type {
  App,
  Resource,
  Role,
  User,
  LogEntry,
  TabId,
  VerdictType,
} from "./types/trolley";
import { Header } from "./components/header";
import { TabBar } from "./components/tab-bar";
import { AdminTab } from "./components/admin-tab";
import { UserTab } from "./components/user-tab";
import { InstructionLog } from "./components/instruction-log";
import { TrolleyClient } from "../services/trolley-client";
import { useWalletConnection } from "@solana/react-hooks";
import type { Address } from "@solana/kit";

// ── Error display ─────────────────────────────────────────────────────────────
// Thin toast that auto-dismisses. Swap for your design system's toast if you have one.

interface Toast {
  id:      number;
  message: string;
  kind:    "error" | "info";
}

let toastId = 0;

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: Toast["kind"] = "error") => {
    const id = ++toastId;
    setToasts(p => [...p, { id, message, kind }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 5000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(p => p.filter(t => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
}

// ── Known error → human message ───────────────────────────────────────────────

function friendlyError(e: unknown): string {
  if (typeof e === "object" && e !== null && "context" in e) {
    // eslint-disable-next-line
    const ctx = (e as any).context;
    const code: number | undefined = ctx?.code;
    const msg: string | undefined  = ctx?.__serverMessage;

    // Anchor / program errors
    const ANCHOR: Record<number, string> = {
      6000: "Unauthorized — user does not hold this role.",
      6001: "Role is inactive and cannot be used.",
      6002: "Resource limit reached (max 64).",
      6003: "Role limit reached (max 64).",
      6004: "Resource name too long (max 32 bytes).",
      6005: "Role name too long (max 32 bytes).",
      6006: "App name too long (max 32 bytes).",
      6007: "Role belongs to a different application.",
      6008: "User account belongs to a different application.",
    };
    if (code !== undefined && ANCHOR[code]) return ANCHOR[code];

    // Solana runtime / RPC errors
    const RUNTIME: Record<number, string> = {
      [-32603]: "RPC internal error — check your connection.",
      [-32002]: "Transaction simulation failed.",
        0:      "Account not found.",
        1:      "Insufficient funds for fees or rent.",
        2:      "Invalid account data.",
    };
    if (code !== undefined && RUNTIME[code]) return RUNTIME[code];
    if (msg) return `RPC error: ${msg}`;
  }

  // Wallet rejection
  const str = String(e);
  if (str.includes("User rejected"))          return "Transaction rejected in wallet.";
  if (str.includes("already in use"))         return "This account already exists on-chain.";
  if (str.includes("Blockhash not found"))    return "Transaction expired — please retry.";
  if (str.includes("insufficient lamports"))  return "Insufficient SOL for rent or fees.";

  if (e instanceof Error) return e.message;
  return "An unexpected error occurred.";
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TrolleyDemo() {
  const [tab, setTab] = useState<TabId>("admin");
  const { wallet, status } = useWalletConnection();
  const { toasts, push: pushToast, dismiss } = useToasts();
  
  // Stable client — only recreated when the connected wallet changes.
  // Passes undefined safely; every method guards against a missing signer.
  const client = useMemo(
    () =>
      wallet
        ? new TrolleyClient({ signer: wallet, cluster: "devnet" })
        : null,
    [wallet],
  );

  // Loading state shared across all async ops so the UI can disable inputs.
  const [busy, setBusy] = useState<string | null>(null); // null = idle, string = which op

  // Mirrored on-chain state
  const [app,       setApp]       = useState<App | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [roles,     setRoles]     = useState<Role[]>([]);
  const [users,     setUsers]     = useState<User[]>([]);

  // Admin forms
  const [appName,   setAppName]   = useState<string>("my-app");
  const [resName,   setResName]   = useState<string>("");
  const [roleName,  setRoleName]  = useState<string>("");
  const [rolePerms, setRolePerms] = useState<bigint>(0n);
  const [userName,  setUserName]  = useState<string>("");
  const [userAddr,  setUserAddr]  = useState<string>("");

  // User portal
  const [selUser,  setSelUser]  = useState<string>("");
  const [selRole,  setSelRole]  = useState<string>("");
  const [verdict,  setVerdict]  = useState<VerdictType | null>(null);
  const [checking, setChecking] = useState<boolean>(false);

  // Instruction log
  const [log, setLog] = useState<LogEntry[]>([]);

  const addLog = (ix: string, details: LogEntry["details"]): void =>
    setLog(p =>
      [{ ix, details, ts: new Date().toISOString().slice(11, 19) }, ...p].slice(0, 40),
    );

  // ── Guards ──────────────────────────────────────────────────────────────────

  // Wraps every async op: sets busy label, catches and toasts errors, resets busy.
  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    if (!client) {
      pushToast("Connect your wallet first.");
      return null;
    }
    if (busy) return null; // debounce: ignore double-clicks during a pending op
    setBusy(label);
    try {
      return await fn();
    } catch (e) {
      pushToast(friendlyError(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  // ── Admin ops ───────────────────────────────────────────────────────────────

  const initApp = async (): Promise<void> => {
    if (!appName.trim()) return;
    const result = await run("initialize_application", () =>
      client!.initializeApplication(appName.trim()),
    );
    if (!result) return;

    // Fetch the full account so local state mirrors on-chain exactly
    const onChain = await client!.fetchApplication(appName.trim()).catch(() => null);
    setApp({
      name:      appName.trim(),
      authority: wallet!.address,
    });
    if (onChain) {
      setResources(onChain.resources);
    } else {
      setResources([]);
    }
    setRoles([]);
    setUsers([]);
    setVerdict(null);
    addLog("initialize_application", {
      appName:        appName.trim(),
      applicationPda: result.applicationPda,
      signature:      result.signature,
    });
  };

  const addResource = async (): Promise<void> => {
    if (!resName.trim() || resources.length >= 64) return;
    const result = await run("add_resource", () =>
      client!.addResource(resName.trim()),
    );
    if (!result) return;

    const idx = resources.length;
    setResources(p => [...p, { name: resName.trim(), index: idx }]);
    addLog("add_resource", {
      resourceName: resName.trim(),
      index:        idx,
      signature:    result.signature,
    });
    setResName("");
  };

  const togglePerm = (bit: number): void =>
    setRolePerms(p => p ^ (1n << BigInt(bit)));

  const createRole = async (): Promise<void> => {
    if (!roleName.trim() || roles.length >= 64) return;
    const result = await run("create_role", () =>
      client!.createRole(roleName.trim(), rolePerms),
    );
    if (!result) return;

    const roleIndex = roles.length;
    setRoles(p => [
      ...p,
      { name: roleName.trim(), roleIndex, permissions: rolePerms, isActive: true },
    ]);
    addLog("create_role", {
      roleName:    roleName.trim(),
      roleIndex,
      permissions: `0b${rolePerms.toString(2)}`,
      signature:   result.signature,
    });
    setRoleName("");
    setRolePerms(0n);
  };

  const deactivateRole = async (role: Role): Promise<void> => {
    const result = await run("deactivate_role", () =>
      client!.deactivateRole(role.name),
    );
    if (!result) return;

    setRoles(p => p.map(r => r.name === role.name ? { ...r, isActive: false } : r));
    addLog("deactivate_role", { roleName: role.name, signature: result.signature });
  };

  const addUser = async (): Promise<void> => {
    if (!userAddr.trim()) return;
    const label = userName.trim() || userAddr.slice(0, 8);

    const result = await run("create_user", () =>
      client!.createUser(userAddr.trim() as Address),
    );
    if (!result) return;

    setUsers(p => [
      ...p,
      { address: userAddr.trim(), label, roles: 0n },
    ]);
    addLog("create_user", {
      userPubkey:     userAddr.trim(),
      label,
      userAccountPda: result.userAccountPda,
      signature:      result.signature,
    });
    setUserAddr("");
    setUserName("");
  };

  const toggleUserRole = async (user: User, role: Role): Promise<void> => {
    const bit = 1n << BigInt(role.roleIndex);
    const has = (user.roles & bit) !== 0n;

    if (has) {
      const result = await run("revoke_role", () =>
        client!.revokeRole(role.name, user.address as Address),
      );
      if (!result) return;

      setUsers(p =>
        p.map(u =>
          u.address === user.address ? { ...u, roles: u.roles & ~bit } : u,
        ),
      );
      addLog("revoke_role", {
        user:      user.label,
        roleName:  role.name,
        signature: result.signature,
      });
    } else {
      const result = await run("grant_role", () =>
        client!.grantRole(role.name, user.address as Address),
      );
      if (!result) return;

      setUsers(p =>
        p.map(u =>
          u.address === user.address ? { ...u, roles: u.roles | bit } : u,
        ),
      );
      addLog("grant_role", {
        user:      user.label,
        roleName:  role.name,
        signature: result.signature,
      });
    }
  };

  // ── Auth check ──────────────────────────────────────────────────────────────

  const checkAuth = async (): Promise<void> => {
    if (!selUser || !selRole) return;
    if (!client) { pushToast("Connect your wallet first."); return; }
    setChecking(true);
    setVerdict(null);

    const authResult = await client.checkAuthorization(
      selRole,
      selUser as Address,
    );

    // checkAuthorization never throws — map AuthResult → VerdictType
    const verdictMap: Record<string, VerdictType> = {
      authorized: "authorized",
      denied:     "denied",
      inactive:   "inactive",
      error:      "error",
    };
    const v: VerdictType = verdictMap[authResult.status] ?? "error";
    setVerdict(v);
    setChecking(false);

    const user = users.find(u => u.address === selUser);
    addLog("check_authorization", {
      user:      user?.label ?? selUser,
      role:      selRole,
      result:    authResult.status.toUpperCase(),
      ...(authResult.status !== "authorized" && "code" in authResult
        ? { errorCode: authResult.code }
        : {}),
    });

    // Surface unexpected errors as a toast (codes other than 6000/6001)
    if (authResult.status === "error") {
      pushToast(
        "message" in authResult
          ? authResult.message
          : "Authorization check failed unexpectedly.",
      );
    }
  };

  // ── Derived UI flags ────────────────────────────────────────────────────────

  const walletConnected = status === "connected" && !!wallet;
  const isIdle          = busy === null && !checking;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="font-ibm-plex bg-trolley-bg min-h-screen text-trolley-text">

      {/* Toast layer */}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 50, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            style={{
              background: t.kind === "error" ? "#3b0a0a" : "#0a1f2e",
              border:     `1px solid ${t.kind === "error" ? "#ef444450" : "#38bdf850"}`,
              color:      t.kind === "error" ? "#ef4444"  : "#38bdf8",
              padding:    "10px 16px",
              borderRadius: 4,
              fontSize:   11,
              fontFamily: "inherit",
              maxWidth:   340,
              cursor:     "pointer",
              letterSpacing: "0.04em",
              lineHeight: 1.5,
            }}
          >
            {t.kind === "error" ? "✗ " : "i "}{t.message}
          </div>
        ))}
      </div>

      <Header />
      <TabBar tab={tab} onTabChange={setTab} />

      {/* No wallet banner */}
      {!walletConnected && (
        <div style={{
          padding: "10px 32px",
          background: "#0e1c2c",
          borderBottom: "1px solid #162436",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "#e8a020",
        }}>
          <span style={{ opacity: 0.6 }}>⚠</span>
          <span>
            {status === "connecting"
              ? "Connecting to wallet…"
              : "No wallet connected — connect to send transactions. You can still explore the UI."}
          </span>
        </div>
      )}

      {/* Busy banner */}
      {busy && (
        <div style={{
          padding: "8px 32px",
          background: "#0a1f10",
          borderBottom: "1px solid #22c55e30",
          fontSize: 10,
          letterSpacing: "0.1em",
          color: "#22c55e",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
          <span>sending {busy}…</span>
        </div>
      )}

      <div className="grid grid-cols-[1fr_260px] min-h-[calc(100vh-88px)]">
        <div className="p-7 px-8 overflow-y-auto">
          {tab === "admin" && (
            <AdminTab
              app={app}
              resources={resources}
              roles={roles}
              users={users}
              appName={appName}
              setAppName={setAppName}
              resName={resName}
              setResName={setResName}
              roleName={roleName}
              setRoleName={setRoleName}
              rolePerms={rolePerms}
              userName={userName}
              setUserName={setUserName}
              userAddr={userAddr}
              setUserAddr={setUserAddr}
              onInitApp={initApp}
              onAddResource={addResource}
              onCreateRole={createRole}
              onDeactivateRole={deactivateRole}
              onAddUser={addUser}
              onToggleUserRole={toggleUserRole}
              onTogglePerm={togglePerm}
              disabled={!isIdle}          // pass to AdminTab to grey out buttons
              walletConnected={walletConnected}
            />
          )}
          {tab === "user" && (
            <UserTab
              app={app}
              users={users}
              roles={roles}
              selUser={selUser}
              onSelUserChange={v => { setSelUser(v); setVerdict(null); }}
              selRole={selRole}
              onSelRoleChange={v => { setSelRole(v); setVerdict(null); }}
              verdict={verdict}
              checking={checking}
              onCheckAuth={checkAuth}
              walletConnected={walletConnected}
            />
          )}
        </div>

        <InstructionLog log={log} onClear={() => setLog([])} />
      </div>
    </div>
  );
}