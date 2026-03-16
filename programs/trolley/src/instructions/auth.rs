use anchor_lang::prelude::*;

use crate::{
    error::RbacError,
    state::{ApplicationAccount, RoleAccount, UserAccount},
};

// ═══════════════════════════════════════════════════════════════════════════════
// CPI USAGE PATTERN FOR CONSUMING PROGRAMS
// ═══════════════════════════════════════════════════════════════════════════════
//
// Add the trolley program as a dependency in your Cargo.toml:
//
//   trolley = { path = "../trolley", features = ["cpi"] }
//
// ───────────────────────────────────────────────────────────────────────────────
// HARD GATE — entire transaction reverts if the user is not authorized:
// ───────────────────────────────────────────────────────────────────────────────
//
//   let cpi_ctx = CpiContext::new(
//       ctx.accounts.trolley_program.to_account_info(),
//       trolley::cpi::accounts::CheckAuthorization {
//           application: ctx.accounts.application.to_account_info(),
//           role:         ctx.accounts.role.to_account_info(),
//           user_account: ctx.accounts.user_account.to_account_info(),
//       },
//   );
//   trolley::cpi::check_authorization(cpi_ctx)?;
//
// ───────────────────────────────────────────────────────────────────────────────
// SOFT GATE — catch 6000 (Unauthorized) and handle it in your own program,
//             while still propagating any unexpected errors:
// ───────────────────────────────────────────────────────────────────────────────
//
//   match trolley::cpi::check_authorization(cpi_ctx) {
//       Ok(_) => { /* user is authorized — proceed */ }
//       Err(e) if e.error_code_number() == 6000 => {
//           // translate into your own program's error code
//           return err!(MyError::Unauthorized);
//       }
//       Err(e) => return Err(e), // unexpected error — always propagate
//   }
//
// ───────────────────────────────────────────────────────────────────────────────
// SECURITY NOTE:
//   This instruction requires NO Signer. The consuming program is responsible
//   for ensuring it passes the UserAccount that corresponds to the actual signer
//   of its own transaction. The RBAC program validates:
//     1. Account ownership + discriminator (via AccountLoader / Account<T>).
//     2. Role and user PDAs are correctly derived from this application
//        (tamper-proof via on-chain seed check using application.key()).
//     3. The role is active.
//     4. The user's roles bitmask has the bit for the requested role set.
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct CheckAuthorization<'info> {
    /// The application this role and user belong to.
    /// AccountLoader verifies program ownership + discriminator without
    /// deserializing the 2 KB account onto the stack.
    pub application: AccountLoader<'info, ApplicationAccount>,

    /// The role being checked.
    /// PDA seed uses application.key() — tamper-proof without loading app data.
    /// Must belong to this application and must be active.
    #[account(
        constraint = role.app == application.key() @ RbacError::RoleMismatch,
        constraint = role.is_active                @ RbacError::RoleInactive,
        seeds = [
            b"role",
            application.key().as_ref(),
            role.name.as_bytes(),
        ],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    /// The user record to check.
    /// PDA seed uses application.key() — tamper-proof without loading app data.
    /// Must belong to this application.
    #[account(
        constraint = user_account.app == application.key() @ RbacError::UserMismatch,
        seeds = [
            b"user",
            application.key().as_ref(),
            user_account.user.as_ref(),
        ],
        bump = user_account.bump,
    )]
    pub user_account: Account<'info, UserAccount>,
}

impl<'info> CheckAuthorization<'info> {
    pub fn check_authorization(&self) -> Result<()> {
        let has_role = (self.user_account.roles >> self.role.role_index) & 1 == 1;
        require!(has_role, RbacError::Unauthorized);
        Ok(())
    }
}