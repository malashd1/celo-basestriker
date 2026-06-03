import { ENEMY_SPECS } from './enemies';
export const WINGMAN_OFFSETS = [-28, 28];
export const WINGMAN_HIT_RADIUS = 11;
let _id = 1;
export const nextId = () => _id++;
export function spawnEnemy(kind, x, y, hpMul, speedMul, fireRateMul, formationGroup) {
    const spec = ENEMY_SPECS[kind];
    // Clamp anchorX safely inside the playable area so the formation drift
    // (±30px wobble) never pushes the enemy off-screen permanently.
    const safeX = Math.max(50, Math.min(480 - 50, x));
    return {
        id: nextId(),
        kind,
        spec,
        x, y,
        vx: 0, vy: spec.speed * speedMul * 0.5,
        hp: Math.ceil(spec.hp * hpMul),
        maxHp: Math.ceil(spec.hp * hpMul),
        // Tight initial cooldown so enemies open fire ~0.3 s after they reach the
        // formation, not 2-3 s. The previous formula made grunts wait 2.5 s before
        // the first shot — entire opening waves passed without enemy fire.
        fireCooldown: 0.3 + Math.random() * 0.4,
        age: 0,
        state: 'enter',
        anchorX: safeX,
        anchorY: Math.max(60, Math.min(220, Math.abs(safeX) % 240)),
        formationGroup,
        weaveOffset: Math.random() * Math.PI * 2,
        splitterChildren: 0,
        teleportCooldown: 1.5,
    };
}
