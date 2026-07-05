use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use anchor_spl::token::{self, burn, Burn, Transfer};
use constant_product_curve::{ConstantProduct, LiquidityPair};

use crate::constants::*;
use crate::error::DexiError;
use crate::state::{AdminConfig, AthletePool, Contest, ContestStatus};

#[derive(Accounts)]
pub struct ProcessEntryMint<'info> {
    #[account(mut, seeds = [CONTEST_SEED, &contest.id.to_le_bytes()], bump = contest.bump)]
    pub contest: Box<Account<'info, Contest>>,
    #[account(mut, seeds = [POOL_SEED, pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Box<Account<'info, AthletePool>>,
    #[account(mut, mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = contest,
        associated_token::token_program = token_program,
    )]
    pub contest_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = contest,
        associated_token::token_program = token_program,
    )]
    pub contest_escrow_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        seeds = [ADMIN_SEED],
        bump,
        constraint = config.keeper == keeper.key() @ DexiError::NotAdmin,
    )]
    pub config: Box<Account<'info, AdminConfig>>,
    #[account(
        mut,
        associated_token::mint = mint,
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
    pub keeper: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> ProcessEntryMint<'info> {
    /// For each athlete mint:
    ///   1. Swap 90% of staked tokens back to USDC (adds to prize pool escrow).
    ///   2. Burn the remaining 10%.
    pub fn process(&mut self) -> Result<()> {
        require!(self.contest.status == ContestStatus::Locked, DexiError::ContestNotLocked);

        let vault_balance = self.contest_token_vault.amount;
        require!(vault_balance > 0, DexiError::InvalidAmount);

        // 90% gets swapped; the remaining 10% is burned.
        let swap_amount = vault_balance
            .checked_mul(SWAP_BURN_PCT)
            .and_then(|v| v.checked_div(100))
            .ok_or(DexiError::ArithmeticError)?;

        let burn_amount = vault_balance
            .checked_sub(swap_amount)
            .ok_or(DexiError::ArithmeticError)?;

        // Zero-fee swap so the full swap_amount flows to the prize pool.
        let mut curve = ConstantProduct::init(
            self.pool_token_vault.amount,
            self.pool_usdc_vault.amount,
            0,
            0, // no fee on this internal operation
            Some(6),
        )
        .map_err(DexiError::from)?;

        let swap_result = curve
            .swap(LiquidityPair::X, swap_amount, 0)
            .map_err(DexiError::from)?;

        let contest_seeds: &[&[u8]] = &[
            CONTEST_SEED,
            &self.contest.id.to_le_bytes(),
            &[self.contest.bump],
        ];
        let pool_seeds: &[&[u8]] = &[
            POOL_SEED,
            self.pool.mint.as_ref(),
            &[self.pool.bump],
        ];

        // Step 1 — send tokens from contest vault → pool token vault.
        token::transfer(
            CpiContext::new_with_signer(
                self.token_program.key(),
                Transfer {
                    from: self.contest_token_vault.to_account_info(),
                    to: self.pool_token_vault.to_account_info(),
                    authority: self.contest.to_account_info(),
                },
                &[contest_seeds],
            ),
            swap_amount,
        )?;

        // Step 2 — receive USDC from pool usdc vault → contest escrow (prize pool).
        token::transfer(
            CpiContext::new_with_signer(
                self.token_program.key(),
                Transfer {
                    from: self.pool_usdc_vault.to_account_info(),
                    to: self.contest_escrow_vault.to_account_info(),
                    authority: self.pool_authority.to_account_info(),
                },
                &[pool_seeds],
            ),
            swap_result.withdraw,
        )?;

        // Step 3 — burn the remaining tokens permanently.
        burn(
            CpiContext::new_with_signer(
                self.token_program.key(),
                Burn {
                    from: self.contest_token_vault.to_account_info(),
                    mint: self.mint.to_account_info(),
                    authority: self.contest.to_account_info(),
                },
                &[contest_seeds],
            ),
            burn_amount,
        )?;

        // Track progress so settle_contest can assert all mints are fully processed.
        self.contest.processed_mint_count = self
            .contest
            .processed_mint_count
            .checked_add(1)
            .ok_or(DexiError::ArithmeticError)?;

        Ok(())
    }
}
