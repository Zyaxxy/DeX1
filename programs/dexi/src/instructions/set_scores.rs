use anchor_lang::prelude::*;
use crate::constants::{CONTEST_SEED, ADMIN_SEED};
use crate::state::{AdminConfig, Contest, ContestStatus, UserEntry};
use crate::error::DexiError;

#[derive(Accounts)]
pub struct SetScores<'info> {
    #[account(
        seeds = [ADMIN_SEED],
        bump,
        constraint = config.keeper == keeper.key() @ DexiError::NotAdmin
    )]
    pub config: Box<Account<'info, AdminConfig>>,
    #[account(mut, seeds = [CONTEST_SEED, &contest.id.to_le_bytes()], bump = contest.bump)]
    pub contest: Account<'info, Contest>,
    #[account(mut)]
    pub entry: Account<'info, UserEntry>,
    pub keeper: Signer<'info>,
}

impl<'info> SetScores<'info> {
    pub fn set(&mut self, score: i64) -> Result<()> {
        require!(
            self.contest.status == ContestStatus::Locked,
            DexiError::ContestNotLocked
        );
        require!(
            self.entry.contest == self.contest.key(),
            DexiError::InvalidContestStatus
        );

        self.entry.score = score;
        Ok(())
    }
}
