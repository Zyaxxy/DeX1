# Football Scoring Rules

## Athlete Roles

Each athlete token is assigned one of four roles at pool creation:

| Role | Label |
|------|-------|
| Goalkeeper | GK |
| Defender | DEF |
| Midfielder | MID |
| Forward | FWD |

## Points

Scoring is based on the athlete's role and their real-world stat event:

### Goals

| Role | Points per Goal |
|------|----------------|
| Forward (FWD) | +10 |
| Midfielder (MID) | +20 |
| Defender (DEF) | +30 |
| Goalkeeper (GK) | +40 |

### Saves (Goalkeeper only)

| Event | Points |
|-------|--------|
| Save | +5 |

### Assist (Any role)

| Event | Points |
|-------|--------|
| Assist | +5 |

### Clean Sheet

Bonus for playing entire match without conceding:

| Role | Points |
|------|--------|
| Goalkeeper (GK) | +10 |
| Defender (DEF) | +10 |

## Lineup Constraints

11 athletes per entry:
- **1 GK** (required)
- **2 DEF** (required)
- **2 MID** (required)
- **2 FWD** (required)
- **4 FLEX** (any role)

## User Total Score

```
user_total_score = Σ(athlete_points) for all 11 athletes in lineup
```

Where `athlete_points` is the sum of all scoring events they accumulated during the match.

## Implementation — Off-Chain Scoring

The MVP does **not** store scores or rankings on-chain. The flow is:

1. Keeper fetches match stats from a sports data API (e.g., Sportradar, Opta)
2. Keeper computes each athlete's total points using the rules above
3. Keeper computes each user's total score by summing their 11 athletes' points
4. Backend computes final rankings and the exact USDC payout for each winner
5. When a user wants to claim their prize, the keeper co-signs the `claim_reward` transaction with the exact USDC `amount` they won
6. The program validates the keeper signature and pays out — it does not verify the score or payout amount itself

This means the keeper is a trusted party for the MVP. Future versions should move to a trustless Merkle tree verification system.
