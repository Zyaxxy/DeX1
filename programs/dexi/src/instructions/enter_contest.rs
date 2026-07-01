use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token;
use crate::constants::*;
use crate::error::DexiError;
use crate::state::*;

pub const ENTRY_TOKEN_AMOUNT: u64 = 1;

#[derive(Accounts)]
pub struct EnterContest<'info> {
    pub config: Account<'info, AdminConfig>,
    #[account(mut, seeds = [CONTEST_SEED, &contest.id.to_le_bytes()], bump = contest.bump)]
    pub contest: Account<'info, Contest>,
    #[account(
        init,
        payer = user,
        space = UserEntry::DISCRIMINATOR.len() + UserEntry::INIT_SPACE,
        seeds = [ENTRY_SEED, contest.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub entry: Account<'info, UserEntry>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> EnterContest<'info> {
    pub fn enter(
        &mut self,
        athletes: [Pubkey; LINEUP_SIZE],
        _bumps: &EnterContestBumps,
        remaining_accounts: &'info [AccountInfo<'info>],
    ) -> Result<()> {
        let clock = Clock::get()?;

        require!(
            self.contest.status == ContestStatus::Open,
            DexiError::ContestNotOpen
        );
        require!(
            clock.unix_timestamp < self.contest.start_time,
            DexiError::EntryDeadlinePassed
        );

        let user_info = self.user.to_account_info();
        let contest_info = self.contest.to_account_info();
        let token_program_info = self.token_program.to_account_info();
        let ata_program_info = self.associated_token_program.to_account_info();
        let system_program_info = self.system_program.to_account_info();

        let mut gk_count = 0u8;
        let mut def_count = 0u8;
        let mut mid_count = 0u8;
        let mut fwd_count = 0u8;

        let needed = LINEUP_SIZE * 4;
        require!(remaining_accounts.len() >= needed, DexiError::ArithmeticError);

        for i in 0..LINEUP_SIZE {
            let mint = athletes[i];

            let user_ata_info = &remaining_accounts[i * 4];
            let vault_info = &remaining_accounts[i * 4 + 1];
            let mint_info = &remaining_accounts[i * 4 + 2];
            let pool_info = &remaining_accounts[i * 4 + 3];

            require!(mint_info.key() == mint, DexiError::InvalidMint);

            let user_ata = Account::<TokenAccount>::try_from(user_ata_info)?;
            require!(user_ata.owner == self.user.key(), DexiError::InvalidMint);
            require!(user_ata.mint == mint, DexiError::InvalidMint);
            require!(user_ata.amount >= ENTRY_TOKEN_AMOUNT, DexiError::ArithmeticError);

            let pool = Account::<AthletePool>::try_from(pool_info)?;
            require!(pool.mint == mint, DexiError::InvalidMint);
            require!(pool.enabled, DexiError::PoolDisabled);

            match pool.role {
                AthleteRole::GK => gk_count += 1,
                AthleteRole::DEF => def_count += 1,
                AthleteRole::MID => mid_count += 1,
                AthleteRole::FWD => fwd_count += 1,
            }

            let contest_key = self.contest.key();
            let expected_vault = associated_token::get_associated_token_address(&contest_key, &mint);
            require!(vault_info.key() == expected_vault, DexiError::InvalidMint);

            if vault_info.data_is_empty() {
                let ata_ix = anchor_lang::solana_program::instruction::Instruction {
                    program_id: self.associated_token_program.key(),
                    accounts: vec![
                        AccountMeta::new(self.user.key(), true),
                        AccountMeta::new(vault_info.key(), false),
                        AccountMeta::new_readonly(contest_key, false),
                        AccountMeta::new_readonly(mint, false),
                        AccountMeta::new_readonly(system_program::ID, false),
                        AccountMeta::new_readonly(anchor_spl::token::ID, false),
                    ],
                    data: vec![],
                };
                anchor_lang::solana_program::program::invoke(
                    &ata_ix,
                    &[
                        user_info.clone(),
                        vault_info.clone(),
                        contest_info.clone(),
                        mint_info.clone(),
                        system_program_info.clone(),
                        token_program_info.clone(),
                        ata_program_info.clone(),
                    ],
                )?;
            }

            token::transfer(
                CpiContext::new(
                    self.token_program.key(),
                    Transfer {
                        from: user_ata_info.to_account_info(),
                        to: vault_info.to_account_info(),
                        authority: user_info.clone(),
                    },
                ),
                ENTRY_TOKEN_AMOUNT,
            )?;
        }

        require!(
            gk_count == REQUIRED_GK
                && def_count >= REQUIRED_DEF
                && mid_count >= REQUIRED_MID
                && fwd_count >= REQUIRED_FWD,
            DexiError::InvalidLineup
        );

        let entry = &mut self.entry;
        entry.user = self.user.key();
        entry.contest = self.contest.key();
        entry.athletes = athletes;
        entry.score = 0;
        entry.rank = 0;
        entry.claimed = false;

        let contest = &mut self.contest;
        contest.entry_count = contest.entry_count.checked_add(1).ok_or(DexiError::ArithmeticError)?;

        Ok(())
    }
}
