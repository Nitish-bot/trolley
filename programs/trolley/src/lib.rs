use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("DsFnBVZwCAaW3TNzkcMGo4gbEKdNVo58MbpvVWVPvqun");

#[program]
pub mod trolley {
    use super::*;

    // ── Application ─────────────────────────────────────────────────────────

    pub fn initialize_application(
        ctx: Context<InitializeApplication>,
        app_name: String,
    ) -> Result<()> {
        ctx.accounts
            .initialize_application(app_name, ctx.bumps.application)
    }

    pub fn add_resource(ctx: Context<AddResource>, resource_name: String) -> Result<()> {
        ctx.accounts.add_resource(resource_name)
    }

    // ── Role ─────────────────────────────────────────────────────────────────

    pub fn create_role(
        ctx: Context<CreateRole>,
        role_name: String,
        permissions: u64,
    ) -> Result<()> {
        ctx.accounts
            .create_role(role_name, permissions, ctx.bumps.role)
    }

    pub fn update_role_permissions(
        ctx: Context<UpdateRolePermissions>,
        new_permissions: u64,
    ) -> Result<()> {
        ctx.accounts.update_role_permissions(new_permissions)
    }

    pub fn deactivate_role(ctx: Context<DeactivateRole>) -> Result<()> {
        ctx.accounts.deactivate_role()
    }

    // ── User ─────────────────────────────────────────────────────────────────

    pub fn create_user(ctx: Context<CreateUser>, user_pubkey: Pubkey) -> Result<()> {
        ctx.accounts
            .create_user(user_pubkey, ctx.bumps.user_account)
    }

    pub fn grant_role(ctx: Context<GrantRole>) -> Result<()> {
        ctx.accounts.grant_role()
    }

    pub fn revoke_role(ctx: Context<RevokeRole>) -> Result<()> {
        ctx.accounts.revoke_role()
    }

    // ── Auth ─────────────────────────────────────────────────────────────────

    pub fn check_authorization(ctx: Context<CheckAuthorization>) -> Result<()> {
        ctx.accounts.check_authorization()
    }
}