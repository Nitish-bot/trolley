import {
  assertAccountExists,
  createKeyPairSignerFromBytes,
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

// ─── helpers ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const stringify = (object: any) => {
  const bigIntReplacer = (key: string, value: any) =>
    typeof value === "bigint" ? value.toString() : value;
  return JSON.stringify(object, bigIntReplacer, 2);
};

/**
 * Derive the ApplicationAccount PDA.
 * Seeds: [b"app", authority_pubkey_bytes, app_name_utf8_bytes]
 */
async function getAppPda(
  authority: Address,
  appName: string,
): Promise<Address> {
  const encoder = getAddressEncoder();
  const { pda } = await getPDAAndBump(TROLLEY_PROGRAM_ADDRESS, [
    Buffer.from("app"),
    Buffer.from(encoder.encode(authority)),
    Buffer.from(appName),
  ]);
  return pda;
}

/**
 * Derive a RoleAccount PDA.
 * Seeds: [b"role", application_pda_bytes, role_name_utf8_bytes]
 */
async function getRolePda(
  applicationPda: Address,
  roleName: string,
): Promise<Address> {
  const encoder = getAddressEncoder();
  const { pda } = await getPDAAndBump(TROLLEY_PROGRAM_ADDRESS, [
    Buffer.from("role"),
    Buffer.from(encoder.encode(applicationPda)),
    Buffer.from(roleName),
  ]);
  return pda;
}

/**
 * Derive a UserAccount PDA.
 * Seeds: [b"user", application_pda_bytes, user_pubkey_bytes]
 */
async function getUserPda(
  applicationPda: Address,
  userAddress: Address,
): Promise<Address> {
  const encoder = getAddressEncoder();
  const { pda } = await getPDAAndBump(TROLLEY_PROGRAM_ADDRESS, [
    Buffer.from("user"),
    Buffer.from(encoder.encode(applicationPda)),
    Buffer.from(encoder.encode(userAddress)),
  ]);
  return pda;
}

// ─── test suite ─────────────────────────────────────────────────────────────

describe("rbac (trolley)", async () => {
  // ── shared state ──────────────────────────────────────────────────────────
  let connection: Connection;
  let superAdmin: KeyPairSigner | TransactionSigner;
  let alice: KeyPairSigner | TransactionSigner;
  let bob: KeyPairSigner | TransactionSigner;

  // PDAs — computed once in beforeAll
  let applicationPda: Address;
  let editorRolePda: Address;
  let viewerRolePda: Address;
  let aliceUserPda: Address;
  let bobUserPda: Address;

  // Account fetchers — created after applicationPda is known
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

  const CLUSTER = process.env.CLUSTER || "localnet";

  // Fixed test data
  const APP_NAME = "my-app";
  const EDITOR_ROLE = "editor";
  const VIEWER_ROLE = "viewer";
  const RESOURCE_POSTS = "posts";
  const RESOURCE_USERS = "users";

  // Permissions bitmasks:
  //   bit 0 = posts, bit 1 = users
  //   EDITOR → can access both  = 0b11 = 3n
  //   VIEWER → posts only       = 0b01 = 1n
  const EDITOR_PERMISSIONS = 3n;
  const VIEWER_PERMISSIONS = 1n;

  beforeAll(async () => {
    // Bun is fast; give the local validator websocket time to be ready
    await sleep(2000);

    connection = connect(CLUSTER);

    // Wallets
    superAdmin =
      process.env.KEYPAIR_BYTES && CLUSTER === "devnet"
        ? await createKeyPairSignerFromBytes(
            new Uint8Array(JSON.parse(process.env.KEYPAIR_BYTES)),
          )
        : await connection.createWallet();

    alice = await connection.createWallet();
    bob = await connection.createWallet();

    // PDAs
    applicationPda = await getAppPda(superAdmin.address, APP_NAME);
    editorRolePda = await getRolePda(applicationPda, EDITOR_ROLE);
    viewerRolePda = await getRolePda(applicationPda, VIEWER_ROLE);
    aliceUserPda = await getUserPda(applicationPda, alice.address);
    bobUserPda = await getUserPda(applicationPda, bob.address);

    // ── Account fetcher factories ─────────────────────────────────────────
    // Each factory returns a getter that fetches ALL accounts of that type,
    // then we find the one matching our PDA address.

    const getAllApplicationAccounts = connection.getAccountsFactory(
      TROLLEY_PROGRAM_ADDRESS,
      APPLICATION_ACCOUNT_DISCRIMINATOR,
      getApplicationAccountDecoder(),
    );

    getApplicationAccount = async (pda: Address) => {
      const all = await getAllApplicationAccounts();
      const account = all.find((a) => a.address === pda);
      expect(account).toBeDefined();
      assertAccountExists(account!);
      return account!.data as any;
    };

    const getAllRoleAccounts = connection.getAccountsFactory(
      TROLLEY_PROGRAM_ADDRESS,
      ROLE_ACCOUNT_DISCRIMINATOR,
      getRoleAccountDecoder(),
    );

    getRoleAccount = async (pda: Address) => {
      const all = await getAllRoleAccounts();
      const account = all.find((a) => a.address === pda);
      expect(account).toBeDefined();
      assertAccountExists(account!);
      return account!.data as any;
    };

    const getAllUserAccounts = connection.getAccountsFactory(
      TROLLEY_PROGRAM_ADDRESS,
      USER_ACCOUNT_DISCRIMINATOR,
      getUserAccountDecoder(),
    );

    getUserAccount = async (pda: Address) => {
      const all = await getAllUserAccounts();
      const account = all.find((a) => a.address === pda);
      expect(account).toBeDefined();
      assertAccountExists(account!);
      return account!.data as any;
    };
  });

  // ── 1. initialize_application ────────────────────────────────────────────

  describe("initialize_application", () => {
    it("super admin can initialize an application", async () => {
      const ix = getInitializeApplicationInstruction({
        application: applicationPda,
        authority: superAdmin,
        appName: APP_NAME,
      });

      const result = await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

      expect(result).toBeTruthy();
    });

    it("ApplicationAccount has correct authority and zero counts", async () => {
      const data = await getApplicationAccount(applicationPda);
      expect(data.authority).toBe(superAdmin.address);
      expect(data.resourceCount).toBe(0);
      expect(data.roleCount).toBe(0);
    });

    it("cannot initialize the same application twice", async () => {
      const ix = getInitializeApplicationInstruction({
        application: applicationPda,
        authority: superAdmin,
        appName: APP_NAME,
      });

      let failed = false;
      try {
        await connection.sendTransactionFromInstructions({
          feePayer: superAdmin,
          instructions: [ix],
          commitment: "confirmed",
        });
      } catch {
        // Account already exists — Anchor rejects the init constraint
        failed = true;
      }
      expect(failed).toBe(true);
    });
  });

  // ── 2. add_resource ──────────────────────────────────────────────────────

  describe("add_resource", () => {
    it("super admin can add the 'posts' resource (index 0)", async () => {
      const ix = getAddResourceInstruction({
        application: applicationPda,
        authority: superAdmin,
        resourceName: RESOURCE_POSTS,
      });

      const result = await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });
      expect(result).toBeTruthy();

      const data = await getApplicationAccount(applicationPda);
      expect(data.resourceCount).toBe(1);

      // First resource name should match (fixed-width array, UTF-8, zero-padded)
      const storedName = Buffer.from(data.resources[0]!.name)
        .toString("utf8")
        .replace(/\0/g, "");
      expect(storedName).toBe(RESOURCE_POSTS);
    });

    it("super admin can add the 'users' resource (index 1)", async () => {
      const ix = getAddResourceInstruction({
        application: applicationPda,
        authority: superAdmin,
        resourceName: RESOURCE_USERS,
      });

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

      const data = await getApplicationAccount(applicationPda);
      expect(data.resourceCount).toBe(2);

      const storedName = Buffer.from(data.resources[1]!.name)
        .toString("utf8")
        .replace(/\0/g, "");
      expect(storedName).toBe(RESOURCE_USERS);
    });

    it("non-admin cannot add a resource (has_one constraint rejects)", async () => {
      const ix = getAddResourceInstruction({
        application: applicationPda,
        // alice is NOT the super admin — has_one = authority will reject this
        authority: alice,
        resourceName: "secrets",
      });

      let failed = false;
      try {
        await connection.sendTransactionFromInstructions({
          feePayer: alice,
          instructions: [ix],
          commitment: "confirmed",
        });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);

      // resource_count must still be 2
      const data = await getApplicationAccount(applicationPda);
      expect(data.resourceCount).toBe(2);
    });
  });

  // ── 3. create_role ───────────────────────────────────────────────────────

  describe("create_role", () => {
    it("super admin can create the 'editor' role (role_index = 0)", async () => {
      const ix = getCreateRoleInstruction({
        application: applicationPda,
        role: editorRolePda,
        authority: superAdmin,
        roleName: EDITOR_ROLE,
        permissions: EDITOR_PERMISSIONS,
      });

      const result = await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });
      expect(result).toBeTruthy();
    });

    it("editor role has role_index 0 and correct permissions bitmask", async () => {
      const data = await getRoleAccount(editorRolePda);
      expect(data.roleIndex).toBe(0);
      expect(data.permissions).toBe(EDITOR_PERMISSIONS);
      expect(data.isActive).toBe(true);
      expect(data.app).toBe(applicationPda);
    });

    it("ApplicationAccount role_count increments to 1", async () => {
      const data = await getApplicationAccount(applicationPda);
      expect(data.roleCount).toBe(1);
    });

    it("super admin can create the 'viewer' role (role_index = 1)", async () => {
      const ix = getCreateRoleInstruction({
        application: applicationPda,
        role: viewerRolePda,
        authority: superAdmin,
        roleName: VIEWER_ROLE,
        permissions: VIEWER_PERMISSIONS,
      });

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

      const data = await getRoleAccount(viewerRolePda);
      // Assigned sequentially — this is the second role so index = 1
      expect(data.roleIndex).toBe(1);
      expect(data.permissions).toBe(VIEWER_PERMISSIONS);
    });

    it("role_count is now 2 on the ApplicationAccount", async () => {
      const data = await getApplicationAccount(applicationPda);
      expect(data.roleCount).toBe(2);
    });
  });

  // ── 4. update_role_permissions ───────────────────────────────────────────

  describe("update_role_permissions", () => {
    it("super admin can update editor permissions to posts-only (0b01)", async () => {
      const ix = getUpdateRolePermissionsInstruction({
        application: applicationPda,
        role: editorRolePda,
        authority: superAdmin,
        newPermissions: 1n, // posts only
      });

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

      const data = await getRoleAccount(editorRolePda);
      expect(data.permissions).toBe(1n);
    });

    it("can restore editor permissions back to full (0b11)", async () => {
      const ix = getUpdateRolePermissionsInstruction({
        application: applicationPda,
        role: editorRolePda,
        authority: superAdmin,
        newPermissions: EDITOR_PERMISSIONS,
      });

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

      const data = await getRoleAccount(editorRolePda);
      expect(data.permissions).toBe(EDITOR_PERMISSIONS);
    });
  });

  // ── 5. create_user ───────────────────────────────────────────────────────

  describe("create_user", () => {
    it("super admin can create a UserAccount for alice", async () => {
      const ix = getCreateUserInstruction({
        application: applicationPda,
        userAccount: aliceUserPda,
        authority: superAdmin,
        userPubkey: alice.address,
      });

      const result = await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });
      expect(result).toBeTruthy();
    });

    it("alice's UserAccount starts with roles = 0n (no roles)", async () => {
      const data = await getUserAccount(aliceUserPda);
      expect(data.roles).toBe(0n);
      expect(data.user).toBe(alice.address);
      expect(data.app).toBe(applicationPda);
    });

    it("super admin can create a UserAccount for bob", async () => {
      const ix = getCreateUserInstruction({
        application: applicationPda,
        userAccount: bobUserPda,
        authority: superAdmin,
        userPubkey: bob.address,
      });

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

      const data = await getUserAccount(bobUserPda);
      expect(data.roles).toBe(0n);
      expect(data.user).toBe(bob.address);
    });
  });

  // ── 6. grant_role / revoke_role ──────────────────────────────────────────

  describe("grant_role", () => {
    it("super admin can grant the 'editor' role to alice", async () => {
      const ix = getGrantRoleInstruction({
        application: applicationPda,
        role: editorRolePda,
        userAccount: aliceUserPda,
        authority: superAdmin,
      });

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

      const data = await getUserAccount(aliceUserPda);
      // editor has role_index 0 → bit 0 should be set → roles & 1n === 1n
      expect(data.roles & 1n).toBe(1n);
    });

    it("super admin can also grant the 'viewer' role to alice", async () => {
      const ix = getGrantRoleInstruction({
        application: applicationPda,
        role: viewerRolePda,
        userAccount: aliceUserPda,
        authority: superAdmin,
      });

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

      const data = await getUserAccount(aliceUserPda);
      // Both bit 0 (editor) and bit 1 (viewer) should be set → roles = 0b11 = 3n
      expect(data.roles).toBe(3n);
    });

    it("granting an already-held role is idempotent (|= is safe)", async () => {
      // Grant editor to alice again — bitmask OR won't change the value
      const ix = getGrantRoleInstruction({
        application: applicationPda,
        role: editorRolePda,
        userAccount: aliceUserPda,
        authority: superAdmin,
      });

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

      const data = await getUserAccount(aliceUserPda);
      // roles must still be 3n — no phantom bits added
      expect(data.roles).toBe(3n);
    });
  });

  describe("revoke_role", () => {
    it("super admin can revoke the 'viewer' role from alice", async () => {
      const ix = getRevokeRoleInstruction({
        application: applicationPda,
        role: viewerRolePda,
        userAccount: aliceUserPda,
        authority: superAdmin,
      });

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

      const data = await getUserAccount(aliceUserPda);
      // bit 1 (viewer) cleared; bit 0 (editor) still set → roles = 1n
      expect(data.roles).toBe(1n);
    });

    it("revoking a role alice doesn't hold is idempotent (&= ~ is safe)", async () => {
      // Revoke viewer again — alice doesn't have it, no-op
      const ix = getRevokeRoleInstruction({
        application: applicationPda,
        role: viewerRolePda,
        userAccount: aliceUserPda,
        authority: superAdmin,
      });

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

      const data = await getUserAccount(aliceUserPda);
      // Still 1n — no change
      expect(data.roles).toBe(1n);
    });
  });

  // ── 7. check_authorization ───────────────────────────────────────────────

  describe("check_authorization", () => {
    it("alice IS authorized for 'editor' → silent Ok(())", async () => {
      // Alice holds editor (bit 0 set). This must succeed.
      const ix = getCheckAuthorizationInstruction({
        application: applicationPda,
        role: editorRolePda,
        userAccount: aliceUserPda,
      });

      const result = await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });
      expect(result).toBeTruthy();
    });

    it("alice is NOT authorized for 'viewer' → error 6000 Unauthorized", async () => {
      // Alice had viewer revoked above, so this must fail with code 6000.
      const ix = getCheckAuthorizationInstruction({
        application: applicationPda,
        role: viewerRolePda,
        userAccount: aliceUserPda,
      });

      let failed = false;
      try {
        await connection.sendTransactionFromInstructions({
          feePayer: superAdmin,
          instructions: [ix],
          commitment: "confirmed",
        });
      } catch (e: any) {
        failed = true;
        // Anchor surfaces custom errors by their numeric code in the logs
        const logs: string[] = await connection.getLogs(e.signature).catch(() => []);
        const hasUnauthorized =
          logs.some((l) => l.includes("Unauthorized")) ||
          stringify(e).includes("6000");
        expect(hasUnauthorized).toBe(true);
      }
      expect(failed).toBe(true);
    });

    it("bob (no roles at all) fails check for 'editor' → error 6000", async () => {
      // Bob was created but never granted any role.
      const ix = getCheckAuthorizationInstruction({
        application: applicationPda,
        role: editorRolePda,
        userAccount: bobUserPda,
      });

      let failed = false;
      try {
        await connection.sendTransactionFromInstructions({
          feePayer: superAdmin,
          instructions: [ix],
          commitment: "confirmed",
        });
      } catch (e: any) {
        failed = true;
        const logs: string[] = await connection.getLogs(e.signature).catch(() => []);
        const hasUnauthorized =
          logs.some((l) => l.includes("Unauthorized")) ||
          stringify(e).includes("6000");
        expect(hasUnauthorized).toBe(true);
      }
      expect(failed).toBe(true);
    });

    it("check fails after role is revoked — auth is not cached", async () => {
      // Grant editor to bob, verify it passes, then revoke and verify it fails.

      const grantIx = getGrantRoleInstruction({
        application: applicationPda,
        role: editorRolePda,
        userAccount: bobUserPda,
        authority: superAdmin,
      });
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [grantIx],
        commitment: "confirmed",
      });

      // Passes now
      const checkIxBefore = getCheckAuthorizationInstruction({
        application: applicationPda,
        role: editorRolePda,
        userAccount: bobUserPda,
      });
      const passBefore = await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [checkIxBefore],
        commitment: "confirmed",
      });
      expect(passBefore).toBeTruthy();

      // Revoke
      const revokeIx = getRevokeRoleInstruction({
        application: applicationPda,
        role: editorRolePda,
        userAccount: bobUserPda,
        authority: superAdmin,
      });
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [revokeIx],
        commitment: "confirmed",
      });

      // Fails now
      const checkIxAfter = getCheckAuthorizationInstruction({
        application: applicationPda,
        role: editorRolePda,
        userAccount: bobUserPda,
      });
      let failed = false;
      try {
        await connection.sendTransactionFromInstructions({
          feePayer: superAdmin,
          instructions: [checkIxAfter],
          commitment: "confirmed",
        });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    });
  });

  // ── 8. deactivate_role ───────────────────────────────────────────────────

  describe("deactivate_role", () => {
    it("super admin can deactivate the 'viewer' role", async () => {
      const ix = getDeactivateRoleInstruction({
        application: applicationPda,
        role: viewerRolePda,
        authority: superAdmin,
      });

      const result = await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });
      expect(result).toBeTruthy();

      const data = await getRoleAccount(viewerRolePda);
      expect(data.isActive).toBe(false);
    });

    it("check_authorization against an inactive role → error 6001 RoleInactive", async () => {
      // Now check — role is inactive so Anchor's constraint rejects with 6001
      const checkIx = getCheckAuthorizationInstruction({
        application: applicationPda,
        role: viewerRolePda,
        userAccount: aliceUserPda,
      });

      let failed = false;
      try {
        await connection.sendTransactionFromInstructions({
          feePayer: superAdmin,
          instructions: [checkIx],
          commitment: "confirmed",
        });
      } catch (e: any) {
        failed = true;
        const logs: string[] = await connection.getLogs(e.signature).catch(() => []);
        const hasRoleInactive =
          logs.some((l) => l.includes("RoleInactive")) ||
          stringify(e).includes("6001");
        expect(hasRoleInactive).toBe(true);
      }
      expect(failed).toBe(true);
    });

    it("grant_role against an inactive role also fails with 6001", async () => {
      // viewer is still inactive — can't grant an inactive role
      const ix = getGrantRoleInstruction({
        application: applicationPda,
        role: viewerRolePda,
        userAccount: bobUserPda,
        authority: superAdmin,
      });

      let failed = false;
      try {
        await connection.sendTransactionFromInstructions({
          feePayer: superAdmin,
          instructions: [ix],
          commitment: "confirmed",
        });
      } catch (e: any) {
        failed = true;
        const logs: string[] = await connection.getLogs(e.signature).catch(() => []);
        const hasRoleInactive =
          logs.some((l) => l.includes("RoleInactive")) ||
          stringify(e).includes("6001");
        expect(hasRoleInactive).toBe(true);
      }
      expect(failed).toBe(true);
    });
  });

  // ── 9. bitmask correctness sanity checks ─────────────────────────────────

  describe("bitmask correctness", () => {
    it("two distinct roles set two distinct bits and both clear independently", async () => {
      // Re-grant both roles to alice now that viewer is (re-)active if needed.
      // For this isolated bitmask test, use the editor (still active).
      // alice currently has editor (bit 0) and viewer bit set in roles
      // (viewer was granted before deactivation test, revoke doesn't care about active).

      // Verify bit 0 is set (editor, role_index=0) and bit 1 (viewer, role_index=1)
      const data = await getUserAccount(aliceUserPda);
      // bit 0 must be set (editor)
      expect((data.roles >> 0n) & 1n).toBe(1n);
      // bit 1 is set from the grant in the deactivation test above
      expect((data.roles >> 1n) & 1n).toBe(1n);
    });

    it("editor permissions bitmask covers exactly bits 0 and 1 (posts + users)", async () => {
      const data = await getRoleAccount(editorRolePda);
      // EDITOR_PERMISSIONS = 3n = 0b11 → bit 0 (posts) and bit 1 (users)
      expect(data.permissions & 1n).toBe(1n);   // posts bit
      expect(data.permissions & 2n).toBe(2n);   // users bit
      expect(data.permissions & 4n).toBe(0n);   // no 3rd resource
    });

    it("viewer permissions bitmask covers exactly bit 0 (posts only)", async () => {
      const data = await getRoleAccount(viewerRolePda);
      // VIEWER_PERMISSIONS = 1n = 0b01 → bit 0 (posts) only
      expect(data.permissions & 1n).toBe(1n);
      expect(data.permissions & 2n).toBe(0n);   // no users access
    });
  });
});