use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use crate::constants::{CONTEST_SEED, ADMIN_SEED};
use crate::state::{AdminConfig, Contest, ContestStatus};
use crate::error::DexiError;

#[derive(Accounts)]
pub struct SettleContest<'info> {
    #[account(
        seeds = [ADMIN_SEED],
        bump,
        constraint = config.keeper == keeper.key() @ DexiError::NotAdmin
    )]
    pub config: Box<Account<'info, AdminConfig>>,
    #[account(mut, seeds = [CONTEST_SEED, &contest.id.to_le_bytes()], bump = contest.bump)]
    pub contest: Account<'info, Contest>,
    #[account(mut, constraint = escrow_vault.owner == contest.key())]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub keeper: Signer<'info>,
}

impl<'info> SettleContest<'info> {
    pub fn settle(&mut self) -> Result<()> {
        require!(
            self.contest.status == ContestStatus::Locked,
            DexiError::ContestNotLocked
        );
        require!(!self.contest.settled, DexiError::AlreadySettled);

        self.contest.prize_pool = self.escrow_vault.amount;
        self.contest.status = ContestStatus::Settled;
        self.contest.settled = true;

        Ok(())
    }
}
