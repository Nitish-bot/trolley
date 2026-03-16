use anchor_lang::prelude::*;

#[error_code]
pub enum RbacError {
    // ── Auth signals — CPI callers MAY catch and handle these ──
    #[msg("Unauthorized: user does not hold the required role")]
    Unauthorized, // 6000

    // ── Config / limit errors — treat as bugs, always propagate ──
    #[msg("Role does not exist or is inactive")]
    RoleInactive, // 6001
    #[msg("Maximum resource limit of 64 reached")]
    ResourceLimitReached, // 6002
    #[msg("Maximum role limit of 64 reached")]
    RoleLimitReached, // 6003
    #[msg("Resource name too long (max 32 bytes)")]
    ResourceNameTooLong, // 6004
    #[msg("Role name too long (max 32 bytes)")]
    RoleNameTooLong, // 6005
    #[msg("App name too long (max 32 bytes)")]
    AppNameTooLong, // 6006
    #[msg("Role belongs to a different application")]
    RoleMismatch, // 6007
    #[msg("User account belongs to a different application")]
    UserMismatch, // 6008
}
