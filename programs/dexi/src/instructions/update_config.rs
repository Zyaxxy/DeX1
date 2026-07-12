use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use crate::constants::ADMIN_SEED;
use crate::error::DexiError;
use crate::state::AdminConfig;

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [ADMIN_SEED],
        bump,
        has_one = admin @ DexiError::NotAdmin,
    )]
    pub config: Account<'info, AdminConfig>,
    #[account(mint::token_program = token_program)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> UpdateConfig<'info> {
    pub fn update(&mut self, swap_fee_bps: Option<u16>, keeper: Option<Pubkey>, treasury: Option<Pubkey>) -> Result<()> {
        if let Some(fee) = swap_fee_bps {
            require!(fee <= 1_000, DexiError::InvalidFee);
            self.config.swap_fee_bps = fee;
        }
        if let Some(k) = keeper {
            self.config.keeper = k;
        }
        if let Some(t) = treasury {
            self.config.treasury = t;
        }
        self.config.usdc_mint = self.usdc_mint.key();
        Ok(())
    }
}
