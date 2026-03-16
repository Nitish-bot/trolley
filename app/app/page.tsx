"use client"
import { useState } from "react";

// ── Real Solana imports (wire up for deployment) ─────────────────────────────
// import { connect } from "solana-kite";
// import { createKeyPairSignerFromBytes } from "@solana/kit";
// import { useWalletConnection } from "@solana/react-hooks";
// import {
//   getInitializeApplicationInstruction, getAddResourceInstruction,
//   getCreateRoleInstruction, getUpdateRolePermissionsInstruction,
//   getDeactivateRoleInstruction, getCreateUserInstruction,
//   getGrantRoleInstruction, getRevokeRoleInstruction,
//   getCheckAuthorizationInstruction,
// } from "@client/index";

const PROGRAM_ID = "DsFnBVZwCAaW3TNzkcMGo4gbEKdNVo58MbpvVWVPvqun";

const T = {
  bg:         "#060b12",
  panel:      "#0b1520",
  card:       "#0e1c2c",
  input:      "#070d16",
  amber:      "#e8a020",
  amberMid:   "#a06c12",
  amberGlow:  "#e8a02018",
  green:      "#22c55e",
  greenGlow:  "#22c55e14",
  red:        "#ef4444",
  redGlow:    "#ef444414",
  blue:       "#38bdf8",
  text:       "#7a9cb8",
  textHi:     "#c8dff0",
  textDim:    "#304a60",
  border:     "#162436",
  borderMid:  "#1e3a54",
  mono:       "'IBM Plex Mono', 'Courier New', monospace",
};

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${T.bg}; }
  select option { background: ${T.panel}; color: ${T.textHi}; }
  input::placeholder { color: ${T.textDim}; }
  ::-webkit-scrollbar { width: 3px; height: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.borderMid}; border-radius: 2px; }
  @keyframes fadeUp   { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
  @keyframes stamp    { 0%{opacity:0;transform:scale(1.5) rotate(-6deg)} 65%{transform:scale(.97) rotate(-4deg)} 100%{opacity:1;transform:scale(1) rotate(-4deg)} }
  @keyframes fadeIn   { from { opacity: 0; } to { opacity: 1; } }
  @keyframes scanline { 0% { top: -20%; } 100% { top: 110%; } }
`;

// ── Atoms ────────────────────────────────────────────────────────────────────

const Label = ({ children, color = T.amber }) => (
  <span style={{ fontSize: 9, letterSpacing: "0.18em", color, textTransform: "uppercase", fontWeight: 700 }}>
    {children}
  </span>
);

const Pill = ({ children, color = T.amber }) => (
  <span style={{ fontSize: 10, letterSpacing: "0.1em", color, border: `1px solid ${color}40`, padding: "2px 8px", borderRadius: 2 }}>
    {children}
  </span>
);

const FieldInput = ({ style, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
      style={{
        background: T.input, fontFamily: T.mono, fontSize: 12, color: T.textHi,
        border: `1px solid ${focused ? T.amber : T.border}`, borderRadius: 3,
        padding: "7px 11px", outline: "none", width: "100%",
        transition: "border-color 0.15s",
        ...style,
      }}
    />
  );
};

const FieldSelect = ({ children, value, onChange }) => (
  <select
    value={value} onChange={onChange}
    style={{
      background: T.input, fontFamily: T.mono, fontSize: 12, color: T.textHi,
      border: `1px solid ${T.border}`, borderRadius: 3, padding: "7px 11px",
      outline: "none", width: "100%", cursor: "pointer",
    }}
  >
    {children}
  </select>
);

const Btn = ({ children, onClick, disabled, variant = "default", small }) => {
  const [hov, setHov] = useState(false);
  const col = variant === "danger" ? T.red : variant === "green" ? T.green : T.amber;
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov && !disabled ? `${col}18` : "transparent",
        border: `1px solid ${col}`, color: col, borderRadius: 3, cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: T.mono, fontSize: small ? 10 : 11, fontWeight: 500,
        letterSpacing: "0.08em", padding: small ? "4px 9px" : "7px 16px",
        opacity: disabled ? 0.35 : 1, transition: "background 0.12s",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
};

const SectionHead = ({ idx, title }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
    <span style={{ fontSize: 9, color: T.amberMid, letterSpacing: "0.2em", minWidth: 16 }}>
      {String(idx).padStart(2, "0")}
    </span>
    <span style={{ fontSize: 10, color: T.textHi, letterSpacing: "0.14em", fontWeight: 700 }}>
      {title.toUpperCase()}
    </span>
    <div style={{ flex: 1, borderBottom: `1px dashed ${T.border}` }} />
  </div>
);

// ── Main ─────────────────────────────────────────────────────────────────────

export default function TrolleyDemo() {
  const [tab, setTab]           = useState("admin");
  const [wallet, setWallet]     = useState("");
  const [connecting, setConn]   = useState(false);

  // Mirrored on-chain state
  const [app,       setApp]       = useState(null);
  const [resources, setResources] = useState([]);
  const [roles,     setRoles]     = useState([]);
  const [users,     setUsers]     = useState([]);

  // Admin forms
  const [appName,   setAppName]   = useState("my-app");
  const [resName,   setResName]   = useState("");
  const [roleName,  setRoleName]  = useState("");
  const [rolePerms, setRolePerms] = useState(0n);
  const [userName,  setUserName]  = useState("");
  const [userAddr,  setUserAddr]  = useState("");

  // User portal
  const [selUser,  setSelUser]  = useState("");
  const [selRole,  setSelRole]  = useState("");
  const [verdict,  setVerdict]  = useState(null);
  const [checking, setChecking] = useState(false);

  // Instruction log
  const [log, setLog] = useState([]);

  const addLog = (ix, details) =>
    setLog(p => [{ ix, details, ts: new Date().toISOString().slice(11, 19) }, ...p].slice(0, 40));

  // ── Wallet ─────────────────────────────────────────────────────────────────
  // Replace with: const { connect, wallet } = useWalletConnection();
  const connectWallet = async () => {
    setConn(true);
    await new Promise(r => setTimeout(r, 600));
    const rand = () => Math.random().toString(36).slice(2, 6).toUpperCase();
    setWallet('7hC5...qKx8');
    setConn(false);
  };

  // ── Admin ops ──────────────────────────────────────────────────────────────
  // Each function mirrors the exact instruction it would call on-chain.

  const initApp = async () => {
    if (!appName.trim()) return;
    // Real: await connection.sendTransactionFromInstructions({
    //   feePayer: wallet, instructions: [getInitializeApplicationInstruction({ application: appPda, authority: wallet, appName })],
    // });
    setApp({ name: appName.trim(), authority: wallet || "demo-wallet" });
    setResources([]); setRoles([]); setUsers([]); setVerdict(null);
    addLog("initialize_application", { appName: appName.trim() });
  };

  const addResource = async () => {
    if (!resName.trim() || resources.length >= 64) return;
    // Real: await connection.sendTransactionFromInstructions({
    //   instructions: [getAddResourceInstruction({ application: appPda, authority: wallet, resourceName: resName })],
    // });
    const idx = resources.length;
    setResources(p => [...p, { name: resName.trim(), index: idx }]);
    addLog("add_resource", { resourceName: resName.trim(), index: idx });
    setResName("");
  };

  const togglePerm = (bit) => setRolePerms(p => p ^ (1n << BigInt(bit)));

  const createRole = async () => {
    if (!roleName.trim() || roles.length >= 64) return;
    const roleIndex = roles.length;
    // Real: await connection.sendTransactionFromInstructions({
    //   instructions: [getCreateRoleInstruction({ application: appPda, role: rolePda, authority: wallet, roleName, permissions: rolePerms })],
    // });
    setRoles(p => [...p, { name: roleName.trim(), roleIndex, permissions: rolePerms, isActive: true }]);
    addLog("create_role", { roleName: roleName.trim(), roleIndex, permissions: `0b${rolePerms.toString(2)}` });
    setRoleName(""); setRolePerms(0n);
  };

  const deactivateRole = async (role) => {
    // Real: await connection.sendTransactionFromInstructions({
    //   instructions: [getDeactivateRoleInstruction({ application: appPda, role: rolePda, authority: wallet })],
    // });
    setRoles(p => p.map(r => r.name === role.name ? { ...r, isActive: false } : r));
    addLog("deactivate_role", { roleName: role.name });
  };

  const addUser = async () => {
    if (!userAddr.trim()) return;
    // Real: await connection.sendTransactionFromInstructions({
    //   instructions: [getCreateUserInstruction({ application: appPda, userAccount: userPda, authority: wallet, userPubkey: userAddr })],
    // });
    setUsers(p => [...p, { address: userAddr.trim(), label: userName.trim() || userAddr.slice(0, 8), roles: 0n }]);
    addLog("create_user", { userPubkey: userAddr.trim(), label: userName.trim() || userAddr.slice(0, 8) });
    setUserAddr(""); setUserName("");
  };

  const toggleUserRole = async (user, role) => {
    const bit = 1n << BigInt(role.roleIndex);
    const has = (user.roles & bit) !== 0n;
    if (has) {
      // Real: getGrantRoleInstruction / getRevokeRoleInstruction
      setUsers(p => p.map(u => u.address === user.address ? { ...u, roles: u.roles & ~bit } : u));
      addLog("revoke_role", { user: user.label, roleName: role.name });
    } else {
      setUsers(p => p.map(u => u.address === user.address ? { ...u, roles: u.roles | bit } : u));
      addLog("grant_role", { user: user.label, roleName: role.name });
    }
  };

  // ── Auth check ─────────────────────────────────────────────────────────────

  const checkAuth = async () => {
    if (!selUser || !selRole) return;
    setChecking(true); setVerdict(null);
    await new Promise(r => setTimeout(r, 700));
    // Real: try {
    //   await connection.sendTransactionFromInstructions({
    //     instructions: [getCheckAuthorizationInstruction({ application: appPda, role: rolePda, userAccount: userPda })],
    //   });
    //   setVerdict("authorized");
    // } catch(e) { setVerdict(e.context?.code === 6000 ? "denied" : e.context?.code === 6001 ? "inactive" : "error"); }

    const user = users.find(u => u.address === selUser);
    const role = roles.find(r => r.name === selRole);
    let result = "error";
    if (user && role) {
      if (!role.isActive) result = "inactive";
      else if ((user.roles >> BigInt(role.roleIndex)) & 1n) result = "authorized";
      else result = "denied";
    }
    setVerdict(result); setChecking(false);
    addLog("check_authorization", { user: user?.label ?? selUser, role: selRole, result: result.toUpperCase() });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: T.mono, background: T.bg, minHeight: "100vh", color: T.text }}>
      <style>{GLOBAL_CSS}</style>

      {/* ── Header ── */}
      <div style={{ background: T.panel, borderBottom: `1px solid ${T.border}`, padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 14, color: T.amber, fontWeight: 700, letterSpacing: "0.12em" }}>TROLLEY</span>
          <span style={{ color: T.border, fontSize: 12 }}>//</span>
          <span style={{ fontSize: 10, color: T.textDim, letterSpacing: "0.1em" }}>ON-CHAIN RBAC</span>
          <span style={{ color: T.border, fontSize: 12 }}>//</span>
          <Pill>{PROGRAM_ID.slice(0, 8)}…{PROGRAM_ID.slice(-4)}</Pill>
        </div>
        <div>
          {wallet ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} />
              <span style={{ fontSize: 11, color: T.green }}>{wallet}</span>
            </div>
          ) : (
            <Btn onClick={connectWallet} disabled={connecting}>
              {connecting ? "CONNECTING…" : "CONNECT WALLET"}
            </Btn>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ background: T.panel, borderBottom: `1px solid ${T.border}`, display: "flex" }}>
        {[{ id: "admin", label: "⬡  ADMIN TERMINAL" }, { id: "user", label: "⬢  USER CLEARANCE" }].map(({ id, label }) => (
          <button
            key={id} onClick={() => setTab(id)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 24px", fontFamily: T.mono, fontSize: 10,
              fontWeight: 600, letterSpacing: "0.14em", color: tab === id ? T.amber : T.textDim,
              borderBottom: `2px solid ${tab === id ? T.amber : "transparent"}`,
              transition: "color 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", minHeight: "calc(100vh - 88px)" }}>

        {/* Main panel */}
        <div style={{ padding: "28px 32px", overflowY: "auto" }}>

          {/* ═══════════════ ADMIN TAB ═══════════════ */}
          {tab === "admin" && (
            <div style={{ animation: "fadeUp 0.25s ease" }}>

              {/* 01 — Application */}
              <div style={{ marginBottom: 30 }}>
                <SectionHead idx={1} title="Application" />
                {app ? (
                  <div style={{ padding: "12px 16px", border: `1px dashed ${T.borderMid}`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <Label>Active</Label>
                      <div style={{ fontSize: 15, color: T.textHi, fontWeight: 700, marginTop: 3 }}>{app.name}</div>
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>authority: {app.authority}</div>
                    </div>
                    <Pill color={T.green}>INITIALIZED</Pill>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <FieldInput value={appName} onChange={e => setAppName(e.target.value)} placeholder="app-name" style={{ maxWidth: 260 }} onKeyDown={e => e.key === "Enter" && initApp()} />
                    <Btn onClick={initApp}>INIT APP</Btn>
                  </div>
                )}
              </div>

              {app && (<>

                {/* 02 — Resources */}
                <div style={{ marginBottom: 30 }}>
                  <SectionHead idx={2} title="Resources" />
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <FieldInput value={resName} onChange={e => setResName(e.target.value)} placeholder="resource-name" style={{ maxWidth: 240 }} onKeyDown={e => e.key === "Enter" && addResource()} />
                    <Btn onClick={addResource} disabled={!resName.trim() || resources.length >= 64}>+ ADD</Btn>
                  </div>
                  {resources.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {resources.map(r => (
                        <div key={r.index} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", border: `1px solid ${T.border}`, borderRadius: 3 }}>
                          <span style={{ fontSize: 9, color: T.amberMid, fontWeight: 700 }}>[{r.index}]</span>
                          <span style={{ fontSize: 12, color: T.textHi }}>{r.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: T.textDim }}>no resources registered</span>
                  )}
                </div>

                {/* 03 — Roles */}
                <div style={{ marginBottom: 30 }}>
                  <SectionHead idx={3} title="Roles" />
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <FieldInput value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="role-name" style={{ maxWidth: 180 }} />
                    {resources.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {resources.map(r => {
                          const on = (rolePerms >> BigInt(r.index)) & 1n;
                          return (
                            <button
                              key={r.index} onClick={() => togglePerm(r.index)}
                              style={{
                                background: on ? T.amberGlow : "transparent",
                                border: `1px solid ${on ? T.amber : T.border}`,
                                color: on ? T.amber : T.textDim,
                                padding: "5px 10px", borderRadius: 3, cursor: "pointer",
                                fontFamily: T.mono, fontSize: 10, fontWeight: on ? 700 : 400,
                                transition: "all 0.12s",
                              }}
                            >
                              {on ? "✓ " : "○ "}{r.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <Btn onClick={createRole} disabled={!roleName.trim()}>+ CREATE ROLE</Btn>
                  </div>
                  {roles.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
                      {roles.map(role => (
                        <div
                          key={role.name}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: `1px solid ${T.border}`, borderRadius: 3, opacity: role.isActive ? 1 : 0.45, transition: "opacity 0.2s" }}
                        >
                          <span style={{ fontSize: 9, color: T.textDim, minWidth: 20 }}>[{role.roleIndex}]</span>
                          <span style={{ fontSize: 12, color: T.textHi, minWidth: 100, fontWeight: 500 }}>{role.name}</span>
                          <div style={{ display: "flex", gap: 4, flex: 1, flexWrap: "wrap" }}>
                            {resources.map(r => {
                              const has = (role.permissions >> BigInt(r.index)) & 1n;
                              return (
                                <span key={r.index} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 2, background: has ? `${T.green}18` : `${T.border}50`, color: has ? T.green : T.textDim }}>
                                  {has ? "✓" : "–"} {r.name}
                                </span>
                              );
                            })}
                          </div>
                          <Pill color={role.isActive ? T.green : T.textDim}>{role.isActive ? "ACTIVE" : "INACTIVE"}</Pill>
                          {role.isActive && <Btn onClick={() => deactivateRole(role)} variant="danger" small>DEACTIVATE</Btn>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: T.textDim }}>no roles created</span>
                  )}
                </div>

                {/* 04 — Access Control */}
                <div style={{ marginBottom: 30 }}>
                  <SectionHead idx={4} title="Access Control" />
                  <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                    <FieldInput value={userName} onChange={e => setUserName(e.target.value)} placeholder="label (alice, bob…)" style={{ maxWidth: 160 }} />
                    <FieldInput value={userAddr} onChange={e => setUserAddr(e.target.value)} placeholder="wallet address / pubkey" style={{ maxWidth: 300 }} onKeyDown={e => e.key === "Enter" && addUser()} />
                    <Btn onClick={addUser} disabled={!userAddr.trim()}>+ ADD USER</Btn>
                  </div>

                  {users.length > 0 && roles.length > 0 ? (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                            <th style={{ textAlign: "left", padding: "6px 12px 6px 0", fontSize: 9, color: T.textDim, fontWeight: 400, letterSpacing: "0.12em" }}>USER</th>
                            <th style={{ textAlign: "left", padding: "6px 12px 6px 0", fontSize: 9, color: T.textDim, fontWeight: 400, letterSpacing: "0.12em" }}>ADDRESS</th>
                            {roles.map(r => (
                              <th key={r.name} style={{ textAlign: "center", padding: "6px 10px", fontSize: 9, color: T.amber, fontWeight: 600, letterSpacing: "0.1em", opacity: r.isActive ? 1 : 0.45 }}>
                                {r.name.toUpperCase()}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {users.map(user => (
                            <tr key={user.address} style={{ borderBottom: `1px solid ${T.border}30` }}>
                              <td style={{ padding: "8px 12px 8px 0", color: T.textHi, fontWeight: 600, fontSize: 12 }}>{user.label}</td>
                              <td style={{ padding: "8px 12px 8px 0", color: T.textDim, fontSize: 10 }}>
                                {user.address.length > 16 ? `${user.address.slice(0, 8)}…${user.address.slice(-4)}` : user.address}
                              </td>
                              {roles.map(role => {
                                const has = (user.roles >> BigInt(role.roleIndex)) & 1n;
                                return (
                                  <td key={role.name} style={{ textAlign: "center", padding: "6px 10px" }}>
                                    <button
                                      onClick={() => role.isActive && toggleUserRole(user, role)}
                                      title={has ? `Click to revoke ${role.name}` : `Click to grant ${role.name}`}
                                      style={{
                                        background: has ? `${T.green}20` : "transparent",
                                        border: `1px solid ${has ? T.green : T.border}`,
                                        color: has ? T.green : T.textDim,
                                        width: 28, height: 24, borderRadius: 3,
                                        cursor: role.isActive ? "pointer" : "default",
                                        fontFamily: T.mono, fontSize: 11, fontWeight: 700,
                                        opacity: role.isActive ? 1 : 0.35,
                                        transition: "all 0.12s",
                                      }}
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
                      <div style={{ fontSize: 9, color: T.textDim, marginTop: 10, letterSpacing: "0.08em" }}>
                        click a cell to grant or revoke the role — mirrors grant_role / revoke_role on-chain
                      </div>
                    </div>
                  ) : users.length === 0 ? (
                    <span style={{ fontSize: 11, color: T.textDim }}>no users registered</span>
                  ) : (
                    <span style={{ fontSize: 11, color: T.textDim }}>create at least one role to manage access</span>
                  )}
                </div>

              </>)}
            </div>
          )}

          {/* ═══════════════ USER TAB ═══════════════ */}
          {tab === "user" && (
            <div style={{ animation: "fadeUp 0.25s ease" }}>
              {!app ? (
                <div style={{ padding: "64px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: T.textDim, letterSpacing: "0.1em" }}>
                    NO APPLICATION INITIALIZED<br />
                    <span style={{ fontSize: 10, marginTop: 8, display: "block" }}>switch to ADMIN TERMINAL to create one</span>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 28 }}>
                    <Label>Application</Label>
                    <div style={{ fontSize: 15, color: T.textHi, fontWeight: 700, marginTop: 4 }}>{app.name}</div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
                    <div>
                      <Label style={{ marginBottom: 6, display: "block" }}>User</Label>
                      <div style={{ marginTop: 6 }}>
                        <FieldSelect value={selUser} onChange={e => { setSelUser(e.target.value); setVerdict(null); }}>
                          <option value="">— select user —</option>
                          {users.map(u => <option key={u.address} value={u.address}>{u.label}</option>)}
                        </FieldSelect>
                      </div>
                    </div>
                    <div>
                      <Label>Role to check</Label>
                      <div style={{ marginTop: 6 }}>
                        <FieldSelect value={selRole} onChange={e => { setSelRole(e.target.value); setVerdict(null); }}>
                          <option value="">— select role —</option>
                          {roles.map(r => <option key={r.name} value={r.name}>{r.name}{!r.isActive ? " [inactive]" : ""}</option>)}
                        </FieldSelect>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 36 }}>
                    <Btn onClick={checkAuth} disabled={!selUser || !selRole || checking} variant="green">
                      {checking ? "⟳  QUERYING CHAIN…" : "⬢  CHECK AUTHORIZATION"}
                    </Btn>
                  </div>

                  {/* Verdict */}
                  {verdict && (() => {
                    const cfg = {
                      authorized: { color: T.green, glow: T.greenGlow, label: "✓  AUTHORIZED",    sub: `error code: none — tx succeeded silently` },
                      denied:     { color: T.red,   glow: T.redGlow,   label: "✗  ACCESS DENIED", sub: `error code: 6000 — Unauthorized` },
                      inactive:   { color: T.text,  glow: "transparent", label: "⊘  ROLE INACTIVE", sub: `error code: 6001 — RoleInactive` },
                      error:      { color: T.text,  glow: "transparent", label: "?  UNKNOWN ERROR",  sub: `unexpected program error` },
                    }[verdict];
                    const user = users.find(u => u.address === selUser);
                    return (
                      <div style={{ padding: "36px 24px", border: `1px dashed ${cfg.color}50`, borderRadius: 6, textAlign: "center", background: cfg.glow, animation: "fadeIn 0.2s ease" }}>
                        <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: "0.18em", color: cfg.color, display: "inline-block", animation: "stamp 0.45s cubic-bezier(0.34,1.56,0.64,1) both" }}>
                          {cfg.label}
                        </div>
                        <div style={{ fontSize: 10, color: T.textDim, marginTop: 14, letterSpacing: "0.08em" }}>{cfg.sub}</div>
                        <div style={{ marginTop: 16, padding: "10px 14px", background: T.panel, borderRadius: 3, display: "inline-block" }}>
                          <code style={{ fontSize: 10, color: T.text }}>
                            check_authorization(app="{app.name}", role="{selRole}", user="{user?.label ?? selUser}")
                          </code>
                        </div>
                      </div>
                    );
                  })()}

                  {!verdict && (selUser || selRole) && (
                    <div style={{ fontSize: 10, color: T.textDim, letterSpacing: "0.08em" }}>
                      {selUser && selRole
                        ? `ready to check: ${users.find(u => u.address === selUser)?.label} → ${selRole}`
                        : "select both a user and a role to proceed"}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Instruction log sidebar ── */}
        <div style={{ borderLeft: `1px solid ${T.border}`, background: T.panel, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Label>Instruction Log</Label>
            {log.length > 0 && (
              <button onClick={() => setLog([])} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontFamily: T.mono, fontSize: 10 }}>
                CLEAR
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {log.length === 0 ? (
              <div style={{ padding: "20px 16px", fontSize: 10, color: T.textDim, letterSpacing: "0.08em", textAlign: "center" }}>
                instructions appear here<br />as you interact
              </div>
            ) : (
              log.map((entry, i) => (
                <div key={i} style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}25`, animation: i === 0 ? "fadeUp 0.2s ease" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: T.amber, fontWeight: 600 }}>→ {entry.ix}</span>
                    <span style={{ fontSize: 9, color: T.textDim }}>{entry.ts}</span>
                  </div>
                  {Object.entries(entry.details).map(([k, v]) => (
                    <div key={k} style={{ fontSize: 9, paddingLeft: 10, lineHeight: 1.6 }}>
                      <span style={{ color: T.blue }}>{k}</span>
                      <span style={{ color: T.textDim }}>: </span>
                      <span style={{ color: T.textHi }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}