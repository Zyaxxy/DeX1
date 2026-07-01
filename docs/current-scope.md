# Current Scope — MVP

## Overview

The MVP implements a self-contained fantasy football platform on Solana. A single Anchor program manages:

- In-program CPMM for buying/selling athlete tokens
- Contest creation with time-locked entry windows
- Lineup submission with role-based constraints
- Token burn + swap-to-USDC prize pool mechanics
- Keeper-driven scoring and prize distribution

## Architecture

- **Program**: Single Anchor program (`dexi`)
- **Tokens**: SPL Token (via `TokenInterface` — supports both Token and Token-2022)
- **Pricing**: [`constant-product-curve`](https://github.com/deanmlittle/constant-product-curve.git) AMM crate
- **Oracle**: Switchboard Oracle + keeper bot for stats
- **Wallet**: Privy embedded wallet
- **Sport**: Football (soccer)
- **Testing**: Mocha + ts-mocha

## State Accounts

| Account | Purpose |
|---------|---------|
| `AdminConfig` | Global authority, USDC mint, swap fee config, treasury |
| `AthletePool` | CPMM reserves, mint, vaults, role, name |
| `Contest` | Tournament state, timers, escrow, entry count, prize split |
| `UserEntry` | User's 11-athlete lineup, score, rank, claim status |

## Instructions

| Instruction | Module | Caller | Action |
|-------------|--------|--------|--------|
| `initialize` | `initialize.rs` | Admin | Create `AdminConfig` |
| `create_pool` | `market/` | Admin | Init CPMM pool for an athlete |
| `update_pool` | `market/` | Admin | Update pool metadata (role, etc.) |
| `buy` | `market/` | User | USDC → athlete tokens via CPMM |
| `sell` | `market/` | User | Athlete tokens → USDC via CPMM |
| `create_contest` | `create_contest.rs` | Admin | Create contest with start time |
| `enter_contest` | `enter_contest.rs` | User | Submit 11 tokens to entry vault |
| `lock_contest` | `lock_contest.rs` | Keeper | Lock contest, prevent further entries |
| `process_entry_mint` | `market/` | Keeper | Swap 90% of vault tokens → USDC, burn 10% |
| `set_scores` | `set_scores.rs` | Keeper | Write scores to each `UserEntry` |
| `settle_contest` | `settle_contest.rs` | Keeper | Finalize prize pool from escrow |
| `claim_reward` | `claim_reward.rs` | User | Claim USDC prize from escrow |

## Contest Flow

```
┌─────────────┐    ┌───────────────┐    ┌──────────────┐
│ ENTRY PHASE │    │ LOCK PHASE    │    │ SETTLEMENT   │
│             │    │               │    │              │
│ Users enter │    │ Clock hits    │    │ Keeper posts │
│ lineups via │───▶│ start_time    │───▶│ scores to    │
│ enter_cont. │    │               │    │ UserEntry    │
│             │    │ lock_contest  │    │              │
│ Tokens go   │    │               │    │ settle_cont  │
│ to vault    │    │ Keeper swaps  │    │ finalizes    │
│             │    │ 90%→USDC via  │    │ prize pool   │
│             │    │ process_entr. │    │              │
│             │    │               │    │ Top N claim  │
│             │    │ Burn 10%      │    │ proportional │
└─────────────┘    └───────────────┘    └──────┬───────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │ CLAIM PHASE  │
                                         │              │
                                         │ User calls   │
                                         │ claim_reward │
                                         │              │
                                         │ Program reads│
                                         │ UserEntry    │
                                         │ score, rank  │
                                         │              │
                                         │ Pays USDC    │
                                         │ from escrow  │
                                         └──────────────┘
```

## Prize Distribution

Top N winners split the Tournament Escrow USDC. N and split ratios are configurable per contest (stored in `Contest` account).

## Lineup Constraints

11 athletes per entry, with:
- **Required**: 1 GK, 2 DEF, 2 MID, 2 FWD
- **Flex**: 4 additional (any role)
- Total: 11

## Implementation Order

1. Scaffold: state structs, constants, errors
2. CPMM: `create_pool`, `buy`, `sell` (in `instructions/market/`)
3. Contest: `create_contest`, `enter_contest`
4. Lock: `lock_contest`, `process_entry_mint` (swap + burn)
5. Settlement: `set_scores`, `settle_contest`, `claim_reward`
6. Keeper: off-chain TypeScript bot
7. Tests: Mocha/TypeScript integration tests
8. Frontend: Next.js + Privy + `@solana/kit`
