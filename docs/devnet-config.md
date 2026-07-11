# Devnet Configuration

## Program
- **Program ID**: `DVhT84igqfyaKaaFDfmjdZGUTNwyoCPQetmVdV5NdTbU`
- **Config PDA**: `HkRURNVZq2i6rzQtzFFQVaJnusgDWK7HEEoFZ1WSt5cR` (seed: `admin`)

## Tokens
- **USDC Mint**: `E75horRbsyTyiA72G1GKxV8JspTU6Lyz82CSy5ptWqgs`
- **Decimals**: 6

## Accounts
- **Admin**: `FsHawHBmgvn5uGZHDWt2NQMbpFGFnCqiC4Knmw31NCrr`
- **Keeper**: `6gUa3Yreg3rgt6PoXkm6CL6TGBbTrdxeeGkeZZoeEbMm`
- **Treasury**: `FsHawHBmgvn5uGZHDWt2NQMbpFGFnCqiC4Knmw31NCrr`

## RPC

- **Solana**: `https://api.devnet.solana.com`

## Setup Commands

```bash
# Create USDC ATA
spl-token create-account E75horRbsyTyiA72G1GKxV8JspTU6Lyz82CSy5ptWqgs --url devnet

# Mint USDC
spl-token mint E75horRbsyTyiA72G1GKxV8JspTU6Lyz82CSy5ptWqgs 1000 --url devnet
```