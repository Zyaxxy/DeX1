pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("5RjcrhEhspU8YLLjWN7SJ3TRJkoLZW3LnkrCWCNgTDb3");

#[program]
pub mod dexi {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, swap_fee_bps: u16, treasury: Pubkey, keeper: Pubkey) -> Result<()> {
        ctx.accounts.init(swap_fee_bps, treasury, keeper)
    }

    pub fn create_pool(ctx: Context<CreatePool>, name: String, role: AthleteRole) -> Result<()> {
        ctx.accounts.init(name, role, &ctx.bumps)
    }

    pub fn update_pool(
        ctx: Context<UpdatePool>,
        name: Option<String>,
        role: Option<AthleteRole>,
        enabled: Option<bool>,
    ) -> Result<()> {
        ctx.accounts.update(name, role, enabled)
    }

    pub fn buy(ctx: Context<Buy>, usdc_amount: u64) -> Result<()> {
        ctx.accounts.execute(usdc_amount, &ctx.bumps)
    }

    pub fn sell(ctx: Context<Sell>, token_amount: u64) -> Result<()> {
        ctx.accounts.execute(token_amount, &ctx.bumps)
    }

    /// Creates a contest and pre-initialises per-athlete vault ATAs in one transaction.
    ///
    /// `player_mints` — all athlete mint addresses for this contest.
    /// `remaining_accounts` — pairs of `[vault_ata, mint_account_info]` for each mint.
    pub fn create_contest<'a>(
        ctx: Context<'a, CreateContest<'a>>,
        id: u64,
        start_time: i64,
        winner_count: u8,
        prize_split: Vec<u16>,
        player_mints: Vec<Pubkey>,
        address_lookup_table: Pubkey,
    ) -> Result<()> {
        ctx.accounts.init(
            id,
            start_time,
            winner_count,
            prize_split,
            player_mints,
            address_lookup_table,
            &ctx.bumps,
            ctx.remaining_accounts,
        )
    }

    pub fn enter_contest<'a>(
        ctx: Context<'a, EnterContest<'a>>,
        athletes: [Pubkey; LINEUP_SIZE],
    ) -> Result<()> {
        ctx.accounts.enter(athletes, ctx.remaining_accounts)
    }

    pub fn lock_contest(ctx: Context<LockContest>) -> Result<()> {
        ctx.accounts.lock()
    }

    pub fn process_entry_mint(ctx: Context<ProcessEntryMint>) -> Result<()> {
        ctx.accounts.process()
    }

    pub fn settle_contest(ctx: Context<SettleContest>) -> Result<()> {
        ctx.accounts.settle()
    }

    pub fn claim_reward(ctx: Context<ClaimReward>, amount: u64) -> Result<()> {
        ctx.accounts.claim(amount)
    }
}
