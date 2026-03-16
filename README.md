# Trolley — On-Chain RBAC for Solana

> **Role-Based Access Control as a Solana program.**  
> A reframe of a foundational Web2 backend pattern into Solana's account model — demonstrating that Solana is a distributed state-machine backend, not just a crypto tool.

---

## Table of Contents

- [What is RBAC?](#what-is-rbac)
- [How This Works in Web2](#how-this-works-in-web2)
- [How This Works on Solana](#how-this-works-on-solana)
- [Architecture Deep Dive](#architecture-deep-dive)
- [Bitmask Design](#bitmask-design)
- [CPI Authorization Pattern](#cpi-authorization-pattern)
- [Tradeoffs & Constraints](#tradeoffs--constraints)
- [Program Instructions](#program-instructions)
- [Getting Started](#getting-started)
- [Running Tests](#running-tests)
- [Devnet Deployment](#devnet-deployment)

---

## What is RBAC?

Role-Based Access Control (RBAC) is one of the most ubiquitous patterns in backend engineering. At its core it answers one question at runtime:

> **"Is this user allowed to do this thing?"**

Every multi-user application — from a SaaS dashboard to a hospital record system — implements some form of RBAC. It is the layer that separates `admin@company.com` from `intern@company.com`.

---

## How This Works in Web2

A traditional RBAC implementation lives inside a centralized backend service backed by a relational database. The schema typically looks like this:

```
┌──────────┐     ┌──────────────────┐     ┌────────┐
│  users   │────<│  user_role_map   │>────│ roles  │
└──────────┘     └──────────────────┘     └────────┘
                                              │
                                    ┌─────────────────┐
                                    │ role_permissions │
                                    └─────────────────┘
                                              │
                                         ┌──────────┐
                                         │resources │
                                         └──────────┘
```

**The authorization check** is a middleware function that runs on every protected HTTP request:

```typescript
// Express middleware — runs on every protected route
async function requireRole(role: string) {
  return async (req, res, next) => {
    const userId = req.session.userId;
    const hasRole = await db.query(
      `SELECT 1 FROM user_role_map
       JOIN roles ON roles.id = user_role_map.role_id
       WHERE user_role_map.user_id = $1 AND roles.name = $2`,
      [userId, role]
    );
    if (!hasRole.rows.length) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
```

**The trust model is entirely centralized:**
- You trust your database not to be corrupted
- You trust your application server not to be compromised
- You trust your session management not to be forged
- The entire system is opaque — an outsider cannot verify whether a permission check actually happened

---

## How This Works on Solana

On Solana, the database *is* the blockchain. Every permission state is a publicly verifiable on-chain account. Every authorization check is a transaction whose success or failure is cryptographically recorded.

```
Web2                              Solana
─────────────────────────────     ─────────────────────────────────────
Database row (users table)    →   UserAccount PDA
Database row (roles table)    →   RoleAccount PDA
Database row (role_map)       →   Bit in UserAccount.roles bitmask
SQL SELECT for auth check     →   check_authorization instruction
HTTP 403 Forbidden            →   Transaction error code 6000
Middleware guard              →   CPI into check_authorization
Admin dashboard mutation      →   Signed transaction from super-admin wallet
```

**The trust model is decentralized:**
- State lives in accounts that anyone can read and verify
- Mutations require a cryptographic signature from the authority
- The authorization check is an on-chain instruction — its result is part of the transaction record
- Other programs can CPI into `check_authorization` and gate their own logic on the result

---

## Architecture Deep Dive

The program manages three account types, each a PDA (Program Derived Address):

```
super-admin wallet
        │
        │ initializes
        ▼
┌────────────────────────────────────────────────────┐
│  ApplicationAccount                                │
│  PDA: ["app", authority, app_name]                 │
│                                                    │
│  authority:      Pubkey      ← the super-admin     │
│  app_name:       [u8; 32]    ← baked into seed     │
│  resource_count: u8          ← append-only index   │
│  resources:      [ResourceMeta; 64]                │
│  role_count:     u8          ← append-only index   │
│  bump:           u8                                │
└────────────────────────────────────────────────────┘
        │                          │
        │ spawns                   │ spawns
        ▼                          ▼
┌──────────────────┐     ┌──────────────────────────┐
│  RoleAccount     │     │  UserAccount             │
│  PDA: ["role",   │     │  PDA: ["user",           │
│   app, name]     │     │   app, user_pubkey]       │
│                  │     │                          │
│  app:        Pub │     │  app:   Pubkey           │
│  name:    String │     │  user:  Pubkey           │
│  role_index:  u8 │     │  roles: u64  ← bitmask   │
│  permissions: u64│     │  bump:  u8               │
│  is_active: bool │     └──────────────────────────┘
│  bump:        u8 │
└──────────────────┘

Authorization check:
  (user_account.roles >> role_account.role_index) & 1 == 1
```

### Why Zero-Copy for ApplicationAccount?

`ApplicationAccount` holds `[ResourceMeta; 64]` — that array alone is `64 × 33 = 2,112 bytes`. Anchor's normal deserialization copies the entire account onto the stack for processing. Solana enforces a **4KB stack frame limit per instruction**, and at ~2,187 bytes total the account sits dangerously close to that ceiling.

`#[account(zero_copy)]` solves this by handing the program a reference directly into the account's data buffer in memory — zero bytes copied to the stack:

```
Normal #[account]                    #[account(zero_copy)]

Account buffer (heap)                Account buffer (heap)
         │                                    │
    memcpy + Borsh                       just a &ref
    deserialize                               │
         ▼                                    ▼
  Stack frame ← 4KB limit          Struct reference
  Full struct copied here           (zero stack cost)
```

The tradeoff: `zero_copy` requires every field to implement `bytemuck::Pod` — fixed size, no heap allocation. This is why `app_name` and resource names are `[u8; 32]` byte arrays instead of `String`. `RoleAccount` and `UserAccount` are small enough to use normal Anchor deserialization and can use `String` normally.

---

## Bitmask Design

Both permission management and role assignment use `u64` bitmasks. This encodes what would be a many-to-many join table in Web2 into a single 8-byte integer.

### Resource → Role permissions

Each `RoleAccount` holds a `permissions: u64`. Bit `i` being set means that role grants access to the resource registered at index `i` in the `ApplicationAccount.resources` array.

```
resources array:   index 0 = "posts"   index 1 = "users"   index 2 = "orders"

EDITOR role:       permissions = 0b00000111  → can access posts, users, orders
VIEWER role:       permissions = 0b00000001  → posts only
BILLING role:      permissions = 0b00000100  → orders only
```

### User → Role assignment

Each `UserAccount` holds a `roles: u64`. Bit `i` being set means the user holds the role whose `role_index == i`.

```
roles created:  role_index 0 = EDITOR   role_index 1 = VIEWER   role_index 2 = BILLING

Alice:          roles = 0b00000011  → Alice has EDITOR and VIEWER
Bob:            roles = 0b00000101  → Bob has EDITOR and BILLING
```

**Granting and revoking are single bitwise operations:**

```rust
// Grant role at index i
user_account.roles |= 1u64 << role.role_index;

// Revoke role at index i
user_account.roles &= !(1u64 << role.role_index);

// Check: does user hold role at index i?
let authorized = (user_account.roles >> role.role_index) & 1 == 1;
```

Both operations are **idempotent** — granting an already-held role is a no-op, revoking an absent role is a no-op. No need for existence checks.

**The hard limit is 64 resources and 64 roles per application.** In practice this is a feature — it forces clean domain boundaries. Applications that genuinely need more than 64 resources are a signal to split into multiple applications.

---

## CPI Authorization Pattern

The primary design goal is that **other Solana programs can gate their own logic on Trolley's authorization check**. This is the on-chain equivalent of importing an auth middleware library.

### Hard gate — whole transaction reverts on failure

```rust
// In your consuming program
pub fn protected_action(ctx: Context<ProtectedAction>) -> Result<()> {
    // If the user lacks the required role, this CPI throws RbacError::Unauthorized
    // (error code 6000) and the ENTIRE transaction reverts atomically.
    // No partial state mutations escape.
    trolley::cpi::check_authorization(cpi_ctx)?;

    // Only reaches here if authorized
    do_the_thing(&mut ctx.accounts)?;
    Ok(())
}
```

### Soft gate — conditional logic without reverting

```rust
// Catch specifically the authorization signal (6000) for conditional flows
match trolley::cpi::check_authorization(cpi_ctx) {
    Ok(_) => {
        // Full access path
        premium_action(&mut ctx.accounts)?;
    }
    Err(e) if e.error_code_number() == 6000 => {
        // Degraded access path — don't revert, just limit what they can do
        basic_action(&mut ctx.accounts)?;
    }
    Err(e) => return Err(e), // Unexpected error — propagate, don't swallow
}
```

### Why error code 6000 is the only code worth catching

The error surface is intentionally stratified:

| Code | Name | Meaning | Should catch? |
|------|------|---------|---------------|
| 6000 | `Unauthorized` | User lacks the role — expected denial | ✅ Yes |
| 6001 | `RoleInactive` | Role was deactivated — config signal | ⚠️ Sometimes |
| 6002–6008 | Various | Limit exceeded / wrong account — caller bug | ❌ No, propagate |

Codes 6002–6008 indicate a programming error in the caller, not a runtime access decision. Swallowing them would hide bugs.

---

## Tradeoffs & Constraints

### Compared to a Web2 RBAC system

| Dimension | Web2 (PostgreSQL + Express) | Trolley (Solana) |
|---|---|---|
| **State storage** | Mutable database rows | Immutable-by-default PDAs |
| **Auth check cost** | ~1ms SQL query, free | ~5,000 compute units, costs ~0.000005 SOL |
| **Auditability** | Requires audit log setup | Every tx is permanently on-chain |
| **Mutation auth** | Session token / JWT | Ed25519 keypair signature |
| **Max resources** | Unlimited | 64 per application |
| **Max roles** | Unlimited | 64 per application |
| **Read access** | Private by default | Public by default |
| **Role deletion** | `DELETE FROM roles` | Deactivation only (indices are permanent) |
| **Latency** | Sub-millisecond | ~400ms (one block confirmation) |

### Why role indices are permanent

If a role at index `i` were deleted and the index reused, every `UserAccount.roles` bitmask would silently change meaning. A user who had `roles = 0b00000010` (held the old role at index 1) would now appear to hold the new role at index 1. This is a silent privilege escalation bug with no transaction to audit.

The safe model is append-only: `deactivate_role` sets `is_active = false` and all constraints that gate on active roles will reject operations. The index is never reused.

### The public-by-default tradeoff

All on-chain state is readable by anyone. `UserAccount.roles` bitmasks are public. In most RBAC contexts this is fine — the existence of a permission is less sensitive than what that permission unlocks. For applications where role assignments themselves are confidential, this model is not appropriate without an additional encryption layer.

### Rent costs

Each PDA costs a one-time rent-exempt deposit:
- `ApplicationAccount` (~2,187 bytes): ~0.016 SOL
- `RoleAccount` (~120 bytes): ~0.002 SOL  
- `UserAccount` (~81 bytes): ~0.002 SOL

These are deposits, not fees — they are recoverable if the accounts are closed.

---

## Program Instructions

| Instruction | Authority | Description |
|---|---|---|
| `initialize_application` | Anyone | Creates a new RBAC application. Caller becomes super-admin. |
| `add_resource` | Super-admin | Registers a named resource at the next available bit index. |
| `create_role` | Super-admin | Creates a named role with an initial permissions bitmask. |
| `update_role_permissions` | Super-admin | Overwrites a role's permissions bitmask. |
| `deactivate_role` | Super-admin | Marks a role inactive. Permanent — index is never reused. |
| `create_user` | Super-admin | Creates a UserAccount for a wallet address. Starts with `roles = 0`. |
| `grant_role` | Super-admin | Sets the role's bit in the user's bitmask. |
| `revoke_role` | Super-admin | Clears the role's bit in the user's bitmask. |
| `check_authorization` | Anyone | Checks if a user holds a role. Silent success or error 6000. |

---

## Getting Started

### Prerequisites

```bash
# Anchor version manager
avm install 0.32.0 && avm use 0.32.0

# Solana CLI
solana --version  # should be 2.x

# Bun (for tests)
curl -fsSL https://bun.sh/install | bash
```

### Install and build

```bash
git clone https://github.com/your-username/trolley
cd trolley
bun install

# Fix known Anchor 0.32.0 dependency conflicts
cargo update base64ct --precise 1.6.0
cargo update constant_time_eq --precise 0.4.1
cargo update blake3 --precise 1.5.5

anchor build
```

### Generate the TypeScript client

```bash
# Reads target/idl/trolley.json and writes dist/js-client/
npx ts-node create-codama-client.ts
```

---

## Running Tests

Tests run against a local validator spun up by `anchor test`. The suite covers the full lifecycle: application initialization, resource and role creation, user management, grant/revoke, authorization checks, and edge cases including inactive roles and bitmask idempotency.

```bash
anchor test
```

To run against devnet with your own keypair:

```bash
CLUSTER=devnet KEYPAIR_BYTES="[1,2,3,...]" bun test
```

### Test coverage

```
rbac (trolley)
  initialize_application
    ✓ super admin can initialize an application
    ✓ ApplicationAccount has correct authority and zero counts
    ✓ cannot initialize the same application twice
  add_resource
    ✓ super admin can add the 'posts' resource (index 0)
    ✓ super admin can add the 'users' resource (index 1)
    ✓ non-admin cannot add a resource (has_one constraint rejects)
  create_role
    ✓ super admin can create the 'editor' role (role_index = 0)
    ✓ editor role has role_index 0 and correct permissions bitmask
    ✓ ApplicationAccount role_count increments to 1
    ✓ super admin can create the 'viewer' role (role_index = 1)
    ✓ role_count is now 2 on the ApplicationAccount
  update_role_permissions
    ✓ super admin can update editor permissions to posts-only
    ✓ can restore editor permissions back to full
  create_user
    ✓ super admin can create a UserAccount for alice
    ✓ alice's UserAccount starts with roles = 0n (no roles)
    ✓ super admin can create a UserAccount for bob
  grant_role
    ✓ super admin can grant the 'editor' role to alice
    ✓ super admin can also grant the 'viewer' role to alice
    ✓ granting an already-held role is idempotent
  revoke_role
    ✓ super admin can revoke the 'viewer' role from alice
    ✓ revoking a role alice doesn't hold is idempotent
  check_authorization
    ✓ alice IS authorized for 'editor' → silent Ok(())
    ✓ alice is NOT authorized for 'viewer' → error 6000 Unauthorized
    ✓ bob (no roles at all) fails check for 'editor' → error 6000
    ✓ check fails after role is revoked — auth is not cached
  deactivate_role
    ✓ super admin can deactivate the 'viewer' role
    ✓ check_authorization against an inactive role → error 6001 RoleInactive
    ✓ grant_role against an inactive role also fails with 6001
  bitmask correctness
    ✓ two distinct roles set two distinct bits and clear independently
    ✓ editor permissions bitmask covers exactly bits 0 and 1
    ✓ viewer permissions bitmask covers exactly bit 0
```

---

## Devnet Deployment

**Program address:** `DsFnBVZwCAaW3TNzkcMGo4gbEKdNVo58MbpvVWVPvqun`

| Transaction | Description | Explorer |
|---|---|---|
| Program deploy | Initial deployment to devnet | [View](#) |
| initialize_application | Created `my-app` application | [View](#) |
| add_resource × 2 | Registered `posts` and `users` resources | [View](#) |
| create_role × 2 | Created `editor` and `viewer` roles | [View](#) |
| create_user | Created UserAccount for test wallet | [View](#) |
| grant_role | Granted `editor` role to test wallet | [View](#) |
| check_authorization | Authorization check — passed silently | [View](#) |

> Replace the `[View](#)` links with your actual Solana Explorer links after deploying.

To deploy yourself:

```bash
# Point Solana CLI at devnet
solana config set --url devnet

# Fund your deploy wallet
solana airdrop 2

# Build and deploy
anchor build
anchor deploy

# Update the program address in lib.rs and Anchor.toml, then rebuild
anchor build && anchor deploy
```