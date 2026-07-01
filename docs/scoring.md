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

## Implementation Details

- Keeper fetches match stats from a sports data API (e.g., Sportradar, Opta)
- Keeper computes each athlete's total points using the rules above
- Keeper computes each user's total score by summing their 11 athletes' points
- Keeper calls `set_scores` on the `Contest` account to write scores to each `UserEntry`
- No on-chain oracle reads needed for MVP scoring; Switchboard integration is future scope
