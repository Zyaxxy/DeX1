use anchor_lang::prelude::*;
use anchor_lang::AccountSerialize;
use crate::constants::*;
use crate::state::{AdminConfig, Contest, ContestStatus, UserEntry};
use crate::error::DexiError;

#[derive(Accounts)]
pub struct CalculateRankings<'info> {
    #[account(
        seeds = [ADMIN_SEED],
        bump,
        constraint = config.keeper == keeper.key() @ DexiError::NotAdmin
    )]
    pub config: Box<Account<'info, AdminConfig>>,
    #[account(mut, seeds = [CONTEST_SEED, &contest.id.to_le_bytes()], bump = contest.bump)]
    pub contest: Box<Account<'info, Contest>>,
    pub keeper: Signer<'info>,
}

impl<'info> CalculateRankings<'info> {
    pub fn calculate(&mut self, remaining_accounts: &[AccountInfo]) -> Result<()> {
        require!(
            self.contest.status == ContestStatus::Locked,
            DexiError::ContestNotLocked
        );

        let n = remaining_accounts.len();
        let contest_key = self.contest.key();

        for i in 0..n {
            require!(remaining_accounts[i].is_writable, DexiError::InvalidContestStatus);
            {
                let data = remaining_accounts[i].data.borrow();
                let mut cursor: &[u8] = &data;
                let entry = UserEntry::try_deserialize(&mut cursor)
                    .map_err(|_| DexiError::InvalidContestStatus)?;
                require!(entry.contest == contest_key, DexiError::InvalidContestStatus);
                if i > 0 {
                    let prev_data = remaining_accounts[i - 1].data.borrow();
                    let mut prev_cursor: &[u8] = &prev_data;
                    let prev = UserEntry::try_deserialize(&mut prev_cursor)
                        .map_err(|_| DexiError::InvalidContestStatus)?;
                    require!(prev.score >= entry.score, DexiError::ArithmeticError);
                }
            }
        }

        for i in 0..n {
            let entry = {
                let data = remaining_accounts[i].data.borrow();
                let mut cursor: &[u8] = &data;
                let mut entry = UserEntry::try_deserialize(&mut cursor)
                    .map_err(|_| DexiError::InvalidContestStatus)?;
                entry.rank = i as u32;
                entry
            };

            let mut buf = Vec::new();
            entry.try_serialize(&mut buf)
                .map_err(|_| DexiError::ArithmeticError)?;

            let mut data = remaining_accounts[i].data.borrow_mut();
            data[..buf.len()].copy_from_slice(&buf);
        }

        Ok(())
    }
}
