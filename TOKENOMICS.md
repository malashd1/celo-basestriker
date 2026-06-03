# `$STRK` Tokenomics

> The token that powers BaseStriker. Designed for **sustainable emission**, **clear utility**, and **alignment between players, holders, and the treasury**.

## TL;DR

| Field | Value |
|---|---|
| Name | BaseStriker |
| Symbol | `$STRK` |
| Standard | ERC-20 (Base mainnet) |
| Total supply | **1,000,000,000** (fixed; no inflation post-mint) |
| Decimals | 18 |
| Launch chain | Base |
| Primary DEX | Aerodrome (`STRK / USDC` and `STRK / WETH`) |
| Anti-bot launch | LBP via Fjord (48h) → Aerodrome concentrated liquidity |

`$STRK` is **not a security**. It is a utility token for gameplay rewards, in-game purchase discounts, equipment crafting, and lightweight governance over the rewards pool emission schedule.

---

## Supply allocation (1,000,000,000 `$STRK`)

| Bucket | % | Tokens | Vesting |
|---|---:|---:|---|
| Play-to-earn rewards pool | 40% | 400,000,000 | 48-month linear emission via `RewardsDistributor` |
| Community + airdrops | 15% | 150,000,000 | 25% TGE, 75% over 18 months. Includes retroactive testnet drop, missions, partnerships |
| Liquidity (Aerodrome) | 15% | 150,000,000 | 100% TGE — paired with treasury USDC, LP locked 24 months |
| Team | 12% | 120,000,000 | 12-month cliff, 36-month linear |
| Investors (seed) | 8% | 80,000,000 | 6-month cliff, 24-month linear |
| Treasury / dev fund | 10% | 100,000,000 | Multi-sig; 6-month cliff, 36-month linear unlock |

Initial circulating supply at TGE: **≈187.5M (18.75%)** — community TGE portion + liquidity.

---

## Emission curve (rewards pool, 400M tokens)

48 months, **halving every 12 months**:

| Year | Emission | Per day | Per day at $0.01 reference |
|---:|---:|---:|---:|
| 1 | 200,000,000 | 547,945 | $5,479 |
| 2 | 100,000,000 | 273,972 | $2,739 |
| 3 | 50,000,000 | 136,986 | $1,369 |
| 4 | 50,000,000 | 136,986 | $1,369 |

After year 4 emission ends. The game continues; `$STRK` rewards transition to **fee-funded** model where in-shop revenue buys `$STRK` from Aerodrome and recycles into the rewards pool. This is the long-term equilibrium.

### Per-player daily emission cap

To prevent farms and Sybils:

- Hard cap **2,000 `$STRK` / wallet / day** in year 1 (scales down with halving).
- Cap applies to wallet **AND** verified Smart Wallet user ID (`getOwners()` hash) — both must be under cap.
- Capped via on-chain `RewardsDistributor.claim()` checking daily epoch.

---

## How players earn `$STRK`

Earning is **gated by signed score attestations** from the backend (`/api/score/sign`). The backend replays the seed, verifies the score within tolerance, and emits an EIP-712 signature. The on-chain `RewardsDistributor.claim()` consumes the signature.

| Source | Reward | Frequency |
|---|---|---|
| Complete level | 5–80 `$STRK` (scales with level, halves over halving epochs) | per level, once per level per day |
| Boss kill (every 10th level) | 100–500 `$STRK` + 1 equipment loot box | per boss, once per day |
| Daily missions (3 rotating) | 25–100 `$STRK` each | daily reset |
| Weekly leaderboard top 100 | 1k–25k `$STRK` pool split | weekly |
| Streak bonus (7-day login) | +20% multiplier on level rewards | continuous while streak holds |
| First-run-of-level | 2× multiplier | first clear of each level |
| Achievements | 500–5000 `$STRK` | one-time |

All claims are **batched** — players accumulate off-chain, then claim on-chain to save gas (or use paymaster-sponsored zero-cost claims for amounts < 500 `$STRK`).

---

## Sinks (where `$STRK` goes to die)

A reward economy without sinks inflates and dies. We engineered four major sinks:

### 1. Ship + equipment minting (50% burn / 50% to treasury)

| Item | `$STRK` cost (year 1 reference) | Alt: USDC |
|---|---:|---:|
| Scout ship (starter) | Free | n/a |
| Striker ship | 5,000 | $5 |
| Vanguard ship | 15,000 | $15 |
| Phantom ship | 40,000 | $40 |
| Titan ship | 120,000 | $120 |
| Common weapon | 500 | $0.50 |
| Rare weapon | 5,000 | $5 |
| Epic weapon | 25,000 | $25 |
| Legendary weapon | 100,000 | $100 |
| Loot box (random equipment) | 1,000 | $1 |

When paid in `$STRK`, **50% is burned, 50% sent to treasury**. When paid in ETH/USDC, **30% is used to market-buy `$STRK` and burn**, 70% to treasury.

### 2. Continue-after-death

`$STRK` 100 / 250 / 500 (escalating per death in same run). Paid → 100% burn.

### 3. Crafting / fusion

Combine two equipment of same tier + `$STRK` fee → 1 equipment of next tier. `$STRK` fee 100% burn.

### 4. Cosmetics (skins, particles, sound packs)

Pure cosmetic NFTs, priced 1k–10k `$STRK`. 70% burn, 30% to artists.

---

## Pricing in $STRK vs USDC

Every purchase has a `$STRK` price and a USDC price. The contract uses a **TWAP oracle** (Aerodrome) to enforce that paying in `$STRK` is always **15% cheaper** than the USDC price at current market rate.

This anchors the token's utility value: a player can always burn `$STRK` for at least 15% extra purchasing power vs. selling on DEX.

---

## Buy-back-and-burn (BBB)

Net revenue (ETH/USDC purchases minus paymaster + infra costs) is allocated:

- **40% → buy `$STRK` from Aerodrome → burn**
- **30% → treasury (dev, ops, audits)**
- **30% → rewards pool (refills emission for year 5+)**

BBB executes weekly via a Chainlink-automation-compatible keeper job calling `Treasury.executeBuyback()`. All actions are public events.

---

## Governance (Phase 2)

After 6 months post-TGE:

- `$STRK` holders can stake into `veSTRK` (vote-escrow) — up to 4 years.
- `veSTRK` votes on:
  - Weekly leaderboard reward pool size (within bounds)
  - New equipment item parameters
  - Treasury grants
- No control over emission curve (fixed by contract).
- No control over team or investor unlocks.

Voting is non-binding for the first 3 months (snapshot off-chain), then transitions to on-chain execution via Governor contract with a 7-day timelock.

---

## Anti-bot / anti-Sybil

- **Smart Wallet passkey** required to claim rewards above 500 `$STRK` / week.
- **Score attestation** must originate from a server-replayed game session — RNG is seeded by `keccak256(playerAddress, levelId, dailyEpoch)`, so the server can deterministically replay and validate.
- **Daily wallet cap** (see above).
- **Per-IP soft rate limiting** at the score attestation API.
- **Stamina** — each ship has a stamina bar (5 lives, regenerates 1/hour). Burnable with `$STRK` to refill. Prevents 24/7 farming.

---

## Reference economics (sanity check)

Year 1, assumptions:
- 5,000 daily active players (median)
- 50% claim rewards on-chain weekly
- 30% of daily emission is actually claimed (rest forfeited to cap)
- Token price discovery puts $STRK at $0.005–$0.02 in year 1

| Metric | Estimate |
|---|---:|
| Daily emission target | 547,945 `$STRK` |
| Daily emission claimed | ≈164,000 `$STRK` |
| Avg per active player | ≈33 `$STRK`/day = $0.16–$0.66 |
| Annual sink burn (ships+equip+continues) | 80M–150M `$STRK` (20–40% of year-1 emission) |
| Net inflation year 1 | ≈+50M–120M `$STRK` to circulating |

This is a deliberately conservative model. The goal is **net deflation by year 3** once sinks compound.
