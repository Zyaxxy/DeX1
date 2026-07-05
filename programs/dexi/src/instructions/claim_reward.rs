use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::error::DexiError;
use crate::state::{AdminConfig, Contest, ContestStatus, UserEntry};

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(seeds = [ADMIN_SEED], bump)]
    pub config: Box<Account<'info, AdminConfig>>,
    #[account(mut, seeds = [CONTEST_SEED, &contest.id.to_le_bytes()], bump = contest.bump)]
    pub contest: Box<Account<'info, Contest>>,
    #[account(
        mut,
        constraint = entry.user == user.key(),
        constraint = entry.contest == contest.key(),
    )]
    pub entry: Box<Account<'info, UserEntry>>,
    #[account(
        mut,
        constraint = escrow_vault.owner == contest.key(),
        constraint = escrow_vault.mint == config.usdc_mint,
    )]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = user_usdc_ata.owner == user.key(),
        constraint = user_usdc_ata.mint == config.usdc_mint,
    )]
    pub user_usdc_ata: Box<Account<'info, TokenAccount>>,
    pub user: Signer<'info>,
    pub keeper: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ClaimReward<'info> {
    pub fn claim(&mut self, amount: u64) -> Result<()> {
        require!(self.keeper.key() == self.config.keeper, DexiError::NotAdmin);
        require!(self.contest.status == ContestStatus::Settled, DexiError::NotSettled);
        require!(!self.entry.claimed, DexiError::AlreadyClaimed);
        require!(amount > 0, DexiError::InvalidAmount);
        
        let payout = amount;

        let contest_seeds: &[&[u8]] = &[
            CONTEST_SEED,
            &self.contest.id.to_le_bytes(),
            &[self.contest.bump],
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

        self.entry.claimed = true;
        Ok(())
    }
}
