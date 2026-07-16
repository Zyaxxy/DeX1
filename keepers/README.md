# Dexi Keeper Bot

The keeper bot is a TypeScript automation service that manages the lifecycle of decentralized fantasy contests and handles match-data ingestion from the TxLINE Sports API.

## Functions & Lifecycle Control
The keeper bot runs continuously and monitors both on-chain contests and off-chain fixtures to orchestrate:
1. **Locking Contests**: Once the fixture's start time passes, the keeper calls `lock_contest` to transition the contest status from `Open` to `Locked`, preventing further lineup entries.
2. **Liquidating Athlete Tokens (Swap & Burn)**: The keeper iterates over the staked athlete tokens in the contest vault, calling `process_entry_mint` to swap 90% into USDC via the CPMM pool and burn the remaining 10%.
3. **Fetching Live Match Updates**: The keeper polls the TxLINE Sports API snapshot endpoint (`GET /api/scores/snapshot/{fixtureId}`) to calculate real-time fantasy score updates and user rankings.
4. **Settle Contests**: Once the match is completed (TxLINE status `'F'`), the keeper calls `settle_contest` to finalize the USDC prize pool.
5. **Reward Co-signing**: The keeper exposes/calculates user rankings off-chain and co-signs `claim_reward` transactions to authorize payouts.

## Setup Instructions

### 1. Environment Configuration
Create a `.env` file in this directory based on the `.env.example` file:
```bash
cp .env.example .env
```

Ensure the following variables are filled out:
- **`RPC_URL`**: Solana RPC endpoint URL (e.g. `https://api.devnet.solana.com`).
- **`KEEPER_PRIVATE_KEY`**: Private key of the keeper keypair (e.g., base58 string).
- **`TXLINE_JWT` & `TXLINE_API_TOKEN`**: Sports API credentials for live scoring.
- **`TXLINE_BASE_URL`**: Target TxLINE endpoint (defaults to `https://txline-dev.txodds.com`).

### 2. Run commands

Install workspace dependencies if not done already, then run:

```bash
# Run the keeper bot in development auto-reload mode
pnpm dev

# Start the keeper bot in production mode
pnpm start
```
