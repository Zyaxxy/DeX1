use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use crate::constants::{ADMIN_SEED, CONTEST_SEED};
use crate::error::DexiError;
use crate::state::{AdminConfig, Contest, ContestStatus};

#[derive(Accounts)]
pub struct SettleContest<'info> {
    #[account(
        seeds = [ADMIN_SEED],
        bump,
        constraint = config.keeper == keeper.key() @ DexiError::NotAdmin,
    )]
    pub config: Box<Account<'info, AdminConfig>>,
    #[account(mut, seeds = [CONTEST_SEED, &contest.id.to_le_bytes()], bump = contest.bump)]
    pub contest: Account<'info, Contest>,
    #[account(mut, constraint = escrow_vault.owner == contest.key())]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub keeper: Signer<'info>,
}

impl<'info> SettleContest<'info> {
    /// Snapshots the escrow balance into `prize_pool` and transitions to Settled.
    pub fn settle(&mut self) -> Result<()> {
        // Locked → Settled is the only valid transition.
        require!(self.contest.status == ContestStatus::Locked, DexiError::ContestNotLocked);

        // Ensure every athlete mint's tokens have been swapped to USDC for the prize pool.
        require!(
            self.contest.processed_mint_count == self.contest.total_mint_count,
            DexiError::InvalidContestStatus
        );

        self.contest.prize_pool = self.escrow_vault.amount;
        self.contest.status = ContestStatus::Settled;
        Ok(())
    }
}
