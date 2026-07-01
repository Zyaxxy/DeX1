use anchor_lang::prelude::*;

#[constant]
pub const SEED: &str = "anchor";

pub const ADMIN_SEED: &[u8] = b"admin";
pub const POOL_SEED: &[u8] = b"pool";
pub const CONTEST_SEED: &[u8] = b"contest";
pub const ENTRY_SEED: &[u8] = b"entry";

pub const BASIS_POINTS: u16 = 10000;
pub const MAX_PRIZE_SPLIT: usize = 10;
pub const MAX_NAME_LEN: usize = 32;
pub const SWAP_BURN_PCT: u64 = 90;
pub const BURN_PCT: u64 = 10;
pub const LINEUP_SIZE: usize = 11;

pub const REQUIRED_GK: u8 = 1;
pub const REQUIRED_DEF: u8 = 2;
pub const REQUIRED_MID: u8 = 2;
pub const REQUIRED_FWD: u8 = 2;
