use anchor_lang::prelude::*;
use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum AthleteRole {
    GK,
    DEF,
    MID,
    FWD,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum ContestStatus {
    Open,
    Locked,
    Settled,
}

#[account]
#[derive(InitSpace)]
pub struct AdminConfig {
    pub admin: Pubkey,
    pub keeper: Pubkey,
    pub usdc_mint: Pubkey,
    pub swap_fee_bps: u16,
    pub treasury: Pubkey,
}

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
    pub prize_split: [u16; MAX_PRIZE_SPLIT],
    pub escrow_vault: Pubkey,
    pub settled: bool,
}

#[account]
#[derive(InitSpace)]
pub struct UserEntry {
    pub user: Pubkey,
    pub contest: Pubkey,
    pub athletes: [Pubkey; LINEUP_SIZE],
    pub score: i64,
    pub rank: u32,
    pub claimed: bool,
    pub is_complete: bool,
    pub gk_count: u8,
    pub def_count: u8,
    pub mid_count: u8,
    pub fwd_count: u8,
}
