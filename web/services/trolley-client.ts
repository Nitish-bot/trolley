import {
  assertAccountExists,
  getAddressEncoder,
  type Address,
  type KeyPairSigner,
  type TransactionSigner,
} from "@solana/kit";
import { connect, getPDAAndBump, type Connection } from "solana-kite";
import {
  TROLLEY_PROGRAM_ADDRESS,
  APPLICATION_ACCOUNT_DISCRIMINATOR,
  ROLE_ACCOUNT_DISCRIMINATOR,
  USER_ACCOUNT_DISCRIMINATOR,
  getApplicationAccountDecoder,
  getRoleAccountDecoder,
  getUserAccountDecoder,
  getInitializeApplicationInstruction,
  getAddResourceInstruction,
  getCreateRoleInstruction,
  getUpdateRolePermissionsInstruction,
  getDeactivateRoleInstruction,
  getCreateUserInstruction,
  getGrantRoleInstruction,
  getRevokeRoleInstruction,
  getCheckAuthorizationInstruction,
} from "@client/index";
import type { ResourceMeta } from "@client/index"

// ── Public types ─────────────────────────────────────────────────────────────

export type Cluster = "localnet" | "devnet" | "mainnet";

export interface AppAccount {
  address:       Address;
  authority:     Address;
  appName:       string;
  resourceCount: number;
  roleCount:     number;
  resources:     ResourceEntry[];
  bump:          number;
}

export interface ResourceEntry {
  index:    number;
  name:     string;
  isActive: boolean;
}

export interface RoleAccount {
  address:     Address;
  app:         Address;
  name:        string;
  roleIndex:   number;
  permissions: bigint;
  isActive:    boolean;
  bump:        number;
}

export interface UserAccount {
  address: Address;
  app:     Address;
  user:    Address;
  roles:   bigint;
  bump:    number;
}

// Returned by checkAuthorization — never throws for known RBAC outcomes
export type AuthResult =
  | { status: "authorized" }
  | { status: "denied";   code: 6000 }
  | { status: "inactive"; code: 6001 }
  | { status: "error";    code: number; message: string };

// Every mutating call resolves to a signature string on success
export type TxResult = { signature: string };

// ── Error helpers ────────────────────────────────────────────────────────────

function errorCode(e: unknown): number | null {
  if (typeof e === "object" && e !== null && "context" in e) {
    // eslint-disable-next-line
    const ctx = (e as any).context;
    if (typeof ctx?.code === "number") return ctx.code;
  }
  // Fallback: scan the serialised error for the numeric code field
  try {
    const s = JSON.stringify(e, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    const m = s.match(/"code"\s*:\s*(\d+)/);
    if (m) return Number(m[1]);
  } catch { /* ignore */ }
  return null;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

// ── PDA helpers ──────────────────────────────────────────────────────────────

const enc = () => getAddressEncoder();

async function appPda(authority: Address, appName: string): Promise<Address> {
  const { pda } = await getPDAAndBump(TROLLEY_PROGRAM_ADDRESS, [
    Buffer.from("app"),
    Buffer.from(enc().encode(authority)),
    Buffer.from(appName),
  ]);
  return pda;
}

async function rolePda(applicationPda: Address, roleName: string): Promise<Address> {
  const { pda } = await getPDAAndBump(TROLLEY_PROGRAM_ADDRESS, [
    Buffer.from("role"),
    Buffer.from(enc().encode(applicationPda)),
    Buffer.from(roleName),
  ]);
  return pda;
}

async function userPda(applicationPda: Address, userAddress: Address): Promise<Address> {
  const { pda } = await getPDAAndBump(TROLLEY_PROGRAM_ADDRESS, [
    Buffer.from("user"),
    Buffer.from(enc().encode(applicationPda)),
    Buffer.from(enc().encode(userAddress)),
  ]);
  return pda;
}

// ── Raw account bytes → typed shape ─────────────────────────────────────────

function decodeAppName(raw: Uint8Array): string {
  return Buffer.from(raw).toString("utf8").replace(/\0/g, "");
}

function decodeResources(
  raw: ResourceMeta[],
  count: number,
): ResourceEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    index:    i,
    name:     Buffer.from(raw[i]!.name).toString("utf8").replace(/\0/g, ""),
    isActive: raw[i]!.isActive === 1,
  }));
}

// ── TrolleyClient ────────────────────────────────────────────────────────────

export class TrolleyClient {
  private connection: Connection;
  private signer:     KeyPairSigner | TransactionSigner;
  private cluster:    Cluster;

  // Cached PDA for the active application so callers don't have to pass it
  // around. Populated after initializeApplication or fetchApplication.
  private _appPda: Address | null = null;

  constructor(opts: {
    signer:  KeyPairSigner | TransactionSigner;
    cluster: Cluster;
  }) {
    this.signer     = opts.signer;
    this.cluster    = opts.cluster;
    this.connection = connect(opts.cluster);
  }

  // ── Internal send helper ───────────────────────────────────────────────────

  private async send(
    ix: Parameters<typeof this.connection.sendTransactionFromInstructions>[0]["instructions"][0],
  ): Promise<TxResult> {
    const signature = await this.connection.sendTransactionFromInstructions({
      feePayer:    this.signer,
      instructions: [ix],
      commitment:  "confirmed",
    });
    return { signature };
  }

  // ── PDA accessors ──────────────────────────────────────────────────────────

  async getAppPda(appName: string): Promise<Address> {
    return appPda(this.signer.address, appName);
  }

  async getRolePda(roleNameOrAppPda: Address, appPda: Address | null, roleName?: string): Promise<Address> {
    // Overload: getRolePda(appPdaAddress, roleName) | getRolePda(roleName) if _appPda cached
    if (roleName !== undefined) {
      return rolePda(roleNameOrAppPda, roleName);
    }
    if (!appPda) throw new Error("No application loaded. Call initializeApplication or fetchApplication first.");
    return rolePda(appPda, roleNameOrAppPda as string);
  }

  async getUserPda(userAddress: Address, appPda: Address | null): Promise<Address> {
    if (!appPda) throw new Error("No application loaded.");
    return userPda(appPda, userAddress);
  }

  // ── 1. initialize_application ──────────────────────────────────────────────

  async initializeApplication(appName: string): Promise<TxResult & { applicationPda: Address }> {
    const application = await appPda(this.signer.address, appName);
    const result = await this.send(
      getInitializeApplicationInstruction({
        application,
        authority: this.signer,
        appName,
      }),
    );
    return { ...result, applicationPda: application };
  }

  // ── 2. add_resource ────────────────────────────────────────────────────────

  async addResource(resourceName: string, appPda: Address | null): Promise<TxResult> {
    if (!appPda) throw new Error("No application loaded.");
    return this.send(
      getAddResourceInstruction({
        application:  appPda,
        authority:    this.signer,
        resourceName,
      }),
    );
  }

  // ── 3. create_role ─────────────────────────────────────────────────────────

  async createRole(roleName: string, permissions: bigint, appPda: Address | null): Promise<TxResult & { rolePda: Address }> {
    if (!appPda) throw new Error("No application loaded.");
    const role = await rolePda(appPda, roleName);
    const result = await this.send(
      getCreateRoleInstruction({
        application: appPda,
        role,
        authority:   this.signer,
        roleName,
        permissions,
      }),
    );
    return { ...result, rolePda: role };
  }

  // ── 4. update_role_permissions ─────────────────────────────────────────────

  async updateRolePermissions(roleName: string, newPermissions: bigint, appPda: Address | null): Promise<TxResult> {
    if (!appPda) throw new Error("No application loaded.");
    const role = await rolePda(appPda, roleName);
    return this.send(
      getUpdateRolePermissionsInstruction({
        application:    appPda,
        role,
        authority:      this.signer,
        newPermissions,
      }),
    );
  }

  // ── 5. deactivate_role ─────────────────────────────────────────────────────

  async deactivateRole(roleName: string, appPda: Address | null): Promise<TxResult> {
    if (!appPda) throw new Error("No application loaded.");
    const role = await rolePda(appPda, roleName);
    return this.send(
      getDeactivateRoleInstruction({
        application: appPda,
        role,
        authority:   this.signer,
      }),
    );
  }

  // ── 6. create_user ─────────────────────────────────────────────────────────

  async createUser(userAddress: Address, appPda: Address | null): Promise<TxResult & { userAccountPda: Address }> {
    if (!appPda) throw new Error("No application loaded.");
    const userAccount = await userPda(appPda, userAddress);
    const result = await this.send(
      getCreateUserInstruction({
        application: appPda,
        userAccount,
        authority:   this.signer,
        userPubkey:  userAddress,
      }),
    );
    return { ...result, userAccountPda: userAccount };
  }

  // ── 7. grant_role ──────────────────────────────────────────────────────────

  async grantRole(roleName: string, userAddress: Address, appPda: Address | null): Promise<TxResult> {
    if (!appPda) throw new Error("No application loaded.");
    const [role, userAccount] = await Promise.all([
      rolePda(appPda, roleName),
      userPda(appPda, userAddress),
    ]);
    return this.send(
      getGrantRoleInstruction({
        application: appPda,
        role,
        userAccount,
        authority:   this.signer,
      }),
    );
  }

  // ── 8. revoke_role ─────────────────────────────────────────────────────────

  async revokeRole(roleName: string, userAddress: Address, appPda: Address | null): Promise<TxResult> {
    if (!appPda) throw new Error("No application loaded.");
    const [role, userAccount] = await Promise.all([
      rolePda(appPda, roleName),
      userPda(appPda, userAddress),
    ]);
    return this.send(
      getRevokeRoleInstruction({
        application: appPda,
        role,
        userAccount,
        authority:   this.signer,
      }),
    );
  }

  // ── 9. check_authorization ─────────────────────────────────────────────────
  //
  // Unlike every other method this one NEVER throws.
  // It maps the three possible outcomes to a typed AuthResult:
  //   silent Ok(())     → { status: "authorized" }
  //   error code 6000   → { status: "denied",   code: 6000 }
  //   error code 6001   → { status: "inactive", code: 6001 }
  //   anything else     → { status: "error",    code, message }

  async checkAuthorization(roleName: string, userAddress: Address, appPda: Address | null): Promise<AuthResult> {
    if (!appPda) return { status: "error", code: -1, message: "No application loaded." };
    try {
      const [role, userAccount] = await Promise.all([
        rolePda(appPda, roleName),
        userPda(appPda, userAddress),
      ]);
      await this.send(
        getCheckAuthorizationInstruction({
          application: appPda,
          role,
          userAccount,
        }),
      );
      return { status: "authorized" };
    } catch (e) {
      const code = errorCode(e);
      if (code === 6000) return { status: "denied",   code: 6000 };
      if (code === 6001) return { status: "inactive", code: 6001 };
      return { status: "error", code: code ?? -1, message: errorMessage(e) };
    }
  }

  // ── Read helpers ───────────────────────────────────────────────────────────
  // Useful for seeding local React state after a tx confirms.

  async fetchApplication(appName: string): Promise<AppAccount> {
    const address = await appPda(this.signer.address, appName);
    const getAll  = this.connection.getAccountsFactory(
      TROLLEY_PROGRAM_ADDRESS,
      APPLICATION_ACCOUNT_DISCRIMINATOR,
      getApplicationAccountDecoder(),
    );
    const all     = await getAll();
    const account = all.find(a => a.address === address);
    if (!account || !account.exists) throw new Error(`ApplicationAccount not found: ${address}`);
    const d       = account.data;
    return {
      address,
      authority:     d.authority,
      appName:       decodeAppName(new Uint8Array(d.appName)),
      resourceCount: d.resourceCount,
      roleCount:     d.roleCount,
      resources:     decodeResources(d.resources, d.resourceCount),
      bump:          d.bump,
    };
  }

  async fetchAllRoles(appPda: Address | null): Promise<RoleAccount[]> {
    if (!appPda) throw new Error("No application loaded.");
    const getAll = this.connection.getAccountsFactory(
      TROLLEY_PROGRAM_ADDRESS,
      ROLE_ACCOUNT_DISCRIMINATOR,
      getRoleAccountDecoder(),
    );
    const all = await getAll();
    return all
      .filter(a => a.exists && a.data.app === appPda)
      .map(a => {
        assertAccountExists(a);
        const d = a.data;
        return {
          address:     a.address,
          app:         d.app,
          name:        d.name,
          roleIndex:   d.roleIndex,
          permissions: d.permissions,
          isActive:    d.isActive,
          bump:        d.bump,
        };
      })
      .sort((a, b) => a.roleIndex - b.roleIndex);
  }

  async fetchUser(userAddress: Address, appPda: Address | null): Promise<UserAccount> {
    if (!appPda) throw new Error("No application loaded.");
    const address = await userPda(appPda, userAddress);
    const getAll  = this.connection.getAccountsFactory(
      TROLLEY_PROGRAM_ADDRESS,
      USER_ACCOUNT_DISCRIMINATOR,
      getUserAccountDecoder(),
    );
    const all     = await getAll();
    const account = all.find(a => a.address === address);
    if (!account || !account.exists) throw new Error(`UserAccount not found for: ${userAddress}`);
    const d = account.data;
    return { address, app: d.app, user: d.user, roles: d.roles, bump: d.bump };
  }

  async fetchAllUsers(appPda: Address | null): Promise<UserAccount[]> {
    if (!appPda) throw new Error("No application loaded.");
    const getAll = this.connection.getAccountsFactory(
      TROLLEY_PROGRAM_ADDRESS,
      USER_ACCOUNT_DISCRIMINATOR,
      getUserAccountDecoder(),
    );
    const all = await getAll();
    return all
      .filter(a => a.exists && a.data.app === appPda)
      .map(a => {
        assertAccountExists(a)
        const d = a.data;
        return { address: a.address, app: d.app, user: d.user, roles: d.roles, bump: d.bump };
      });
  }

  // Convenience: is this user's bit set locally — no RPC call, no tx fee.
  // Use for pre-flight UI state. Call checkAuthorization for the real gate.
  static hasRole(user: UserAccount, role: RoleAccount): boolean {
    return ((user.roles >> BigInt(role.roleIndex)) & 1n) === 1n;
  }
}