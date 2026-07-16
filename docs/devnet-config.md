# Devnet Configuration

## Program
- **Program ID**: `HLqcxyy9DrVH7DJ2NqTza8Vq6GWB4aUuUSjFWdq5EAmt`
- **Config PDA**: `HxpNdeFQtaL3EVC2V966KCBEZpE67HcQciRjiEfxBxso` (seed: `admin`)

## Tokens
- **USDC Mint**: `9Y27Cm2eWZ1H6KzMss5Py4BhRPBMYKCssEoWBp2MunEP`
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
- USDC ATA: `Aoq3ePZZg72RUwiMN6DRG8vHtwa3tXCBhvC8HjWD63bq`
- USDC Balance: 99,991 USDC
