You are an expert Solana and Anchor framework developer. Your task is to implement
a production-quality on-chain RBAC (Role-Based Access Control) Anchor program from
scratch, then write a complete test suite for it using @solana/kit, solana-kite,
and Codama.

════════════════════════════════════════════════════════════
PART 1 — ANCHOR PROGRAM
════════════════════════════════════════════════════════════

## Workspace layout

Standard Anchor workspace. Program name: `rbac`. All program code lives in
`programs/rbac/src/`. Split into logical files:
  lib.rs         — declare_id!, #[program] module, re-exports
  state.rs       — all #[account] structs and their impl blocks
  instructions/  — one file per instruction group
    mod.rs
    application.rs
    role.rs
    user.rs
    auth.rs
  error.rs       — #[error_code] enum
  constants.rs   — MAX_RESOURCES, RESOURCE_NAME_LEN, etc.

## Anchor version & compatibility

Use Anchor 0.32.0. After scaffold, run these cargo fixes:
  cargo update base64ct --precise 1.6.0
  cargo update constant_time_eq --precise 0.4.1
  cargo update blake3 --precise 1.5.5
Add `solana-program = "3"` to programs/rbac/Cargo.toml [dependencies] if you
encounter solana-program version warnings.

════════════════════════════════════════════════════════════
DATA MODEL
════════════════════════════════════════════════════════════

## Constants (constants.rs)
  MAX_RESOURCES:    usize = 64
  MAX_ROLES:        usize = 64   (same limit — roles bitmask is also u64)
  RESOURCE_NAME_LEN: usize = 32  (fixed-width, right-padded with 0 bytes)
  ROLE_NAME_LEN:    usize = 32
  APP_NAME_LEN:     usize = 32

## ApplicationAccount (state.rs)
PDA seeds: [b"app", authority.key().as_ref(), app_name_bytes]

Fields:
  authority:      Pubkey     — the super admin; immutable after init
  app_name:       [u8; 32]   — fixed-width copy of the name used in seed
  resource_count: u8         — next available bit index for resources (0-63)
  resources:      [ResourceMeta; 64]
  role_count:     u8         — next available bit index for roles (0-63)
  bump:           u8

ResourceMeta (plain struct, NOT an account):
  name:      [u8; 32]
  is_active: bool
  LEN = 33 bytes

Compute ApplicationAccount::LEN explicitly in an impl block.
Total ≈ 8 + 32 + 32 + 1 + (64*33) + 1 + 1 = 2187 bytes.

## RoleAccount (state.rs)
PDA seeds: [b"role", app_account.key().as_ref(), role_name_bytes]

Fields:
  app:         Pubkey    — back-reference to ApplicationAccount
  name:        [u8; 32]  — matches PDA seed material
  role_index:  u8        — bit position in UserAccount.roles; assigned at
                           creation from app.role_count; PERMANENT
  permissions: u64       — bitmask: bit i = can access resource[i]
  is_active:   bool
  bump:        u8

RoleAccount::LEN = 8 + 32 + 32 + 1 + 8 + 1 + 1 = 83 bytes

## UserAccount (state.rs)
PDA seeds: [b"user", app_account.key().as_ref(), user_pubkey.as_ref()]

Fields:
  app:   Pubkey   — back-reference
  user:  Pubkey   — the wallet this record represents
  roles: u64      — bitmask: bit i = user holds role with role_index i
  bump:  u8

UserAccount::LEN = 8 + 32 + 32 + 8 + 1 = 81 bytes

════════════════════════════════════════════════════════════
ERROR CODES (error.rs)
════════════════════════════════════════════════════════════

#[error_code]
pub enum RbacError {
  // ── Auth signals — CPI callers MAY catch and handle these ──
  #[msg("Unauthorized: user does not hold the required role")]
  Unauthorized,              // 6000  ← only one callers need to catch

  // ── Config / limit errors — treat as bugs, always propagate ──
  #[msg("Role does not exist or is inactive")]
  RoleInactive,              // 6001
  #[msg("Maximum resource limit of 64 reached")]
  ResourceLimitReached,      // 6002
  #[msg("Maximum role limit of 64 reached")]
  RoleLimitReached,          // 6003
  #[msg("Resource name too long (max 32 bytes)")]
  ResourceNameTooLong,       // 6004
  #[msg("Role name too long (max 32 bytes)")]
  RoleNameTooLong,           // 6005
  #[msg("App name too long (max 32 bytes)")]
  AppNameTooLong,            // 6006
  #[msg("Role belongs to a different application")]
  RoleMismatch,              // 6007
  #[msg("User account belongs to a different application")]
  UserMismatch,              // 6008
}

Also expose a free function:
  pub fn is_auth_error(code: u32) -> bool {
      code == RbacError::Unauthorized as u32 + 6000
  }

════════════════════════════════════════════════════════════
INSTRUCTIONS
════════════════════════════════════════════════════════════

All instructions live in the #[program] mod in lib.rs but delegate
to impl methods on the Accounts structs for organisation.

── 1. initialize_application (instructions/application.rs) ──

pub fn initialize_application(
    ctx: Context<InitializeApplication>,
    app_name: String,
) -> Result<()>

Accounts:
  application: init, payer=authority, space=ApplicationAccount::LEN
    seeds=[b"app", authority.key().as_ref(), app_name_bytes], bump
  authority: Signer, mut
  system_program: Program<System>

Logic:
  - Validate app_name.len() <= APP_NAME_LEN, else RbacError::AppNameTooLong
  - Write authority, app_name (as fixed [u8;32], zero-padded), bump
  - resource_count = 0, role_count = 0
  - Zero-initialise resources array

── 2. add_resource (instructions/application.rs) ──

pub fn add_resource(
    ctx: Context<AddResource>,
    resource_name: String,
) -> Result<()>

Accounts:
  application: mut, has_one=authority
    seeds=[b"app", application.authority.as_ref(), application.app_name.as_ref()], bump
  authority: Signer, mut
  system_program: Program<System>

Logic:
  - Validate resource_name.len() <= RESOURCE_NAME_LEN
  - require!(app.resource_count < 64, RbacError::ResourceLimitReached)
  - Write ResourceMeta into resources[resource_count], is_active=true
  - Increment resource_count

── 3. create_role (instructions/role.rs) ──

pub fn create_role(
    ctx: Context<CreateRole>,
    role_name: String,
    permissions: u64,
) -> Result<()>

Accounts:
  application: mut, has_one=authority
    seeds=[...], bump=application.bump
  role: init, payer=authority, space=RoleAccount::LEN
    seeds=[b"role", application.key().as_ref(), role_name_bytes], bump
  authority: Signer, mut
  system_program: Program<System>

Logic:
  - Validate role_name.len() <= ROLE_NAME_LEN
  - require!(app.role_count < 64, RbacError::RoleLimitReached)
  - role_index = app.role_count (then increment app.role_count)
  - Write all RoleAccount fields

── 4. update_role_permissions (instructions/role.rs) ──

pub fn update_role_permissions(
    ctx: Context<UpdateRolePermissions>,
    new_permissions: u64,
) -> Result<()>

Accounts:
  application: has_one=authority, seeds=[...], bump
  role: mut, constraint role.app == application.key() @ RbacError::RoleMismatch
    seeds=[b"role", application.key().as_ref(), role.name.as_ref()], bump=role.bump
  authority: Signer

Logic: role.permissions = new_permissions

── 5. create_user (instructions/user.rs) ──

pub fn create_user(
    ctx: Context<CreateUser>,
    user_pubkey: Pubkey,
) -> Result<()>

Accounts:
  application: has_one=authority, seeds=[...], bump
  user_account: init, payer=authority, space=UserAccount::LEN
    seeds=[b"user", application.key().as_ref(), user_pubkey.as_ref()], bump
  authority: Signer, mut
  system_program: Program<System>

Logic: write app, user=user_pubkey, roles=0, bump

── 6. grant_role (instructions/user.rs) ──

pub fn grant_role(ctx: Context<GrantRole>) -> Result<()>

Accounts:
  application: has_one=authority, seeds=[...], bump
  role:
    seeds=[b"role", application.key().as_ref(), role.name.as_ref()], bump=role.bump
    constraint: role.app == application.key() @ RbacError::RoleMismatch
    constraint: role.is_active @ RbacError::RoleInactive
  user_account: mut
    seeds=[b"user", application.key().as_ref(), user_account.user.as_ref()], bump
    constraint: user_account.app == application.key() @ RbacError::UserMismatch
  authority: Signer

Logic:
  user_account.roles |= 1u64 << role.role_index;

── 7. revoke_role (instructions/user.rs) ──

pub fn revoke_role(ctx: Context<RevokeRole>) -> Result<()>

Same account structure as grant_role.

Logic:
  user_account.roles &= !(1u64 << role.role_index);

── 8. check_authorization (instructions/auth.rs) ──

pub fn check_authorization(ctx: Context<CheckAuthorization>) -> Result<()>

This is the critical instruction. NO Signer required beyond PDA validation.
The consuming program is responsible for ensuring it passes the correct
user_account for its own transaction signer.

Accounts (all read-only):
  application:
    seeds=[b"app", application.authority.as_ref(), application.app_name.as_ref()], bump
  role:
    seeds=[b"role", application.key().as_ref(), role.name.as_ref()], bump=role.bump
    constraint: role.app == application.key() @ RbacError::RoleMismatch
    constraint: role.is_active @ RbacError::RoleInactive
  user_account:
    seeds=[b"user", application.key().as_ref(), user_account.user.as_ref()], bump
    constraint: user_account.app == application.key() @ RbacError::UserMismatch

Logic:
  let has_role = (user_account.roles >> role.role_index) & 1 == 1;
  require!(has_role, RbacError::Unauthorized);
  Ok(())

════════════════════════════════════════════════════════════
CPI USAGE PATTERN FOR OTHER PROGRAMS
════════════════════════════════════════════════════════════

Document in a comment block inside auth.rs how a consuming program CPIs in:

  // Hard gate — whole tx reverts if unauthorized:
  rbac::cpi::check_authorization(cpi_ctx)?;

  // Soft gate — catch specifically error code 6000:
  match rbac::cpi::check_authorization(cpi_ctx) {
      Ok(_) => { /* authorized */ }
      Err(e) if e.error_code_number() == 6000 => {
          return err!(MyError::Unauthorized);
      }
      Err(e) => return Err(e), // unexpected — propagate
  }

════════════════════════════════════════════════════════════
ANCHOR GUIDELINES (follow strictly)
════════════════════════════════════════════════════════════

- Use typed accounts (Account<'info, T>) everywhere; never UncheckedAccount
- Use has_one for authority/ownership relationships
- Always validate PDA seeds and bumps via constraints
- Use Program<'info, System> to validate CPI targets
- Avoid init_if_needed (reinitialisation attack vector)
- Move complex logic into impl<'info> blocks on the Accounts structs
- Use #[error_code] with #[msg] on all errors
- Explicitly compute all ::LEN constants in impl blocks

════════════════════════════════════════════════════════════
PART 2 — TESTS
════════════════════════════════════════════════════════════

## Tooling
  - @solana/kit           (Solana Kit — replaces @solana/web3.js)
  - solana-kite           (high-level helpers for Kit)
  - Codama                (generate TypeScript client from Anchor IDL)
  - vitest or jest        (test runner, your choice)
  - localnet              (anchor test spins up a local validator)

## Client generation setup

Create create-codama-client.ts at the workspace root (run before tests):

  import { createFromRoot } from "codama";
  import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
  import { renderJavaScriptVisitor } from "@codama/renderers-js";
  import idl from "./target/idl/rbac.json";

  const codama = createFromRoot(rootNodeFromAnchor(idl as any));
  codama.accept(renderJavaScriptVisitor("./dist/js-client"));

In package.json scripts:
  "pretest": "anchor build && npx ts-node create-codama-client.ts"

## Test file: tests/rbac.test.ts

Use Kite's pattern:
  import { createSolanaClient, createWallet, airdropIfRequired } from "solana-kite";
  import * as programClient from "../dist/js-client";

Connection setup (before all tests):
  const { rpc, sendAndConfirmTransaction } = createSolanaClient({
    urlOrMoniker: "localnet"
  });

Wallet setup (before each suite or top-level beforeAll):
  const superAdmin = await createWallet({ airdropAmount: 2_000_000_000n });
  const alice      = await createWallet({ airdropAmount: 1_000_000_000n });
  const bob        = await createWallet({ airdropAmount: 1_000_000_000n });

PDA derivation helper (write a small utility for each PDA type):
  import { getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";

  async function getAppPda(authority: Address, appName: string) {
    const [pda] = await getProgramDerivedAddress({
      programAddress: RBAC_PROGRAM_ADDRESS,
      seeds: [
        getUtf8Encoder().encode("app"),
        getAddressEncoder().encode(authority),
        padEnd(appName, 32),   // fixed-width 32-byte seed
      ],
    });
    return pda;
  }
  // similar helpers for getRolePda, getUserPda

## Test suites to cover (describe blocks)

1. initialize_application
   ✓ super admin can initialize an application
   ✓ fetching the ApplicationAccount returns correct authority and app_name
   ✓ cannot initialize same app twice (account already exists)

2. add_resource
   ✓ super admin can add a resource; resource_count increments
   ✓ resource appears at correct index in resources[]
   ✓ non-admin cannot add resource (has_one constraint rejects)

3. create_role
   ✓ super admin can create a role with permissions bitmask
   ✓ role_index assigned sequentially (first role = 0, second = 1, …)
   ✓ second role gets correct role_index = 1
   ✓ permissions stored correctly

4. update_role_permissions
   ✓ super admin can update permissions
   ✓ new permissions bitmask reflected in fetched account

5. create_user
   ✓ super admin can create a UserAccount for alice
   ✓ UserAccount starts with roles = 0n (BigInt)
   ✓ user field matches alice's pubkey

6. grant_role / revoke_role
   ✓ super admin can grant role to alice; alice's roles bitmask has correct bit set
   ✓ super admin can grant multiple roles; bitmask reflects all
   ✓ super admin can revoke a role; bit is cleared
   ✓ revoking a role alice doesn't have is a no-op (idempotent)

7. check_authorization (the critical suite)
   ✓ authorized user + correct role → transaction succeeds silently
   ✓ user without the role → fails with error code 6000 (Unauthorized)
   ✓ user with role A checking role B → fails with 6000
   ✓ after role is revoked, check fails with 6000
   ✓ inactive role → fails with 6001 (RoleInactive)
   ✗ wrong application account → constraint/seeds rejection

## Error assertion pattern

For expected failures use try/catch and inspect the error:

  try {
    await connection.sendTransactionFromInstructions({
      feePayer: alice,
      instructions: [checkAuthIx],
    });
    throw new Error("Expected transaction to fail");
  } catch (e: any) {
    const logs: string[] = await connection.getLogs(e.signature);
    expect(logs.some(l => l.includes("Unauthorized"))).toBe(true);
  }

Or if the Codama client surfaces structured errors, match on the
error code number 6000 directly.

## Fetching and decoding accounts

Use Kite's getAccountsFactory or direct Codama fetch helpers:

  // Fetch ApplicationAccount
  const appAccount = await programClient.fetchApplicationAccount(
    rpc,
    appPda
  );
  expect(appAccount.data.resourceCount).toBe(1);
  expect(appAccount.data.authority).toBe(superAdmin.address);

════════════════════════════════════════════════════════════
DELIVERABLES
════════════════════════════════════════════════════════════

1. programs/rbac/src/lib.rs
2. programs/rbac/src/constants.rs
3. programs/rbac/src/error.rs
4. programs/rbac/src/state.rs
5. programs/rbac/src/instructions/mod.rs
6. programs/rbac/src/instructions/application.rs
7. programs/rbac/src/instructions/role.rs
8. programs/rbac/src/instructions/user.rs
9. programs/rbac/src/instructions/auth.rs
10. programs/rbac/Cargo.toml
11. Anchor.toml
12. create-codama-client.ts
13. tests/rbac.test.ts
14. package.json (with pretest script)

Write every file in full. Do not truncate or use placeholder comments.
Ensure the program compiles with `anchor build` and all tests pass with
`anchor test`.