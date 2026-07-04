use anchor_lang::prelude::*;
use anchor_spl::associated_token;
use anchor_spl::token::Token;
use crate::constants::*;
use crate::error::DexiError;
use crate::state::*;

const TOKEN_ACCOUNT_SIZE: usize = 165;

#[derive(Accounts)]
pub struct SetupContest<'info> {
    pub config: Account<'info, AdminConfig>,
    #[account(
        mut,
        seeds = [CONTEST_SEED, &contest.id.to_le_bytes()],
        bump = contest.bump
    )]
    pub contest: Account<'info, Contest>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> SetupContest<'info> {
    pub fn setup(&mut self, player_mints: Vec<Pubkey>, _bumps: &SetupContestBumps, remaining_accounts: &'info [AccountInfo<'info>]) -> Result<()> {
        require!(
            self.admin.key() == self.config.admin,
            DexiError::NotAdmin
        );
        require!(
            self.contest.status == ContestStatus::Open,
            DexiError::ContestNotOpen
        );
        require!(
            player_mints.len() <= 256,
            DexiError::ArithmeticError
        );
        require!(
            remaining_accounts.len() >= player_mints.len(),
            DexiError::ArithmeticError
        );

        let contest_key = self.contest.key();
        let rent = self.rent.minimum_balance(TOKEN_ACCOUNT_SIZE);

        let mut accounts_iter = remaining_accounts.iter();
        for mint in player_mints.iter() {
            let vault = anchor_spl::associated_token::get_associated_token_address(&contest_key, mint);
            let vault_info = next_account_info(&mut accounts_iter)?;
            require!(vault_info.key() == vault, DexiError::InvalidMint);

            if vault_info.lamports() < rent {
                let ata_ix = anchor_lang::solana_program::instruction::Instruction {
                    program_id: self.associated_token_program.key(),
                    accounts: vec![
                        AccountMeta::new(self.admin.key(), true),
                        AccountMeta::new(vault, false),
                        AccountMeta::new_readonly(contest_key, false),
                        AccountMeta::new_readonly(*mint, false),
                        AccountMeta::new_readonly(anchor_lang::solana_program::system_program::ID, false),
                        AccountMeta::new_readonly(anchor_spl::token::ID, false),
                    ],
                    data: vec![],
                };
                anchor_lang::solana_program::program::invoke(
                    &ata_ix,
                    &[
                        self.admin.to_account_info(),
                        self.system_program.to_account_info(),
                        self.token_program.to_account_info(),
                        self.associated_token_program.to_account_info(),
                    ],
                )?;
            }
        }

        Ok(())
    }
}