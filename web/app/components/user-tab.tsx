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
    sub: "unexpected program error",
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
}: UserTabProps) {
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

  const selectedUser = users.find((u) => u.address === selUser);
  const cfg = verdict ? VERDICT_CONFIGS[verdict] : null;

  return (
    <div className="animate-fade-up">
      <div className="mb-7">
        <Label>Application</Label>
        <div className="text-[15px] text-trolley-text-hi font-bold mt-1">
          {app.name}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 mb-5.5">
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

      <div className="mb-9">
        <Btn
          onClick={onCheckAuth}
          disabled={!selUser || !selRole || checking}
          variant="green"
        >
          {checking ? "⟳  QUERYING CHAIN…" : "⬢  CHECK AUTHORIZATION"}
        </Btn>
      </div>

      {cfg && (
        <div
          className={[
            "px-6 py-9 border border-dashed rounded-md text-center animate-fade-in",
            cfg.borderClass,
            cfg.bgClass,
          ].join(" ")}
        >
          <div
            className={`text-[38px] font-bold tracking-[0.18em] inline-block animate-stamp ${cfg.colorClass}`}
          >
            {cfg.label}
          </div>
          <div className="text-[10px] text-trolley-text-dim mt-3.5 tracking-[0.08em]">
            {cfg.sub}
          </div>
          <div className="mt-4 px-3.5 py-2.5 bg-trolley-panel rounded-sm inline-block">
            <code className="text-[10px] text-trolley-text font-ibm-plex">
              check_authorization(app=&quot;{app.name}&quot;, role=&quot;
              {selRole}&quot;, user=&quot;{selectedUser?.label ?? selUser}
              &quot;)
            </code>
          </div>
        </div>
      )}

      {!verdict && (selUser || selRole) && (
        <div className="text-[10px] text-trolley-text-dim tracking-[0.08em]">
          {selUser && selRole
            ? `ready to check: ${users.find((u) => u.address === selUser)?.label} → ${selRole}`
            : "select both a user and a role to proceed"}
        </div>
      )}
    </div>
  );
}
