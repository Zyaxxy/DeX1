# Dexi Frontend App

This directory contains the Next.js web application for Dexi, a decentralized fantasy sports platform on Solana.

## Tech Stack
- **Framework**: Next.js (using App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4, shadcn/ui, Framer Motion
- **Solana Connection**: `@solana/wallet-adapter-react` (Phantom/Solflare) + `@solana/kit`
- **Database**: Neon PostgreSQL (via `@neondatabase/serverless` SQL client)
- **Design System**: Sleek modern design system tailored to sports trading analytics

## Getting Started

### 1. Environment Setup
Create a `.env` file in this directory based on the `.env.example` file:
```bash
cp .env.example .env
```

Fill in the appropriate configuration keys:
- **`NEXT_PUBLIC_CLUSTER`**: Set to `devnet` (or `localnet` for local testing).
- **`RPC_URL`**: Solana RPC endpoint URL.
- **`ADMIN_PASSWORD`**: Set a password for accessing the `/admin` portal.
- **`ADMIN_PRIVATE_KEY`**: Private key (JSON array format) of the admin wallet authorized to initialize and manage athlete pools.
- **`KEEPER_PRIVATE_KEY`**: Private key of the keeper bot authorized to lock/settle contests.
- **`TXLINE_JWT` & `TXLINE_API_TOKEN`**: Credentials for the TxLINE Sports API to fetch real-world World Cup match schedules and scores.
- **`DATABASE_URL`**: Neon PostgreSQL connection URI.
- **`CRON_SECRET`**: Secure token to authenticate keeper automated cron triggers.

### 2. Install Dependencies
Run the workspace install from the repository root:
```bash
pnpm install
```

### 3. Run Development Server
Start the frontend locally:
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## Key Routes & Directories
- `src/app/`: Next.js pages and layouts.
  - `(app)/admin/`: Admin config panel (create/update pools, update global mint/fee config).
  - `(app)/contest/[id]/`: Contest drafting lineup page & real-time leaderboard/settlement.
  - `(app)/faucet/`: Devnet USDC faucet for user onboarding.
- `src/components/`: Reusable Tailwind components (cards, layout shell, tables).
- `src/solana/`: Client configurations, provider wrappers, and helper scripts for program interactions.
- `src/data/`: Database utilities and SQL queries.
