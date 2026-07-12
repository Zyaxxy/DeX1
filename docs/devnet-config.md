# Devnet Configuration

## Program
- **Program ID**: `B9PQhgmdn2TrEMFmMXfaJg7HXCuzzj9QrtxFDEXSMsw2`
- **Config PDA**: `EKXk98TNLYkXvp5bZqNApJJetSpg5o3tcNGU1vJ8Je9f` (seed: `admin`)

## Tokens
- **USDC Mint**: `E75horRbsyTyiA72G1GKxV8JspTU6Lyz82CSy5ptWqgs`
- **Decimals**: 6
- **Mint Authority**: `FsHawHBmgvn5uGZHDWt2NQMbpFGFnCqiC4Knmw31NCrr` (admin)

## Accounts
- **Admin**: `FsHawHBmgvn5uGZHDWt2NQMbpFGFnCqiC4Knmw31NCrr`
- **Keeper**: `6gUa3Yreg3rgt6PoXkm6CL6TGBbTrdxeeGkeZZoeEbMm`
- **Treasury**: `FsHawHBmgvn5uGZHDWt2NQMbpFGFnCqiC4Knmw31NCrr`

## RPC

- **Solana**: `https://api.devnet.solana.com`

## Setup Commands

```bash
# Deploy the program
anchor deploy

# Initialize the program config (after deploy)
# This creates the AdminConfig account at the Config PDA
# Requires admin wallet to sign
```

## Admin Wallet
- Balance: ~12.94 SOL (enough for deploy)
- USDC ATA: `12gHLWSdhiXXLQTfhwHsc5mxfg6c8svNADZZLQkChsn1`
- USDC Balance: 99,991 USDC
