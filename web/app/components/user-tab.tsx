import type { App, User, Role, VerdictType } from "../types/trolley";
import { Label } from "./ui/label";
import { Btn } from "./ui/button";
import { FieldSelect } from "./ui/field-select";

interface UserTabProps {
  app: App | null;
  users: User[];
  roles: Role[];
  selUser: string;
  onSelUserChange: (s: string) => void;
  selRole: string;
  onSelRoleChange: (s: string) => void;
  verdict: VerdictType | null;
  checking: boolean;
  onCheckAuth: () => void;
  // Passed from TrolleyDemo
  walletConnected: boolean;
}

type VerdictConfig = {
  colorClass: string;
  borderClass: string;
  bgClass: string;
  label: string;
  sub: string;
};

const VERDICT_CONFIGS: Record<VerdictType, VerdictConfig> = {
  authorized: {
    colorClass: "text-trolley-green",
    borderClass: "border-trolley-green/30",
    bgClass: "bg-trolley-green/10",
    label: "✓  AUTHORIZED",
    sub: "error code: none — tx succeeded silently",
  },
  denied: {
    colorClass: "text-trolley-red",
    borderClass: "border-trolley-red/30",
    bgClass: "bg-trolley-red/10",
    label: "✗  ACCESS DENIED",
    sub: "error code: 6000 — Unauthorized",
  },
  inactive: {
    colorClass: "text-trolley-text",
    borderClass: "border-trolley-text/30",
    bgClass: "bg-transparent",
    label: "⊘  ROLE INACTIVE",
    sub: "error code: 6001 — RoleInactive",
  },
  error: {
    colorClass: "text-trolley-text",
    borderClass: "border-trolley-text/30",
    bgClass: "bg-transparent",
    label: "?  UNKNOWN ERROR",
    sub: "unexpected program error — see instruction log",
  },
};

export function UserTab({
  app,
  users,
  roles,
  selUser,
  onSelUserChange,
  selRole,
  onSelRoleChange,
  verdict,
  checking,
  onCheckAuth,
  walletConnected,
}: UserTabProps) {
  // ── No app ───────────────────────────────────────────────────────────────
  if (!app) {
    return (
      <div className="py-16 text-center animate-fade-up">
        <div className="text-[11px] text-trolley-text-dim tracking-widest">
          NO APPLICATION INITIALIZED
          <br />
          <span className="text-[10px] mt-2 block">
            switch to ADMIN TERMINAL to create one
          </span>
        </div>
      </div>
    );
  }

  // ── No users or no roles registered yet ──────────────────────────────────
  if (users.length === 0 || roles.length === 0) {
    return (
      <div className="py-16 text-center animate-fade-up">
        <div className="text-[11px] text-trolley-text-dim tracking-widest">
          {users.length === 0 ? "NO USERS REGISTERED" : "NO ROLES CREATED"}
          <br />
          <span className="text-[10px] mt-2 block">
            {users.length === 0
              ? "add users in the ADMIN TERMINAL first"
              : "create roles in the ADMIN TERMINAL first"}
          </span>
        </div>
      </div>
    );
  }

  const selectedUser = users.find((u) => u.address === selUser);
  const cfg = verdict ? VERDICT_CONFIGS[verdict] : null;
  const checkDisabled = !selUser || !selRole || checking || !walletConnected;

  return (
    <div className="animate-fade-up">
      {/* App name */}
      <div className="mb-7">
        <Label>Application</Label>
        <div className="text-[15px] text-trolley-text-hi font-bold mt-1">
          {app.name}
        </div>
      </div>

      {/* No wallet warning */}
      {!walletConnected && (
        <div className="mb-5 px-3 py-2 border border-trolley-amber/30 rounded-sm bg-trolley-amber/5">
          <p className="text-[10px] text-trolley-amber tracking-[0.06em]">
            ⚠ Connect a wallet to run check_authorization on-chain.
          </p>
        </div>
      )}

      {/* Selectors */}
      <div className="grid grid-cols-2 gap-3.5 mb-5">
        <div>
          <div className="mb-1.5">
            <Label>User</Label>
          </div>
          <FieldSelect
            value={selUser}
            onChange={(e) => onSelUserChange(e.target.value)}
          >
            <option value="">— select user —</option>
            {users.map((u) => (
              <option key={u.address} value={u.address}>
                {u.label}
              </option>
            ))}
          </FieldSelect>
        </div>

        <div>
          <div className="mb-1.5">
            <Label>Role to check</Label>
          </div>
          <FieldSelect
            value={selRole}
            onChange={(e) => onSelRoleChange(e.target.value)}
          >
            <option value="">— select role —</option>
            {roles.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
                {!r.isActive ? " [inactive]" : ""}
              </option>
            ))}
          </FieldSelect>
        </div>
      </div>

      {/* Selected user's current roles — helpful context before checking */}
      {selectedUser && (
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-trolley-text-dim tracking-[0.06em]">
            {selectedUser.label} currently holds:
          </span>
          {roles.filter(
            (r) => ((selectedUser.roles >> BigInt(r.roleIndex)) & 1n) === 1n,
          ).length === 0 ? (
            <span className="text-[10px] text-trolley-text-dim italic">
              no roles
            </span>
          ) : (
            roles
              .filter(
                (r) =>
                  ((selectedUser.roles >> BigInt(r.roleIndex)) & 1n) === 1n,
              )
              .map((r) => (
                <span
                  key={r.name}
                  className={[
                    "text-[10px] px-2 py-0.5 rounded-sm border font-medium",
                    r.name === selRole
                      ? "border-trolley-green text-trolley-green bg-trolley-green/10"
                      : "border-trolley-border text-trolley-text-dim",
                  ].join(" ")}
                >
                  {r.name}
                </span>
              ))
          )}
        </div>
      )}

      {/* Check button */}
      <div className="mb-9">
        <Btn onClick={onCheckAuth} disabled={checkDisabled} variant="green">
          {checking
            ? "⟳  QUERYING CHAIN…"
            : !walletConnected
              ? "⬢  WALLET REQUIRED"
              : "⬢  CHECK AUTHORIZATION"}
        </Btn>
        {!walletConnected && (
          <span className="ml-3 text-[10px] text-trolley-text-dim tracking-[0.06em]">
            connect a wallet to send this transaction
          </span>
        )}
      </div>

      {/* Verdict display */}
      {cfg && (
        <div
          className={[
            "px-6 py-9 border border-dashed rounded-md text-center animate-fade-in",
            cfg.borderClass,
            cfg.bgClass,
          ].join(" ")}
        >
          <div
            className={[
              "text-[38px] font-bold tracking-[0.18em] inline-block animate-stamp",
              cfg.colorClass,
            ].join(" ")}
          >
            {cfg.label}
          </div>

          <div className="text-[10px] text-trolley-text-dim mt-3.5 tracking-[0.08em]">
            {cfg.sub}
          </div>

          {/* Instruction call display */}
          <div className="mt-4 px-3.5 py-2.5 bg-trolley-panel rounded-sm inline-block">
            <code className="text-[10px] text-trolley-text font-ibm-plex">
              check_authorization(app=&quot;{app.name}&quot;, role=&quot;
              {selRole}&quot;, user=&quot;{selectedUser?.label ?? selUser}
              &quot;)
            </code>
          </div>

          {/* Bit-level explanation for educational value */}
          {selectedUser &&
            selRole &&
            (() => {
              const role = roles.find((r) => r.name === selRole);
              if (!role) return null;
              const bit = BigInt(role.roleIndex);
              return (
                <div className="mt-4 text-[9px] text-trolley-text-dim tracking-[0.06em] font-ibm-plex">
                  (user.roles &gt;&gt; {role.roleIndex}) &amp; 1 ={" "}
                  <span className={cfg.colorClass}>
                    {((selectedUser.roles >> bit) & 1n).toString()}
                  </span>
                </div>
              );
            })()}
        </div>
      )}

      {/* Pre-check hint */}
      {!verdict && (selUser || selRole) && (
        <div className="text-[10px] text-trolley-text-dim tracking-[0.08em]">
          {selUser && selRole
            ? `ready to check: ${selectedUser?.label ?? selUser} → ${selRole}`
            : "select both a user and a role to proceed"}
        </div>
      )}
    </div>
  );
}
