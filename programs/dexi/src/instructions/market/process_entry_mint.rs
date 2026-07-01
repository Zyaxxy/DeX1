use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use anchor_spl::token::{self, Transfer, Burn, burn};
use constant_product_curve::{ConstantProduct, LiquidityPair};

use crate::constants::*;
use crate::state::{Contest, ContestStatus, AthletePool};
use crate::error::DexiError;
use crate::state::AdminConfig;

#[derive(Accounts)]
pub struct ProcessEntryMint<'info> {
    #[account(mut, seeds = [CONTEST_SEED, &contest.id.to_le_bytes()], bump = contest.bump)]
    pub contest: Box<Account<'info, Contest>>,
    #[account(mut, seeds = [POOL_SEED, pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Box<Account<'info, AthletePool>>,
    #[account(
        mint::token_program = token_program
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut,
        associated_token::mint = mint,
        associated_token::authority = contest,
        associated_token::token_program = token_program,
    )]
    pub contest_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = contest,
        associated_token::token_program = token_program,
    )]
    pub contest_escrow_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(seeds = [ADMIN_SEED], bump)]
    pub config: Box<Account<'info, AdminConfig>>,
    #[account(mut,
        associated_token::mint = mint,
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
    pub keeper: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> ProcessEntryMint<'info> {
    pub fn process(&mut self, _bumps: &ProcessEntryMintBumps) -> Result<()> {
        require!(
            self.contest.status == ContestStatus::Locked,
            DexiError::ContestNotLocked
        );

        let vault_balance = self.contest_token_vault.amount;
        require!(vault_balance > 0, DexiError::InvalidAmount);

        let swap_amount = (vault_balance as u128)
            .checked_mul(SWAP_BURN_PCT as u128)
            .ok_or(DexiError::ArithmeticError)?
            .checked_div(100)
            .ok_or(DexiError::ArithmeticError)? as u64;

        let burn_amount = vault_balance
            .checked_sub(swap_amount)
            .ok_or(DexiError::ArithmeticError)?;

        let mut curve = ConstantProduct::init(
            self.pool.token_reserve,
            self.pool.usdc_reserve,
            0,
            0,
            Some(6),
        ).map_err(DexiError::from)?;

        let swap_result = curve.swap(LiquidityPair::X, swap_amount, 1)
            .map_err(DexiError::from)?;

        let pool_mint = self.pool.mint;
        let pool_bump = self.pool.bump;
        let contest_id = self.contest.id;
        let contest_bump = self.contest.bump;

        let contest_seeds = &[
            CONTEST_SEED,
            &contest_id.to_le_bytes(),
            &[contest_bump],
        ];

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

        let pool_seeds = &[
            POOL_SEED,
            pool_mint.as_ref(),
            &[pool_bump],
        ];

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

        let pool = &mut self.pool;
        pool.token_reserve = pool
            .token_reserve
            .checked_add(swap_amount)
            .ok_or(DexiError::ArithmeticError)?;
        pool.usdc_reserve = pool
            .usdc_reserve
            .checked_sub(swap_result.withdraw)
            .ok_or(DexiError::ArithmeticError)?;
        pool.k = (pool.token_reserve as u128)
            .checked_mul(pool.usdc_reserve as u128)
            .ok_or(DexiError::ArithmeticError)?;

        let contest = &mut self.contest;
        contest.prize_pool = contest
            .prize_pool
            .checked_add(swap_result.withdraw)
            .ok_or(DexiError::ArithmeticError)?;

        Ok(())
    }
}
