use anchor_lang::prelude::*;

use crate::{
    error::RbacError,
    state::{ApplicationAccount, RoleAccount, UserAccount},
};

// ─────────────────────────────────────────────────────────────────────────────
// create_user
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(user_pubkey: Pubkey)]
pub struct CreateUser<'info> {
    #[account(mut)]
    pub application: AccountLoader<'info, ApplicationAccount>,

    #[account(
        init,
        payer = authority,
        space = 8 + UserAccount::INIT_SPACE,
        seeds = [b"user", application.key().as_ref(), user_pubkey.as_ref()],
        bump,
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreateUser<'info> {
    pub fn create_user(&mut self, user_pubkey: Pubkey, bump: u8) -> Result<()> {
        let app = self.application.load()?;

        // Manual authority check — replaces has_one constraint
        require!(
            app.authority == self.authority.key(),
            RbacError::Unauthorized
        );

        drop(app);

        let user_account = &mut self.user_account;
        user_account.app = self.application.key();
        user_account.user = user_pubkey;
        user_account.roles = 0;
        user_account.bump = bump;

        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// grant_role
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct GrantRole<'info> {
    pub application: AccountLoader<'info, ApplicationAccount>,

    #[account(
        constraint = role.app == application.key() @ RbacError::RoleMismatch,
        constraint = role.is_active                @ RbacError::RoleInactive,
        seeds = [b"role", application.key().as_ref(), role.name.as_bytes()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(
        mut,
        constraint = user_account.app == application.key() @ RbacError::UserMismatch,
        seeds = [b"user", application.key().as_ref(), user_account.user.as_ref()],
        bump = user_account.bump,
    )]
    pub user_account: Account<'info, UserAccount>,

    pub authority: Signer<'info>,
}

impl<'info> GrantRole<'info> {
    pub fn grant_role(&mut self) -> Result<()> {
        let app = self.application.load()?;

        // Manual authority check — replaces has_one constraint
        require!(
            app.authority == self.authority.key(),
            RbacError::Unauthorized
        );

        drop(app);

        self.user_account.roles |= 1u64 << self.role.role_index;
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// revoke_role
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RevokeRole<'info> {
    pub application: AccountLoader<'info, ApplicationAccount>,

    #[account(
        constraint = role.app == application.key() @ RbacError::RoleMismatch,
        constraint = role.is_active                @ RbacError::RoleInactive,
        seeds = [b"role", application.key().as_ref(), role.name.as_bytes()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(
        mut,
        constraint = user_account.app == application.key() @ RbacError::UserMismatch,
        seeds = [b"user", application.key().as_ref(), user_account.user.as_ref()],
        bump = user_account.bump,
    )]
    pub user_account: Account<'info, UserAccount>,

    pub authority: Signer<'info>,
}

impl<'info> RevokeRole<'info> {
    pub fn revoke_role(&mut self) -> Result<()> {
        let app = self.application.load()?;

        // Manual authority check — replaces has_one constraint
        require!(
            app.authority == self.authority.key(),
            RbacError::Unauthorized
        );

        drop(app);

        self.user_account.roles &= !(1u64 << self.role.role_index);
        Ok(())
    }
}
