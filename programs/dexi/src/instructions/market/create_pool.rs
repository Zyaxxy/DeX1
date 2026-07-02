use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::constants::*;
use crate::error::DexiError;
use crate::state::*;

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(seeds = [ADMIN_SEED], bump, has_one = admin @ crate::error::DexiError::NotAdmin)]
    pub config: Account<'info, AdminConfig>,
    #[account(
        init,
        payer = admin,
        seeds = [POOL_SEED, mint.key().as_ref()],
        bump,
        space = AthletePool::DISCRIMINATOR.len() + AthletePool::INIT_SPACE,
    )]
    pub pool: Account<'info, AthletePool>,
    #[account(
        mint::token_program = token_program
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut,
        associated_token::mint = mint,
        associated_token::authority = pool_authority,
        associated_token::token_program = token_program,
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = pool_authority,
        associated_token::token_program = token_program,
    )]
    pub usdc_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA-derived authority for pool vault operations.
    #[account(seeds = [POOL_SEED, mint.key().as_ref()], bump)]
    pub pool_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreatePool<'info> {
    pub fn init(
        &mut self,
        name: String,
        role: AthleteRole,
        _bumps: &CreatePoolBumps,
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, DexiError::NameTooLong);

        let pool = &mut self.pool;
        pool.mint = self.mint.key();
        pool.role = role;
        pool.name = name;
        pool.enabled = true;

        Ok(())
    }
}
