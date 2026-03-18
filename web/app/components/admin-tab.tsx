import React, { useState } from "react";
import type { App, Resource, Role, User } from "../types/trolley";
import { SectionHead } from "./ui/section-head";
import { Btn } from "./ui/button";
import { FieldInput } from "./ui/field-input";
import { Pill } from "./ui/pill";
import { Label } from "./ui/label";

interface AdminTabProps {
  app: App | null;
  resources: Resource[];
  roles: Role[];
  users: User[];
  appName: string;
  setAppName: (s: string) => void;
  resName: string;
  setResName: (s: string) => void;
  roleName: string;
  setRoleName: (s: string) => void;
  rolePerms: bigint;
  userName: string;
  setUserName: (s: string) => void;
  userAddr: string;
  setUserAddr: (s: string) => void;
  onInitApp: () => void;
  onAddResource: () => void;
  onCreateRole: () => void;
  onDeactivateRole: (role: Role) => void;
  onAddUser: () => void;
  onToggleUserRole: (user: User, role: Role) => void;
  onTogglePerm: (bit: number) => void;
  // Passed from TrolleyDemo
  disabled: boolean;
  walletConnected: boolean;
}

export function AdminTab({
  app,
  resources,
  roles,
  users,
  appName,
  setAppName,
  resName,
  setResName,
  roleName,
  setRoleName,
  rolePerms,
  userName,
  setUserName,
  userAddr,
  setUserAddr,
  onInitApp,
  onAddResource,
  onCreateRole,
  onDeactivateRole,
  onAddUser,
  onToggleUserRole,
  onTogglePerm,
  disabled,
  walletConnected,
}: AdminTabProps) {
  // React-controlled dropdown: tracks which user's role-add dropdown is open.
  // Using address as the key. null = all closed.
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Combined disable: any pending tx OR wallet not connected
  const isDisabled = disabled || !walletConnected;

  const toggleDropdown = (address: string) =>
    setOpenDropdown((prev) => (prev === address ? null : address));

  const closeDropdown = () => setOpenDropdown(null);

  return (
    <div className="animate-fade-up">
      {/* ── 01 Application ───────────────────────────────────────────── */}
      <div className="mb-8">
        <SectionHead idx={1} title="Application" />

        {app ? (
          <div className="flex items-center justify-between px-4 py-3 border border-dashed border-trolley-border-mid rounded">
            <div>
              <Label>Active</Label>
              <div className="text-[15px] text-trolley-text-hi font-bold mt-0.5">
                {app.name}
              </div>
              <div className="text-[10px] text-trolley-text-dim mt-0.5">
                authority: {app.authority}
              </div>
            </div>
            <Pill color="green">INITIALIZED</Pill>
          </div>
        ) : (
          <div className="flex gap-2">
            <FieldInput
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="app-name"
              style={{ maxWidth: 260 }}
              onKeyDown={(e) => e.key === "Enter" && !isDisabled && onInitApp()}
              disabled={isDisabled}
            />
            <Btn onClick={onInitApp} disabled={isDisabled || !appName.trim()}>
              INIT APP
            </Btn>
          </div>
        )}

        {!walletConnected && !app && (
          <p className="text-[10px] text-trolley-amber mt-2 tracking-[0.06em]">
            Connect a wallet to send transactions.
          </p>
        )}
      </div>

      {/* Sections 02–04 only render once an app exists */}
      {app && (
        <>
          {/* ── 02 Resources ─────────────────────────────────────────── */}
          <div className="mb-8">
            <SectionHead idx={2} title="Resources" />

            <div className="flex gap-2 mb-3">
              <FieldInput
                value={resName}
                onChange={(e) => setResName(e.target.value)}
                placeholder="resource-name"
                style={{ maxWidth: 240 }}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isDisabled && onAddResource()
                }
                disabled={isDisabled || resources.length >= 64}
              />
              <Btn
                onClick={onAddResource}
                disabled={
                  isDisabled || !resName.trim() || resources.length >= 64
                }
              >
                + ADD
              </Btn>
            </div>

            {resources.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {resources.map((r) => (
                  <div
                    key={r.index}
                    className="flex items-center gap-1.5 px-2.5 py-1 border border-trolley-border rounded-sm"
                  >
                    <span className="text-[9px] text-trolley-amber-mid font-bold">
                      [{r.index}]
                    </span>
                    <span className="text-xs text-trolley-text-hi">
                      {r.name}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-trolley-text-dim">
                no resources registered
              </span>
            )}

            {resources.length >= 64 && (
              <p className="text-[10px] text-trolley-red mt-2 tracking-[0.06em]">
                Resource limit reached (64 / 64).
              </p>
            )}
          </div>

          {/* ── 03 Roles ─────────────────────────────────────────────── */}
          <div className="mb-8">
            <SectionHead idx={3} title="Roles" />

            <div className="flex gap-2 mb-2 flex-wrap items-end">
              <FieldInput
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="role-name"
                style={{ maxWidth: 180 }}
                disabled={isDisabled || roles.length >= 64}
              />

              {/* Permission toggles — one per registered resource */}
              {resources.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {resources.map((r) => {
                    const on = (rolePerms >> BigInt(r.index)) & 1n;
                    return (
                      <button
                        key={r.index}
                        onClick={() => onTogglePerm(r.index)}
                        disabled={isDisabled}
                        className={[
                          "px-2.5 py-1 rounded-sm border text-[10px] transition-all font-ibm-plex",
                          on
                            ? "bg-trolley-amber/10 border-trolley-amber text-trolley-amber font-bold"
                            : "bg-transparent border-trolley-border text-trolley-text-dim",
                          isDisabled
                            ? "opacity-35 cursor-not-allowed"
                            : "cursor-pointer",
                        ].join(" ")}
                      >
                        {on ? "✓ " : "○ "}
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <Btn
                onClick={onCreateRole}
                disabled={isDisabled || !roleName.trim() || roles.length >= 64}
              >
                + CREATE ROLE
              </Btn>
            </div>

            {resources.length === 0 && (
              <p className="text-[10px] text-trolley-text-dim mb-2 tracking-[0.06em]">
                Add resources first to assign permissions to roles.
              </p>
            )}

            {roles.length > 0 ? (
              <div className="flex flex-col gap-1.5 mt-2.5">
                {roles.map((role) => (
                  <div
                    key={role.name}
                    className={[
                      "flex items-center gap-2.5 px-3 py-2 border border-trolley-border rounded-sm transition-opacity",
                      role.isActive ? "opacity-100" : "opacity-45",
                    ].join(" ")}
                  >
                    <span className="text-[9px] text-trolley-text-dim min-w-5">
                      [{role.roleIndex}]
                    </span>
                    <span className="text-xs text-trolley-text-hi font-medium min-w-25">
                      {role.name}
                    </span>

                    {/* Permission badges */}
                    <div className="flex gap-1 flex-1 flex-wrap">
                      {resources.map((r) => {
                        const has = (role.permissions >> BigInt(r.index)) & 1n;
                        return (
                          <span
                            key={r.index}
                            className={[
                              "text-[9px] px-1.5 py-0.5 rounded-sm",
                              has
                                ? "bg-trolley-green/10 text-trolley-green"
                                : "bg-trolley-border/30 text-trolley-text-dim",
                            ].join(" ")}
                          >
                            {has ? "✓" : "–"} {r.name}
                          </span>
                        );
                      })}
                    </div>

                    <Pill color={role.isActive ? "green" : "muted"}>
                      {role.isActive ? "ACTIVE" : "INACTIVE"}
                    </Pill>

                    {role.isActive && (
                      <Btn
                        onClick={() => onDeactivateRole(role)}
                        disabled={isDisabled}
                        variant="danger"
                        small
                      >
                        DEACTIVATE
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-trolley-text-dim">
                no roles created
              </span>
            )}

            {roles.length >= 64 && (
              <p className="text-[10px] text-trolley-red mt-2 tracking-[0.06em]">
                Role limit reached (64 / 64).
              </p>
            )}
          </div>

          {/* ── 04 Access Control ────────────────────────────────────── */}
          <div className="mb-8">
            <SectionHead idx={4} title="Access Control" />

            <div className="flex gap-2 mb-3.5 flex-wrap">
              <FieldInput
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="label (alice, bob…)"
                style={{ maxWidth: 160 }}
                disabled={isDisabled}
              />
              <FieldInput
                value={userAddr}
                onChange={(e) => setUserAddr(e.target.value)}
                placeholder="wallet address / pubkey"
                style={{ maxWidth: 300 }}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isDisabled && onAddUser()
                }
                disabled={isDisabled}
              />
              <Btn
                onClick={onAddUser}
                disabled={isDisabled || !userAddr.trim()}
              >
                + ADD USER
              </Btn>
            </div>

            {users.length > 0 && roles.length === 0 && (
              <p className="text-[10px] text-trolley-text-dim mb-3 tracking-[0.06em]">
                Create at least one role to manage user access.
              </p>
            )}

            {users.length > 0 ? (
              <>
                {/* ── Tag-style user cards ── */}
                <div className="flex flex-col gap-2.5 mt-2">
                  {users.map((user) => {
                    const assignedRoles = roles.filter(
                      (r) => ((user.roles >> BigInt(r.roleIndex)) & 1n) === 1n,
                    );
                    const availableRoles = roles.filter(
                      (r) =>
                        ((user.roles >> BigInt(r.roleIndex)) & 1n) === 0n &&
                        r.isActive,
                    );
                    const isOpen = openDropdown === user.address;

                    return (
                      <div
                        key={user.address}
                        className="flex items-center gap-3 border border-trolley-border rounded-sm px-3 py-2 relative"
                      >
                        {/* Identity */}
                        <div className="flex flex-col min-w-30">
                          <span className="text-trolley-text-hi font-semibold text-xs">
                            {user.label}
                          </span>
                          <span className="text-trolley-text-dim text-[10px]">
                            {user.address.length > 16
                              ? `${user.address.slice(0, 8)}…${user.address.slice(-4)}`
                              : user.address}
                          </span>
                        </div>

                        {/* Role tags */}
                        <div className="flex gap-1.5 flex-wrap flex-1">
                          {assignedRoles.length === 0 ? (
                            <span className="text-[10px] text-trolley-text-dim italic">
                              no roles
                            </span>
                          ) : (
                            assignedRoles.map((role) => (
                              <span
                                key={role.name}
                                className="flex items-center bg-trolley-green/10 text-trolley-green text-[11px] px-2 py-0.5 rounded-sm font-bold"
                              >
                                {role.name}
                                <button
                                  onClick={() =>
                                    !isDisabled &&
                                    role.isActive &&
                                    onToggleUserRole(user, role)
                                  }
                                  disabled={isDisabled}
                                  className={[
                                    "ml-1 text-trolley-red text-[13px] font-bold bg-transparent border-none leading-none",
                                    isDisabled
                                      ? "opacity-35 cursor-not-allowed"
                                      : "cursor-pointer hover:opacity-70",
                                  ].join(" ")}
                                  title={`Revoke ${role.name}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          )}
                        </div>

                        {/* Add role dropdown */}
                        {roles.length > 0 && (
                          <div className="ml-auto relative">
                            <Btn
                              onClick={() =>
                                !isDisabled && toggleDropdown(user.address)
                              }
                              disabled={
                                isDisabled || availableRoles.length === 0
                              }
                              small
                              title={
                                availableRoles.length === 0
                                  ? "All active roles assigned"
                                  : "Grant a role"
                              }
                            >
                              + ROLE
                            </Btn>

                            {isOpen && (
                              <>
                                {/* Backdrop to close on outside click */}
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={closeDropdown}
                                />
                                <div className="absolute right-0 mt-1 z-20 bg-trolley-card border border-trolley-border rounded-sm shadow-lg min-w-35">
                                  {availableRoles.length > 0 ? (
                                    availableRoles.map((role) => (
                                      <div
                                        key={role.name}
                                        onClick={() => {
                                          onToggleUserRole(user, role);
                                          closeDropdown();
                                        }}
                                        className="px-3 py-2 hover:bg-trolley-panel cursor-pointer text-[11px] text-trolley-text-hi tracking-[0.04em] transition-colors"
                                      >
                                        {role.name}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="px-3 py-2 text-trolley-text-dim text-[10px]">
                                      No roles to add
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Matrix table ── */}
                {roles.length > 0 && (
                  <div className="mt-8 overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b border-trolley-border">
                          <th className="text-left py-1.5 pr-3 text-[9px] text-trolley-text-dim font-normal tracking-[0.12em]">
                            USER
                          </th>
                          <th className="text-left py-1.5 pr-3 text-[9px] text-trolley-text-dim font-normal tracking-[0.12em]">
                            ADDRESS
                          </th>
                          {roles.map((r) => (
                            <th
                              key={r.name}
                              className={[
                                "text-center py-1.5 px-2.5 text-[9px] text-trolley-amber font-semibold tracking-widest",
                                r.isActive ? "opacity-100" : "opacity-45",
                              ].join(" ")}
                            >
                              {r.name.toUpperCase()}
                              {!r.isActive && (
                                <div className="text-[8px] text-trolley-text-dim font-normal normal-case tracking-normal">
                                  inactive
                                </div>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr
                            key={user.address}
                            className="border-b border-trolley-border/20"
                          >
                            <td className="py-2 pr-3 text-trolley-text-hi font-semibold text-xs">
                              {user.label}
                            </td>
                            <td className="py-2 pr-3 text-trolley-text-dim text-[10px]">
                              {user.address.length > 16
                                ? `${user.address.slice(0, 8)}…${user.address.slice(-4)}`
                                : user.address}
                            </td>
                            {roles.map((role) => {
                              const has =
                                (user.roles >> BigInt(role.roleIndex)) & 1n;
                              return (
                                <td
                                  key={role.name}
                                  className="text-center py-1.5 px-2.5"
                                >
                                  <button
                                    onClick={() =>
                                      !isDisabled &&
                                      role.isActive &&
                                      onToggleUserRole(user, role)
                                    }
                                    disabled={isDisabled || !role.isActive}
                                    title={
                                      !role.isActive
                                        ? "Role is inactive"
                                        : has
                                          ? `Revoke ${role.name}`
                                          : `Grant ${role.name}`
                                    }
                                    className={[
                                      "w-7 h-6 rounded-sm font-ibm-plex text-[11px] font-bold transition-all border",
                                      has
                                        ? "bg-trolley-green/10 border-trolley-green text-trolley-green"
                                        : "bg-transparent border-trolley-border text-trolley-text-dim",
                                      isDisabled || !role.isActive
                                        ? "opacity-35 cursor-not-allowed"
                                        : "cursor-pointer hover:opacity-70",
                                    ].join(" ")}
                                  >
                                    {has ? "✓" : "○"}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="text-[9px] text-trolley-text-dim mt-2.5 tracking-[0.08em]">
                      click a cell to grant or revoke — mirrors grant_role /
                      revoke_role on-chain
                    </div>
                  </div>
                )}
              </>
            ) : (
              <span className="text-[11px] text-trolley-text-dim">
                no users registered
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
