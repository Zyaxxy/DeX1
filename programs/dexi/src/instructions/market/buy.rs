use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{TokenAccount, TokenInterface};
use anchor_spl::token::{transfer, Transfer};
use constant_product_curve::{ConstantProduct, LiquidityPair};

use crate::constants::*;
use crate::error::DexiError;
use crate::state::AdminConfig;

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(seeds = [ADMIN_SEED], bump)]
    pub config: Box<Account<'info, AdminConfig>>,
    #[account(mut, seeds = [POOL_SEED, pool.mint.as_ref()], bump)]
    pub pool: Box<Account<'info, crate::state::AthletePool>>,
    #[account(mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_usdc_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut,
        associated_token::mint = pool.mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_token_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut,
        associated_token::mint = pool.mint,
        associated_token::authority = pool_authority,
        associated_token::token_program = token_program,
    )]
    pub pool_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut,
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

        let mut curve = ConstantProduct::init(
            self.pool.token_reserve,
            self.pool.usdc_reserve,
            0,
            self.config.swap_fee_bps,
            Some(6),
        ).map_err(DexiError::from)?;

        let swap_result = curve.swap(LiquidityPair::Y, usdc_amount, 1)
            .map_err(DexiError::from)?;

        let pool_mint = self.pool.mint;
        let pool_seeds: &[&[&[u8]]] = &[&[POOL_SEED, pool_mint.as_ref(), &[bumps.pool]]];

        self.deposit_usdc(swap_result.deposit)?;
        self.withdraw_tokens(swap_result.withdraw, pool_seeds)?;

        let pool = &mut self.pool;
        pool.usdc_reserve = pool
            .usdc_reserve
            .checked_add(swap_result.deposit)
            .ok_or(DexiError::ArithmeticError)?;
        pool.token_reserve = pool
            .token_reserve
            .checked_sub(swap_result.withdraw)
            .ok_or(DexiError::ArithmeticError)?;
        pool.k = (pool.token_reserve as u128)
            .checked_mul(pool.usdc_reserve as u128)
            .ok_or(DexiError::ArithmeticError)?;

        Ok(())
    }

    pub fn deposit_usdc(&self, amount: u64) -> Result<()> {
        let cpi_program = self.token_program.key();
        let cpi_accounts = Transfer {
            from: self.user_usdc_ata.to_account_info(),
            to: self.pool_usdc_vault.to_account_info(),
            authority: self.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        transfer(cpi_ctx, amount)
    }

    pub fn withdraw_tokens(&self, amount: u64, seeds: &[&[&[u8]]]) -> Result<()> {
        let cpi_program = self.token_program.key();
        let cpi_accounts = Transfer {
            from: self.pool_token_vault.to_account_info(),
            to: self.user_token_ata.to_account_info(),
            authority: self.pool_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, seeds);
        transfer(cpi_ctx, amount)
    }
}
