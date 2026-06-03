import './style.css';
import { Game } from './game/Game';
import { renderShop } from './ui/shop';
import { renderLeaderboard } from './ui/leaderboard';
import { renderMissions } from './ui/missions';
import { renderBadges } from './ui/badges';
import { renderSettings, applyStoredSettings } from './ui/settings';
import { connect, disconnect, walletAddress, onAddressChange, restoreSession } from './web3/wallet';
import { postRunToBackend, claimRewards, getHighestLevel, creditPoints } from './web3/api';
import { audio } from './game/audio';
import { addPoints, pointsForUsd } from './game/points';
import { strkRewardForLevel } from './game/difficulty';
import type { RunResult } from './game/types';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay')!;
const shopEl = document.getElementById('shop')!;
const lbEl = document.getElementById('leaderboard')!;
const missionsEl = document.getElementById('missions')!;
const badgesEl = document.getElementById('badges')!;
const settingsEl = document.getElementById('settings')!;
const scoreEl = document.getElementById('score')!;
const pointsEl = document.getElementById('points')!;
const levelEl = document.getElementById('level')!;
const livesEl = document.getElementById('lives')!;
const bombsEl = document.getElementById('bombs')!;
const comboEl = document.getElementById('combo')!;

// ── PTS bookkeeping ────────────────────────────────────────────────
// HUD shows points earned IN THIS RUN only. The counter resets to 0 on
// death; the accumulated total has already been flushed to the lifetime
// localStorage ledger and the backend leaderboard at the moment of each
// earn, so a death doesn't lose previously-earned PTS — only the
// per-run display resets.
//
// PTS sources (the ONLY three):
//   1. Full level clear        — `strkRewardForLevel(level)` = 5–80
//   2. Shop purchase           — `pointsForUsd(usd)` = 300 PTS / $1
//   3. "+100" loot pickup      — `PTS_BONUS_LOOT` flat per pickup
// Nothing else awards PTS.
let runPoints = 0;
function refreshPointsHud() {
  pointsEl.textContent = `PTS ${runPoints.toLocaleString()}`;
}
function earnPoints(n: number) {
  if (!Number.isFinite(n) || n <= 0) return;
  const amount = Math.floor(n);
  runPoints += amount;
  refreshPointsHud();
  addPoints(amount);          // lifetime localStorage (survives reload)
  void creditPoints(amount);  // backend leaderboard total
}
function resetRunPoints() {
  runPoints = 0;
  refreshPointsHud();
}
refreshPointsHud();
const walletStatus = document.getElementById('wallet-status')!;

const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnConnect = document.getElementById('btn-connect') as HTMLButtonElement;
const btnShop = document.getElementById('btn-shop') as HTMLButtonElement;
const btnLb = document.getElementById('btn-leaderboard') as HTMLButtonElement;
const btnMissions = document.getElementById('btn-missions') as HTMLButtonElement;
const btnBadges = document.getElementById('btn-badges') as HTMLButtonElement;
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;

// ── Persistent progression ─────────────────────────────────────────
// `highestUnlocked` is the next level the player has unlocked. Defaults to 1.
// Saved to localStorage so reload / new session resumes from where they died.
const PROGRESS_KEY = 'basestriker.progress';
function loadProgress(): number {
  try {
    const v = Number(localStorage.getItem(PROGRESS_KEY));
    if (Number.isInteger(v) && v >= 1 && v <= 100) return v;
  } catch { /* */ }
  return 1;
}
function saveProgress(level: number) {
  try { localStorage.setItem(PROGRESS_KEY, String(level)); } catch { /* */ }
}

let highestUnlocked = loadProgress();
let currentLevel = highestUnlocked;
let chosenShipId = 'scout';
let chosenWeaponId = 'single';

// Helper: hide every floating panel (missions/shop/lb/settings) before opening a new one.
function closeAllPanels() {
  document.querySelectorAll('.panel').forEach((el) => el.classList.add('hidden'));
}

let wasRunningBeforePanel = false;

function openPanel(panel: HTMLElement, render: () => void) {
  // Freeze the game while a menu is open so the panel reads as its own page.
  wasRunningBeforePanel = (game as any).state === 'running';
  if (wasRunningBeforePanel) game.pause();
  closeAllPanels();
  overlay.classList.add('hidden');
  panel.classList.remove('hidden');
  render();
}

function backToMenu() {
  closeAllPanels();
  overlay.classList.remove('hidden');
  if (wasRunningBeforePanel) {
    // If we paused mid-game, hide the main menu and resume.
    overlay.classList.add('hidden');
    game.resume();
    wasRunningBeforePanel = false;
  }
}

const game = new Game(canvas, {
  onLevelComplete: handleLevelComplete,
  onGameOver: handleGameOver,
  onScoreChange: (s) => { scoreEl.textContent = `SCORE ${s.toLocaleString()}`; },
  // PTS are awarded ONLY for the "+100" bonus-score loot drop — `kind ===
  // 'points'` is the special powerup that grants 100 score on pickup. All
  // other powerups (extra-life, bomb, laser, plasma, rocket, double, rapid,
  // armor) are gameplay buffs and do NOT pay out PTS.
  onPowerupPicked: (kind: string) => {
    if (kind === 'points') earnPoints(PTS_BONUS_LOOT);
  },
});

function updateHUD() {
  if (!game.player) return;
  scoreEl.textContent = `SCORE ${game.player.score.toLocaleString()}`;
  levelEl.textContent = `LV ${currentLevel}`;
  livesEl.textContent = '♥'.repeat(Math.max(0, game.player.hp));
  const b = game.player.bombs;
  bombsEl.textContent = b > 0 ? `💣×${b} [X]` : '💣×0 [X]';
  bombsEl.classList.toggle('empty', b === 0);
  comboEl.textContent = game.player.combo > 1 ? `x${game.player.combo}` : '';
}
setInterval(updateHUD, 100);

btnStart.onclick = () => { audio.prime(); audio.play('menu'); startLevel(currentLevel); };
if (currentLevel !== 1) btnStart.textContent = `RESUME · LV ${currentLevel}`;

// ── Pause overlay ──────────────────────────────────────────────────
const pauseEl = document.getElementById('pause-overlay')!;
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement;
const btnQuit = document.getElementById('btn-quit') as HTMLButtonElement;

function pauseGame() {
  if ((game as any).state !== 'running') return;
  game.pause();
  pauseEl.classList.remove('hidden');
}
function resumeGame() {
  if ((game as any).state !== 'paused') return;
  pauseEl.classList.add('hidden');
  game.resume();
}
btnResume.onclick = () => { audio.play('menu'); resumeGame(); };
btnQuit.onclick = () => {
  audio.play('menu');
  pauseEl.classList.add('hidden');
  (game as any).state = 'idle';
  audio.stopMusic();
  overlay.classList.remove('hidden');
  refreshMenu();
};

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ((game as any).state === 'running') pauseGame();
    else if ((game as any).state === 'paused') resumeGame();
  }
  const code = (e.code || '').toLowerCase();
  if (e.key.toLowerCase() === 'm' || code === 'keym') audio.setEnabled(!audio.enabled);
  if (e.key.toLowerCase() === 'n' || code === 'keyn') audio.setMusicEnabled(!audio.musicEnabled);
});
addEventListener('pointerdown', () => audio.prime(), { once: true });
addEventListener('keydown', () => audio.prime(), { once: true });

async function runConnect() {
  if (btnConnect.disabled) return;
  btnConnect.disabled = true;
  const origLabel = btnConnect.textContent;
  btnConnect.textContent = 'CONNECTING…';
  audio.prime();
  try {
    const a = await connect();
    if (a) {
      audio.play('connect');
      walletStatus.textContent = `Connected: ${a.slice(0, 6)}…${a.slice(-4)}`;
      walletStatus.classList.add('connected');
      btnConnect.textContent = 'WALLET ✓';
      game.setPlayerAddress(a);
      try {
        const h = await getHighestLevel();
        if (h > 0) { highestUnlocked = h + 1; currentLevel = highestUnlocked; }
      } catch { /* contracts may not be deployed yet */ }
    } else {
      btnConnect.textContent = origLabel ?? 'CONNECT WALLET';
    }
  } catch (e: any) {
    console.warn('[wallet] connect failed', e);
    btnConnect.textContent = origLabel ?? 'CONNECT WALLET';
  } finally {
    btnConnect.disabled = false;
  }
}

/** Pop-up shown when the user taps WALLET ✓ while connected. Three rows:
 *  CHANGE WALLET (disconnect → re-open picker), DISCONNECT (clear session
 *  + reset HUD), CANCEL. */
function openWalletMenu() {
  const addr = walletAddress();
  if (!addr) { void runConnect(); return; }
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '9999',
    background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
    fontFamily: '"Press Start 2P", monospace',
  } as Partial<CSSStyleDeclaration>);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#0a0014', border: '2px solid #00d4ff',
    boxShadow: '0 0 30px rgba(0,212,255,0.4)',
    width: '100%', maxWidth: '360px',
    padding: '18px 20px 16px',
    display: 'flex', flexDirection: 'column', gap: '12px',
  } as Partial<CSSStyleDeclaration>);

  const title = document.createElement('div');
  title.style.cssText = 'color:#00d4ff;font-size:11px;letter-spacing:1px';
  title.textContent = 'WALLET';
  card.appendChild(title);

  const sub = document.createElement('div');
  sub.style.cssText = 'color:#9a9ac0;font-size:9px;line-height:1.5;word-break:break-all';
  sub.textContent = `${addr.slice(0, 6)}…${addr.slice(-6)}`;
  card.appendChild(sub);

  const mkRow = (label: string, color: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `width:100%;padding:10px 12px;font-size:9px;color:${color};border-color:${color};background:transparent`;
    b.onclick = onClick;
    return b;
  };

  card.appendChild(mkRow('CHANGE WALLET', '#00d4ff', async () => {
    close();
    audio.play('menu');
    try { await disconnect(); } catch { /* */ }
    await runConnect();
  }));
  card.appendChild(mkRow('DISCONNECT', '#ff4860', async () => {
    close();
    audio.play('menu');
    try { await disconnect(); } catch { /* */ }
    walletStatus.textContent = '';
    walletStatus.classList.remove('connected');
    btnConnect.textContent = 'CONNECT WALLET';
  }));
  card.appendChild(mkRow('CANCEL', '#9a9ac0', close));

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

btnConnect.onclick = () => {
  if (walletAddress()) openWalletMenu();
  else void runConnect();
};
// HUD's wallet-status line is also clickable when connected.
walletStatus.style.cursor = 'pointer';
walletStatus.addEventListener('click', () => {
  if (walletAddress()) openWalletMenu();
});

btnShop.onclick = () => {
  openPanel(shopEl, () => renderShop(shopEl, {
    getInventory: () => ({
      extraLives: Math.max(0, (game.carriedLives ?? 1) - 1),
      armor: game.carriedArmor,
      bombs: game.carriedBombs,
      weaponMode: game.carriedWeaponMode,
      wingmen: game.carriedWingmen,
    }),
    equipOne: (id) => {
      switch (id) {
        case 'extra-life':    game.carriedLives = (game.carriedLives ?? 1) + 1; return true;
        case 'armor':         game.carriedArmor += 1; return true;
        case 'extra-bomb':    game.carriedBombs += 1; return true;
        case 'rocket':        game.carriedWeaponMode = 'rocket'; return true;
        case 'homing-rocket': game.carriedWeaponMode = 'homing-rocket'; return true;
        case 'wingman':
          if (game.carriedWingmen >= 2) return false;
          game.carriedWingmen += 1; return true;
      }
    },
    charge: (priceUsd: number) => {
      if (priceUsd > 0) earnPoints(pointsForUsd(priceUsd));
    },
  }, backToMenu));
};
btnLb.onclick = () => {
  openPanel(lbEl, () => renderLeaderboard(lbEl, backToMenu));
};
btnMissions.onclick = () => {
  openPanel(missionsEl, () => renderMissions(missionsEl, backToMenu));
};
btnBadges.onclick = () => {
  openPanel(badgesEl, () => renderBadges(badgesEl, backToMenu));
};
btnSettings.onclick = () => {
  openPanel(settingsEl, () => renderSettings(settingsEl, {
    currentShipId: chosenShipId,
    currentWeaponId: chosenWeaponId,
    setShip: (id) => { chosenShipId = id; game.setShip(id); },
    setWeapon: (id) => { chosenWeaponId = id; game.setWeapon(id); },
    onPurchase: (priceUsd) => {
      if (priceUsd > 0) earnPoints(pointsForUsd(priceUsd));
    },
  }, backToMenu));
};

// Backend connectivity probe — surfaces a small green / red dot in the menu so
// the player can see at-a-glance whether the API is reachable without digging
// into devtools.
import { NETWORKS, DEFAULT_NETWORK } from './web3/config';
async function pingBackend(): Promise<boolean> {
  try {
    const url = NETWORKS[DEFAULT_NETWORK].backendUrl + '/api/health';
    const r = await fetch(url, { method: 'GET' });
    return r.ok;
  } catch { return false; }
}
function renderBackendBadge(ok: boolean) {
  const status = document.getElementById('wallet-status')!;
  let badge = document.getElementById('backend-status') as HTMLDivElement | null;
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'backend-status';
    badge.style.fontSize = '8px';
    badge.style.marginTop = '4px';
    status.appendChild(badge);
  }
  badge.style.color = ok ? '#4cff7a' : '#ff4860';
  badge.textContent = ok ? '● backend online' : '● backend offline — score / missions disabled';
}
pingBackend().then(renderBackendBadge);
setInterval(() => pingBackend().then(renderBackendBadge), 15_000);

// Restore the last connected wallet at boot — saves the player from
// re-tapping CONNECT WALLET on every launch.
void restoreSession().then((addr) => {
  if (addr) {
    walletStatus.textContent = `Connected: ${addr.slice(0, 6)}…${addr.slice(-4)}`;
    walletStatus.classList.add('connected');
    btnConnect.textContent = 'WALLET ✓';
    game.setPlayerAddress(addr);
  }
});

// Apply stored settings on boot.
applyStoredSettings({
  currentShipId: chosenShipId,
  currentWeaponId: chosenWeaponId,
  setShip: (id) => { chosenShipId = id; game.setShip(id); },
  setWeapon: (id) => { chosenWeaponId = id; game.setWeapon(id); },
});

onAddressChange((a) => {
  if (a) {
    walletStatus.textContent = `Connected: ${a.slice(0, 6)}…${a.slice(-4)}`;
    walletStatus.classList.add('connected');
    game.setPlayerAddress(a);
  } else {
    walletStatus.textContent = '';
    walletStatus.classList.remove('connected');
  }
});

function startLevel(levelId: number) {
  document.getElementById('pause-overlay')!.classList.add('hidden');
  clearScreenEl.classList.add('hidden');
  gameoverScreenEl.classList.add('hidden');
  closeAllPanels();
  overlay.classList.add('hidden');
  game.loadLevel(levelId);
  currentLevel = levelId;
  game.start();
}

/**
 * PTS reward for clearing a level — 5 PTS @ L1 → 80 PTS @ L100. Death does
 * NOT trigger this reward; only full level-clear pays out.
 */
function ptsForLevelClear(levelId: number): number {
  return strkRewardForLevel(levelId);
}

/** Flat PTS for catching the "+100" bonus-score loot drop (the only
 *  powerup kind that pays out PTS — see `onPowerupPicked` above). */
const PTS_BONUS_LOOT = 5;

async function handleLevelComplete(result: RunResult) {
  // PTS for clearing the level (5–80 scale).
  const earned = ptsForLevelClear(result.levelId);
  earnPoints(earned);

  // Persist progress — next session resumes here.
  if (result.levelId >= highestUnlocked) {
    highestUnlocked = Math.min(100, result.levelId + 1);
    currentLevel = highestUnlocked;
    saveProgress(highestUnlocked);
  }

  // Dedicated clear screen — title menu stays out of view.
  setTimeout(() => showClearScreen(result, earned), 1200);

  void submitRunToBackend(result, /*accepted*/ true);
}

/**
 * Single shared run-submission helper. Posts to /api/run/verify, logs the
 * response on failure (so DevTools shows why a run didn't make it to the
 * leaderboard), and surfaces the backend reason in the UI.
 */
async function submitRunToBackend(result: RunResult, _accepted: boolean) {
  if (!walletAddress()) return;
  try {
    const signed = await postRunToBackend(result);
    try { await claimRewards(signed); }
    catch (e: any) { console.warn('[run] claim ack skipped:', e?.message ?? e); }
  } catch (e: any) {
    // Log to console only — the on-screen orange "Run not recorded" banner
    // was firing on benign races (claim ack, backend ack timing) even when
    // the leaderboard row + POINTS credit had landed, scaring players into
    // thinking their record wasn't saved. Real failures still show up in
    // DevTools / `adb logcat`.
    console.warn('[run] submit failed:', e?.message ?? e);
  }
}

function handleGameOver(result: RunResult) {
  // Death resets the persistent checkpoint — next session starts from LV 1.
  highestUnlocked = 1;
  currentLevel = 1;
  saveProgress(1);
  // Death wipes the on-screen PTS counter (per-run display). The
  // accumulated total has already been flushed to lifetime + backend via
  // `earnPoints` at the moment of each pickup / clear / purchase, so this
  // is a visual reset only — leaderboard rank does NOT lose anything.
  resetRunPoints();
  // Still submit the run to the backend so the score column on the
  // leaderboard reflects the dead run as well.
  void submitRunToBackend(result, /*accepted*/ false);
  setTimeout(() => showGameOverScreen(result), 1200);
}

// ── Result screens (separate from main title menu) ─────────────────
const clearScreenEl    = document.getElementById('clear-screen')!;
const clearTitleEl     = document.getElementById('clear-title')!;
const clearSummaryEl   = document.getElementById('clear-summary')!;
const btnNext          = document.getElementById('btn-next') as HTMLButtonElement;
const btnClearMenu     = document.getElementById('btn-clear-menu') as HTMLButtonElement;

const gameoverScreenEl = document.getElementById('gameover-screen')!;
const gameoverTitleEl  = document.getElementById('gameover-title')!;
const gameoverSummary  = document.getElementById('gameover-summary')!;
const btnRetry         = document.getElementById('btn-retry') as HTMLButtonElement;
const btnGameoverMenu  = document.getElementById('btn-gameover-menu') as HTMLButtonElement;

function hideResultScreens() {
  clearScreenEl.classList.add('hidden');
  gameoverScreenEl.classList.add('hidden');
}

function showClearScreen(result: RunResult, earned: number) {
  closeAllPanels();
  overlay.classList.add('hidden');         // title menu stays hidden
  gameoverScreenEl.classList.add('hidden');
  clearScreenEl.classList.remove('hidden');

  const isFinal = result.levelId >= 100;
  clearTitleEl.textContent = isFinal ? 'YOU WON THE SOVEREIGN' : `LV ${result.levelId} CLEAR`;
  clearSummaryEl.innerHTML =
    `+<strong>${earned}</strong> PTS · Run score <strong>${result.score.toLocaleString()}</strong> · ` +
    `Kills <strong>${result.enemiesKilled}</strong>`;

  if (isFinal) {
    btnNext.textContent = 'PLAY AGAIN';
    btnNext.onclick = () => { audio.play('menu'); highestUnlocked = 1; saveProgress(1); hideResultScreens(); startLevel(1); };
  } else {
    const nextLv = Math.min(100, result.levelId + 1);
    btnNext.textContent = `NEXT LEVEL ${nextLv}`;
    btnNext.onclick = () => { audio.play('menu'); hideResultScreens(); startLevel(nextLv); };
  }
  btnClearMenu.onclick = () => { audio.play('menu'); hideResultScreens(); overlay.classList.remove('hidden'); refreshMenu(); };
}

function showGameOverScreen(result: RunResult) {
  closeAllPanels();
  overlay.classList.add('hidden');
  clearScreenEl.classList.add('hidden');
  gameoverScreenEl.classList.remove('hidden');

  gameoverTitleEl.textContent = 'GAME OVER';
  gameoverSummary.innerHTML =
    `Reached <strong>LV ${result.levelId}</strong> · ` +
    `Run score <strong>${result.score.toLocaleString()}</strong> · ` +
    `Kills <strong>${result.enemiesKilled}</strong> · ` +
    `Time <strong>${result.duration.toFixed(0)}s</strong>`;

  btnRetry.onclick = () => { audio.play('menu'); hideResultScreens(); startLevel(1); };
  btnGameoverMenu.onclick = () => { audio.play('menu'); hideResultScreens(); overlay.classList.remove('hidden'); refreshMenu(); };
}

/// Sync the main-menu "PRESS START / RESUME · LV X" label after progress changes.
function refreshMenu() {
  btnStart.textContent = currentLevel > 1 ? `RESUME · LV ${currentLevel}` : 'PRESS START';
  btnStart.onclick = () => { audio.prime(); audio.play('menu'); startLevel(currentLevel); };
}

// Service worker — production only.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[sw] register failed', e));
  });
}

console.log('BaseStriker booted. 100 levels ready.');
