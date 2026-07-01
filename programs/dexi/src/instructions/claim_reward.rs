use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::error::DexiError;
use crate::state::{AdminConfig, Contest, UserEntry};

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(seeds = [ADMIN_SEED], bump)]
    pub config: Box<Account<'info, AdminConfig>>,
    #[account(mut, seeds = [CONTEST_SEED, &contest.id.to_le_bytes()], bump = contest.bump)]
    pub contest: Box<Account<'info, Contest>>,
    #[account(mut, constraint = entry.user == user.key(), constraint = entry.contest == contest.key())]
    pub entry: Box<Account<'info, UserEntry>>,
    #[account(mut, constraint = escrow_vault.owner == contest.key(), constraint = escrow_vault.mint == config.usdc_mint)]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = user_usdc_ata.owner == user.key(), constraint = user_usdc_ata.mint == config.usdc_mint)]
    pub user_usdc_ata: Box<Account<'info, TokenAccount>>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ClaimReward<'info> {
    pub fn claim(&mut self) -> Result<()> {
        let contest = &self.contest;
        let entry = &self.entry;

        require!(contest.settled, DexiError::NotSettled);
        require!(!entry.claimed, DexiError::AlreadyClaimed);
        require!(entry.score > 0, DexiError::NoScore);

        let rank = entry.rank as usize;
        require!(rank < contest.winner_count as usize, DexiError::NoPrize);

        let payout = (contest.prize_pool as u128)
            .checked_mul(contest.prize_split[rank] as u128)
            .ok_or(DexiError::ArithmeticError)?
            .checked_div(BASIS_POINTS as u128)
            .ok_or(DexiError::ArithmeticError)? as u64;

        require!(payout > 0, DexiError::NoPrize);

        let contest_seeds = &[
            CONTEST_SEED,
            &contest.id.to_le_bytes(),
            &[contest.bump],
        ];

        token::transfer(
            CpiContext::new_with_signer(
                self.token_program.key(),
                Transfer {
                    from: self.escrow_vault.to_account_info(),
                    to: self.user_usdc_ata.to_account_info(),
                    authority: self.contest.to_account_info(),
                },
                &[contest_seeds],
            ),
            payout,
        )?;

        let entry = &mut self.entry;
        entry.claimed = true;

        Ok(())
    }
}
