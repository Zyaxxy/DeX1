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
        ├── initialize_entry.rs-- Lineup init (6 players + token transfer)
        ├── finalize_entry.rs  -- Lineup completion (5 players)
        ├── lock_contest.rs    -- Lock contest at start_time
        ├── settle_contest.rs  -- Finalize prize pool
        └── claim_reward.rs    -- Prize claim
```

## Account Model

```
AdminConfig (1 global)
├── admin: Pubkey
├── keeper: Pubkey          -- Authorized keeper (Phase 0)
├── usdc_mint: Pubkey
├── swap_fee_bps: u16
└── treasury: Pubkey

AthletePool (1 per athlete)
├── mint: Pubkey
├── bump: u8
├── role: AthleteRole       -- GK | DEF | MID | FWD
├── name: String
└── enabled: bool

Contest (1 per tournament)
├── id: u64
├── admin: Pubkey
├── bump: u8
├── start_time: i64
├── status: ContestStatus   -- Open | Locked | Settled (Created removed)
├── entry_count: u64
├── prize_pool: u64
├── winner_count: u8
├── prize_split: [u16; 10]  -- e.g., [5000, 3000, 2000, 0, ...]
├── escrow_vault: Pubkey
├── total_mint_count: u8    -- Number of unique athlete mints
└── processed_mint_count: u8 -- Processed by keeper during lock phase

UserEntry (1 per user per contest)
├── user: Pubkey
├── contest: Pubkey
├── athletes: [Pubkey; 11]
├── claimed: bool
└── is_complete: bool
```

## CPMM Math

Constant product formula using the [`constant-product-curve`](https://github.com/deanmlittle/constant-product-curve.git) crate. Reserves are read directly from vault `.amount` at swap time — the pool stores no reserve or `k` fields.

**Buy (USDC in → tokens out):** `LiquidityPair::Y` swap (deposit Y/USDC, withdraw X/token)

**Sell (tokens in → USDC out):** `LiquidityPair::X` swap (deposit X/token, withdraw Y/USDC)

Swap fees are handled internally by the curve and accrue in vault balances.

## Entry → Prize Pool Mechanics

1. User enters: 11 tokens transferred to contest vault per athlete
2. At `lock_contest`, keeper calls `process_entry_mint`:
   - Swap 90% of each token type via its pool CPMM → USDC to contest escrow
   - Burn the remaining 10% of tokens
3. Burn reduces token supply, increasing price for remaining holders
4. `settle_contest` captures `escrow_vault` balance as `prize_pool`

## Prize Distribution

On `claim_reward`:
1. User requests to claim their prize from the backend.
2. Backend computes their score, rank, and payout amount off-chain, and returns a transaction co-signed by the `keeper`.
3. User submits the transaction to the program containing the `amount` to claim and the `keeper` signature.
4. Program validates that the `keeper` signer matches the authorized `config.keeper`.
5. Transfer USDC from `escrow_vault` to user.
6. Mark `UserEntry.claimed = true`.

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
