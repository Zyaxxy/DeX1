# Dexi — Decentralized Fantasy Sports on Solana


Dexi is a decentralized fantasy sports protocol built on Solana using the Anchor framework. Users trade athlete tokens on constant-product AMMs, draft 11-player lineups, and win USDC prizes — all verified and settled using live TxLINE World Cup data.

**Devnet Program ID:** `HLqcxyy9DrVH7DJ2NqTza8Vq6GWB4aUuUSjFWdq5EAmt`

**Devnet USDC Mint:** `9Y27Cm2eWZ1H6KzMss5Py4BhRPBMYKCssEoWBp2MunEP`

---

## How It Works

1. **Trade athlete tokens** — Buy/sell tokens for real World Cup players via on-chain CPMM bonding curves
2. **Draft your lineup** — Enter fantasy contests with 11-athlete lineups (role-based constraints: GK, DEF, MID, FWD)
3. **TxLINE resolves scores** — The keeper bot fetches live match events (goals, assists, saves) from TxLINE's SSE stream to compute fantasy scores
4. **Win USDC** — Prizes are distributed on-chain from the contest escrow vault

## TxLINE Integration

Dexi uses TxLINE as its primary data source for live match resolution:

- **`/api/scores/snapshot/{fixtureId}?asOf={timestamp}`** — Fetches real-time match events for the 104 World Cup fixtures. The keeper bot polls this endpoint to detect goals, assists, saves, and match completion (`statusSoccerId === 'F'`) for automated contest settlement.
- TxLINE's low-latency SSE stream powers live score display in the frontend, keeping fans engaged with real-time leaderboard updates as matches unfold.

## Features

- **Athlete Token Markets** — Buy/sell athlete tokens via CPMM bonding curves
- **Fantasy Contests** — Draft 11-athlete lineups with role-based constraints (GK, DEF, MID, FWD)
- **Prize Pool Mechanics** — 90% of staked entry tokens swapped to USDC for prizes, 10% burned
- **Keeper Automation** — Off-chain bot monitors TxLINE data and manages contest lifecycle (lock, process mints, settle)
- **Address Lookup Tables** — V0 versioned transactions for compressed contest entry
- **Devnet Deployed** — Fully functional on Solana devnet

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend   │     │  Keeper Bot  │     │  Solana Program │
│  (Next.js)   │     │  (keepers/)  │     │  (programs/)    │
│              │     │              │     │                 │
│ Buy/Sell     │     │ TxLINE API   │     │ 11 instructions │
│ Enter Contest│────▶│ Lock/Process │────▶│ CPMM + Contest  │
│ Claim Reward │     │ Settle       │     │ Lifecycle       │
└──────────────┘     └──────────────┘     └─────────────────┘
                            │
                     ┌──────┘
                     ▼
              ┌──────────────┐
              │   TxLINE     │
              │  Sports API  │
              │ (Live scores)│
              └──────────────┘
```

| Component | Location | Tech |
|-----------|----------|------|
| Solana Program | `programs/dexi/` | Anchor 1.0.2, Rust |
| Frontend | `app/` | Next.js 16, React 19, Tailwind v4 |
| SDK | `packages/dexi-sdk/` | Codama-generated from IDL |
| Keeper Bot | `keepers/` | TypeScript, `@coral-xyz/anchor` |
| Tests | `tests/dexi.ts` | Mocha, ts-mocha, chai |

## Program Accounts

| Account | PDA Seed | Purpose |
|---------|----------|---------|
| `AdminConfig` | `"admin"` | Global config (admin, keeper, USDC mint, fee, treasury) |
| `AthletePool` | `"pool"` + mint | Per-athlete CPMM pool with role, name, enabled flag |
| `Contest` | `"contest"` + id (u64 LE) | Tournament state with prize split, escrow, ALT |
| `UserEntry` | `"entry"` + contest + user | User's 11-athlete lineup and claim status |

## Instructions

| Instruction | Caller | Description |
|-------------|--------|-------------|
| `initialize` | Admin | Create global admin config |
| `update_config` | Admin | Update USDC mint, swap fee, keeper, treasury |
| `create_pool` | Admin | Init athlete pool + vaults |
| `update_pool` | Admin | Rename/disable/enable pool |
| `buy` | User | USDC → athlete tokens (CPMM) |
| `sell` | User | Athlete tokens → USDC (CPMM) |
| `create_contest` | Admin | Create contest with prize split, vaults, ALT |
| `enter_contest` | User | Validate lineup, stake 11 tokens (single tx) |
| `lock_contest` | Keeper | Open → Locked at start_time |
| `process_entry_mint` | Keeper | Swap 90% → USDC, burn 10% per mint |
| `settle_contest` | Keeper | Locked → Settled, snapshot prize pool |
| `claim_reward` | User + Keeper | Claim USDC prize (co-signed) |

## Getting Started

### Prerequisites

- Rust 1.89.0 (`rust-toolchain.toml`)
- Solana CLI
- Anchor 1.0.2
- pnpm (workspace monorepo)

### Environment Setup

Dexi consists of a Next.js web application and an off-chain keeper bot. Both require environment configurations to run:

- **Frontend App**: Refer to [app/README.md](file:///home/utkarsh/Projects/dexi/app/README.md) and [app/.env.example](file:///home/utkarsh/Projects/dexi/app/.env.example) for setup.
- **Keeper Bot**: Refer to [keepers/README.md](file:///home/utkarsh/Projects/dexi/keepers/README.md) and [keepers/.env.example](file:///home/utkarsh/Projects/dexi/keepers/.env.example) for setup.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/architecture.md](docs/architecture.md) | System architecture, program layout, account model |
| [docs/current-scope.md](docs/current-scope.md) | MVP scope — instructions, contest flow, constraints |
| [docs/future-scope.md](docs/future-scope.md) | Planned enhancements (merkle settlement, salary caps, LP program) |
| [docs/scoring.md](docs/scoring.md) | Football scoring rules and formulas |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Product vision, user personas, design principles |
| [docs/devnet-config.md](docs/devnet-config.md) | Devnet addresses, configs, and initialization |