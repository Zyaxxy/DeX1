use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenInterface};
use crate::constants::ADMIN_SEED;
use crate::error::DexiError;
use crate::state::AdminConfig;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [ADMIN_SEED],
        bump,
        space = AdminConfig::DISCRIMINATOR.len() + AdminConfig::INIT_SPACE,
    )]
    pub config: Account<'info, AdminConfig>,
    #[account(
        mint::token_program = token_program
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    pub fn init(&mut self, swap_fee_bps: u16, treasury: Pubkey, keeper: Pubkey) -> Result<()> {
        require!(swap_fee_bps <= 1000, DexiError::ArithmeticError);
        self.config.set_inner(AdminConfig { 
            admin: self.admin.key(),
            keeper,
            usdc_mint: self.usdc_mint.key(),
            swap_fee_bps,
            treasury });
        Ok(())
    }
}
