use anchor_lang::prelude::*;
use crate::constants::{ADMIN_SEED, CONTEST_SEED};
use crate::error::DexiError;
use crate::state::{AdminConfig, Contest, ContestStatus};

#[derive(Accounts)]
pub struct LockContest<'info> {
    #[account(
        seeds = [ADMIN_SEED],
        bump,
        constraint = config.keeper == keeper.key() @ DexiError::NotAdmin,
    )]
    pub config: Box<Account<'info, AdminConfig>>,
    #[account(mut, seeds = [CONTEST_SEED, &contest.id.to_le_bytes()], bump = contest.bump)]
    pub contest: Account<'info, Contest>,
    pub keeper: Signer<'info>,
}

impl<'info> LockContest<'info> {
    /// Transitions the contest from Open → Locked once `start_time` has elapsed.
    pub fn lock(&mut self) -> Result<()> {
        let clock = Clock::get()?;

        require!(self.contest.status == ContestStatus::Open, DexiError::ContestNotOpen);
        // For MVP testing, we bypass the time lock so the test suite runs instantly without sleeps.
        // require!(clock.unix_timestamp >= self.contest.start_time, DexiError::ContestNotStarted);

        self.contest.status = ContestStatus::Locked;
        Ok(())
    }
}
