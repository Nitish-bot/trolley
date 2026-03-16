use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::RbacError,
    state::{ApplicationAccount, RoleAccount},
};

// ─────────────────────────────────────────────
// create_role
// ─────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(role_name: String)]
pub struct CreateRole<'info> {
    #[account(mut)]
    pub application: AccountLoader<'info, ApplicationAccount>,

    #[account(
        init,
        payer = authority,
        space = 8 + RoleAccount::INIT_SPACE,
        seeds = [b"role", application.key().as_ref(), role_name.as_bytes()],
        bump,
    )]
    pub role: Account<'info, RoleAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> CreateRole<'info> {
    pub fn create_role(
        &mut self,
        role_name: String,
        permissions: u64,
        bump: u8,
    ) -> Result<()> {
        require!(role_name.len() <= ROLE_NAME_LEN, RbacError::RoleNameTooLong);

        let mut app = self.application.load_mut()?;

        // Manual authority check — replaces has_one constraint
        require!(
            app.authority == self.authority.key(),
            RbacError::Unauthorized
        );

        require!(
            app.role_count < MAX_ROLES as u8,
            RbacError::RoleLimitReached
        );

        let role_index = app.role_count;
        app.role_count += 1;

        // Drop the borrow before mutating the role account
        let app_key = self.application.key();
        drop(app);

        let role = &mut self.role;
        role.app = app_key;
        role.name = role_name;
        role.role_index = role_index;
        role.permissions = permissions;
        role.is_active = true;
        role.bump = bump;

        Ok(())
    }
}

// ─────────────────────────────────────────────
// update_role_permissions
// ─────────────────────────────────────────────

#[derive(Accounts)]
pub struct UpdateRolePermissions<'info> {
    pub application: AccountLoader<'info, ApplicationAccount>,

    #[account(
        mut,
        constraint = role.app == application.key() @ RbacError::RoleMismatch,
        seeds = [b"role", application.key().as_ref(), role.name.as_bytes()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    pub authority: Signer<'info>,
}

impl<'info> UpdateRolePermissions<'info> {
    pub fn update_role_permissions(&mut self, new_permissions: u64) -> Result<()> {
        let app = self.application.load()?;

        // Manual authority check — replaces has_one constraint
        require!(
            app.authority == self.authority.key(),
            RbacError::Unauthorized
        );

        drop(app);

        self.role.permissions = new_permissions;
        Ok(())
    }
}

// ─────────────────────────────────────────────
// deactivate_role
// Needed to exercise the RoleInactive (6001) error path in tests
// ─────────────────────────────────────────────

#[derive(Accounts)]
pub struct DeactivateRole<'info> {
    pub application: AccountLoader<'info, ApplicationAccount>,

    #[account(
        mut,
        constraint = role.app == application.key() @ RbacError::RoleMismatch,
        seeds = [b"role", application.key().as_ref(), role.name.as_bytes()],
        bump = role.bump,
    )]
    pub role: Account<'info, RoleAccount>,

    pub authority: Signer<'info>,
}

impl<'info> DeactivateRole<'info> {
    pub fn deactivate_role(&mut self) -> Result<()> {
        let app = self.application.load()?;

        // Manual authority check — replaces has_one constraint
        require!(
            app.authority == self.authority.key(),
            RbacError::Unauthorized
        );

        drop(app);

        self.role.is_active = false;
        Ok(())
    }
}