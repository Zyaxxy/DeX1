use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{TokenAccount, TokenInterface};
use anchor_spl::token::{transfer, Transfer};
use constant_product_curve::{ConstantProduct, LiquidityPair};

use crate::constants::*;
use crate::error::DexiError;
use crate::state::{AdminConfig, AthletePool};

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(seeds = [ADMIN_SEED], bump)]
    pub config: Box<Account<'info, AdminConfig>>,
    #[account(mut, seeds = [POOL_SEED, pool.mint.as_ref()], bump)]
    pub pool: Box<Account<'info, AthletePool>>,
    #[account(
        mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_usdc_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = pool.mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_token_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = pool.mint,
        associated_token::authority = pool_authority,
        associated_token::token_program = token_program,
    )]
    pub pool_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = pool_authority,
        associated_token::token_program = token_program,
    )]
    pub pool_usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: PDA-derived authority for pool vault operations.
    #[account(seeds = [POOL_SEED, pool.mint.as_ref()], bump = pool.bump)]
    pub pool_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Buy<'info> {
    pub fn execute(&mut self, usdc_amount: u64, bumps: &BuyBumps) -> Result<()> {
        require!(self.pool.enabled, DexiError::PoolDisabled);
        require!(usdc_amount > 0, DexiError::InvalidAmount);

        // price = usdc_reserve / token_reserve  (constant-product)
        let mut curve = ConstantProduct::init(
            self.pool_token_vault.amount, // X reserve
            self.pool_usdc_vault.amount,  // Y reserve
            0,
            self.config.swap_fee_bps,
            Some(6),
        )
        .map_err(DexiError::from)?;

        // Swap USDC (Y) in → athlete tokens (X) out
        let swap_result = curve
            .swap(LiquidityPair::Y, usdc_amount, 1)
            .map_err(DexiError::from)?;

        let pool_seeds: &[&[&[u8]]] =
            &[&[POOL_SEED, self.pool.mint.as_ref(), &[bumps.pool]]];

        // USDC flows in from user, tokens flow out from pool vault.
        self.transfer_user_to_pool_usdc(swap_result.deposit)?;
        self.transfer_pool_to_user_tokens(swap_result.withdraw, pool_seeds)?;

        Ok(())
    }

    fn transfer_user_to_pool_usdc(&self, amount: u64) -> Result<()> {
        transfer(
            CpiContext::new(
                self.token_program.key(),
                Transfer {
                    from: self.user_usdc_ata.to_account_info(),
                    to: self.pool_usdc_vault.to_account_info(),
                    authority: self.user.to_account_info(),
                },
            ),
            amount,
        )
    }

    fn transfer_pool_to_user_tokens(&self, amount: u64, seeds: &[&[&[u8]]]) -> Result<()> {
        transfer(
            CpiContext::new_with_signer(
                self.token_program.key(),
                Transfer {
                    from: self.pool_token_vault.to_account_info(),
                    to: self.user_token_ata.to_account_info(),
                    authority: self.pool_authority.to_account_info(),
                },
                seeds,
            ),
            amount,
        )
    }
}
