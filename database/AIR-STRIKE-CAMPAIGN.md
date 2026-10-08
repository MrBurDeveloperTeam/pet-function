# Sky Patrol campaign rules and manual SQL review

## Current behavior

The hangar mission selector unlocks stages in order, groups them into ten chapters, and unlocks Endless after stage 100. `FLIGHT LV` is the separate arcade record level; it does not determine aircraft upgrades, cat level, or mission unlocks.

Permanent talents remain purchased using the existing cat wallet, in order 1–15, costing **26,000 coins** in total. Confirmed `spendCoins` payment is required. Talent 3 grants a fourth candidate, not a second skill. Every launch resets run skills, energy, shields, missiles, and survival charges.

Skill offers occur at launch, after normal waves, and when collected energy levels up. Energy requirements are `6 + 3 × skill level`; missed orbs descend and disappear. Each candidate independently rolls the stage's tier weights, filters prerequisites and route limits, applies the 50% advanced / 25% ultimate candidate gate, and draws without duplicates. Empty tiers fall back downward; an exhausted initial pool tries available advanced skills, then field repair. There is no pity system. Normal runs have at most four routes. Reflection II stays unavailable after Ring Laser; to collect all six ultimates in Endless, acquire Reflection II before Ring Laser. Ring Laser suppresses reflection effects regardless of acquisition order.

Normal bosses follow **5 / 6 / 7 / 8 waves** at stages 1–20 / 21–50 / 51–80 / 81–100, without a skill-route gate. Enemy baseline at stage 100 is HP 3.2×, damage 2.2×, count 2.6×, movement 1.33×, projectile speed 1.42×. Talents never increase those normal-stage multipliers. Chapter mechanisms include armor, sniper telegraphs, dashes, suicide units, shielding and shield support, healing 8% nearby HP every three seconds, limited summoning, elite affixes, support formations, narrow telegraphed field lasers and patterned bullet attacks. Existing aircraft sprites are reused with support/shield/elite indicators.

Stages 91–98 focus on speed, shield, summon, missiles, laser, sustain, bullet patterns and phase changes. Stage 99 has three consecutive bosses. Stage 100 changes at 75%, 50%, and 25% HP, introduces attack/shield/healing drones, field attacks, and overdrive combinations. Boss attacks still alternate hard and easy patterns, with a 190-unit safe corridor for rows and finite homing. New boss patterns wait for prior boss bullets and field hazards to clear. Critical hits during boss recovery deal 15% bonus damage.

Lifesteal heals from **actual damage dealt**, including capped normal bonus damage, without subtracting enemy HP percentages. Shields prevent lifesteal on blocked shots. Drone damage is 50% of current noncritical player firepower. Ultimate bombing deals maximum HP to ordinary fighters, 50% to advanced/elite units, and current player damage ×5 to bosses. Player hit priority is shield, existing invulnerability/dodge, defense, HP, evolution/dimension saves, Unyielding, Revive, death; one hit consumes one survival charge.

## Rewards and saves

First-clear coins: `round(40 × 1.035^(stage−1))`. Replays pay 35%. All 100 first clears total **34,501 coins** (talents 26,000; all aircraft upgrades 9,200; a few replay clears cover the difference if buying both). Example cumulative milestones: stages 20 / 30 / 50 / 70 / 90 = 1,131 / 2,064 / 5,239 / 11,554 / 24,127 coins. Stage 1 pays 40 and stage 100 pays 1,205. Failed normal runs pay no completion reward. Endless bosses pay the stage-100 replay amount at each ten-wave checkpoint, with duplicate checkpoints ignored.

The app uses the **existing** shared cat coin APIs. No new wallet/database procedure is required for this client implementation. Game progress, first-clear flags, and endless records remain per-user browser saves. Talent ownership now supports the optional atomic cloud adapter; see AIR-STRIKE-TALENT-CLOUD.md and deploy its separate SQL manually to enable it on authenticated App Gallery pages. Local design previews still use local talents. Origin, iframe source, per-launch token, result bounds and deduplication are checked, but local arcade progress and rewards are client-authoritative; this is not a server-verified competitive economy. No real-wallet test was performed.

## Endless

Every fifth wave contains an elite, every tenth a boss, every fiftieth a super boss. Route caps are removed. Boss clear offers a skill; super boss choices use 20/50/30 initial/advanced/ultimate weights. Each completed ultimate adds 6% HP, 4% count and 2% attack frequency. HP growth is additive: first 100 wave steps +2% each, next 200 +1%, subsequent steps +0.5%. Threat grows every ten waves; thresholds 5/10/15/20/25/30 add regular elites, more elites, one affix, two affixes, one boss mutation, two mutations. Super bosses have at least two mutations. Once all six ultimate routes are owned, offers become +5% laser damage, +5% critical damage, or −5% shield cooldown (five-second cooldown floor).

## Database files — not executed

- If the base `air_strike_progress` table already exists, review `air_strike_campaign.sql` for the two new optional fields.
- If setting up from scratch, `air_strike_setup_review.sql` contains the base progress, aircraft, talents, and campaign migrations in order.
- Neither file enables cloud synchronization, changes the cat wallet, nor installs an automated reward/purchase endpoint. Running SQL alone will not move current browser saves to Supabase. The existing progress RPC syncs only XP, score, and run count; it does not sync aircraft, talents, or campaign fields.

These migrations were generated for your review only. Codex has not connected to Supabase or executed them. The newer talent-cloud SQL is separate from these optional campaign fields; see AIR-STRIKE-TALENT-CLOUD.md.

## Validation

Node unit tests cover sequential talent costs, confirmed payments, stage unlocks, reward totals, legacy-save normalization, and malformed results. Godot native headless tests cover collision/resizing, health and VFX, talent/skill rules, all 100 wave limits, enemy healing/shields/summoning, final phases, boss rush, four-card selection bounds, and Endless/Ascension. A long-run simulation checks entity caps and phase progression. These are gameplay tests, not a substitute for hands-on difficulty tuning or browser visual review.

