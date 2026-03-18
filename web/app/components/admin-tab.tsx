import React from "react";
import type { Resource, Role, User } from "../types/trolley";
import { SectionHead } from "./ui/section-head";
import { Btn } from "./ui/button";
import { FieldInput } from "./ui/field-input";

interface AdminTabProps {
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
}

export function AdminTab({
  roles,
  users,
  userName,
  setUserName,
  userAddr,
  setUserAddr,
  onAddUser,
  onToggleUserRole,
}: AdminTabProps) {
  return (
    <div className="animate-fade-up">
      <div className="mb-8">
        <SectionHead idx={4} title="Access Control" />
        <div className="flex gap-2 mb-3.5 flex-wrap">
          <FieldInput
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="label (alice, bob…)"
            style={{ maxWidth: 160 }}
          />
          <FieldInput
            value={userAddr}
            onChange={(e) => setUserAddr(e.target.value)}
            placeholder="wallet address / pubkey"
            style={{ maxWidth: 300 }}
            onKeyDown={(e) => e.key === "Enter" && onAddUser()}
          />
          <Btn onClick={onAddUser} disabled={!userAddr.trim()}>
            + ADD USER
          </Btn>
        </div>
        {users.length > 0 ? (
          <>
            <div className="flex flex-col gap-4 mt-2.5">
              {users.map((user) => {
                const assignedRoles = roles.filter(
                  (r) => ((user.roles >> BigInt(r.roleIndex)) & 1n) === 1n,
                );
                const availableRoles = roles.filter(
                  (r) =>
                    ((user.roles >> BigInt(r.roleIndex)) & 1n) === 0n &&
                    r.isActive,
                );
                return (
                  <div
                    key={user.address}
                    className="flex items-center gap-3 border border-trolley-border rounded px-3 py-2 relative"
                  >
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
                    <div className="flex gap-2 flex-wrap">
                      {assignedRoles.map((role) => (
                        <span
                          key={role.name}
                          className="flex items-center bg-trolley-green/10 text-trolley-green text-xs px-2 py-1 rounded-sm font-bold"
                        >
                          {role.name}
                          <Btn
                            className="ml-1 text-trolley-red hover:text-trolley-red-dark text-[13px] font-bold bg-transparent border-none cursor-pointer"
                            onClick={() =>
                              role.isActive && onToggleUserRole(user, role)
                            }
                          >
                            ×
                          </Btn>
                        </span>
                      ))}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <div style={{ position: "relative" }}>
                        <Btn
                          className="bg-trolley-amber/10 border border-trolley-amber text-trolley-amber px-2 py-1 rounded-sm text-xs font-bold hover:bg-trolley-amber/20 transition-all"
                          onClick={() => {
                            const dropdown = document.getElementById(
                              `role-dropdown-${user.address}`,
                            );
                            if (dropdown)
                              dropdown.style.display =
                                dropdown.style.display === "block"
                                  ? "none"
                                  : "block";
                          }}
                        >
                          +
                        </Btn>
                        <div
                          id={`role-dropdown-${user.address}`}
                          style={{
                            display: "none",
                            position: "absolute",
                            zIndex: 10,
                            background: "#fff",
                            border: "1px solid #ccc",
                            borderRadius: 4,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                            minWidth: 120,
                            right: 0,
                          }}
                          className="mt-1"
                        >
                          {availableRoles.length > 0 ? (
                            availableRoles.map((role) => (
                              <div
                                key={role.name}
                                className="px-3 py-2 hover:bg-trolley-panel cursor-pointer text-xs"
                                onClick={() => {
                                  onToggleUserRole(user, role);
                                  const dropdown = document.getElementById(
                                    `role-dropdown-${user.address}`,
                                  );
                                  if (dropdown) dropdown.style.display = "none";
                                }}
                              >
                                {role.name}
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-trolley-text-dim text-xs">
                              No roles to add
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
                        const has = (user.roles >> BigInt(role.roleIndex)) & 1n;
                        return (
                          <td
                            key={role.name}
                            className="text-center py-1.5 px-2.5"
                          >
                            <Btn
                              onClick={() =>
                                role.isActive && onToggleUserRole(user, role)
                              }
                              className={[
                                "w-7 h-6 rounded-sm font-ibm-plex text-[11px] font-bold transition-all border",
                                has
                                  ? "bg-trolley-green/10 border-trolley-green text-trolley-green"
                                  : "bg-transparent border-trolley-border text-trolley-text-dim",
                                role.isActive
                                  ? "cursor-pointer"
                                  : "cursor-default opacity-35",
                              ].join(" ")}
                            >
                              {has ? "✓" : "○"}
                            </Btn>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[9px] text-trolley-text-dim mt-2.5 tracking-[0.08em]">
                click a cell to grant or revoke the role — mirrors grant_role /
                revoke_role on-chain
              </div>
            </div>
          </>
        ) : (
          <span className="text-[11px] text-trolley-text-dim">
            no users registered
          </span>
        )}
      </div>
    </div>
  );
}
