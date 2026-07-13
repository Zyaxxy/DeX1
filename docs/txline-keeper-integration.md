# TxLINE and Keeper Integration

This document details how the **TxLINE Sports API**, the **Keeper Bot**, the **Solana Dexi Program**, and the **User** interact throughout the lifecycle of a decentralized fantasy sports contest.

## 1. System Flow Sequence

The sequence below outlines the chronological steps of the fantasy contest lifecycle, from entry to live event resolution via **TxLINE** and final prize settlement.

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Program as Solana Program (dexi)
    participant Keeper as Keeper Bot (keepers/keeper.ts)
    participant TxLINE as TxLINE Sports API

    Note over User, Program: Phase 1: Entry Phase
    User->>Program: enter_contest(Lineup of 11 Athletes)
    Note over Program: Validates lineup constraints<br/>Stakes 11 athlete tokens into escrow

    Note over Keeper, TxLINE: Phase 2: Lock Phase
    Keeper->>Program: Polling / Account Change Subscription
    Note over Keeper: Detects contest start_time has passed
    Keeper->>Program: lock_contest()
    Note over Program: Changes status to Locked

    Note over Keeper, Program: Phase 3: Liquidation (Swap & Burn)
    loop For each athlete mint in contest escrow
        Keeper->>Program: process_entry_mint(mint)
        Note over Program: Swaps 90% via CPMM to USDC (escrow)<br/>Burns 10% of athlete tokens
    end

    Note over Keeper, TxLINE: Phase 4: Live Event Scoring
    loop Periodically during the match
        Keeper->>TxLINE: GET /api/scores/snapshot/{fixtureId}
        TxLINE-->>Keeper: Return match events (goals, assists, saves, status)
        Keeper->>Keeper: Calculate live athlete points & user rankings
    end

    Note over Keeper, TxLINE: Phase 5: Contest Settlement
    Keeper->>TxLINE: GET /api/scores/snapshot/{fixtureId}
    TxLINE-->>Keeper: Match status is Finished ('F')
    Keeper->>Program: settle_contest()
    Note over Program: Snapshots final USDC balance to prize_pool<br/>Changes status to Settled

    Note over User, Keeper: Phase 6: Reward Claiming
    User->>Keeper: Request reward (off-chain)
    Keeper->>Keeper: Compute ranks & payouts
    Keeper-->>User: Return signature & payout USDC amount
    User->>Program: claim_reward(amount, keeper_signature)
    Note over Program: Verifies keeper signature matches AdminConfig.keeper
    Program->>User: Transfer USDC prize from escrow to User ATA
    Note over Program: Marks UserEntry as claimed
```

---

## 2. Component Architecture Graph

This diagram shows the structural relationships and communication channels between the components.

```mermaid
graph TD
    %% Styling
    classDef primary fill:#4f46e5,stroke:#312e81,stroke-width:2px,color:#fff;
    classDef secondary fill:#0d9488,stroke:#115e59,stroke-width:2px,color:#fff;
    classDef program fill:#b91c1c,stroke:#7f1d1d,stroke-width:2px,color:#fff;
    classDef external fill:#d97706,stroke:#7c2d12,stroke-width:2px,color:#fff;

    %% Nodes
    User["User (Web App UI)"]:::primary
    TxLINE["TxLINE Sports API<br/>(Live Match Data)"]:::external
    Keeper["Keeper Bot<br/>(TS Automation)"]:::secondary
    Program["Solana Dexi Program<br/>(Anchor/SVM)"]:::program

    %% Relationships
    User -- "1. Draft Lineup & Stake Tokens" --> Program
    Keeper -- "2. Monitor & Lock Contest" --> Program
    Keeper -- "3. Query Real-Time Events" --> TxLINE
    Keeper -- "4. Liquidate Staked Tokens (90/10 Swap & Burn)" --> Program
    Keeper -- "5. Detect Match End & Settle Contest" --> Program
    User -- "6. Request Payout Ranks" --> Keeper
    Keeper -- "7. Sign Payout Amount" --> User
    User -- "8. Claim USDC with Signature" --> Program
```

### Relevant Code & Resources
- [keepers/keeper.ts](file:///home/utkarsh/Projects/dexi/keepers/keeper.ts) — The TypeScript keeper bot that orchestrates TxLINE data collection and transaction execution.
- [programs/dexi/src/instructions/lock_contest.rs](file:///home/utkarsh/Projects/dexi/programs/dexi/src/instructions/lock_contest.rs) — Anchor instruction to transition contests to `Locked`.
- [programs/dexi/src/instructions/market/process_entry_mint.rs](file:///home/utkarsh/Projects/dexi/programs/dexi/src/instructions/market/process_entry_mint.rs) — Handles swapping entry tokens to USDC and burning the rest.
- [programs/dexi/src/instructions/settle_contest.rs](file:///home/utkarsh/Projects/dexi/programs/dexi/src/instructions/settle_contest.rs) — Anchor instruction to settle the contest and freeze the prize pool.
- [programs/dexi/src/instructions/claim_reward.rs](file:///home/utkarsh/Projects/dexi/programs/dexi/src/instructions/claim_reward.rs) — Anchor instruction validating the keeper-co-signed claim request.
- [docs/scoring.md](file:///home/utkarsh/Projects/dexi/docs/scoring.md) — Documentation detailing how TxLINE event definitions correspond to fantasy points.
