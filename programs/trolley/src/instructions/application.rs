use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::RbacError,
    state::{ApplicationAccount, ResourceMeta},
};

// ─────────────────────────────────────────────────────────────────
// initialize_application
// ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(app_name: String)]
pub struct InitializeApplication<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<ApplicationAccount>(),
        seeds = [b"app", authority.key().as_ref(), app_name.as_bytes()],
        bump,
    )]
    pub application: AccountLoader<'info, ApplicationAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitializeApplication<'info> {
    pub fn initialize_application(&mut self, app_name: String, bump: u8) -> Result<()> {
        require!(app_name.len() <= APP_NAME_LEN, RbacError::AppNameTooLong);

        let mut app = self.application.load_init()?;

        let mut name_bytes = [0u8; APP_NAME_LEN];
        name_bytes[..app_name.len()].copy_from_slice(app_name.as_bytes());

        app.authority = self.authority.key();
        app.app_name = name_bytes;
        app.resource_count = 0;
        app.resources = [ResourceMeta::default(); 64];
        app.role_count = 0;
        app.bump = bump;

        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────
// add_resource
// ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct AddResource<'info> {
    #[account(mut)]
    pub application: AccountLoader<'info, ApplicationAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> AddResource<'info> {
    pub fn add_resource(&mut self, resource_name: String) -> Result<()> {
        require!(
            resource_name.len() <= RESOURCE_NAME_LEN,
            RbacError::ResourceNameTooLong
        );

        let mut app = self.application.load_mut()?;

        // Manual authority check — replaces has_one constraint
        require!(
            app.authority == self.authority.key(),
            RbacError::Unauthorized
        );

        require!(
            app.resource_count < MAX_RESOURCES as u8,
            RbacError::ResourceLimitReached
        );

        let idx = app.resource_count as usize;

        let mut name_bytes = [0u8; RESOURCE_NAME_LEN];
        name_bytes[..resource_name.len()].copy_from_slice(resource_name.as_bytes());

        app.resources[idx] = ResourceMeta {
            name: name_bytes,
            is_active: 1,
        };

        app.resource_count += 1;

        Ok(())
    }
}