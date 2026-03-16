use anchor_lang::prelude::*;

// ─────────────────────────────────────────────
// ResourceMeta — nested zero-copy struct
// name:      [u8; 32] → 32 bytes (fixed-width, zero-padded)
// is_active: u8       →  1 byte  (0 = inactive, 1 = active)
//                                 bool is not bytemuck::Pod so we use u8
// Total               → 33 bytes
// ─────────────────────────────────────────────
#[zero_copy]
#[derive(Default)]
pub struct ResourceMeta {
    pub name: [u8; 32],
    pub is_active: u8,
}

// ─────────────────────────────────────────────
// ApplicationAccount — zero-copy PDA account
// PDA seeds: [b"app", authority, app_name_bytes]
//
// Zero-copy is required because the resources array alone is
// 64 × 33 = 2 112 bytes; regular Account<T> deserialization
// would blow Solana's 4 KB stack frame limit.
// ─────────────────────────────────────────────
#[account(zero_copy)]
pub struct ApplicationAccount {
    /// The super-admin; immutable after init
    pub authority: Pubkey,

    /// Fixed-width name baked into the PDA seed (zero-padded to 32 bytes)
    pub app_name: [u8; 32],

    /// Next free bit-index for resources (0-63)
    pub resource_count: u8,

    /// Fixed-size registry of all resources registered to this app
    pub resources: [ResourceMeta; 64],

    /// Next free bit-index for roles (0-63)
    pub role_count: u8,

    /// Canonical PDA bump
    pub bump: u8,
}

// ─────────────────────────────────────────────
// RoleAccount — regular (small) PDA account
// PDA seeds: [b"role", app_account, role_name_bytes]
// ─────────────────────────────────────────────
#[account]
#[derive(InitSpace)]
pub struct RoleAccount {
    /// Back-reference to the parent ApplicationAccount
    pub app: Pubkey,

    /// Role name — matches the PDA seed material
    #[max_len(32)]
    pub name: String,

    /// Bit position in UserAccount.roles; assigned at creation; PERMANENT
    pub role_index: u8,

    /// Bitmask: bit i = this role grants access to resource[i]
    pub permissions: u64,

    /// Whether this role may be granted / checked
    pub is_active: bool,

    /// Canonical PDA bump
    pub bump: u8,
}

// ─────────────────────────────────────────────
// UserAccount — regular (small) PDA account
// PDA seeds: [b"user", app_account, user_pubkey]
// ─────────────────────────────────────────────
#[account]
#[derive(InitSpace)]
pub struct UserAccount {
    /// Back-reference to the parent ApplicationAccount
    pub app: Pubkey,

    /// The wallet this record represents
    pub user: Pubkey,

    /// Bitmask: bit i = user holds the role whose role_index == i
    pub roles: u64,

    /// Canonical PDA bump
    pub bump: u8,
}