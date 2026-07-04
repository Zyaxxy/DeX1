use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::error::DexiError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(athletes: [Pubkey; LINEUP_SIZE])]
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

        let user_key = self.user.key();
        let contest_key = self.contest.key();

        // Single pass: deduplicate and count mint occurrences, validate full lineup
        let mut unique_mints: Vec<Pubkey> = Vec::with_capacity(LINEUP_SIZE);
        let mut mint_counts: Vec<u8> = Vec::with_capacity(LINEUP_SIZE);

        for &mint in &athletes {
            require!(mint != Pubkey::default(), DexiError::InvalidLineup);

            if let Some(pos) = unique_mints.iter().position(|&m| m == mint) {
                mint_counts[pos] = mint_counts[pos].checked_add(1).ok_or(DexiError::ArithmeticError)?;
            } else {
                unique_mints.push(mint);
                mint_counts.push(1);
            }
        }

        let required_accts = unique_mints.len().checked_mul(4).ok_or(DexiError::ArithmeticError)?;
        require!(
            remaining_accounts.len() >= required_accts,
            DexiError::ArithmeticError
        );

        let mut accounts_iter = remaining_accounts.iter();
        let mut role_counts = [0u8; 4];

        for (i, &mint) in unique_mints.iter().enumerate() {
            let count = mint_counts[i];

            let mint_info = next_account_info(&mut accounts_iter)?;
            require!(mint_info.key() == mint, DexiError::InvalidMint);

            let user_ata = anchor_spl::associated_token::get_associated_token_address(&user_key, &mint);
            let contest_vault = anchor_spl::associated_token::get_associated_token_address(&contest_key, &mint);

            let user_ata_info = next_account_info(&mut accounts_iter)?;
            let vault_info = next_account_info(&mut accounts_iter)?;

            require!(user_ata_info.key() == user_ata, DexiError::InvalidMint);
            require!(vault_info.key() == contest_vault, DexiError::InvalidMint);

            let user_ata_data = Account::<TokenAccount>::try_from(user_ata_info)?;
            require!(user_ata_data.owner == user_key, DexiError::InvalidMint);
            require!(user_ata_data.mint == mint, DexiError::InvalidMint);

            let required_amount = ENTRY_TOKEN_AMOUNT
                .checked_mul(count as u64)
                .ok_or(DexiError::ArithmeticError)?;
            require!(
                user_ata_data.amount >= required_amount,
                DexiError::ArithmeticError
            );

            let pool_pda = Pubkey::find_program_address(
                &[POOL_SEED, mint.as_ref()],
                &crate::ID,
            ).0;

            let pool_info = next_account_info(&mut accounts_iter)?;
            require!(pool_info.key() == pool_pda, DexiError::InvalidMint);

            let pool = Account::<AthletePool>::try_from(pool_info)?;
            require!(pool.mint == mint, DexiError::InvalidMint);
            require!(pool.enabled, DexiError::PoolDisabled);

            let role_idx = match pool.role {
                AthleteRole::GK => 0,
                AthleteRole::DEF => 1,
                AthleteRole::MID => 2,
                AthleteRole::FWD => 3,
            };
            role_counts[role_idx] = role_counts[role_idx]
                .checked_add(count)
                .ok_or(DexiError::ArithmeticError)?;

            token::transfer(
                CpiContext::new(
                    self.token_program.key(),
                    Transfer {
                        from: user_ata_info.to_account_info(),
                        to: vault_info.to_account_info(),
                        authority: self.user.to_account_info(),
                    },
                ),
                required_amount,
            )?;
        }

        require!(
            role_counts[0] == REQUIRED_GK
                && role_counts[1] >= REQUIRED_DEF
                && role_counts[2] >= REQUIRED_MID
                && role_counts[3] >= REQUIRED_FWD,
            DexiError::InvalidLineup
        );

        self.entry.set_inner(UserEntry {
            user: user_key,
            contest: contest_key,
            athletes,
            score: 0,
            rank: 0,
            claimed: false,
            is_complete: true,
            gk_count: role_counts[0],
            def_count: role_counts[1],
            mid_count: role_counts[2],
            fwd_count: role_counts[3],
        });

        self.contest.entry_count = self.contest
            .entry_count
            .checked_add(1)
            .ok_or(DexiError::ArithmeticError)?;

        Ok(())
    }
}
