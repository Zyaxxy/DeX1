pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("A5PqjrLDne1y5iskNFxNhSpC2w1regprbaKZPTxAtAJS");

#[program]
pub mod dexi {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, swap_fee_bps: u16, treasury: Pubkey, keeper: Pubkey) -> Result<()> {
        ctx.accounts.init(swap_fee_bps, treasury, keeper)
    }

    pub fn create_pool(
        ctx: Context<CreatePool>,
        name: String,
        role: AthleteRole,
    ) -> Result<()> {
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

    pub fn create_contest(
        ctx: Context<CreateContest>,
        id: u64,
        start_time: i64,
        winner_count: u8,
        prize_split: Vec<u16>,
    ) -> Result<()> {
        ctx.accounts.init(id, start_time, winner_count, prize_split)
    }

    pub fn enter_contest<'a>(
        ctx: Context<'a, EnterContest<'a>>,
        athletes: [Pubkey; 11],
    ) -> Result<()> {
        ctx.accounts
            .enter(athletes, &ctx.bumps, ctx.remaining_accounts)
    }

    pub fn lock_contest(ctx: Context<LockContest>) -> Result<()> {
        ctx.accounts.lock()
    }

    pub fn process_entry_mint(ctx: Context<ProcessEntryMint>) -> Result<()> {
        ctx.accounts.process(&ctx.bumps)
    }

    pub fn set_scores(ctx: Context<SetScores>, score: i64) -> Result<()> {
        ctx.accounts.set(score)
    }

    pub fn settle_contest(ctx: Context<SettleContest>) -> Result<()> {
        ctx.accounts.settle()
    }

    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        ctx.accounts.claim()
    }

    pub fn calculate_rankings<'a>(
        ctx: Context<'a, CalculateRankings<'a>>,
    ) -> Result<()> {
        ctx.accounts.calculate(ctx.remaining_accounts)
    }
}
