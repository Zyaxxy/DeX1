// ── PDA seeds ─────────────────────────────────────────────────────────────────
pub const ADMIN_SEED: &[u8] = b"admin";
pub const POOL_SEED: &[u8] = b"pool";
pub const CONTEST_SEED: &[u8] = b"contest";
pub const ENTRY_SEED: &[u8] = b"entry";

// ── Fee / math ─────────────────────────────────────────────────────────────────
/// 10 000 basis points = 100%
pub const BASIS_POINTS: u16 = 10_000;

// ── Pool / token burn splits ───────────────────────────────────────────────────
/// 90% of deposited athlete tokens are swapped back to USDC for the prize pool.
pub const SWAP_BURN_PCT: u64 = 90;

// ── Contest limits ─────────────────────────────────────────────────────────────
pub const MAX_PRIZE_SPLIT: usize = 10;
/// Max byte-length for athlete / pool names (must match `#[max_len(32)]` in state).
pub const MAX_NAME_LEN: usize = 32;
/// Max byte-length for contest display names (match title e.g. "Germany vs France - QF").
pub const MAX_CONTEST_NAME_LEN: usize = 64;
/// Max byte-length for TxLINE fixture IDs.
pub const MAX_FIXTURE_ID_LEN: usize = 32;

// ── Lineup composition rules ───────────────────────────────────────────────────
pub const LINEUP_SIZE: usize = 11;
pub const REQUIRED_GK: u8 = 1;
pub const REQUIRED_DEF: u8 = 2;
pub const REQUIRED_MID: u8 = 2;
pub const REQUIRED_FWD: u8 = 2;

// ── Entry staking ──────────────────────────────────────────────────────────────
/// Each athlete slot requires exactly 1 token to be staked (1 token = 10^6 raw units).
pub const ENTRY_TOKEN_AMOUNT: u64 = 1_000_000;
