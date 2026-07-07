use anchor_lang::prelude::*;
use anchor_spl::associated_token::{self, AssociatedToken, Create};
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::constants::*;
use crate::error::DexiError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateContest<'info> {
    #[account(seeds = [ADMIN_SEED], bump, has_one = admin @ DexiError::NotAdmin)]
    pub config: Account<'info, AdminConfig>,
    #[account(
        init,
        payer = admin,
        space = Contest::DISCRIMINATOR.len() + Contest::INIT_SPACE,
        seeds = [CONTEST_SEED, &id.to_le_bytes()],
        bump,
    )]
    pub contest: Account<'info, Contest>,
    pub usdc_mint: Account<'info, Mint>,
    /// The USDC escrow vault for this contest. Must be pre-created by the admin
    /// with the contest PDA as its authority.
    #[account(
        mut,
        constraint = escrow_vault.owner == contest.key() @ DexiError::InvalidMint,
        constraint = escrow_vault.mint == config.usdc_mint @ DexiError::InvalidMint,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
    /// Required to create per-athlete vault ATAs inline.
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateContest<'info> {
    /// Validates prize split, creates per-athlete vault ATAs, and initialises the Contest account.
    ///
    /// `player_mints` — ordered list of all athlete mint addresses for this contest.
    /// `remaining_accounts` — pairs of `[vault_ata, mint_account_info]` for each entry in
    ///   `player_mints`, in the same order. ATAs are created on-the-fly if they don't exist yet.
    pub fn init(
        &'info mut self,
        id: u64,
        start_time: i64,
        winner_count: u8,
        prize_split: Vec<u16>,
        player_mints: Vec<Pubkey>,
        address_lookup_table: Pubkey,
        bumps: &CreateContestBumps,
        remaining_accounts: &'info [AccountInfo<'info>],
    ) -> Result<()> {
        require!(
            !prize_split.is_empty() && prize_split.len() <= MAX_PRIZE_SPLIT,
            DexiError::InvalidPrizeSplit
        );
        require!(
            winner_count as usize == prize_split.len(),
            DexiError::InvalidPrizeSplit
        );

        let total_bps: u16 = prize_split.iter().sum();
        require!(total_bps <= BASIS_POINTS, DexiError::InvalidPrizeSplit);

        // Each player_mint requires [vault_ata, mint_account_info] in remaining_accounts.
        require!(
            remaining_accounts.len() >= player_mints.len().saturating_mul(2),
            DexiError::ArithmeticError
        );

        // Copy the prize split Vec into the fixed-size array (remaining slots stay 0).
        let mut split_arr = [0u16; MAX_PRIZE_SPLIT];
        split_arr[..prize_split.len()].copy_from_slice(&prize_split);

        let contest_key = self.contest.key();
        let mut accounts_iter = remaining_accounts.iter();

        // Pre-create one ATA vault per athlete mint so that users can stake tokens
        // into them during enter_contest without incurring the ATA-init rent themselves.
        for mint_key in &player_mints {
            let vault_info = next_account_info(&mut accounts_iter)?;
            let mint_info = next_account_info(&mut accounts_iter)?;

            let expected_vault =
                anchor_spl::associated_token::get_associated_token_address(&contest_key, mint_key);
            require!(vault_info.key() == expected_vault, DexiError::InvalidMint);

            // Idempotent: only create if the ATA doesn't already exist.
            if vault_info.lamports() == 0 {
                associated_token::create(CpiContext::new(
                    self.associated_token_program.key(),
                    Create {
                        payer: self.admin.to_account_info(),
                        associated_token: vault_info.to_account_info(),
                        authority: self.contest.to_account_info(),
                        mint: mint_info.to_account_info(),
                        system_program: self.system_program.to_account_info(),
                        token_program: self.token_program.to_account_info(),
                    },
                ))?;
            }
        }

        let total_mint_count = player_mints.len() as u8;

        self.contest.set_inner(Contest {
            id,
            bump: bumps.contest,
            admin: self.admin.key(),
            start_time,
            status: ContestStatus::Open,
            entry_count: 0,
            prize_pool: 0,
            winner_count,
            prize_split: split_arr,
            escrow_vault: self.escrow_vault.key(),
            total_mint_count,
            processed_mint_count: 0,
            address_lookup_table,
        });

        Ok(())
    }
}
