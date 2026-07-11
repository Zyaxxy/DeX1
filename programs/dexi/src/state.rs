use anchor_lang::prelude::*;
use crate::constants::*;

// ── Role enum ─────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum AthleteRole {
    GK,
    DEF,
    MID,
    FWD,
}

// ── Contest lifecycle ─────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum ContestStatus {
    Open,
    Locked,
    Settled,
}

// ── Accounts ──────────────────────────────────────────────────────────────────

/// Global program configuration; one per deployment.
#[account]
#[derive(InitSpace)]
pub struct AdminConfig {
    pub admin: Pubkey,
    pub keeper: Pubkey,
    pub usdc_mint: Pubkey,
    pub swap_fee_bps: u16,
    pub treasury: Pubkey,
}

/// On-chain representation of a single tradable athlete token pool.
#[account]
#[derive(InitSpace)]
pub struct AthletePool {
    pub mint: Pubkey,
    pub bump: u8,
    pub role: AthleteRole,
    #[max_len(32)]
    pub name: String,
    pub enabled: bool,
}

/// A fantasy contest created by the admin.
#[account]
#[derive(InitSpace)]
pub struct Contest {
    pub id: u64,
    pub admin: Pubkey,
    pub bump: u8,
    pub start_time: i64,
    pub status: ContestStatus,
    pub entry_count: u64,
    pub prize_pool: u64,
    pub winner_count: u8,
    /// Basis-point share for each prize rank; zeroed slots are unused.
    pub prize_split: [u16; MAX_PRIZE_SPLIT],
    pub escrow_vault: Pubkey,
    /// Total number of athlete mints registered for this contest (set at creation).
    pub total_mint_count: u8,
    /// Number of mints processed by `process_entry_mint` so far.
    /// Must equal `total_mint_count` before the contest can be settled.
    pub processed_mint_count: u8,
    /// The Address Lookup Table containing all shared contest accounts (mints, pools, vaults).
    pub address_lookup_table: Pubkey,
    /// Display name e.g. "Germany vs France - QF"
    #[max_len(MAX_CONTEST_NAME_LEN)]
    pub name: String,
    /// TxLINE fixture ID for match-based scoring
    #[max_len(MAX_FIXTURE_ID_LEN)]
    pub fixture_id: String,
}

/// A single user's lineup entry for a contest.
#[account]
#[derive(InitSpace)]
pub struct UserEntry {
    pub user: Pubkey,
    pub contest: Pubkey,
    pub athletes: [Pubkey; LINEUP_SIZE],
    pub claimed: bool,
    /// True once the full 11-player lineup has been validated and staked.
    pub is_complete: bool,
}
