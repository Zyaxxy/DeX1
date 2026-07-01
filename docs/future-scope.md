# Future Scope — To Be Worked On

Items deferred past MVP.

## Performance-Based Pricing

The current CPMM prices tokens based purely on swap activity. Future versions should add dynamic pricing where athlete performance shifts the price curve:

- Keeper pushes real-world performance data to Switchboard oracle
- Program reads oracle and adjusts pool price via asymmetry (add/remove POL from one side)
- Creates a liquid on-chain asset class backed by real-world stats

## Salary Caps

Lineups must stay under a configurable salary cap. Each athlete has a notional value (derived from their token price), and entering a contest requires the sum of 11 athlete values ≤ cap.

## Token-2022 Delegate Freeze

Instead of physically transferring tokens to an entry vault (which prevents the user from multi-entering the same tokens), use Token-2022 Permanent Delegate extension to freeze (lock) tokens in place. This lets users enter multiple contests with the same tokens simultaneously.

## Multiple Contests Per Matchday

Support multiple concurrent contests (different entry fees, different payout structures) for the same real-world matchday.

## D/ST and Kicker Roles

Expand athlete roles to include defense/special teams and kickers with their own scoring rules.

## Full Merkle Tree Settlement

Replace keeper-driven `set_scores` with an on-chain Merkle root verification system for trustless, permissionless settlement:

- Keeper builds Merkle tree of (wallet, score, payout) leaves
- Only the 32-byte root is posted on-chain
- Users submit their Merkle proof and claim autonomously
- Reduces keeper trust assumptions

## Zero-Score Edge Cases

Handling for contests where no user scores (or all users tie):
- Escrow rollover to next contest
- Proportional refund to all entrants
- Admin sweep

## Angel LP Program

A separate module for Protocol-Owned Liquidity:
- LPs seed master vaults with USDC
- Receive yield from swap fees
- Backstop for token redemptions during volatility

## Algorithmic Arbitrage / MEV Module

Incentivize bots to trade against the pricing curve when real-world data updates, ensuring token prices reflect performance:
- Priority fee rebates
- Gasless arb transactions for qualified keepers

## Multi-Sport Support

Expand beyond football to basketball, cricket, esports, etc. Each sport has its own scoring formula and role set.

## Mainnet Deployment Checklist

- Full security audit
- Wormhole/switchboard mainnet oracles
- Token-2022 migration
- Formal solvency verification
- Gradual admin key decentralization
