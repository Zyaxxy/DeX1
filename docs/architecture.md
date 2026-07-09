# System Architecture

## Program Layout

```
programs/dexi/
└── src/
    ├── lib.rs                 -- Program ID, instruction dispatch (11 instructions)
    ├── instructions.rs        -- Module root, re-exports all instruction modules
    ├── constants.rs           -- PDA seeds, lineup rules, fee constants
    ├── error.rs               -- DexiError enum (+ CurveError conversion)
    ├── state.rs               -- Account structs (InitSpace derives)
    └── instructions/
        ├── initialize.rs      -- AdminConfig creation
        ├── market/            -- CPMM pool instructions
        │   ├── mod.rs
        │   ├── create_pool.rs -- AthletePool + vaults
        │   ├── update_pool.rs -- Rename/disable/enable pools
        │   ├── buy.rs         -- USDC → athlete tokens (constant-product-curve)
        │   ├── sell.rs        -- Athlete tokens → USDC (constant-product-curve)
        │   └── process_entry_mint.rs -- Contest vault swap-to-USDC + burn
        ├── create_contest.rs  -- Contest + per-athlete vault ATAs + Address Lookup Table
        ├── enter_contest.rs   -- Single-step: validate 11-athlete lineup + stake tokens
        ├── lock_contest.rs    -- Lock contest (Open → Locked)
        ├── settle_contest.rs  -- Finalize prize pool from escrow (Locked → Settled)
        └── claim_reward.rs    -- USDC prize claim (keeper co-signs)
```

## Account Model

```
AdminConfig (1 global, PDA seed = "admin")
├── admin: Pubkey
├── keeper: Pubkey              -- Authorized keeper
├── usdc_mint: Pubkey
├── swap_fee_bps: u16           -- Capped at 10% (1000 bps)
└── treasury: Pubkey

AthletePool (1 per athlete, PDA seed = "pool" + mint)
├── mint: Pubkey
├── bump: u8
├── role: AthleteRole            -- GK | DEF | MID | FWD
├── name: String                 -- Max 32 bytes
└── enabled: bool

Contest (1 per tournament, PDA seed = "contest" + id (u64 LE))
├── id: u64
├── admin: Pubkey
├── bump: u8
├── start_time: i64              -- Unix timestamp
├── status: ContestStatus        -- Open | Locked | Settled
├── entry_count: u64
├── prize_pool: u64              -- Snapshot of escrow vault balance at settlement
├── winner_count: u8
├── prize_split: [u16; 10]       -- Basis-point shares, e.g. [5000, 3000, 2000, 0, ...]
├── escrow_vault: Pubkey         -- USDC escrow ATA
├── total_mint_count: u8         -- Number of unique athlete mints in this contest
├── processed_mint_count: u8     -- Count of mints processed by process_entry_mint
└── address_lookup_table: Pubkey -- Address Lookup Table for V0 tx compression

UserEntry (1 per user per contest, PDA seed = "entry" + contest + user)
├── user: Pubkey
├── contest: Pubkey
├── athletes: [Pubkey; 11]      -- Full 11-athlete lineup
├── claimed: bool                -- Prize claimed?
└── is_complete: bool            -- Always true (single-step entry)
```

## CPMM Math

Constant product formula using the [`constant-product-curve`](https://github.com/deanmlittle/constant-product-curve.git) crate. Reserves are read directly from vault `.amount` at swap time — the pool stores no reserve or `k` fields.

**Buy (USDC in → tokens out):** `LiquidityPair::Y` swap (deposit Y/USDC, withdraw X/token)

**Sell (tokens in → USDC out):** `LiquidityPair::X` swap (deposit X/token, withdraw Y/USDC)

Swap fees are set per-pool via `AdminConfig.swap_fee_bps` and handled internally by the curve.

## Entry → Prize Pool Mechanics

1. **User enters**: calls `enter_contest` with 11 athlete mint addresses. Program validates role counts (1 GK, 2+ DEF, 2+ MID, 2+ FWD), stakes 1 token per athlete slot from user → contest vault. Single transaction.
2. **Keeper locks**: calls `lock_contest` once `start_time` passes. Contest transitions Open → Locked.
3. **Keeper processes mints**: for each athlete mint, calls `process_entry_mint` which:
   - Swaps 90% of staked tokens via pool CPMM → USDC to contest escrow vault
   - Burns the remaining 10% (reduces supply, increases price for remaining holders)
4. **Keeper settles**: calls `settle_contest` which snapshots escrow balance into `prize_pool`. Contest transitions Locked → Settled.

## Prize Distribution

On `claim_reward`:
1. User requests to claim their prize from the backend.
2. Backend computes score, rank, and payout off-chain, returns a transaction co-signed by the `keeper`.
3. User submits transaction containing the `amount` to claim and the `keeper` signature.
4. Program validates `keeper` signer matches `config.keeper`.
5. Transfers USDC from `escrow_vault` to user's USDC ATA.
6. Marks `UserEntry.claimed = true`.

## Address Lookup Tables

`create_contest` accepts an Address Lookup Table (ALT) address. The ALT is populated with all shared contest accounts (mints, vaults, pool PDAs, program IDs) to enable V0 versioned transactions with compressed account addressing, reducing per-entry transaction size.

## Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Solana (devnet) |
| Program Framework | Anchor 1.0.2 (features: `init-if-needed`) |
| Token Standard | SPL Token via `TokenInterface` (Token & Token-2022 compatible) |
| AMM Math | [`constant-product-curve`](https://github.com/deanmlittle/constant-product-curve.git) |
| Client SDK | `@solana/kit` + `@coral-xyz/anchor` |
| Wallet | `@solana/wallet-adapter-react` (Phantom) + `@solana/wallet-adapter-react-ui` |
| Frontend | Next.js 16.2.9 + React 19 + TypeScript |
| UI / Styling | Tailwind CSS v4, shadcn/ui, Framer Motion, Lucide icons |
| SDK Generation | Codama (from Anchor IDL → `@dexi/sdk`) |
| Keeper Bot | TypeScript (`@coral-xyz/anchor`, `ts-node`) |
| Testing | Mocha + ts-mocha + chai |
| Package Manager | pnpm (workspace monorepo) |
| Rust Toolchain | 1.89.0 |
