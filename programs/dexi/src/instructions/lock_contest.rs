use anchor_lang::prelude::*;
use crate::constants::CONTEST_SEED;
use crate::state::{Contest, ContestStatus};
use crate::error::DexiError;

#[derive(Accounts)]
pub struct LockContest<'info> {
    #[account(mut, seeds = [CONTEST_SEED, &contest.id.to_le_bytes()], bump = contest.bump)]
    pub contest: Account<'info, Contest>,
    pub keeper: Signer<'info>,
}

impl<'info> LockContest<'info> {
    pub fn lock(&mut self) -> Result<()> {
        let clock = Clock::get()?;

        require!(
            self.contest.status == ContestStatus::Open,
            DexiError::ContestNotOpen
        );
        require!(
            clock.unix_timestamp >= self.contest.start_time,
            DexiError::EntryDeadlinePassed
        );

        self.contest.status = ContestStatus::Locked;
        Ok(())
    }
}
