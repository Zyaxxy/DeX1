use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::constants::*;
use crate::error::DexiError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateContest<'info> {
    #[account(seeds = [ADMIN_SEED], bump, has_one = admin @ crate::error::DexiError::NotAdmin)]
    pub config: Account<'info, AdminConfig>,
    #[account(
        init,
        payer = admin,
        space = Contest::DISCRIMINATOR.len() + Contest::INIT_SPACE,
        seeds = [CONTEST_SEED, &id.to_le_bytes()],
        bump
    )]
    pub contest: Account<'info, Contest>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, constraint = escrow_vault.owner == contest.key(), constraint = escrow_vault.mint == config.usdc_mint)]
    pub escrow_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateContest<'info> {
    pub fn init(
        &mut self,
        id: u64,
        start_time: i64,
        winner_count: u8,
        prize_split: Vec<u16>,
        bumps: &CreateContestBumps,
    ) -> Result<()> {
        require!(
            !prize_split.is_empty() && prize_split.len() <= MAX_PRIZE_SPLIT,
            DexiError::InvalidPrizeSplit
        );
        require!(
            winner_count as usize == prize_split.len(),
            DexiError::InvalidPrizeSplit
        );

        let total_bps: u16 = prize_split.iter().sum();
        require!(total_bps <= BASIS_POINTS, DexiError::InvalidPrizeSplit);

        let mut split_arr = [0u16; MAX_PRIZE_SPLIT];
        for (i, &bps) in prize_split.iter().enumerate() {
            split_arr[i] = bps;
        }

        self.contest.set_inner(Contest {
            id,
            bump: bumps.contest,
            admin: self.admin.key(),
            start_time,
            status: ContestStatus::Open,
            entry_count: 0,
            prize_pool: 0,
            winner_count,
            prize_split: split_arr,
            escrow_vault: self.escrow_vault.key(),
            settled: false,
        });

        Ok(())
    }
}
