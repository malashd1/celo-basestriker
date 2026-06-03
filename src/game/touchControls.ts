// On-screen virtual joystick + fire/bomb buttons for touch devices.
// Writes directly into the shared `InputController.keys` set so the engine
// reads it identically to keyboard input.

import type { InputController } from './input';

const ACTIVE_KEYS = new Set([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'shift']);

export function attachTouchControls(canvas: HTMLCanvasElement, input: InputController) {
  // Show touch controls on:
  //   - real touch devices (mobile browsers, in-app WebViews)
  //   - any narrow viewport (≤ 520 px) — covers DevTools responsive testing
  //     where the user resizes the viewport without enabling touch emulation.
  const isTouch =
    matchMedia('(hover: none) and (pointer: coarse)').matches
    || matchMedia('(max-width: 520px)').matches
    || ('ontouchstart' in window);
  if (!isTouch) return;

  const layer = document.createElement('div');
  layer.id = 'touch-overlay';
  Object.assign(layer.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '6',
  } as Partial<CSSStyleDeclaration>);

  // ---- Control band (visual separator between play-field and gamepad) ----
  // The band's top accent (borderTop) marks "no-go" for the player ship
  // and despawn boundary for enemy bullets / dives. Sized so the line sits
  // exactly at the JOYSTICK TOP — joystick is at `bottom: SAFE + 70` with
  // height 120, so its top edge is `SAFE + 190` above the gesture bar.
  // Match the band height to that: `SAFE + 190`. Previous `25dvh` value
  // diverged from this on phones with non-zero safe-area-inset-bottom,
  // letting gameplay (bullets / ship) cross the line.
  const band = document.createElement('div');
  Object.assign(band.style, {
    position: 'absolute',
    left: '0', right: '0', bottom: '0',
    height: 'calc(env(safe-area-inset-bottom, 0px) + 190px)',
    background: 'linear-gradient(180deg, rgba(13,5,36,0) 0%, rgba(13,5,36,0.55) 18%, rgba(13,5,36,0.85) 100%)',
    borderTop: '2px solid rgba(0, 212, 255, 0.4)',
    boxShadow: '0 -8px 24px rgba(0, 212, 255, 0.18)',
    pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>);
  layer.appendChild(band);

  // ---- left joystick ----
  // `bottom` adds `env(safe-area-inset-bottom)` so the joystick clears the
  // iOS home-indicator (typically 34 px) and the Android navigation gesture
  // zone. Without it the bottom half of the joystick gets clipped on most
  // modern phones. Baseline raised from 28 → 70 after user report: the
  // joystick was sitting too low and partially behind the gesture-nav bar
  // on Android Pixel-class phones with non-zero safe-area-inset-bottom.
  const joy = document.createElement('div');
  Object.assign(joy.style, {
    position: 'absolute',
    left: '24px',
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 70px)',
    width: '120px', height: '120px',
    borderRadius: '50%',
    background: 'rgba(0, 212, 255, 0.08)',
    border: '2px solid rgba(0, 212, 255, 0.55)',
    pointerEvents: 'auto',
    touchAction: 'none',
  } as Partial<CSSStyleDeclaration>);
  const knob = document.createElement('div');
  Object.assign(knob.style, {
    position: 'absolute',
    left: '50%', top: '50%',
    transform: 'translate(-50%, -50%)',
    width: '52px', height: '52px',
    borderRadius: '50%',
    background: 'rgba(0, 212, 255, 0.35)',
    border: '2px solid #00d4ff',
    pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>);
  joy.appendChild(knob);
  layer.appendChild(joy);

  // ---- right-side action buttons (side-by-side, FIRE rightmost) ----
  //   [ BOMB ]  [ FIRE ]
  // Both anchored to the same bottom so they read as a row, and the
  // thumb travel between them is symmetrical. Yellow bomb sprite reads
  // better against the dark gameplay background than the old pink.
  // Same safe-area lift as the joystick keeps both buttons fully on-screen.
  // Baseline raised from 48 → 88 (joystick raised by 42, buttons by 40, so
  // they stay vertically aligned ~half-way up the joystick's right edge).
  const fireBtn = mkButton('FIRE', '#4cff7a', { right: '24px',  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' });
  const bombBtn = mkButton('BOMB', '#ffd84d', { right: '128px', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' });
  layer.appendChild(fireBtn);
  layer.appendChild(bombBtn);

  // ---- pause hint ----
  const pauseBtn = mkButton('||', '#9a9ac0', { right: '24px', top: '24px' }, true);
  layer.appendChild(pauseBtn);

  // Insert above canvas.
  canvas.parentElement?.appendChild(layer);

  // ---- joystick logic ----
  let joyActiveId: number | null = null;
  const joyRect = () => joy.getBoundingClientRect();
  const setDir = (dx: number, dy: number) => {
    const dead = 0.25;
    setKey('arrowleft',  dx < -dead);
    setKey('arrowright', dx >  dead);
    setKey('arrowup',    dy < -dead);
    setKey('arrowdown',  dy >  dead);
  };
  function setKey(k: string, on: boolean) {
    if (on) input.keys.add(k); else input.keys.delete(k);
  }

  joy.addEventListener('pointerdown', (e) => {
    joy.setPointerCapture(e.pointerId);
    joyActiveId = e.pointerId;
    updateJoy(e);
    e.preventDefault();
  });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyActiveId) updateJoy(e); });
  joy.addEventListener('pointerup',     () => { joyActiveId = null; resetJoy(); });
  joy.addEventListener('pointercancel', () => { joyActiveId = null; resetJoy(); });
  joy.addEventListener('pointerleave',  () => { joyActiveId = null; resetJoy(); });

  function updateJoy(e: PointerEvent) {
    const r = joyRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = r.width / 2;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    knob.style.left = `${50 + (dx / max) * 35}%`;
    knob.style.top  = `${50 + (dy / max) * 35}%`;
    setDir(dx / max, dy / max);
  }
  function resetJoy() {
    knob.style.left = '50%';
    knob.style.top = '50%';
    setDir(0, 0);
  }

  // ---- fire / bomb ----
  bindHold(fireBtn, ' ');
  bindTap(bombBtn, 'x');     // input.ts no longer reads `shift` — keep in sync.

  function bindHold(el: HTMLElement, key: string) {
    const onDown = (e: PointerEvent) => { input.keys.add(key); el.setPointerCapture?.(e.pointerId); e.preventDefault(); };
    const onUp = () => input.keys.delete(key);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onUp);
  }
  function bindTap(el: HTMLElement, key: string) {
    el.addEventListener('pointerdown', (e) => {
      input.keys.add(key);
      setTimeout(() => input.keys.delete(key), 80);
      e.preventDefault();
    });
  }

  pauseBtn.addEventListener('pointerdown', (e) => {
    // Synthesise an Escape key event for `main.ts` to pick up. `new KeyboardEvent`
    // defaults to `bubbles: false`, so dispatching on `document` never reaches
    // listeners on `window`. Fire on `window` with `bubbles: true` so the
    // pause/resume listener catches it in any browser.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    e.preventDefault();
  });

  // Cleanup when the page hides.
  addEventListener('visibilitychange', () => {
    if (document.hidden) for (const k of ACTIVE_KEYS) input.keys.delete(k);
  });
}

function mkButton(label: string, color: string, pos: Partial<CSSStyleDeclaration>, small = false): HTMLDivElement {
  const b = document.createElement('div');
  Object.assign(b.style, {
    position: 'absolute',
    width: small ? '44px' : '80px',
    height: small ? '44px' : '80px',
    borderRadius: '50%',
    background: 'rgba(10, 0, 20, 0.55)',
    border: `2px solid ${color}`,
    color,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: '"Press Start 2P", monospace',
    fontSize: small ? '14px' : '10px',
    pointerEvents: 'auto',
    touchAction: 'none',
    userSelect: 'none',
    boxShadow: `0 0 16px ${color}55`,
    ...pos,
  });
  b.textContent = label;
  return b;
}
