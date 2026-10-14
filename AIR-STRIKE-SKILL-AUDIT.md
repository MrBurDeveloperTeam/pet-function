# Sky Patrol talent and skill audit — 2026-10-14

Scope: all 15 permanent talents and all 25 skill cards, plus endless ascensions and field repair. Desktop/mobile use the same combat implementation. Checks are headless runtime tests and code-path inspection; browser/cloud-account end-to-end verification is still outstanding.

## Permanent talents

| IDs | Effect checked |
| --- | --- |
| 1–2 | Damage multiplier and firing interval |
| 3 | Two opening choices instead of one |
| 4–5 | Two/three firing lanes; higher tier replaces lower tier; now preserved with lasers |
| 6–7 | One/two extra penetrations; higher tier replaces lower tier; laser already pierces all targets |
| 8 | Critical damage multiplier |
| 9 | Timed homing missile |
| 10–12 | Drone count, timed drone missiles and twin drones; duplicate basic drone card excluded |
| 13–14 | Separate fatal-hit saves, reset each run; now explicitly announced |
| 15 | Every 30 non-bombardment kills schedules bombardment; now explicitly announced |

## Cards

| Cards | Effect/path checked |
| --- | --- |
| bullet | Adds a distinct normal/laser lane; adds a radial beam with ring laser |
| damage, crit_damage, crit_chance | Multipliers/probability |
| evade, defense | Dodge probability and fractional incoming damage |
| leech, vampire | Actual-damage-based healing, capped at maximum HP |
| shield, nuclear_shield | Immediate layers, consumption and timed refill |
| life, life_evolve, dimension | Maximum HP changes and finite fatal-hit saves |
| drone, drone_boost, vamp_drone | Drone availability, doubled volley and drone healing |
| laser, ring_laser | Full-length piercing pulses and radial beams |
| reflect, reflect2 | Bounce payload and hit retargeting, now also enabled with ring laser |
| double_damage, crit_bomb, supercrit | Extra critical damage, splash and stat tradeoff |
| counter, double_counter | Dodge-triggered homing volleys |
| endless ascensions | Removed campaign-only four-route early return in endless mode |
| repair | 15% HP heal capped at maximum |

Fixes: distinct laser launch origins retained while following aircraft; radial count respects bullet bonuses; ring laser no longer disables ricochet; existing drone talent satisfies drone-upgrade prerequisite and suppresses redundant base card; endless offers remain available after four ultimate routes; launch waits for cloud talent readiness; drone talent description corrected; fatal saves and bombardment show activation notices.

Regression: skill_audit (desktop + mobile), progression, difficulty, dodge, revival, skill_inventory and gameplay passed. Existing tests cover finite save consumption, bombardment damage and prevention of recursive bombardment chains. Conditional abilities still require their conditions: e.g. 30 kills for bombardment and fatal damage for automatic talent Revival, which now runs before other fatal-hit saves.
