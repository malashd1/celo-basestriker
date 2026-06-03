// Loot drops + powerups.
// On enemy death there's a small chance to spawn a powerup that drifts downward.
// Player touches it → effect applied to PlayerState until death.
export const POWERUP_SPECS = {
    life: { kind: 'life', color: '#ff4860', glyph: '♥', weight: 4, label: 'EXTRA LIFE', desc: '+1 HP. Stacks.' },
    bomb: { kind: 'bomb', color: '#ffd84d', glyph: 'B', weight: 6, label: 'BOMB', desc: '+1 screen-clearing bomb (press X).' },
    laser: { kind: 'laser', color: '#00d4ff', glyph: 'L', weight: 5, label: 'LASER', desc: 'High-velocity beam. Replaces weapon.' },
    plasma: { kind: 'plasma', color: '#ff3df0', glyph: 'P', weight: 4, label: 'PLASMA ORB', desc: 'Large orb with generous hit radius. Heavy damage.' },
    rocket: { kind: 'rocket', color: '#ff8c1a', glyph: 'R', weight: 1, label: 'ROCKET', desc: 'AoE explosion (35 px). Very rare drop (~1 per 10 levels).' },
    double: { kind: 'double', color: '#4cff7a', glyph: 'D', weight: 5, label: '+1 SIDE SHOT', desc: '+1 side projectile. Pick up twice → triple.' },
    armor: { kind: 'armor', color: '#9ad0ff', glyph: 'A', weight: 4, label: 'ARMOR', desc: 'Absorbs 1 hit before HP. Visible plates on the ship.' },
    rapid: { kind: 'rapid', color: '#fff', glyph: 'F', weight: 4, label: 'RAPID FIRE', desc: '+55% fire rate.' },
    points: { kind: 'points', color: '#ffd84d', glyph: '$', weight: 6, label: '+100 PTS', desc: 'Instant +100 score.' },
};
const TABLE = [];
for (const [k, s] of Object.entries(POWERUP_SPECS)) {
    for (let i = 0; i < s.weight; i++)
        TABLE.push(k);
}
/// 18% drop chance on enemy death. Boss kills always drop something good.
export const DROP_CHANCE = 0.18;
export function rollDrop(rng) {
    if (rng() > DROP_CHANCE)
        return null;
    return TABLE[Math.floor(rng() * TABLE.length)];
}
/**
 * Force-pick a weighted powerup from the full table, ignoring DROP_CHANCE.
 * Used by the no-3-in-a-row guard in Game.ts.
 */
export function pickAnyPowerup(rng, exclude) {
    const pool = exclude ? TABLE.filter((k) => k !== exclude) : TABLE;
    return pool[Math.floor(rng() * pool.length)];
}
export function bossDrop(rng, exclude) {
    // Bosses drop a powerful upgrade.
    const fullPool = ['life', 'armor', 'laser', 'plasma', 'rocket', 'double', 'rapid', 'bomb'];
    const pool = exclude ? fullPool.filter((k) => k !== exclude) : fullPool;
    return pool[Math.floor(rng() * pool.length)];
}
export function spawnPowerup(kind, x, y) {
    return { kind, x, y, vx: 0, vy: 60, age: 0 };
}
