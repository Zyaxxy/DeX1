# System Architecture

## Program Layout

```
programs/dexi/
└── src/
    ├── lib.rs                 -- Program ID, instruction dispatch
    ├── instructions.rs        -- Module root, re-exports all instruction modules
    ├── constants.rs           -- PDA seeds, constants
    ├── error.rs               -- Error codes (incl. CurveError conversion)
    ├── state.rs               -- Account structs (InitSpace derives)
    └── instructions/
        ├── initialize.rs      -- AdminConfig creation
        ├── market/            -- AMM pool instructions
        │   ├── mod.rs
        │   ├── create_pool.rs -- AthletePool creation
        │   ├── update_pool.rs -- Update pool metadata
        │   ├── buy.rs         -- USDC → athlete tokens (constant-product-curve)
        │   ├── sell.rs        -- Athlete tokens → USDC (constant-product-curve)
        │   └── process_entry_mint.rs -- Contest vault swap/burn
        ├── create_contest.rs  -- Contest creation
        ├── enter_contest.rs   -- Lineup submission
        ├── lock_contest.rs    -- Lock contest at start_time
        ├── set_scores.rs      -- Keeper score posting
        ├── settle_contest.rs  -- Finalize prize pool
        └── claim_reward.rs    -- Prize claim
```

## Account Model

```
AdminConfig (1 global)
├── admin: Pubkey
├── usdc_mint: Pubkey
├── swap_fee_bps: u16
└── treasury: Pubkey

AthletePool (1 per athlete)
├── mint: Pubkey
├── bump: u8
├── token_vault: Pubkey
├── usdc_vault: Pubkey
├── token_reserve: u64
├── usdc_reserve: u64
├── k: u128                 -- constant product
├── role: AthleteRole       -- GK | DEF | MID | FWD
├── name: String
└── enabled: bool

Contest (1 per tournament)
├── id: u64
├── admin: Pubkey
├── bump: u8
├── start_time: i64
├── status: ContestStatus   -- Created | Open | Locked | Settled
├── entry_count: u64
├── prize_pool: u64
├── winner_count: u8
├── prize_split: [u16; 10]  -- e.g., [5000, 3000, 2000, 0, ...]
├── escrow_vault: Pubkey
└── settled: bool

UserEntry (1 per user per contest)
├── user: Pubkey
├── contest: Pubkey
├── athletes: [Pubkey; 11]
├── score: i64
├── rank: u32
└── claimed: bool
```

## CPMM Math

Constant product formula using the [`constant-product-curve`](https://github.com/deanmlittle/constant-product-curve.git) crate:

```
token_reserve * usdc_reserve = k
```

**Buy (USDC in → tokens out):** `LiquidityPair::Y` swap (deposit Y/USDC, withdraw X/token)

**Sell (tokens in → USDC out):** `LiquidityPair::X` swap (deposit X/token, withdraw Y/USDC)

Swap fees are handled internally by the curve and accrue in pool reserves, creating excess value beyond `k` that compounds over time.

## Entry → Prize Pool Mechanics

1. User enters: 11 tokens transferred to contest vault per athlete
2. At `lock_contest`, keeper calls `process_entry_mint`:
   - Swap 90% of each token type via its CPMM → USDC to contest escrow
   - Burn the remaining 10% of tokens
3. Burn reduces token supply, increasing price for remaining holders
4. `settle_contest` captures `escrow_vault` balance as `prize_pool`

## Prize Distribution

On `claim_reward`:
1. Program reads `UserEntry.score` and `UserEntry.rank`
2. If rank ≤ `winner_count`, calculate payout from `prize_split[rank]` × `prize_pool` / 10000
3. Transfer USDC from `escrow_vault` to user
4. Mark `UserEntry.claimed = true`

## Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Solana |
| Program Framework | Anchor 1.0.2 |
| Token Standard | SPL Token (TokenInterface — Token & Token-2022 compatible) |
| AMM Math | [`constant-product-curve`](https://github.com/deanmlittle/constant-product-curve.git) |
| Client SDK | @solana/kit |
| Frontend | Next.js |
| Auth / Wallet | Privy |
| Testing | Mocha + ts-mocha |
| Oracle (future) | Switchboard |
| Sports Data | External API → keeper bot |
