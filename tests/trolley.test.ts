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

  const CLUSTER = process.env.CLUSTER || "localnet";
  const APP_NAME = "my-app";
  const EDITOR_ROLE = "editor";
  const VIEWER_ROLE = "viewer";
  const RESOURCE_POSTS = "posts";
  const RESOURCE_USERS = "users";
  // bit 0 = posts, bit 1 = users
  const EDITOR_PERMISSIONS = 3n; // 0b11 — posts + users
  const VIEWER_PERMISSIONS = 1n; // 0b01 — posts only

  // ── error assertion helpers ──────────────────────────────────────────────

  /**
   * Assert a transaction fails and that the logs/error contain the given
   * error identifier (e.g. "Unauthorized" or "6000").
   */
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

    superAdmin =
      process.env.KEYPAIR_BYTES && CLUSTER === "devnet"
        ? await createKeyPairSignerFromBytes(
            new Uint8Array(JSON.parse(process.env.KEYPAIR_BYTES)),
          )
        : await connection.createWallet();

    alice = await connection.createWallet();
    bob = await connection.createWallet();

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
      const ix = getInitializeApplicationInstruction({
        application: applicationPda,
        authority: superAdmin,
        appName: APP_NAME,
      });
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [ix],
        commitment: "confirmed",
      });

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
      await expectTxError(ix, "already in use");
    });
  });

  // ── 2. add_resource ──────────────────────────────────────────────────────

  describe("add_resource", () => {
    it("adds resources sequentially and increments resource_count", async () => {
      for (const [i, name] of [
        [0, RESOURCE_POSTS],
        [1, RESOURCE_USERS],
      ] as const) {
        await connection.sendTransactionFromInstructions({
          feePayer: superAdmin,
          instructions: [
            getAddResourceInstruction({
              application: applicationPda,
              authority: superAdmin,
              resourceName: name,
            }),
          ],
          commitment: "confirmed",
        });

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
          authority: alice, // not the super admin
          resourceName: "secrets",
        }),
        "Error", // has_one = authority constraint rejection
      );
      // resource_count must be unchanged
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
        await connection.sendTransactionFromInstructions({
          feePayer: superAdmin,
          instructions: [
            getCreateRoleInstruction({
              application: applicationPda,
              role: pda,
              authority: superAdmin,
              roleName: name,
              permissions: perms,
            }),
          ],
          commitment: "confirmed",
        });

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
      const restrictedPerms = 1n; // posts only

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getUpdateRolePermissionsInstruction({
            application: applicationPda,
            role: editorRolePda,
            authority: superAdmin,
            newPermissions: restrictedPerms,
          }),
        ],
        commitment: "confirmed",
      });
      expect((await getRoleAccount(editorRolePda)).permissions).toBe(
        restrictedPerms,
      );

      // restore
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getUpdateRolePermissionsInstruction({
            application: applicationPda,
            role: editorRolePda,
            authority: superAdmin,
            newPermissions: EDITOR_PERMISSIONS,
          }),
        ],
        commitment: "confirmed",
      });
      expect((await getRoleAccount(editorRolePda)).permissions).toBe(
        EDITOR_PERMISSIONS,
      );
    });
  });

  // ── 5. create_user ───────────────────────────────────────────────────────

  describe("create_user", () => {
    it("creates UserAccounts with roles = 0 for each wallet", async () => {
      for (const [user, pda] of [
        [alice, aliceUserPda],
        [bob, bobUserPda],
      ] as const) {
        await connection.sendTransactionFromInstructions({
          feePayer: superAdmin,
          instructions: [
            getCreateUserInstruction({
              application: applicationPda,
              userAccount: pda,
              authority: superAdmin,
              userPubkey: user.address,
            }),
          ],
          commitment: "confirmed",
        });

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
      // Grant editor (role_index=0) → expect bit 0
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getGrantRoleInstruction({
            application: applicationPda,
            role: editorRolePda,
            userAccount: aliceUserPda,
            authority: superAdmin,
          }),
        ],
        commitment: "confirmed",
      });
      expect((await getUserAccount(aliceUserPda)).roles).toBe(1n); // 0b01

      // Grant viewer (role_index=1) → expect bits 0 and 1
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getGrantRoleInstruction({
            application: applicationPda,
            role: viewerRolePda,
            userAccount: aliceUserPda,
            authority: superAdmin,
          }),
        ],
        commitment: "confirmed",
      });
      expect((await getUserAccount(aliceUserPda)).roles).toBe(3n); // 0b11
    });

    it("granting an already-held role is idempotent (|= does not flip bits)", async () => {
      // alice already has both roles (roles = 3n). Grant editor again.
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getGrantRoleInstruction({
            application: applicationPda,
            role: editorRolePda,
            userAccount: aliceUserPda,
            authority: superAdmin,
          }),
        ],
        commitment: "confirmed",
      });
      // Must stay 3n — no phantom bits added
      expect((await getUserAccount(aliceUserPda)).roles).toBe(3n);
    });
  });

  // ── 7. revoke_role ───────────────────────────────────────────────────────

  describe("revoke_role", () => {
    it("clears the correct bit when revoking a role", async () => {
      // alice has roles = 3n (0b11). Revoke viewer (bit 1) → expect 1n (0b01)
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getRevokeRoleInstruction({
            application: applicationPda,
            role: viewerRolePda,
            userAccount: aliceUserPda,
            authority: superAdmin,
          }),
        ],
        commitment: "confirmed",
      });
      expect((await getUserAccount(aliceUserPda)).roles).toBe(1n); // editor only
    });

    it("revoking a role the user does not hold is idempotent (&= ~ does not corrupt)", async () => {
      // alice does not have viewer. Revoke viewer again.
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getRevokeRoleInstruction({
            application: applicationPda,
            role: viewerRolePda,
            userAccount: aliceUserPda,
            authority: superAdmin,
          }),
        ],
        commitment: "confirmed",
      });
      // Must stay 1n — editor bit untouched
      expect((await getUserAccount(aliceUserPda)).roles).toBe(1n);
    });
  });

  // ── 8. check_authorization ───────────────────────────────────────────────

  describe("check_authorization", () => {
    it("succeeds silently when the user holds the role", async () => {
      // alice has editor (bit 0 set)
      const result = await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getCheckAuthorizationInstruction({
            application: applicationPda,
            role: editorRolePda,
            userAccount: aliceUserPda,
          }),
        ],
        commitment: "confirmed",
      });
      expect(result).toBeTruthy();
    });

    it("fails with 6000 Unauthorized when the user lacks the role", async () => {
      // alice had viewer revoked — checking viewer must fail
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
      // bob was never granted anything
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
      // Grant editor to bob, confirm it passes, then revoke and confirm it fails.
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getGrantRoleInstruction({
            application: applicationPda,
            role: editorRolePda,
            userAccount: bobUserPda,
            authority: superAdmin,
          }),
        ],
        commitment: "confirmed",
      });

      const before = await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getCheckAuthorizationInstruction({
            application: applicationPda,
            role: editorRolePda,
            userAccount: bobUserPda,
          }),
        ],
        commitment: "confirmed",
      });
      expect(before).toBeTruthy();

      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getRevokeRoleInstruction({
            application: applicationPda,
            role: editorRolePda,
            userAccount: bobUserPda,
            authority: superAdmin,
          }),
        ],
        commitment: "confirmed",
      });

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
      await connection.sendTransactionFromInstructions({
        feePayer: superAdmin,
        instructions: [
          getDeactivateRoleInstruction({
            application: applicationPda,
            role: viewerRolePda,
            authority: superAdmin,
          }),
        ],
        commitment: "confirmed",
      });
      expect((await getRoleAccount(viewerRolePda)).isActive).toBe(false);
    });

    it("check_authorization against an inactive role fails with 6001 RoleInactive", async () => {
      // The role.is_active constraint fires at account-validation time,
      // before the bitmask is ever read — user state is irrelevant.
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
      // Full role history for alice:
      //   grant editor  → roles = 1n (0b01)
      //   grant viewer  → roles = 3n (0b11)
      //   revoke viewer → roles = 1n (0b01)  ← final state
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
