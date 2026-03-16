import {
  assertAccountExists,
  createKeyPairSignerFromBytes,
  generateKeyPairSigner,
  getAddressEncoder,
  type Address,
  type KeyPairSigner,
  type TransactionSigner,
} from "@solana/kit";
import { describe, it, expect, beforeAll } from "bun:test";
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
  getCreateUserInstruction,
  getGrantRoleInstruction,
  getRevokeRoleInstruction,
  getUpdateRolePermissionsInstruction,
  getDeactivateRoleInstruction,
  getCheckAuthorizationInstruction,
} from "@client/index";
import { connect, getPDAAndBump, type Connection } from "solana-kite";
import { initTxLog, logTx } from "./txLogger";

// ─── helpers ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const stringify = (value: unknown) =>
  JSON.stringify(
    value,
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );

async function getAppPda(
  authority: Address,
  appName: string,
): Promise<Address> {
  const enc = getAddressEncoder();
  const { pda } = await getPDAAndBump(TROLLEY_PROGRAM_ADDRESS, [
    Buffer.from("app"),
    Buffer.from(enc.encode(authority)),
    Buffer.from(appName),
  ]);
  return pda;
}

async function getRolePda(
  applicationPda: Address,
  roleName: string,
): Promise<Address> {
  const enc = getAddressEncoder();
  const { pda } = await getPDAAndBump(TROLLEY_PROGRAM_ADDRESS, [
    Buffer.from("role"),
    Buffer.from(enc.encode(applicationPda)),
    Buffer.from(roleName),
  ]);
  return pda;
}

async function getUserPda(
  applicationPda: Address,
  userAddress: Address,
): Promise<Address> {
  const enc = getAddressEncoder();
  const { pda } = await getPDAAndBump(TROLLEY_PROGRAM_ADDRESS, [
    Buffer.from("user"),
    Buffer.from(enc.encode(applicationPda)),
    Buffer.from(enc.encode(userAddress)),
  ]);
  return pda;
}

// ─── test suite ─────────────────────────────────────────────────────────────

describe("rbac (trolley)", async () => {
  let connection: Connection;
  let superAdmin: KeyPairSigner | TransactionSigner;
  let alice: KeyPairSigner | TransactionSigner;
  let bob: KeyPairSigner | TransactionSigner;

  let applicationPda: Address;
  let editorRolePda: Address;
  let viewerRolePda: Address;
  let aliceUserPda: Address;
  let bobUserPda: Address;

  let getApplicationAccount: (pda: Address) => Promise<{
    authority: Address;
    appName: Uint8Array;
    resourceCount: number;
    resources: Array<{ name: Uint8Array; isActive: number }>;
    roleCount: number;
    bump: number;
  }>;
  let getRoleAccount: (pda: Address) => Promise<{
    app: Address;
    name: string;
    roleIndex: number;
    permissions: bigint;
    isActive: boolean;
    bump: number;
  }>;
  let getUserAccount: (pda: Address) => Promise<{
    app: Address;
    user: Address;
    roles: bigint;
    bump: number;
  }>;

  // send() — submits a tx, logs the explorer URL, returns the signature
  let send: (
    description: string,
    ix: Parameters<typeof connection.sendTransactionFromInstructions>[0]["instructions"][0],
  ) => Promise<string>;

  const CLUSTER = process.env.CLUSTER || "localnet";
  const APP_NAME = new Date().toISOString();
  const EDITOR_ROLE = "editor";
  const VIEWER_ROLE = "viewer";
  const RESOURCE_POSTS = "posts";
  const RESOURCE_USERS = "users";
  const EDITOR_PERMISSIONS = 3n; // 00..11 — posts + users
  const VIEWER_PERMISSIONS = 1n; // 00..01 — posts only

  // ── error assertion helper ───────────────────────────────────────────────

  async function expectTxError(
    ix: Parameters<
      typeof connection.sendTransactionFromInstructions
    >[0]["instructions"][0],
    errorIdentifier: string,
  ) {
    let failed = false;
    try {
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });
    } catch (e: any) {
      failed = true;
      const logs: string[] = await connection
        .getLogs(e?.signature)
        .catch(() => []);
      const haystack = logs.join("\n") + stringify(e);
      expect(haystack).toContain(errorIdentifier);
    }
    expect(failed).toBe(true);
  }

  beforeAll(async () => {
    await sleep(2000);
    connection = connect(CLUSTER);

    initTxLog(CLUSTER);

    send = async (description, ix) => {
      const sig = await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });
      logTx(description, sig, CLUSTER);
      return sig;
    };

    superAdmin =
      process.env.KEYPAIR_BYTES &&
      (CLUSTER === "devnet" || CLUSTER === "helius-devnet")
        ? await createKeyPairSignerFromBytes(
            new Uint8Array(JSON.parse(process.env.KEYPAIR_BYTES)),
          )
        : await connection.createWallet();

    alice = await generateKeyPairSigner();
    bob = await generateKeyPairSigner();

    applicationPda = await getAppPda(superAdmin.address, APP_NAME);
    editorRolePda = await getRolePda(applicationPda, EDITOR_ROLE);
    viewerRolePda = await getRolePda(applicationPda, VIEWER_ROLE);
    aliceUserPda = await getUserPda(applicationPda, alice.address);
    bobUserPda = await getUserPda(applicationPda, bob.address);

    const allApps = connection.getAccountsFactory(
      TROLLEY_PROGRAM_ADDRESS,
      APPLICATION_ACCOUNT_DISCRIMINATOR,
      getApplicationAccountDecoder(),
    );
    getApplicationAccount = async (pda) => {
      const all = await allApps();
      const account = all.find((a) => a.address === pda);
      expect(account).toBeDefined();
      assertAccountExists(account!);
      return account!.data as any;
    };

    const allRoles = connection.getAccountsFactory(
      TROLLEY_PROGRAM_ADDRESS,
      ROLE_ACCOUNT_DISCRIMINATOR,
      getRoleAccountDecoder(),
    );
    getRoleAccount = async (pda) => {
      const all = await allRoles();
      const account = all.find((a) => a.address === pda);
      expect(account).toBeDefined();
      assertAccountExists(account!);
      return account!.data as any;
    };

    const allUsers = connection.getAccountsFactory(
      TROLLEY_PROGRAM_ADDRESS,
      USER_ACCOUNT_DISCRIMINATOR,
      getUserAccountDecoder(),
    );
    getUserAccount = async (pda) => {
      const all = await allUsers();
      const account = all.find((a) => a.address === pda);
      expect(account).toBeDefined();
      assertAccountExists(account!);
      return account!.data as any;
    };
  });

  // ── 1. initialize_application ────────────────────────────────────────────

  describe("initialize_application", () => {
    it("super admin can initialize an application", async () => {
      await send(
        "initialize_application",
        getInitializeApplicationInstruction({
          application: applicationPda,
          authority: superAdmin,
          appName: APP_NAME,
        }),
      );

      const data = await getApplicationAccount(applicationPda);
      expect(data.authority).toBe(superAdmin.address);
      expect(data.resourceCount).toBe(0);
      expect(data.roleCount).toBe(0);
    });

    it("cannot initialize the same application twice", async () => {
      await expectTxError(
        getInitializeApplicationInstruction({
          application: applicationPda,
          authority: superAdmin,
          appName: APP_NAME,
        }),
        "already in use",
      );
    });
  });

  // ── 2. add_resource ──────────────────────────────────────────────────────

  describe("add_resource", () => {
    it("adds resources sequentially and increments resource_count", async () => {
      for (const [i, name] of [
        [0, RESOURCE_POSTS],
        [1, RESOURCE_USERS],
      ] as const) {
        await send(
          `add_resource (${name})`,
          getAddResourceInstruction({
            application: applicationPda,
            authority: superAdmin,
            resourceName: name,
          }),
        );

        const data = await getApplicationAccount(applicationPda);
        expect(data.resourceCount).toBe(i + 1);
        const storedName = Buffer.from(data.resources[i]!.name)
          .toString("utf8")
          .replace(/\0/g, "");
        expect(storedName).toBe(name);
      }
    });

    it("non-admin cannot add a resource", async () => {
      await expectTxError(
        getAddResourceInstruction({
          application: applicationPda,
          authority: alice,
          resourceName: "secrets",
        }),
        "Error",
      );
      const data = await getApplicationAccount(applicationPda);
      expect(data.resourceCount).toBe(2);
    });
  });

  // ── 3. create_role ───────────────────────────────────────────────────────

  describe("create_role", () => {
    it("creates roles with sequential role_index values", async () => {
      for (const [i, name, perms, pda] of [
        [0, EDITOR_ROLE, EDITOR_PERMISSIONS, editorRolePda],
        [1, VIEWER_ROLE, VIEWER_PERMISSIONS, viewerRolePda],
      ] as const) {
        await send(
          `create_role (${name})`,
          getCreateRoleInstruction({
            application: applicationPda,
            role: pda,
            authority: superAdmin,
            roleName: name,
            permissions: perms,
          }),
        );

        const role = await getRoleAccount(pda);
        expect(role.roleIndex).toBe(i);
        expect(role.permissions).toBe(perms);
        expect(role.isActive).toBe(true);
        expect(role.app).toBe(applicationPda);
      }

      const app = await getApplicationAccount(applicationPda);
      expect(app.roleCount).toBe(2);
    });
  });

  // ── 4. update_role_permissions ───────────────────────────────────────────

  describe("update_role_permissions", () => {
    it("super admin can overwrite a role permissions bitmask", async () => {
      const restrictedPerms = 1n;

      await send(
        "update_role_permissions (editor → posts only)",
        getUpdateRolePermissionsInstruction({
          application: applicationPda,
          role: editorRolePda,
          authority: superAdmin,
          newPermissions: restrictedPerms,
        }),
      );
      expect((await getRoleAccount(editorRolePda)).permissions).toBe(restrictedPerms);

      await send(
        "update_role_permissions (editor → restore full)",
        getUpdateRolePermissionsInstruction({
          application: applicationPda,
          role: editorRolePda,
          authority: superAdmin,
          newPermissions: EDITOR_PERMISSIONS,
        }),
      );
      expect((await getRoleAccount(editorRolePda)).permissions).toBe(EDITOR_PERMISSIONS);
    });
  });

  // ── 5. create_user ───────────────────────────────────────────────────────

  describe("create_user", () => {
    it("creates UserAccounts with roles = 0 for each wallet", async () => {
      for (const [label, user, pda] of [
        ["alice", alice, aliceUserPda],
        ["bob",   bob,   bobUserPda],
      ] as const) {
        await send(
          `create_user (${label})`,
          getCreateUserInstruction({
            application: applicationPda,
            userAccount: pda,
            authority: superAdmin,
            userPubkey: user.address,
          }),
        );

        const data = await getUserAccount(pda);
        expect(data.roles).toBe(0n);
        expect(data.user).toBe(user.address);
        expect(data.app).toBe(applicationPda);
      }
    });
  });

  // ── 6. grant_role ────────────────────────────────────────────────────────

  describe("grant_role", () => {
    it("sets the correct bit for each role granted to alice", async () => {
      await send(
        "grant_role (alice ← editor)",
        getGrantRoleInstruction({
          application: applicationPda,
          role: editorRolePda,
          userAccount: aliceUserPda,
          authority: superAdmin,
        }),
      );
      expect((await getUserAccount(aliceUserPda)).roles).toBe(1n);

      await send(
        "grant_role (alice ← viewer)",
        getGrantRoleInstruction({
          application: applicationPda,
          role: viewerRolePda,
          userAccount: aliceUserPda,
          authority: superAdmin,
        }),
      );
      expect((await getUserAccount(aliceUserPda)).roles).toBe(3n);
    });

    it("granting an already-held role is idempotent (|= does not flip bits)", async () => {
      await send(
        "grant_role (alice ← editor, duplicate — idempotency check)",
        getGrantRoleInstruction({
          application: applicationPda,
          role: editorRolePda,
          userAccount: aliceUserPda,
          authority: superAdmin,
        }),
      );
      expect((await getUserAccount(aliceUserPda)).roles).toBe(3n);
    });
  });

  // ── 7. revoke_role ───────────────────────────────────────────────────────

  describe("revoke_role", () => {
    it("clears the correct bit when revoking a role", async () => {
      await send(
        "revoke_role (alice ✗ viewer)",
        getRevokeRoleInstruction({
          application: applicationPda,
          role: viewerRolePda,
          userAccount: aliceUserPda,
          authority: superAdmin,
        }),
      );
      expect((await getUserAccount(aliceUserPda)).roles).toBe(1n);
    });

    it("revoking a role the user does not hold is idempotent (&= ~ does not corrupt)", async () => {
      await send(
        "revoke_role (alice ✗ viewer, duplicate — idempotency check)",
        getRevokeRoleInstruction({
          application: applicationPda,
          role: viewerRolePda,
          userAccount: aliceUserPda,
          authority: superAdmin,
        }),
      );
      expect((await getUserAccount(aliceUserPda)).roles).toBe(1n);
    });
  });

  // ── 8. check_authorization ───────────────────────────────────────────────

  describe("check_authorization", () => {
    it("succeeds silently when the user holds the role", async () => {
      const sig = await send(
        "check_authorization (alice → editor, PASS)",
        getCheckAuthorizationInstruction({
          application: applicationPda,
          role: editorRolePda,
          userAccount: aliceUserPda,
        }),
      );
      expect(sig).toBeTruthy();
    });

    it("fails with 6000 Unauthorized when the user lacks the role", async () => {
      await expectTxError(
        getCheckAuthorizationInstruction({
          application: applicationPda,
          role: viewerRolePda,
          userAccount: aliceUserPda,
        }),
        "6000",
      );
    });

    it("fails with 6000 when the user has no roles at all", async () => {
      await expectTxError(
        getCheckAuthorizationInstruction({
          application: applicationPda,
          role: editorRolePda,
          userAccount: bobUserPda,
        }),
        "6000",
      );
    });

    it("fails with 6000 after a previously-held role is revoked", async () => {
      await send(
        "grant_role (bob ← editor, for revocation test)",
        getGrantRoleInstruction({
          application: applicationPda,
          role: editorRolePda,
          userAccount: bobUserPda,
          authority: superAdmin,
        }),
      );

      const before = await send(
        "check_authorization (bob → editor, PASS)",
        getCheckAuthorizationInstruction({
          application: applicationPda,
          role: editorRolePda,
          userAccount: bobUserPda,
        }),
      );
      expect(before).toBeTruthy();

      await send(
        "revoke_role (bob ✗ editor)",
        getRevokeRoleInstruction({
          application: applicationPda,
          role: editorRolePda,
          userAccount: bobUserPda,
          authority: superAdmin,
        }),
      );

      await expectTxError(
        getCheckAuthorizationInstruction({
          application: applicationPda,
          role: editorRolePda,
          userAccount: bobUserPda,
        }),
        "6000",
      );
    });
  });

  // ── 9. deactivate_role ───────────────────────────────────────────────────

  describe("deactivate_role", () => {
    it("super admin can deactivate a role", async () => {
      await send(
        "deactivate_role (viewer)",
        getDeactivateRoleInstruction({
          application: applicationPda,
          role: viewerRolePda,
          authority: superAdmin,
        }),
      );
      expect((await getRoleAccount(viewerRolePda)).isActive).toBe(false);
    });

    it("check_authorization against an inactive role fails with 6001 RoleInactive", async () => {
      await expectTxError(
        getCheckAuthorizationInstruction({
          application: applicationPda,
          role: viewerRolePda,
          userAccount: aliceUserPda,
        }),
        "6001",
      );
    });

    it("grant_role against an inactive role also fails with 6001", async () => {
      await expectTxError(
        getGrantRoleInstruction({
          application: applicationPda,
          role: viewerRolePda,
          userAccount: bobUserPda,
          authority: superAdmin,
        }),
        "6001",
      );
    });
  });

  // ── 10. bitmask sanity ───────────────────────────────────────────────────

  describe("bitmask sanity", () => {
    it("alice ends the suite with only editor (bit 0 set, bit 1 clear)", async () => {
      const data = await getUserAccount(aliceUserPda);
      expect((data.roles >> 0n) & 1n).toBe(1n); // editor present
      expect((data.roles >> 1n) & 1n).toBe(0n); // viewer absent
    });

    it("editor permissions cover bits 0 and 1 only", async () => {
      const data = await getRoleAccount(editorRolePda);
      expect(data.permissions & 1n).toBe(1n); // posts
      expect(data.permissions & 2n).toBe(2n); // users
      expect(data.permissions & 4n).toBe(0n); // no third resource
    });
  });
});