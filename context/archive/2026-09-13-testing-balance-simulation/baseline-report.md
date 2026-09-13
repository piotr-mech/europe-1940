# Balance Baseline — AI-vs-AI Simulation (descriptive)

Measured by the balance simulation harness (test-plan Phase 2, risk #1).
Descriptive only: **no numeric fairness bands are pinned here** — this report is the
input for a future user-owned decision to pin bands (the descriptive-first call).

- Grid: seeds 0–49 × both role assignments = 100 campaigns
- Turn cap: 60 turn cycles (1 cycle = one side's action phase; a full round of both sides = 2 cycles)
- Regenerate byte-identically: `BALANCE_WRITE=1 npx vitest run src/lib/balance-simulation.test.ts`

### Combined (both role assignments)

| Metric | Value |
| --- | --- |
| Campaigns | 100 |
| Germany wins | 0 (0.0% of decided) |
| Soviet wins | 38 (100.0% of decided) |
| No winner by cap | 62 |
| Campaign length (turn cycles): min / median / max | 30 / 60 / 60 |
| Battles | 1709 |
| Upsets (weaker pre-roll side won) | 104 (6.1% of battles) |

### Germany acts first

| Metric | Value |
| --- | --- |
| Campaigns | 50 |
| Germany wins | 0 (0.0% of decided) |
| Soviet wins | 16 (100.0% of decided) |
| No winner by cap | 34 |
| Campaign length (turn cycles): min / median / max | 31 / 60 / 60 |
| Battles | 905 |
| Upsets (weaker pre-roll side won) | 49 (5.4% of battles) |

### Soviet acts first

| Metric | Value |
| --- | --- |
| Campaigns | 50 |
| Germany wins | 0 (0.0% of decided) |
| Soviet wins | 22 (100.0% of decided) |
| No winner by cap | 28 |
| Campaign length (turn cycles): min / median / max | 30 / 60 / 60 |
| Battles | 804 |
| Upsets (weaker pre-roll side won) | 55 (6.8% of battles) |

### Income divergence (combined)

Ratio of summed per-turn city income (Germany / Soviet); 1.0 = economic parity.

| Turn cycle | Income ratio |
| --- | --- |
| 1 | 1.07 |
| 2 | 1.07 |
| 3 | 1.07 |
| 4 | 1.14 |
| 5 | 1.23 |
| 6 | 1.19 |
| 7 | 1.01 |
| 8 | 0.86 |
| 9 | 0.73 |
| 10 | 0.87 |
| 11 | 0.87 |
| 12 | 0.91 |
| 13 | 0.77 |
| 14 | 0.68 |
| 15 | 0.68 |
| 16 | 0.71 |
| 17 | 0.65 |
| 18 | 0.65 |
| 19 | 0.60 |
| 20 | 0.56 |
| 21 | 0.51 |
| 22 | 0.48 |
| 23 | 0.45 |
| 24 | 0.44 |
| 25 | 0.44 |
| 26 | 0.43 |
| 27 | 0.42 |
| 28 | 0.42 |
| 29 | 0.38 |
| 30 | 0.36 |
| 31 | 0.37 |
| 32 | 0.36 |
| 33 | 0.34 |
| 34 | 0.33 |
| 35 | 0.34 |
| 36 | 0.32 |
| 37 | 0.32 |
| 38 | 0.31 |
| 39 | 0.33 |
| 40 | 0.32 |
| 41 | 0.31 |
| 42 | 0.29 |
| 43 | 0.30 |
| 44 | 0.28 |
| 45 | 0.30 |
| 46 | 0.29 |
| 47 | 0.29 |
| 48 | 0.28 |
| 49 | 0.28 |
| 50 | 0.27 |
| 51 | 0.29 |
| 52 | 0.29 |
| 53 | 0.28 |
| 54 | 0.27 |
| 55 | 0.27 |
| 56 | 0.25 |
| 57 | 0.26 |
| 58 | 0.26 |
| 59 | 0.27 |
| 60 | 0.27 |

### Measurement caveats (measured as-is, see research)

- German "Blitzkrieg" national bonus is advertised in the UI but not implemented; the Soviet recruit discount is live.
- `bonusVsTank` is never read by the engine; antiTank is dominated by infantry.
- Germany's start is front-loaded (Warsaw is a German-initial city 1 move from Soviet territory) with +6% money / +17% steel.
- Consecutive mulberry32 draws correlate (~0.07 near even strengths) — any future 50/50 oracle needs a tolerance band.
