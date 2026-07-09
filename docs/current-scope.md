# Current Scope — MVP

## Overview

The MVP implements a self-contained fantasy football platform on Solana. A single Anchor program manages:

- In-program CPMM for buying/selling athlete tokens
- Contest creation with time-locked entry windows
- Lineup submission with role-based constraints (single-step entry)
- Token burn + swap-to-USDC prize pool mechanics
- Keeper-driven contest lifecycle and prize distribution

## Architecture

- **Program**: Single Anchor 1.0.2 program (`dexi`)
- **Tokens**: SPL Token (via `TokenInterface` — supports both Token and Token-2022)
- **Pricing**: [`constant-product-curve`](https://github.com/deanmlittle/constant-product-curve.git) CPMM crate
- **Wallet**: `@solana/wallet-adapter-react` (Phantom)
- **Contest Txns**: V0 versioned transactions with Address Lookup Tables for compression
- **Sport**: Football (soccer)
- **Keeper**: Off-chain TypeScript bot using `@coral-xyz/anchor`
- **Testing**: Mocha + ts-mocha + chai

## State Accounts

| Account | Purpose |
|---------|---------|
| `AdminConfig` | Global authority, keeper, USDC mint, swap fee config, treasury |
| `AthletePool` | CPMM reserves, mint, vaults, role, name, enabled flag |
| `Contest` | Tournament state, timers, escrow, prize split, ALT address |
| `UserEntry` | User's 11-athlete lineup, claim status |

## Instructions

| # | Instruction | Module | Caller | Action |
|---|-------------|--------|--------|--------|
| 1 | `initialize` | `initialize.rs` | Admin | Create `AdminConfig` with keeper, USDC mint, treasury |
| 2 | `create_pool` | `market/create_pool.rs` | Admin | Init CPMM pool + vaults for an athlete |
| 3 | `update_pool` | `market/update_pool.rs` | Admin | Update pool name, role, enabled flag |
| 4 | `buy` | `market/buy.rs` | User | USDC → athlete tokens via CPMM |
| 5 | `sell` | `market/sell.rs` | User | Athlete tokens → USDC via CPMM |
| 6 | `create_contest` | `create_contest.rs` | Admin | Create contest with start time, prize split, pre-create vault ATAs, ALT |
| 7 | `enter_contest` | `enter_contest.rs` | User | Single-step: validate 11-athlete lineup role counts, stake tokens |
| 8 | `lock_contest` | `lock_contest.rs` | Keeper | Lock contest (Open → Locked) |
| 9 | `process_entry_mint` | `market/process_entry_mint.rs` | Keeper | Per-mint: swap 90% staked tokens → USDC, burn 10% |
| 10 | `settle_contest` | `settle_contest.rs` | Keeper | Finalize prize pool from escrow balance (Locked → Settled) |
| 11 | `claim_reward` | `claim_reward.rs` | User+Keeper | Claim USDC prize (requires keeper co-signature) |

## Contest Flow

```
┌─────────────┐    ┌───────────────────┐    ┌──────────────┐
│ ENTRY PHASE │    │ LOCK PHASE        │    │ SETTLEMENT   │
│             │    │                   │    │              │
│ Users call  │    │ Keeper calls      │    │ Keeper calls │
│ enter_cont  │───▶│ lock_contest      │───▶│ settle_cont  │
│ (single tx) │    │ (after start_time)│    │ to snapshot  │
│             │    │                   │    │ prize_pool   │
│ Validates   │    │ For each mint:    │    │              │
│ lineup      │    │ process_entry_mt │    │ Transitions  │
│ Stakes 11   │    │   swap 90%→USDC  │    │ Locked→Settld│
│ tokens      │    │   burn 10%       │    │              │
└─────────────┘    └───────────────────┘    └──────┬───────┘
                                                    │
                                                    ▼
                                             ┌──────────────┐
                                             │ CLAIM PHASE  │
                                             │              │
                                             │ User calls   │
                                             │ claim_reward │
                                             │ (keeper co-  │
                                             │  signs tx)   │
                                             │              │
                                             │ Pays USDC    │
                                             │ from escrow  │
                                             └──────────────┘
```

## Prize Distribution

Top N winners split the contest escrow USDC. N and split ratios are configurable per contest (stored in `Contest.prize_split` as basis-point array, e.g. `[5000, 3000, 2000, 0, ...]`). Rankings and payouts are computed entirely off-chain by the keeper; the on-chain `claim_reward` merely validates the amount against the keeper's signature.

## Lineup Constraints

11 athletes per entry, with:
- **Required**: 1 GK, 2 DEF, 2 MID, 2 FWD
- **Flex**: 4 additional (any role)
- Total: 11
- Each slot stakes exactly 1 athlete token

## Implementation Order

1. Scaffold: state structs, constants, errors
2. CPMM: `create_pool`, `buy`, `sell` (in `instructions/market/`)
3. Contest: `create_contest`, `enter_contest`
4. Lock: `lock_contest`, `process_entry_mint` (swap + burn)
5. Settlement: `settle_contest`, `claim_reward` (keeper co-sign)
6. Keeper: off-chain TypeScript bot (`keepers/keeper.ts`)
7. Tests: Mocha/TypeScript integration tests (`tests/dexi.ts`)
8. Frontend: Next.js + `@solana/wallet-adapter-react` + `@solana/kit`
