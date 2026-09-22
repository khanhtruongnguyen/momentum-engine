/* ═══════════════════════════════════════════════════════════════
   THE MOMENTUM ENGINE — APP.JS
   Full state management, timer engine, economy, shop, goals
   ═══════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════
// 0. SOUND ENGINE (Web Audio API — no external files needed)
// ═══════════════════════════════════════════

const SoundEngine = (() => {
  const STORAGE_KEY_SOUND = 'momentum_sound_enabled';
  const STORAGE_KEY_VOL   = 'momentum_sound_volume';

  let _ctx = null;
  let _enabled = true;
  let _volume = 0.55; // 0..1

  // Lazy-init AudioContext on first user interaction
  function ctx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function loadPrefs() {
    const stored = localStorage.getItem(STORAGE_KEY_SOUND);
    _enabled = stored === null ? true : stored === 'true';
    const vol = parseFloat(localStorage.getItem(STORAGE_KEY_VOL));
    if (!isNaN(vol)) _volume = Math.max(0, Math.min(1, vol));
  }

  function setEnabled(v) {
    _enabled = !!v;
    localStorage.setItem(STORAGE_KEY_SOUND, _enabled);
    updateSoundUI();
  }

  function setVolume(v) {
    _volume = Math.max(0, Math.min(1, v));
    localStorage.setItem(STORAGE_KEY_VOL, _volume);
  }

  function isEnabled() { return _enabled; }
  function getVolume() { return _volume; }

  function updateSoundUI() {
    const btn = document.getElementById('sound-toggle-btn');
    const lbl = document.getElementById('sound-toggle-label');
    if (btn) btn.textContent = _enabled ? '🔊' : '🔇';
    if (lbl) lbl.textContent = _enabled ? 'Bật' : 'Tắt';
    const slider = document.getElementById('sound-volume-slider');
    if (slider) slider.disabled = !_enabled;
  }

  // ── Core synthesis helpers ──────────────────────────────────────

  function masterGain(c, vol) {
    const g = c.createGain();
    g.gain.value = vol !== undefined ? vol : _volume;
    g.connect(c.destination);
    return g;
  }

  function osc(c, type, freq, startT, duration, gainStart, gainEnd, dest) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, startT);
    g.gain.setValueAtTime(gainStart, startT);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainEnd), startT + duration);
    o.connect(g);
    g.connect(dest);
    o.start(startT);
    o.stop(startT + duration + 0.05);
    return o;
  }

  // ── Individual Sound Designs ─────────────────────────────────────

  // 1. UI click — subtle tick
  function click() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.3 * _volume);
    osc(c, 'square', 1200, t, 0.04, 0.4, 0.001, g);
  }

  // 2. Warmup start — rising whoosh + ignite
  function warmupStart() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, _volume);

    // Noise sweep
    const bufSize = c.sampleRate * 0.6;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(4000, t + 0.5);
    filter.Q.value = 2;
    const wg = c.createGain();
    wg.gain.setValueAtTime(0.001, t);
    wg.gain.linearRampToValueAtTime(_volume * 0.6, t + 0.3);
    wg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(filter); filter.connect(wg); wg.connect(c.destination);
    src.start(t); src.stop(t + 0.65);

    // Ignite notes
    [330, 440, 550, 660].forEach((f, i) => {
      osc(c, 'triangle', f, t + 0.35 + i * 0.06, 0.15, 0.4 * _volume, 0.001, g);
    });
  }

  // 3. Session start — energetic fanfare
  function sessionStart() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, _volume);

    [[220, 'sawtooth', 0], [330, 'sawtooth', 0.02], [440, 'sawtooth', 0.04],
     [660, 'triangle', 0.1], [880, 'triangle', 0.15], [1100, 'sine', 0.22]].forEach(([f, type, d]) => {
      osc(c, type, f, t + d, 0.5, 0.35 * _volume, 0.001, g);
    });
    osc(c, 'square', 1760, t + 0.3, 0.12, 0.25 * _volume, 0.001, g);
    osc(c, 'square', 2200, t + 0.35, 0.1, 0.2 * _volume, 0.001, g);
  }

  // 4. Chunk complete — bell ding dong
  function chunkComplete() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;

    [523, 659, 784, 1047].forEach((f, i) => {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      og.gain.setValueAtTime(0.5 * _volume, t + i * 0.12);
      og.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.8);
      o.connect(og); og.connect(c.destination);
      o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.9);

      const o2 = c.createOscillator();
      const og2 = c.createGain();
      o2.type = 'sine';
      o2.frequency.value = f * 2.76;
      og2.gain.setValueAtTime(0.15 * _volume, t + i * 0.12);
      og2.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.4);
      o2.connect(og2); og2.connect(c.destination);
      o2.start(t + i * 0.12); o2.stop(t + i * 0.12 + 0.5);
    });
  }

  // 5. Victory — triumphant fanfare
  function victory() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.8 * _volume);

    [[523, 0, 0.15, 'triangle'], [659, 0.15, 0.15, 'triangle'],
     [784, 0.30, 0.15, 'triangle'], [1047, 0.45, 0.30, 'triangle'],
     [784, 0.75, 0.1, 'triangle'], [1047, 0.85, 0.1, 'triangle'],
     [1319, 0.95, 0.55, 'sine']].forEach(([f, d, dur, type]) => {
      osc(c, type, f, t + d, dur, 0.5 * _volume, 0.001, g);
    });
    [261, 329, 392].forEach(f => osc(c, 'sine', f, t + 0.4, 1.1, 0.2 * _volume, 0.001, g));
    [2093, 2637, 3136].forEach((f, i) => {
      osc(c, 'sine', f, t + 0.95 + i * 0.07, 0.25, 0.12 * _volume, 0.001, g);
    });
  }

  // 6. Break start — soft chime
  function breakStart() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;

    [[880, 0], [698, 0.2], [523, 0.4], [440, 0.65]].forEach(([f, d]) => {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      og.gain.setValueAtTime(0.35 * _volume, t + d);
      og.gain.exponentialRampToValueAtTime(0.001, t + d + 0.9);
      o.connect(og); og.connect(c.destination);
      o.start(t + d); o.stop(t + d + 1.0);
    });
  }

  // 7. Break done — alert pings
  function breakDone() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, _volume);
    [[523, 0], [784, 0.12], [1047, 0.24], [1319, 0.36]].forEach(([f, d]) => {
      osc(c, 'triangle', f, t + d, 0.2, 0.4 * _volume, 0.001, g);
    });
  }

  // 8. Pause
  function pause() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.4 * _volume);
    osc(c, 'triangle', 440, t, 0.08, 0.5, 0.001, g);
    osc(c, 'triangle', 330, t + 0.06, 0.1, 0.4, 0.001, g);
  }

  // 9. Resume
  function resume() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.4 * _volume);
    osc(c, 'triangle', 330, t, 0.08, 0.5, 0.001, g);
    osc(c, 'triangle', 440, t + 0.07, 0.1, 0.4, 0.001, g);
  }

  // 10. Timer tick (last 10s)
  function tick() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.35 * _volume);
    osc(c, 'square', 880, t, 0.025, 0.6, 0.001, g);
  }

  // 11. Coin earned — sparkle
  function coinEarned() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      og.gain.setValueAtTime(0.3 * _volume, t + i * 0.05);
      og.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.25);
      o.connect(og); og.connect(c.destination);
      o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.3);
    });
  }

  // 12. Level up — epic jingle
  function levelUp() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.9 * _volume);

    [[261,'sawtooth',0,0.18],[329,'sawtooth',0.08,0.18],[392,'sawtooth',0.16,0.18],
     [523,'sawtooth',0.24,0.2],[659,'triangle',0.36,0.2],[784,'triangle',0.48,0.2],
     [1047,'sine',0.60,0.3],[1319,'sine',0.72,0.35],[1568,'sine',0.84,0.7]].forEach(([f, type, d, dur]) => {
      osc(c, type, f, t + d, dur, 0.45 * _volume, 0.001, g);
    });
    [2093, 2637, 3136, 4186].forEach((f, i) => {
      osc(c, 'sine', f, t + 1.1 + i * 0.06, 0.2, 0.15 * _volume, 0.001, g);
    });

    // Bass boom
    const boom = c.createOscillator();
    const boomG = c.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80, t);
    boom.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    boomG.gain.setValueAtTime(0.6 * _volume, t);
    boomG.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    boom.connect(boomG); boomG.connect(c.destination);
    boom.start(t); boom.stop(t + 0.45);
  }

  // 13. Bet win — jackpot coins cascade
  function betWin() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;

    [1047,1319,1568,1760,2093,1760,2093,2637,2093,2637,3136].forEach((f, i) => {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const delay = i * 0.07 + Math.random() * 0.03;
      og.gain.setValueAtTime(0.35 * _volume, t + delay);
      og.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.3);
      o.connect(og); og.connect(c.destination);
      o.start(t + delay); o.stop(t + delay + 0.35);
    });

    setTimeout(() => {
      const c2 = ctx();
      const t2 = c2.currentTime;
      const g2 = masterGain(c2, 0.7 * _volume);
      [[784,0],[1047,0.15],[1319,0.3]].forEach(([f, d]) => {
        osc(c2, 'triangle', f, t2 + d, 0.25, 0.4 * _volume, 0.001, g2);
      });
    }, 600);
  }

  // 14. Bet lose — sad slide
  function betLose() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.75 * _volume);

    const o = c.createOscillator();
    const og = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.7);
    og.gain.setValueAtTime(0.4 * _volume, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    o.connect(og); og.connect(c.destination);
    o.start(t); o.stop(t + 0.8);

    osc(c, 'triangle', 220, t + 0.2, 0.4, 0.2 * _volume, 0.001, g);
    osc(c, 'triangle', 174, t + 0.5, 0.5, 0.25 * _volume, 0.001, g);
  }

  // 15. Bankruptcy / demotion — dramatic fail
  function bankrupt() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.85 * _volume);

    [[110,0,0.5,'sawtooth'],[98,0.3,0.5,'sawtooth'],[87,0.6,0.7,'sawtooth'],[73,0.9,1.0,'sine']].forEach(([f,d,dur,type]) => {
      osc(c, type, f, t + d, dur, 0.5 * _volume, 0.001, g);
    });
    [0, 0.2, 0.4].forEach((d, i) => {
      osc(c, 'square', 130 - i * 14, t + d, 0.15, 0.3 * _volume, 0.001, g);
    });
  }

  // 16. Purchase — shop chime
  function purchase() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;

    [[1047,0],[1319,0.1],[1568,0.2],[2093,0.3]].forEach(([f, d]) => {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      og.gain.setValueAtTime(0.4 * _volume, t + d);
      og.gain.exponentialRampToValueAtTime(0.001, t + d + 0.5);
      o.connect(og); og.connect(c.destination);
      o.start(t + d); o.stop(t + d + 0.6);
    });
  }

  // 17. Warning — urgent beep pattern
  function warning() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.5 * _volume);
    [0, 0.15, 0.3].forEach(d => {
      osc(c, 'square', 880, t + d, 0.1, 0.5 * _volume, 0.001, g);
    });
  }

  // 18. Task created — creation ping
  function taskCreated() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.6 * _volume);
    osc(c, 'triangle', 659, t, 0.1, 0.5 * _volume, 0.001, g);
    osc(c, 'triangle', 880, t + 0.08, 0.15, 0.4 * _volume, 0.001, g);
    osc(c, 'sine', 1047, t + 0.18, 0.25, 0.35 * _volume, 0.001, g);
  }

  // 19. Task complete — success ding
  function taskComplete() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;

    [[523,0],[659,0.1],[784,0.2],[1047,0.3],[1319,0.42]].forEach(([f, d]) => {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      og.gain.setValueAtTime(0.4 * _volume, t + d);
      og.gain.exponentialRampToValueAtTime(0.001, t + d + 0.6);
      o.connect(og); og.connect(c.destination);
      o.start(t + d); o.stop(t + d + 0.7);
    });
  }

  // 20. Task failed — buzzer
  function taskFailed() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.5 * _volume);
    osc(c, 'square', 220, t, 0.2, 0.5 * _volume, 0.001, g);
    osc(c, 'square', 196, t + 0.25, 0.2, 0.4 * _volume, 0.001, g);
    osc(c, 'square', 165, t + 0.5, 0.35, 0.45 * _volume, 0.001, g);
  }

  // 21. Achievement — award fanfare
  function achievement() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.85 * _volume);

    [[659,0,0.12,'triangle'],[784,0.12,0.12,'triangle'],[880,0.24,0.12,'triangle'],
     [1047,0.36,0.35,'sine'],[880,0.72,0.1,'sine'],[1047,0.82,0.1,'sine'],[1319,0.92,0.6,'sine']].forEach(([f,d,dur,type]) => {
      osc(c, type, f, t + d, dur, 0.4 * _volume, 0.001, g);
    });
    [2093,2637,3136].forEach((f,i) => {
      osc(c, 'sine', f, t + 0.9 + i * 0.08, 0.3, 0.12 * _volume, 0.001, g);
    });
  }

  // 22. Goal created — commitment sound
  function goalCreated() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.6 * _volume);

    [[261,0,0.2,'triangle'],[329,0.15,0.2,'triangle'],[392,0.3,0.3,'triangle'],[523,0.45,0.5,'sine']].forEach(([f,d,dur,type]) => {
      osc(c, type, f, t + d, dur, 0.4 * _volume, 0.001, g);
    });
  }

  // 23. Check-in — positive confirm
  function checkIn() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.55 * _volume);
    osc(c, 'triangle', 523, t, 0.12, 0.4 * _volume, 0.001, g);
    osc(c, 'triangle', 659, t + 0.1, 0.12, 0.35 * _volume, 0.001, g);
    osc(c, 'sine', 784, t + 0.2, 0.3, 0.3 * _volume, 0.001, g);
  }

  // 24. Penalty created — ominous low beep
  function penaltyCreated() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.55 * _volume);
    osc(c, 'sawtooth', 165, t, 0.15, 0.4 * _volume, 0.001, g);
    osc(c, 'sawtooth', 147, t + 0.2, 0.15, 0.35 * _volume, 0.001, g);
    osc(c, 'square', 130, t + 0.4, 0.3, 0.3 * _volume, 0.001, g);
  }

  // 25. Penalty paid — relief chime
  function penaltyPaid() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.6 * _volume);
    [[330,0],[440,0.1],[550,0.2],[660,0.3]].forEach(([f, d]) => {
      osc(c, 'triangle', f, t + d, 0.3, 0.35 * _volume, 0.001, g);
    });
  }

  // 26. Quit session — sad short melody
  function quitSound() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.55 * _volume);
    [[440,0],[370,0.15],[311,0.3],[262,0.5]].forEach(([f, d]) => {
      osc(c, 'triangle', f, t + d, 0.2, 0.35 * _volume, 0.001, g);
    });
  }

  // 27. Notify — soft info ping
  function notify() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.35 * _volume);
    osc(c, 'sine', 880, t, 0.06, 0.4 * _volume, 0.001, g);
    osc(c, 'sine', 1046, t + 0.08, 0.1, 0.3 * _volume, 0.001, g);
  }

  // 28. Countdown urgent — rapid beeps
  function countdownUrgent() {
    if (!_enabled) return;
    const c = ctx();
    const t = c.currentTime;
    const g = masterGain(c, 0.4 * _volume);
    [660, 784, 880, 1047].forEach((f, i) => {
      osc(c, 'square', f, t + i * 0.06, 0.05, 0.4 * _volume, 0.001, g);
    });
  }

  // ── Init ─────────────────────────────────────────────────────────
  function init() {
    loadPrefs();
    document.addEventListener('click', () => {
      if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (_ctx.state === 'suspended') _ctx.resume();
    }, { once: true });
  }

  return {
    init, loadPrefs, setEnabled, setVolume, isEnabled, getVolume, updateSoundUI,
    click, warmupStart, sessionStart, chunkComplete, victory,
    breakStart, breakDone, pause, resume, tick,
    coinEarned, levelUp, betWin, betLose, bankrupt,
    purchase, warning, taskCreated, taskComplete, taskFailed,
    achievement, goalCreated, checkIn,
    penaltyCreated, penaltyPaid, quitSound, notify, countdownUrgent,
  };
})();

// ═══════════════════════════════════════════
// 1. STATE MANAGEMENT
// ═══════════════════════════════════════════

const STORAGE_KEY = 'momentum_engine_state';

const DEFAULT_STATE = {
  // Player
  level: 1,
  exp: 0,
  totalExp: 0,
  coins: 0,

  // Passive upgrades
  passiveCoinUpgrades: 0, // 0..20

  // Rest passes inventory: [{type:'45min'|'3hr', id:string}]
  restPasses: [],
  // Active rest pass: {id, type, activatedAt, expiresAt} | null
  activeRestPass: null,

  // Session history: [{id,date,durationMins,notes,expEarned,coinsEarned,type}]
  sessions: [],

  // Contracts: [{id,name,startDate,endDate,totalStake,winMult,lossMult,
  //              paymentType,dailyPayments:{[dateStr]:true},status:'active'|'success'|'failed',
  //              resolution:null|{type,amount,date}}]
  contracts: [],

  // Daily study bets: [{id,createdAt,targetDate,targetMins,stake,winMult,lossMult,
  //                     paymentType:'upfront'|'deferred',status:'active'|'success'|'failed',
  //                     resolution:null|{type,amount,actualMins,date}}]
  dailyBets: [],

  // Tasks: [{id,title,reward,penalty,durationMins,createdAt,expiresAt,
  //          status:'active'|'completed'|'failed',completedAt:null|ISO}]
  tasks: [],

  // Achievements/Bằng khen: [{id,emoji,title,level,category,date,description,stats[],createdAt}]
  achievements: [],

  // Penalty tickets: [{id, dirtyMins, fineAmount, createdAt, paidAt|null, demoted:bool}]
  penaltyTickets: [],

  // activeBlock: {
  //   targetMins: number,
  //   completedMins: number,
  //   betAmount: number,
  //   chunkMins: number,
  //   totalChunks: number,
  //   currentChunk: number,
  //   startedAt: number (ms epoch)
  // } | null
  activeBlock: null,
  // Active timer session (persisted for anti-throttle)
  timerSession: null
  // timerSession shape: {
  //   type: 'warmup' | 'main' | 'break',
  //   startTime: number (ms epoch),
  //   targetEndTime: number (ms epoch),
  //   durationMs: number,
  //   isPaused: boolean,
  //   pauseStartTime: number|null,
  //   accumulatedPauseTime: number (ms),
  //   bet: {amount: number} | null,
  //   pomodoroMode: boolean,
  //   sessionDurationMins: number  // original selection for main
  // }
};

let state = {};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } else {
      state = { ...DEFAULT_STATE };
    }
  } catch {
    state = { ...DEFAULT_STATE };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save state:', e);
  }
  // Debounced push to Gist after every save
  if (typeof GistSync !== 'undefined') GistSync.debouncedPush();
}

// ═══════════════════════════════════════════
// 1b. GITHUB GIST SYNC
// ═══════════════════════════════════════════

const GistSync = (() => {
  const SETTINGS_KEY  = 'momentum_gist_settings';
  const GIST_FILENAME = 'momentum_engine_data.json';
  const API_BASE      = 'https://api.github.com';

  let _pushTimer = null;      // debounce timer id
  let _isSyncing = false;     // prevent concurrent sync
  let _initialized = false;   // prevent push before first pull is done

  /* ── Helpers ─────────────────────────────────────────────────────── */

  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch { return {}; }
  }

  function saveSettings(token, gistId) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ token, gistId }));
  }

  function setStatus(msg, type = 'idle') {
    // type: 'idle' | 'syncing' | 'ok' | 'error'
    const statusEl  = document.getElementById('gist-sync-status');
    const iconEl    = document.getElementById('gist-header-icon');
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.className   = `gist-status gist-status--${type}`;
    }
    if (iconEl) {
      iconEl.className = `gist-header-icon gist-icon--${type}`;
      iconEl.title     = msg;
    }
  }

  function buildHeaders(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/vnd.github+json',
      'Content-Type':  'application/json',
    };
  }

  /* ── Core API calls ──────────────────────────────────────────────── */

  async function fetchGist(token, gistId) {
    const res = await fetch(`${API_BASE}/gists/${gistId}`, {
      headers: buildHeaders(token),
    });
    if (!res.ok) throw new Error(`GET gist failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async function patchGist(token, gistId, content) {
    const body = JSON.stringify({
      files: { [GIST_FILENAME]: { content } },
    });
    const res = await fetch(`${API_BASE}/gists/${gistId}`, {
      method:  'PATCH',
      headers: buildHeaders(token),
      body,
    });
    if (!res.ok) throw new Error(`PATCH gist failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async function postGist(token) {
    const body = JSON.stringify({
      description: 'Momentum Engine — sync data',
      public:      false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({ _created: new Date().toISOString() }),
        },
      },
    });
    const res = await fetch(`${API_BASE}/gists`, {
      method:  'POST',
      headers: buildHeaders(token),
      body,
    });
    if (!res.ok) throw new Error(`POST gist failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /* ── Pull (remote → local) ───────────────────────────────────────── */

  async function pull() {
    const { token, gistId } = getSettings();
    if (!token || !gistId) return null;  // not configured

    setStatus('Đang đồng bộ…', 'syncing');
    const data = await fetchGist(token, gistId);
    const file  = data.files && data.files[GIST_FILENAME];
    if (!file || !file.content) return null;  // empty / first use

    const remoteState = JSON.parse(file.content);
    // Remove internal sync metadata before merging
    delete remoteState._syncedAt;
    return remoteState;
  }

  /* ── Push (local → remote) ───────────────────────────────────────── */

  async function push() {
    const { token, gistId } = getSettings();
    if (!token || !gistId) return;
    if (!_initialized) return;  // wait until first pull completed

    const content = JSON.stringify({ ...state, _syncedAt: new Date().toISOString() }, null, 2);
    await patchGist(token, gistId, content);
  }

  /* ── Public API ──────────────────────────────────────────────────── */

  function debouncedPush() {
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(async () => {
      if (_isSyncing) return;
      const { token, gistId } = getSettings();
      if (!token || !gistId || !_initialized) return;
      _isSyncing = true;
      try {
        setStatus('Đang đẩy dữ liệu…', 'syncing');
        await push();
        const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        setStatus(`✅ Đã đồng bộ lúc ${now}`, 'ok');
      } catch (err) {
        console.warn('GistSync push error:', err);
        setStatus(`❌ Lỗi đẩy: ${err.message}`, 'error');
      } finally {
        _isSyncing = false;
      }
    }, 2000); // 2-second debounce
  }

  // Pull from remote, then merge into local state (last-write-wins: remote wins on initial load)
  async function syncFromRemote({ silent = false } = {}) {
    if (_isSyncing) return;
    const { token, gistId } = getSettings();
    if (!token || !gistId) {
      _initialized = true;
      return;
    }
    _isSyncing = true;
    if (!silent) setStatus('Đang tải dữ liệu…', 'syncing');
    try {
      const remoteState = await pull();
      if (remoteState && Object.keys(remoteState).length > 1) {
        // Remote has real data — merge it into local (remote wins for initial pull)
        state = { ...DEFAULT_STATE, ...remoteState };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {}
        updateHeaderUI();
        renderWeeklyChart();
        renderSessionHistory();
        renderShop();
        renderGoals();
        renderPenalties();
        renderDailyBets();
        renderTasks();
        renderAchievements();
        if (!silent) showToast('☁️ Đã tải dữ liệu từ Gist!', 'info');
      }
      const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      setStatus(`✅ Đã đồng bộ lúc ${now}`, 'ok');
    } catch (err) {
      console.warn('GistSync pull error:', err);
      setStatus(`❌ Lỗi tải: ${err.message}`, 'error');
      if (!silent) showToast(`❌ Lỗi đồng bộ: ${err.message}`, 'error');
    } finally {
      _isSyncing = false;
      _initialized = true;
    }
  }

  async function createNewGist() {
    const token = document.getElementById('gist-token-input').value.trim();
    if (!token) { showToast('⚠️ Vui lòng nhập GitHub Token trước!', 'warning'); return; }

    setStatus('Đang tạo Gist mới…', 'syncing');
    const btn = document.getElementById('btn-create-gist');
    btn.disabled = true;
    try {
      const data = await postGist(token);
      document.getElementById('gist-id-input').value = data.id;
      saveSettings(token, data.id);
      _initialized = true;
      setStatus('✅ Đã tạo Gist thành công!', 'ok');
      showToast('🎉 Gist đã được tạo! Token và Gist ID đã được lưu.', 'success');
      populateSettingsUI();
    } catch (err) {
      setStatus(`❌ Lỗi: ${err.message}`, 'error');
      showToast(`❌ Không thể tạo Gist: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function saveSettingsAndSync() {
    const token  = document.getElementById('gist-token-input').value.trim();
    const gistId = document.getElementById('gist-id-input').value.trim();
    if (!token)  { showToast('⚠️ Vui lòng nhập GitHub Token!', 'warning'); return; }
    if (!gistId) { showToast('⚠️ Vui lòng nhập Gist ID (hoặc bấm Tạo Gist mới)!', 'warning'); return; }

    saveSettings(token, gistId);
    _initialized = false; // reset so pull can happen fresh
    showToast('💾 Đã lưu cài đặt. Đang đồng bộ…', 'info');
    await syncFromRemote();
  }

  function populateSettingsUI() {
    const { token, gistId } = getSettings();
    const tokenEl  = document.getElementById('gist-token-input');
    const gistIdEl = document.getElementById('gist-id-input');
    if (tokenEl && token)  tokenEl.value  = token;
    if (gistIdEl && gistId) gistIdEl.value = gistId;

    const { token: t, gistId: g } = getSettings();
    const configured = !!(t && g);
    const infoEl = document.getElementById('gist-configured-info');
    if (infoEl) {
      infoEl.textContent = configured
        ? `✅ Đang đồng bộ với Gist: ${g}`
        : '⚠️ Chưa cấu hình — nhập token và Gist ID bên dưới.';
      infoEl.className = `gist-configured-info ${configured ? 'gist-info--ok' : 'gist-info--warn'}`;
    }
  }

  function isConfigured() {
    const { token, gistId } = getSettings();
    return !!(token && gistId);
  }

  return {
    debouncedPush,
    syncFromRemote,
    createNewGist,
    saveSettingsAndSync,
    populateSettingsUI,
    isConfigured,
    getSettings,
  };
})();

// ═══════════════════════════════════════════
// 2. ECONOMY & LEVELING
// ═══════════════════════════════════════════

function expForLevel(level) {
  return level * 100;
}

function getCoinMultiplier() {
  return 1 + (state.passiveCoinUpgrades * 0.10);
}

function addExp(amount) {
  if (amount <= 0) return;
  state.exp += amount;
  state.totalExp += amount;
  // Check level ups
  while (state.exp >= expForLevel(state.level)) {
    state.exp -= expForLevel(state.level);
    state.level++;
    SoundEngine.levelUp();
    showToast(`🎉 Lên cấp ${state.level}! Tiếp tục phát huy!`, 'success');
    const levelEl = document.getElementById('player-level');
    if (levelEl) {
      levelEl.classList.remove('level-up-flash');
      void levelEl.offsetWidth;
      levelEl.classList.add('level-up-flash');
    }
  }
  saveState();
  updateHeaderUI();
}

function addCoins(amount) {
  state.coins += amount;

  // ── Trừng phạt phá sản: nợ quá -500 Xu ──
  if (state.coins < -500) {
    state.exp = 0;
    state.totalExp = 0;
    state.level = 1;
    SoundEngine.bankrupt();
    showToast('💀 Phá sản! Bạn đã bị xóa sạch EXP và trở về Cấp 1 do nợ quá sâu!', 'error');
  } else if (amount > 0) {
    SoundEngine.coinEarned();
  }

  saveState();
  updateHeaderUI();
  const coinEl = document.getElementById('player-coins');
  if (coinEl) {
    coinEl.classList.remove('pop');
    void coinEl.offsetWidth;
    coinEl.classList.add('pop');
  }
}

function getMaxBet(durationMins) {
  if (durationMins >= 241) return 400;
  if (durationMins >= 181) return 300;
  if (durationMins >= 121) return 130;
  if (durationMins >= 91)  return 70;
  if (durationMins >= 31)  return 30;
  return 10; // <= 30 phút
}

// ═══════════════════════════════════════════
// 3. UI UPDATES — HEADER
// ═══════════════════════════════════════════

function updateHeaderUI() {
  document.getElementById('player-level').textContent = state.level;

  const needed = expForLevel(state.level);
  const pct = Math.min((state.exp / needed) * 100, 100);
  document.getElementById('exp-bar').style.width = pct + '%';
  document.getElementById('exp-text').textContent = `${state.exp} / ${needed}`;

  const coinEl = document.getElementById('player-coins');
  coinEl.textContent = state.coins;
  coinEl.classList.toggle('negative', state.coins < 0);
}

// ═══════════════════════════════════════════
// 4. TAB SWITCHING
// ═══════════════════════════════════════════

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const id = panel.id.replace('tab-', '');
    if (id === tabName) {
      panel.classList.remove('hidden');
      panel.classList.add('active');
    } else {
      panel.classList.add('hidden');
      panel.classList.remove('active');
    }
  });
  // Refresh tab-specific content
  if (tabName === 'study') {
    renderWeeklyChart();
    renderWeeklySummary();
    renderSessionHistory();
  } else if (tabName === 'shop') {
    renderShop();
    renderPenalties();
  } else if (tabName === 'goals') {
    renderGoals();
    checkDailyBets();
    renderDailyBets();
  } else if (tabName === 'tasks') {
    checkExpiredTasks();
    renderTasks();
  } else if (tabName === 'achievements') {
    renderAchievements();
  } else if (tabName === 'settings') {
    GistSync.populateSettingsUI();
  }
}

// ═══════════════════════════════════════════
// 5. TIMER ENGINE (Anti-Throttle)
// ═══════════════════════════════════════════

let timerRAF = null;
const CIRCUMFERENCE = 2 * Math.PI * 100; // r=100 in SVG

function getRemainingMs() {
  const s = state.timerSession;
  if (!s) return 0;
  if (s.isPaused) {
    // Time frozen at the moment pause was clicked
    const elapsed = s.pauseStartTime - s.startTime - s.accumulatedPauseTime;
    return s.durationMs - elapsed;
  }
  const now = Date.now();
  const elapsed = now - s.startTime - s.accumulatedPauseTime;
  return Math.max(0, s.durationMs - elapsed);
}

function formatTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function updateTimerDisplay() {
  const s = state.timerSession;
  if (!s) return;

  const remaining = getRemainingMs();
  const progress = 1 - (remaining / s.durationMs);

  // Update time text
  document.getElementById('timer-time').textContent = formatTime(remaining);

  // Update SVG ring
  const ring = document.getElementById('timer-progress');
  if (ring) {
    ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  }

  // Update type label
  const typeLabels = {
    warmup: '🔥 Khởi động',
    main: state.activeBlock
      ? `🍅 Phiên ${state.activeBlock.currentChunk} / ${state.activeBlock.totalChunks}`
      : '🎯 Phiên học',
    break: '☕ Nghỉ ngơi'
  };
  document.getElementById('timer-type').textContent = typeLabels[s.type] || s.type;

  // Update status
  const statusEl = document.getElementById('timer-status');
  if (s.isPaused) {
    statusEl.textContent = '⏸ Đang tạm dừng';
  } else {
    statusEl.textContent = '';
  }

  // Pause button text
  const pauseIcon = document.getElementById('pause-icon');
  const pauseLabel = document.getElementById('pause-label');
  if (s.isPaused) {
    if (pauseIcon) pauseIcon.textContent = '▶';
    if (pauseLabel) pauseLabel.textContent = 'Tiếp tục';
  } else {
    if (pauseIcon) pauseIcon.textContent = '⏸';
    if (pauseLabel) pauseLabel.textContent = 'Tạm dừng';
  }
}

function timerTick() {
  const s = state.timerSession;
  if (!s) {
    cancelAnimationFrame(timerRAF);
    timerRAF = null;
    return;
  }

  updateTimerDisplay();

  const remaining = getRemainingMs();

  // Countdown tick sounds (only for main/warmup, not break)
  if (!s.isPaused && s.type !== 'break') {
    const remSec = Math.ceil(remaining / 1000);
    if (remSec <= 10 && remSec > 0) {
      // Play tick once per second
      const prevRemSec = Math.ceil((remaining + 16) / 1000); // ~16ms per frame
      if (prevRemSec !== remSec) {
        if (remSec <= 3) {
          SoundEngine.countdownUrgent();
        } else {
          SoundEngine.tick();
        }
      }
    }
  }

  if (remaining <= 0 && !s.isPaused) {
    // Timer completed!
    onTimerComplete();
    return;
  }

  timerRAF = requestAnimationFrame(timerTick);
}

function startTimerLoop() {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  timerRAF = requestAnimationFrame(timerTick);
}

function stopTimerLoop() {
  if (timerRAF) {
    cancelAnimationFrame(timerRAF);
    timerRAF = null;
  }
  // Dọn dẹp breakRAF để tránh memory leak
  if (breakRAF) {
    cancelAnimationFrame(breakRAF);
    breakRAF = null;
  }
}

// ═══════════════════════════════════════════
// 6. SESSION MANAGEMENT
// ═══════════════════════════════════════════

function showStudySetup() {
  document.getElementById('study-setup').classList.remove('hidden');
  document.getElementById('study-active').classList.add('hidden');
  document.getElementById('study-break').classList.add('hidden');
}

function showStudyActive() {
  document.getElementById('study-setup').classList.add('hidden');
  document.getElementById('study-active').classList.remove('hidden');
  document.getElementById('study-break').classList.add('hidden');
  // Hide block progress by default — updateBlockProgressUI() will show it when needed
  const bp = document.getElementById('block-progress');
  if (bp) bp.classList.add('hidden');
}

function showStudyBreak() {
  document.getElementById('study-setup').classList.add('hidden');
  document.getElementById('study-active').classList.add('hidden');
  document.getElementById('study-break').classList.remove('hidden');
}

function startWarmup() {
  const durationMs = 5 * 60 * 1000; // 5 minutes
  state.timerSession = {
    type: 'warmup',
    startTime: Date.now(),
    targetEndTime: Date.now() + durationMs,
    durationMs,
    isPaused: false,
    pauseStartTime: null,
    accumulatedPauseTime: 0,
    bet: null,
    pomodoroMode: false,
    sessionDurationMins: 5
  };
  saveState();
  showStudyActive();
  updateBetActiveDisplay();
  startTimerLoop();
  SoundEngine.warmupStart();
  showToast('🔥 Khởi động 5 phút — bạn làm được!', 'info');
}

function startMainSession() {
  const targetInput = document.getElementById('session-target-total');
  const chunkInput = document.getElementById('session-chunk');
  const targetMins = parseInt(targetInput.value, 10);
  const chunkMins = parseInt(chunkInput.value, 10);

  if (isNaN(targetMins) || targetMins < 25) {
    showToast('⚠️ Tổng thời gian tối thiểu là 25 phút!', 'warning');
    targetInput.classList.add('shake');
    setTimeout(() => targetInput.classList.remove('shake'), 500);
    return;
  }
  if (targetMins > 720) {
    showToast('⚠️ Tổng thời gian tối đa là 720 phút (12 giờ)!', 'warning');
    return;
  }
  if (isNaN(chunkMins) || chunkMins < 5) {
    showToast('⚠️ Phiên nhỏ tối thiểu là 5 phút!', 'warning');
    chunkInput.classList.add('shake');
    setTimeout(() => chunkInput.classList.remove('shake'), 500);
    return;
  }
  if (chunkMins > 60) {
    showToast('⚠️ Phiên nhỏ tối đa là 60 phút!', 'warning');
    return;
  }
  if (chunkMins > targetMins) {
    showToast('⚠️ Phiên nhỏ không được lớn hơn tổng thời gian!', 'warning');
    return;
  }

  // Validate bet
  const betInput = document.getElementById('bet-amount');
  let betAmount = parseInt(betInput.value, 10) || 0;
  const maxBet = getMaxBet(targetMins);
  if (betAmount > maxBet) {
    showToast(`⚠️ Cược tối đa cho ${targetMins} phút là ${maxBet} Xu!`, 'warning');
    betInput.classList.add('shake');
    setTimeout(() => betInput.classList.remove('shake'), 500);
    return;
  }
  if (betAmount < 0) betAmount = 0;

  const totalChunks = Math.ceil(targetMins / chunkMins);
  const firstChunkMins = Math.min(chunkMins, targetMins);
  const durationMs = firstChunkMins * 60 * 1000;

  // Create activeBlock to track the entire macro-session
  state.activeBlock = {
    targetMins,
    completedMins: 0,
    betAmount,
    chunkMins,
    totalChunks,
    currentChunk: 1,
    startedAt: Date.now()
  };

  // Create timer for the first chunk
  state.timerSession = {
    type: 'main',
    startTime: Date.now(),
    targetEndTime: Date.now() + durationMs,
    durationMs,
    isPaused: false,
    pauseStartTime: null,
    accumulatedPauseTime: 0,
    bet: null,
    pomodoroMode: false,
    sessionDurationMins: firstChunkMins
  };
  saveState();
  showStudyActive();
  updateBetActiveDisplay();
  updateBlockProgressUI();
  startTimerLoop();
  SoundEngine.sessionStart();

  const betText = betAmount > 0 ? ` | Cược: ${betAmount} Xu` : '';
  showToast(`🚀 Bắt đầu buổi học ${targetMins}p (${totalChunks} phiên × ${chunkMins}p)${betText}!`, 'info');
}

function updateBetActiveDisplay() {
  const betDisplay = document.getElementById('bet-active-display');
  const block = state.activeBlock;
  if (block && block.betAmount > 0) {
    betDisplay.classList.remove('hidden');
    document.getElementById('bet-active-amount').textContent = block.betAmount;
  } else {
    betDisplay.classList.add('hidden');
  }
}

function pauseSession() {
  const s = state.timerSession;
  if (!s) return;

  if (s.isPaused) {
    // Resume
    const pauseDuration = Date.now() - s.pauseStartTime;
    s.accumulatedPauseTime += pauseDuration;
    s.isPaused = false;
    s.pauseStartTime = null;
    saveState();
    SoundEngine.resume();
    showToast('▶ Tiếp tục — tập trung!', 'info');
  } else {
    // Pause
    s.isPaused = true;
    s.pauseStartTime = Date.now();
    saveState();
    SoundEngine.pause();
    showToast('⏸ Đã tạm dừng', 'info');
  }
  updateTimerDisplay();
}

function quitSession() {
  const block = state.activeBlock;
  const betAmount = block ? block.betAmount : 0;

  showConfirm(
    'Bỏ cuộc?',
    betAmount > 0
      ? `Bạn sẽ mất ${betAmount * 10} Xu (10× cược). EXP/Xu từ các phiên đã hoàn thành vẫn được giữ. Chắc chắn bỏ cuộc?`
      : 'Bạn sẽ không nhận thêm EXP hay Xu. Chắc chắn bỏ cuộc?',
    () => {
      SoundEngine.quitSound();
      // Apply bet loss
      if (betAmount > 0) {
        const loss = betAmount * 10;
        addCoins(-loss);
        showToast(`💸 Mất ${loss} Xu (10× cược)! EXP/Xu phiên trước vẫn giữ.`, 'error');
      } else {
        showToast('🏳️ Đã bỏ cuộc — EXP/Xu phiên trước vẫn giữ.', 'warning');
      }

      state.activeBlock = null;
      state.timerSession = null;
      saveState();
      stopTimerLoop();
      showStudySetup();
      renderWeeklyChart();
      renderSessionHistory();
    }
  );
}

function onTimerComplete() {
  stopTimerLoop();
  const s = state.timerSession;
  if (!s) return;

  if (s.type === 'warmup') {
    // Warmup done — award a small bonus, go to setup
    const earnedExp = 5;
    const earnedCoins = Math.round(5 * getCoinMultiplier());
    addExp(earnedExp);
    addCoins(earnedCoins);

    state.sessions.push({
      id: Date.now().toString(),
      date: new Date().toISOString(),
      durationMins: 5,
      notes: '',
      expEarned: earnedExp,
      coinsEarned: earnedCoins,
      type: 'warmup'
    });

    state.timerSession = null;
    saveState();
    showStudySetup();
    SoundEngine.chunkComplete();
    showToast('🔥 Khởi động xong! Sẵn sàng cho buổi học!', 'success');
    renderWeeklyChart();
    renderSessionHistory();
    return;
  }

  if (s.type === 'break') {
    // Break done — show "start next chunk" button, DON'T auto-start
    state.timerSession = null;
    saveState();
    showBreakDone();
    SoundEngine.breakDone();
    showToast('☕ Nghỉ xong! Bấm nút để bắt đầu phiên tiếp theo.', 'info');
    return;
  }

  // ═══ Main chunk completed! ═══
  const block = state.activeBlock;
  if (!block) return;

  const chunkMins = s.sessionDurationMins;

  // Award EXP & Xu IMMEDIATELY for this chunk
  const earnedExp = chunkMins;
  const earnedCoins = Math.round(chunkMins * getCoinMultiplier());
  addExp(earnedExp);
  addCoins(earnedCoins);

  // Record this chunk in session history
  state.sessions.push({
    id: Date.now().toString(),
    date: new Date().toISOString(),
    durationMins: chunkMins,
    notes: '',
    expEarned: earnedExp,
    coinsEarned: earnedCoins,
    type: 'pomodoro-chunk'
  });

  // Update block progress
  block.completedMins += chunkMins;

  SoundEngine.chunkComplete();
  showToast(`✅ Phiên ${block.currentChunk} hoàn thành! +${earnedExp} EXP, +${earnedCoins} Xu`, 'success');

  // Check if entire block is done
  if (block.completedMins >= block.targetMins) {
    // ═══ ALL DONE! Show retrospective with bet winnings ═══
    let betWinnings = 0;
    if (block.betAmount > 0) {
      betWinnings = block.betAmount * 2;
    }

    const totalEarnedCoins = Math.round(block.completedMins * getCoinMultiplier());

    const resultsDiv = document.getElementById('session-results');
    resultsDiv.innerHTML = `
      <div class="result-row">
        <span class="result-label">⏱ Tổng thời gian</span>
        <span class="result-value">${block.completedMins} phút (${block.currentChunk} phiên)</span>
      </div>
      <div class="result-row">
        <span class="result-label">✨ Tổng EXP đã nhận</span>
        <span class="result-value positive">+${block.completedMins} EXP</span>
      </div>
      <div class="result-row">
        <span class="result-label">🪙 Tổng Xu đã nhận</span>
        <span class="result-value positive">+${totalEarnedCoins} Xu</span>
      </div>
      ${betWinnings > 0 ? `
      <div class="result-row">
        <span class="result-label">🎰 Thắng cược</span>
        <span class="result-value positive">+${betWinnings} Xu</span>
      </div>
      <div class="result-row" style="border-top:1px solid rgba(120,100,255,0.15); padding-top:8px; margin-top:4px;">
        <span class="result-label"><strong>Tổng Xu (học + cược)</strong></span>
        <span class="result-value positive"><strong>+${totalEarnedCoins + betWinnings} Xu</strong></span>
      </div>` : ''}
    `;

    // Victory sound — bet win if applicable, else general victory
    if (betWinnings > 0) {
      SoundEngine.betWin();
    } else {
      SoundEngine.victory();
    }

    // Store pending bet reward (EXP/Xu already awarded per chunk)
    state._pendingReward = {
      betWinnings,
      totalMins: block.completedMins,
      totalChunks: block.currentChunk
    };
    state.timerSession = null;
    saveState();

    document.getElementById('retro-notes').value = '';
    document.getElementById('retrospective-modal').classList.remove('hidden');
    showStudyActive();
    updateBlockProgressUI(); // Show 100% progress
    return;
  }

  // ═══ Not done yet — auto-start 5-minute break ═══
  block.currentChunk++;
  state.timerSession = null;
  saveState();
  startBreak();
  renderWeeklyChart();
  renderSessionHistory();
}

function saveRetrospective() {
  const notes = document.getElementById('retro-notes').value.trim();
  const r = state._pendingReward;
  if (!r) return;

  // Award bet winnings (EXP/Xu already awarded per chunk)
  if (r.betWinnings > 0) {
    addCoins(r.betWinnings);
  }

  // Store notes on the last chunk session entry
  if (notes && state.sessions.length > 0) {
    state.sessions[state.sessions.length - 1].notes = notes;
  }

  delete state._pendingReward;
  state.activeBlock = null;
  saveState();

  document.getElementById('retrospective-modal').classList.add('hidden');
  showStudySetup();

  if (r.betWinnings > 0) {
    showToast(`🎉 Buổi học hoàn thành! +${r.betWinnings} Xu thưởng cược!`, 'success');
  } else {
    showToast('🎉 Buổi học hoàn thành xuất sắc!', 'success');
  }
  renderWeeklyChart();
  renderSessionHistory();
}

function startBreak() {
  const durationMs = 5 * 60 * 1000;
  state.timerSession = {
    type: 'break',
    startTime: Date.now(),
    targetEndTime: Date.now() + durationMs,
    durationMs,
    isPaused: false,
    pauseStartTime: null,
    accumulatedPauseTime: 0,
    bet: null,
    pomodoroMode: false,
    sessionDurationMins: 5
  };
  saveState();
  showStudyBreak();
  // Reset break UI to countdown mode
  document.getElementById('break-actions').classList.remove('hidden');
  document.getElementById('break-done-actions').classList.add('hidden');
  document.getElementById('break-emoji').textContent = '☕';
  document.getElementById('break-title').textContent = 'Nghỉ ngơi nào!';
  updateBreakBlockProgress();
  startBreakTimerLoop();
  SoundEngine.breakStart();
  showToast('☕ Nghỉ 5 phút — thư giãn đi!', 'info');
}

let breakRAF = null;

function startBreakTimerLoop() {
  if (breakRAF) cancelAnimationFrame(breakRAF);

  function tick() {
    const s = state.timerSession;
    if (!s || s.type !== 'break') {
      cancelAnimationFrame(breakRAF);
      breakRAF = null;
      return;
    }
    const remaining = getRemainingMs();
    document.getElementById('break-timer-time').textContent = formatTime(remaining);
    if (remaining <= 0) {
      onTimerComplete();
      return;
    }
    breakRAF = requestAnimationFrame(tick);
  }
  breakRAF = requestAnimationFrame(tick);
}

function skipBreak() {
  if (breakRAF) cancelAnimationFrame(breakRAF);
  breakRAF = null;
  state.timerSession = null;
  saveState();
  startNextChunk();
}

function showBreakDone() {
  showStudyBreak();
  document.getElementById('break-actions').classList.add('hidden');
  document.getElementById('break-done-actions').classList.remove('hidden');
  document.getElementById('break-emoji').textContent = '✅';
  document.getElementById('break-title').textContent = 'Nghỉ xong!';
  document.getElementById('break-timer-time').textContent = '00:00';
  updateBreakBlockProgress();
}

function startNextChunk() {
  const block = state.activeBlock;
  if (!block) {
    showStudySetup();
    return;
  }

  // Calculate chunk duration (last chunk may be shorter)
  const remainingMins = block.targetMins - block.completedMins;
  const actualChunkMins = Math.min(block.chunkMins, remainingMins);
  const durationMs = actualChunkMins * 60 * 1000;

  state.timerSession = {
    type: 'main',
    startTime: Date.now(),
    targetEndTime: Date.now() + durationMs,
    durationMs,
    isPaused: false,
    pauseStartTime: null,
    accumulatedPauseTime: 0,
    bet: null,
    pomodoroMode: false,
    sessionDurationMins: actualChunkMins
  };
  saveState();
  showStudyActive();
  updateBetActiveDisplay();
  updateBlockProgressUI();
  startTimerLoop();

  showToast(`🍅 Phiên ${block.currentChunk} / ${block.totalChunks} — ${actualChunkMins} phút. Tập trung!`, 'info');
}

function updateBlockProgressUI() {
  const block = state.activeBlock;
  const progressEl = document.getElementById('block-progress');
  if (!block || !progressEl) return;

  progressEl.classList.remove('hidden');
  const pct = Math.min(100, (block.completedMins / block.targetMins) * 100);
  document.getElementById('block-progress-bar').style.width = pct + '%';
  document.getElementById('block-progress-label').textContent =
    `Phiên ${block.currentChunk} / ${block.totalChunks}`;
  document.getElementById('block-progress-time').textContent =
    `${block.completedMins} / ${block.targetMins} phút`;
}

function updateBreakBlockProgress() {
  const block = state.activeBlock;
  const progressEl = document.getElementById('break-block-progress');
  if (!block || !progressEl) return;

  const pct = Math.min(100, (block.completedMins / block.targetMins) * 100);
  document.getElementById('break-block-bar').style.width = pct + '%';
  document.getElementById('break-block-label').textContent =
    `Đã hoàn thành: ${block.completedMins} / ${block.targetMins} phút`;
}

// ═══════════════════════════════════════════
// 7. SHOP & UPGRADES
// ═══════════════════════════════════════════

function renderShop() {
  // Passive upgrade
  const level = state.passiveCoinUpgrades;
  document.getElementById('passive-upgrade-level').textContent = `${level} / 20`;
  document.getElementById('passive-upgrade-bar').style.width = `${(level / 20) * 100}%`;
  document.getElementById('passive-upgrade-bonus').textContent = `+${level * 10}% bonus`;

  const btnBuy = document.getElementById('btn-buy-passive');
  if (level >= 20) {
    btnBuy.textContent = '✅ Đã nâng cấp tối đa!';
    btnBuy.disabled = true;
  } else {
    btnBuy.textContent = '🛒 Mua nâng cấp — 500 Xu';
    btnBuy.disabled = false;
  }

  // Inventory
  renderInventory();
}

function buyPassiveUpgrade() {
  if (state.passiveCoinUpgrades >= 20) {
    showToast('⚠️ Đã đạt tối đa 20 lần nâng cấp!', 'warning');
    return;
  }
  if (state.coins < 500) {
    showToast('💰 Không đủ Xu! Cần 500 Xu.', 'error');
    return;
  }
  addCoins(-500);
  state.passiveCoinUpgrades++;
  saveState();
  renderShop();
  SoundEngine.purchase();
  showToast(`⚡ Nâng cấp thành công! +${state.passiveCoinUpgrades * 10}% Xu bonus`, 'success');
}

function buyRestPass(type) {
  const cost = type === '45min' ? 100 : 350;
  const name = type === '45min' ? 'Vé nghỉ 45 phút' : 'Vé nghỉ 3 giờ';
  if (state.coins < cost) {
    SoundEngine.warning();
    showToast(`💰 Không đủ Xu! Cần ${cost} Xu.`, 'error');
    return;
  }
  addCoins(-cost);
  state.restPasses.push({
    id: Date.now().toString(),
    type
  });
  saveState();
  renderShop();
  SoundEngine.purchase();
  showToast(`🎫 Đã mua ${name}!`, 'success');
}

function activateRestPass(passId) {
  if (state.activeRestPass) {
    SoundEngine.warning();
    showToast('⚠️ Đã có vé đang hoạt động!', 'warning');
    return;
  }
  const idx = state.restPasses.findIndex(p => p.id === passId);
  if (idx === -1) return;
  const pass = state.restPasses[idx];
  const durationMs = pass.type === '45min' ? 45 * 60 * 1000 : 3 * 60 * 60 * 1000;
  state.activeRestPass = {
    id: pass.id,
    type: pass.type,
    activatedAt: Date.now(),
    expiresAt: Date.now() + durationMs
  };
  state.restPasses.splice(idx, 1);
  saveState();
  renderShop();
  const label = pass.type === '45min' ? '45 phút' : '3 giờ';
  SoundEngine.purchase();
  showToast(`✅ Đã kích hoạt Vé nghỉ ${label}!`, 'success');
}

function renderInventory() {
  const container = document.getElementById('inventory-list');

  // Check if active rest pass has expired
  if (state.activeRestPass && Date.now() > state.activeRestPass.expiresAt) {
    state.activeRestPass = null;
    saveState();
  }

  let html = '';

  // Active pass banner
  if (state.activeRestPass) {
    const remaining = state.activeRestPass.expiresAt - Date.now();
    const label = state.activeRestPass.type === '45min' ? '45 phút' : '3 giờ';
    html += `
      <div class="active-pass-banner">
        <div>
          <strong>🟢 Vé nghỉ ${label} đang hoạt động</strong>
        </div>
        <span class="pass-timer">Còn ${formatTime(remaining)}</span>
      </div>
    `;
  }

  // Group passes by type
  const passes45 = state.restPasses.filter(p => p.type === '45min');
  const passes3h = state.restPasses.filter(p => p.type === '3hr');

  if (passes45.length === 0 && passes3h.length === 0 && !state.activeRestPass) {
    container.innerHTML = '<p class="empty-state">Kho đồ trống — hãy mua vé nghỉ ngơi!</p>';
    return;
  }

  if (passes45.length > 0) {
    html += `
      <div class="inventory-item">
        <div class="inv-info">
          <span class="inv-icon">☕</span>
          <div>
            <div class="inv-name">Vé nghỉ 45 phút</div>
            <div class="inv-count">Số lượng: ${passes45.length}</div>
          </div>
        </div>
        <button class="btn btn-success btn-small" onclick="activateRestPass('${passes45[0].id}')">
          Kích hoạt
        </button>
      </div>
    `;
  }

  if (passes3h.length > 0) {
    html += `
      <div class="inventory-item">
        <div class="inv-info">
          <span class="inv-icon">🛏️</span>
          <div>
            <div class="inv-name">Vé nghỉ 3 giờ</div>
            <div class="inv-count">Số lượng: ${passes3h.length}</div>
          </div>
        </div>
        <button class="btn btn-success btn-small" onclick="activateRestPass('${passes3h[0].id}')">
          Kích hoạt
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
}

// ═══════════════════════════════════════════
// 8. PENALTY TICKETS
// ═══════════════════════════════════════════

const PENALTY_RATE = 3; // Xu per dirty minute
const PENALTY_OVERDUE_DAYS = 5;

function createPenaltyTicket() {
  const input = document.getElementById('dirty-mins-input');
  const dirtyMins = parseInt(input.value, 10);
  if (isNaN(dirtyMins) || dirtyMins <= 0) {
    showToast('⚠️ Nhập số phút chơi bẩn hợp lệ!', 'warning');
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 500);
    return;
  }
  const fineAmount = dirtyMins * PENALTY_RATE;
  state.penaltyTickets.push({
    id: Date.now().toString(),
    dirtyMins,
    fineAmount,
    createdAt: new Date().toISOString(),
    paidAt: null,
    demoted: false
  });
  saveState();
  input.value = '';
  document.getElementById('fine-preview').textContent = '— Xu';
  renderPenalties();
  SoundEngine.penaltyCreated();
  showToast(`📋 Đã tạo phiếu phạt ${dirtyMins} phút → ${fineAmount} Xu. Nộp phạt trước 5 ngày!`, 'warning');
}

function payPenaltyTicket(id) {
  const ticket = state.penaltyTickets.find(t => t.id === id);
  if (!ticket || ticket.paidAt) return;
  if (state.coins < ticket.fineAmount) {
    SoundEngine.warning();
    showToast(`💰 Không đủ Xu! Cần ${ticket.fineAmount} Xu để nộp phạt.`, 'error');
    return;
  }
  addCoins(-ticket.fineAmount);
  ticket.paidAt = new Date().toISOString();
  saveState();
  renderPenalties();
  SoundEngine.penaltyPaid();
  showToast(`✅ Đã nộp phạt ${ticket.fineAmount} Xu! Lần sau nhớ mua vé nhé.`, 'success');
}

function demoteLevel() {
  if (state.level <= 1) {
    state.exp = 0;
    SoundEngine.bankrupt();
    showToast('💀 Phiếu phạt quá hạn 5 ngày! EXP bị xóa (đã ở cấp 1).', 'error');
  } else {
    state.level--;
    state.exp = 0;
    SoundEngine.betLose();
    showToast(`💔 Bị hạ xuống Cấp ${state.level} do phiếu phạt quá hạn 5 ngày!`, 'error');
  }
  saveState();
  updateHeaderUI();
}

function checkOverduePenalties() {
  const now = Date.now();
  const threshold = PENALTY_OVERDUE_DAYS * 24 * 60 * 60 * 1000;
  let newDemotions = 0;
  (state.penaltyTickets || []).forEach(ticket => {
    if (!ticket.paidAt && !ticket.demoted) {
      if (now - new Date(ticket.createdAt).getTime() >= threshold) {
        ticket.demoted = true;
        newDemotions++;
      }
    }
  });
  if (newDemotions > 0) {
    for (let i = 0; i < newDemotions; i++) demoteLevel();
    saveState();
  }
}

function updateFinePreview() {
  const input = document.getElementById('dirty-mins-input');
  const preview = document.getElementById('fine-preview');
  if (!input || !preview) return;
  const mins = parseInt(input.value, 10);
  preview.textContent = (mins > 0) ? `${mins * PENALTY_RATE} Xu` : '— Xu';
}

function renderPenalties() {
  checkOverduePenalties();
  const container = document.getElementById('penalty-list');
  if (!container) return;

  const tickets = state.penaltyTickets || [];
  if (tickets.length === 0) {
    container.innerHTML = '<p class="empty-state">Chưa có phiếu phạt nào. Chơi sạch nhé! 😇</p>';
    return;
  }

  const now = Date.now();
  const threshold = PENALTY_OVERDUE_DAYS * 24 * 60 * 60 * 1000;
  const unpaid = tickets.filter(t => !t.paidAt);
  const paid   = tickets.filter(t =>  t.paidAt);

  let html = '';

  if (unpaid.length > 0) {
    html += '<div class="penalty-section-label">⏳ Chưa thanh toán</div>';
    unpaid.forEach(ticket => {
      const age = now - new Date(ticket.createdAt).getTime();
      const msLeft = threshold - age;
      const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
      const urgent  = daysLeft <= 1 && !ticket.demoted;
      const createdStr = new Date(ticket.createdAt).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
      html += `
        <div class="penalty-item${ticket.demoted ? ' penalty-overdue' : urgent ? ' penalty-urgent' : ''}">
          <div class="penalty-info">
            <div class="penalty-meta">
              <span class="penalty-icon">${ticket.demoted ? '⚠️' : '🎮'}</span>
              <div>
                <div class="penalty-mins">${ticket.dirtyMins} phút chơi bẩn</div>
                <div class="penalty-date">Ngày tạo: ${createdStr}</div>
              </div>
            </div>
            <div class="penalty-deadline${urgent ? ' urgent' : ''}">
              ${ticket.demoted
                ? '⚠️ Đã bị hạ 1 cấp — vẫn cần nộp phạt!'
                : `⏰ Còn <strong>${daysLeft}</strong> ngày trước khi bị hạ cấp`}
            </div>
          </div>
          <div class="penalty-right">
            <div class="penalty-amount">${ticket.fineAmount} Xu</div>
            <button class="btn btn-danger btn-small" onclick="payPenaltyTicket('${ticket.id}')">
              Nộp phạt
            </button>
          </div>
        </div>
      `;
    });
  }

  if (paid.length > 0) {
    html += '<div class="penalty-section-label" style="margin-top:16px;">✅ Đã thanh toán</div>';
    [...paid].reverse().slice(0, 10).forEach(ticket => {
      const createdStr = new Date(ticket.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const paidStr    = new Date(ticket.paidAt).toLocaleDateString('vi-VN',    { day: '2-digit', month: '2-digit', year: 'numeric' });
      html += `
        <div class="penalty-item penalty-paid">
          <div class="penalty-info">
            <div class="penalty-meta">
              <span class="penalty-icon">✅</span>
              <div>
                <div class="penalty-mins">${ticket.dirtyMins} phút chơi bẩn</div>
                <div class="penalty-date">Tạo: ${createdStr} &nbsp;·&nbsp; Nộp: ${paidStr}</div>
              </div>
            </div>
          </div>
          <div class="penalty-right">
            <div class="penalty-amount paid">−${ticket.fineAmount} Xu</div>
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

// ═══════════════════════════════════════════
// 9. GOALS / CONTRACTS
// ═══════════════════════════════════════════

function openGoalModal() {
  document.getElementById('goal-modal').classList.remove('hidden');
  // Set default dates
  const today = new Date();
  document.getElementById('goal-start').value = formatDateInput(today);
  const nextMonth = new Date(today);
  nextMonth.setDate(nextMonth.getDate() + 30);
  document.getElementById('goal-end').value = formatDateInput(nextMonth);
}

function closeGoalModal() {
  document.getElementById('goal-modal').classList.add('hidden');
}

function formatDateInput(date) {
  return date.toISOString().split('T')[0];
}

function createGoal() {
  const name = document.getElementById('goal-name').value.trim();
  const startDate = document.getElementById('goal-start').value;
  const endDate = document.getElementById('goal-end').value;
  const totalStake = parseInt(document.getElementById('goal-stake').value, 10);
  const winMult = parseFloat(document.getElementById('goal-win-mult').value);
  const lossMult = parseFloat(document.getElementById('goal-loss-mult').value);
  const paymentType = document.getElementById('goal-payment-type').value;

  if (!name) {
    showToast('⚠️ Vui lòng nhập tên mục tiêu!', 'warning');
    return;
  }
  if (!startDate || !endDate) {
    showToast('⚠️ Vui lòng chọn ngày bắt đầu và kết thúc!', 'warning');
    return;
  }
  if (new Date(endDate) <= new Date(startDate)) {
    showToast('⚠️ Ngày kết thúc phải sau ngày bắt đầu!', 'warning');
    return;
  }
  if (isNaN(totalStake) || totalStake <= 0) {
    showToast('⚠️ Số Xu đặt cược không hợp lệ!', 'warning');
    return;
  }

  // Upfront payment: phải đủ Xu mới cho tạo
  if (paymentType === 'upfront') {
    if (state.coins < totalStake) {
      showToast(`💰 Không đủ Xu! Cần ${totalStake} Xu để trả trước.`, 'error');
      return;
    }
    addCoins(-totalStake);
    showToast(`💰 Đã trừ ${totalStake} Xu (trả trước).`, 'info');
  }

  const contract = {
    id: Date.now().toString(),
    name,
    startDate,
    endDate,
    totalStake,
    winMult,
    lossMult,
    paymentType,
    dailyPayments: {},
    status: 'active',
    resolution: null
  };

  // If daily, mark today as first payment — phải đủ Xu
  if (paymentType === 'daily') {
    const totalDays = getTotalDays(startDate, endDate);
    const dailyStake = Math.ceil(totalStake / totalDays);
    const todayStr = formatDateInput(new Date());
    if (todayStr >= startDate) {
      if (state.coins < dailyStake) {
        showToast(`💰 Không đủ Xu! Cần ${dailyStake} Xu để trả góp ngày đầu.`, 'error');
        return;
      }
      contract.dailyPayments[todayStr] = true;
      addCoins(-dailyStake);
      showToast(`💰 Trả góp ngày đầu: ${dailyStake} Xu.`, 'info');
    }
  }

  state.contracts.push(contract);
  saveState();
  closeGoalModal();
  renderGoals();
  SoundEngine.goalCreated();
  showToast(`🎯 Tạo mục tiêu "${name}" thành công!`, 'success');
}

function getTotalDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  // +1 để tính đủ ngày bao hàm (inclusive): VD 1/9 → 3/9 = 3 ngày
  return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
}

function checkInGoal(contractId) {
  const contract = state.contracts.find(c => c.id === contractId);
  if (!contract || contract.status !== 'active') return;

  const todayStr = formatDateInput(new Date());
  if (contract.dailyPayments[todayStr]) {
    showToast('✅ Đã check-in hôm nay rồi!', 'info');
    return;
  }

  const totalDays = getTotalDays(contract.startDate, contract.endDate);
  const dailyStake = Math.ceil(contract.totalStake / totalDays);

  // Phải đủ Xu mới cho check-in (chỉ phạt thua mới âm được)
  if (contract.paymentType === 'daily' && state.coins < dailyStake) {
    showToast(`💰 Không đủ Xu! Cần ${dailyStake} Xu để check-in hôm nay.`, 'error');
    return;
  }

  contract.dailyPayments[todayStr] = true;

  if (contract.paymentType === 'daily') {
    addCoins(-dailyStake);
    SoundEngine.checkIn();
    showToast(`📅 Check-in thành công! Trả góp ${dailyStake} Xu.`, 'success');
  } else {
    SoundEngine.checkIn();
    showToast('📅 Check-in thành công!', 'success');
  }

  saveState();
  renderGoals();
}

function resolveGoal(contractId, success) {
  const contract = state.contracts.find(c => c.id === contractId);
  if (!contract || contract.status !== 'active') return;

  const action = () => {
    if (success) {
      const payout = Math.round(contract.totalStake * contract.winMult);
      addCoins(payout);
      contract.status = 'success';
      contract.resolution = { type: 'success', amount: payout, date: new Date().toISOString() };
      SoundEngine.betWin();
      showToast(`🎉 Mục tiêu thành công! +${payout} Xu!`, 'success');
    } else {
      const penalty = Math.round(contract.totalStake * contract.lossMult);
      addCoins(-penalty);
      contract.status = 'failed';
      contract.resolution = { type: 'failed', amount: penalty, date: new Date().toISOString() };
      SoundEngine.betLose();
      showToast(`💔 Mục tiêu thất bại. Mất ${penalty} Xu.`, 'error');
    }
    saveState();
    renderGoals();
  };

  if (success) {
    action();
  } else {
    showConfirm(
      'Thất bại?',
      `Bạn sẽ mất ${Math.round(contract.totalStake * contract.lossMult)} Xu. Chắc chắn?`,
      action
    );
  }
}

function checkMissedDailyPayments() {
  const todayStr = formatDateInput(new Date());
  state.contracts.forEach(contract => {
    if (contract.status !== 'active' || contract.paymentType !== 'daily') return;
    // Check if any day between start and yesterday was missed
    const start = new Date(contract.startDate);
    const today = new Date(todayStr);
    const check = new Date(start);
    while (check < today) {
      const dateStr = formatDateInput(check);
      if (dateStr >= contract.startDate && dateStr < todayStr && !contract.dailyPayments[dateStr]) {
        // Missed payment! Auto-fail
        const penalty = Math.round(contract.totalStake * contract.lossMult);
        addCoins(-penalty);
        contract.status = 'failed';
        contract.resolution = {
          type: 'failed',
          amount: penalty,
          date: new Date().toISOString(),
          reason: `Bỏ lỡ check-in ngày ${dateStr}`
        };
        showToast(`💔 Mục tiêu "${contract.name}" thất bại — bỏ lỡ ngày ${dateStr}!`, 'error');
        break;
      }
      check.setDate(check.getDate() + 1);
    }
  });
  saveState();
}

function renderGoals() {
  checkMissedDailyPayments();

  const activeList = document.getElementById('active-contracts');
  const completedList = document.getElementById('completed-contracts');

  const active = state.contracts.filter(c => c.status === 'active');
  const completed = state.contracts.filter(c => c.status !== 'active');

  if (active.length === 0) {
    activeList.innerHTML = '<p class="empty-state">Chưa có mục tiêu nào — tạo ngay để cam kết!</p>';
  } else {
    activeList.innerHTML = active.map(c => renderContractCard(c)).join('');
  }

  if (completed.length === 0) {
    completedList.innerHTML = '<p class="empty-state">Chưa có mục tiêu hoàn thành</p>';
  } else {
    completedList.innerHTML = completed.map(c => renderContractCard(c)).join('');
  }
}

function renderContractCard(c) {
  const totalDays = getTotalDays(c.startDate, c.endDate);
  const daysPassed = Math.max(0, Math.ceil((Date.now() - new Date(c.startDate)) / (1000 * 60 * 60 * 24)));
  const progressPct = Math.min(100, (daysPassed / totalDays) * 100);
  const paidDays = Object.keys(c.dailyPayments).length;
  const todayStr = formatDateInput(new Date());
  const hasPaidToday = c.dailyPayments[todayStr];
  const dailyStake = Math.ceil(c.totalStake / totalDays);

  const statusClass = c.status === 'active' ? 'status-active' :
                      c.status === 'success' ? 'status-success' : 'status-failed';
  const statusLabel = c.status === 'active' ? 'Đang thực hiện' :
                      c.status === 'success' ? 'Thành công' : 'Thất bại';

  // Chỉ cho phép giải quyết sau khi hết ngày endDate
  const hasEnded = todayStr > c.endDate;

  let actionsHtml = '';
  if (c.status === 'active') {
    actionsHtml = `
      <div class="contract-actions">
        ${c.paymentType === 'daily' && !hasPaidToday && !hasEnded ? `
          <button class="btn btn-accent btn-small" onclick="checkInGoal('${c.id}')">
            📅 Check-in hôm nay (${dailyStake} Xu)
          </button>
        ` : c.paymentType === 'daily' && hasPaidToday && !hasEnded ? `
          <button class="btn btn-secondary btn-small" disabled>✅ Đã check-in hôm nay</button>
        ` : ''}
        ${hasEnded ? `
          <button class="btn btn-success btn-small" onclick="resolveGoal('${c.id}', true)">
            🏆 Tuyên bố thành công
          </button>
          <button class="btn btn-danger btn-small" onclick="resolveGoal('${c.id}', false)">
            ❌ Tuyên bố thất bại
          </button>
        ` : `
          <span style="font-size:0.78rem;color:var(--text-muted);font-style:italic;padding:4px 0;">
            🔒 Kết quả mở khóa sau ${formatDisplayDate(c.endDate)}
          </span>
        `}
      </div>
    `;
  }

  let resolutionHtml = '';
  if (c.resolution) {
    const sign = c.resolution.type === 'success' ? '+' : '-';
    const cls = c.resolution.type === 'success' ? 'positive' : 'negative';
    resolutionHtml = `
      <div class="result-row" style="margin-top:8px;">
        <span class="result-label">Kết quả</span>
        <span class="result-value ${cls}">${sign}${c.resolution.amount} Xu</span>
      </div>
      ${c.resolution.reason ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">${c.resolution.reason}</div>` : ''}
    `;
  }

  return `
    <div class="contract-item">
      <div class="contract-header">
        <span class="contract-name">${escapeHtml(c.name)}</span>
        <span class="contract-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="contract-details">
        <div class="contract-detail">
          <span class="detail-label">Bắt đầu</span>
          <span class="detail-value">${formatDisplayDate(c.startDate)}</span>
        </div>
        <div class="contract-detail">
          <span class="detail-label">Kết thúc</span>
          <span class="detail-value">${formatDisplayDate(c.endDate)}</span>
        </div>
        <div class="contract-detail">
          <span class="detail-label">Tổng cược</span>
          <span class="detail-value">${c.totalStake} Xu</span>
        </div>
        <div class="contract-detail">
          <span class="detail-label">Thắng / Thua</span>
          <span class="detail-value">×${c.winMult} / ×${c.lossMult}</span>
        </div>
        <div class="contract-detail">
          <span class="detail-label">Thanh toán</span>
          <span class="detail-value">${c.paymentType === 'upfront' ? 'Trả trước' : 'Hàng ngày'}</span>
        </div>
        ${c.paymentType === 'daily' ? `
        <div class="contract-detail">
          <span class="detail-label">Đã check-in</span>
          <span class="detail-value">${paidDays} / ${totalDays} ngày</span>
        </div>` : ''}
      </div>
      <div class="contract-progress">
        <span class="progress-text">Tiến độ: ${Math.round(progressPct)}% (${daysPassed}/${totalDays} ngày)</span>
        <div class="progress-bar-container">
          <div class="progress-bar" style="width:${progressPct}%"></div>
        </div>
      </div>
      ${resolutionHtml}
      ${actionsHtml}
    </div>
  `;
}

// ═══════════════════════════════════════════
// 9b. DAILY STUDY BETS
// ═══════════════════════════════════════════

/**
 * Returns total study minutes logged for a given local date string (YYYY-MM-DD).
 */
function getDayStudyMins(dateStr) {
  return (state.sessions || []).filter(s => {
    return formatDateInput(new Date(s.date)) === dateStr;
  }).reduce((sum, s) => sum + (s.durationMins || 0), 0);
}

/**
 * Auto-resolve any active daily bets whose targetDate has passed.
 * Called on load and every minute.
 */
function checkDailyBets() {
  if (!state.dailyBets || state.dailyBets.length === 0) return;
  const todayStr = formatDateInput(new Date());
  let changed = false;

  state.dailyBets.forEach(bet => {
    if (bet.status !== 'active') return;
    // Only resolve bets from days that have already ended (before today)
    if (bet.targetDate >= todayStr) return;

    const actualMins = getDayStudyMins(bet.targetDate);
    const success = actualMins >= bet.targetMins;
    const winAmount = Math.round(bet.stake * bet.winMult);
    const lossAmount = Math.round(bet.stake * bet.lossMult);
    const dateLabel = formatDisplayDate(bet.targetDate);
    const hrsActual = (actualMins / 60).toFixed(1);
    const hrsTarget = (bet.targetMins / 60).toFixed(1);

    if (success) {
      addCoins(winAmount);
      bet.status = 'success';
      bet.resolution = { type: 'success', amount: winAmount, actualMins, date: new Date().toISOString() };
      showToast(`🏆 Phiếu cược ${dateLabel}: Học ${hrsActual}h ≥ ${hrsTarget}h mục tiêu! +${winAmount} Xu!`, 'success');
    } else {
      addCoins(-lossAmount);
      bet.status = 'failed';
      bet.resolution = { type: 'failed', amount: lossAmount, actualMins, date: new Date().toISOString() };
      showToast(`💔 Phiếu cược ${dateLabel}: Chỉ học ${hrsActual}h / ${hrsTarget}h. −${lossAmount} Xu.`, 'error');
    }
    changed = true;
  });

  if (changed) {
    saveState();
    renderDailyBets();
  }
}

function openDailyBetModal() {
  const todayStr = formatDateInput(new Date());
  document.getElementById('daily-bet-date-display').textContent =
    new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  document.getElementById('daily-bet-target-hrs').value = 5;
  document.getElementById('daily-bet-stake').value = 50;
  document.getElementById('daily-bet-win-mult').value = 2;
  document.getElementById('daily-bet-loss-mult').value = 3;
  document.getElementById('daily-bet-payment-type').value = 'upfront';
  updateDailyBetPreview();
  document.getElementById('daily-bet-modal').classList.remove('hidden');
}

function closeDailyBetModal() {
  document.getElementById('daily-bet-modal').classList.add('hidden');
}

function updateDailyBetPreview() {
  const hrs = parseFloat(document.getElementById('daily-bet-target-hrs').value) || 0;
  document.getElementById('daily-bet-mins-preview').textContent = Math.round(hrs * 60);

  const stake = parseInt(document.getElementById('daily-bet-stake').value, 10) || 0;
  const winMult = parseFloat(document.getElementById('daily-bet-win-mult').value) || 2;
  const lossMult = parseFloat(document.getElementById('daily-bet-loss-mult').value) || 3;
  const paymentType = document.getElementById('daily-bet-payment-type').value;

  document.getElementById('daily-bet-win-preview').textContent = `+${Math.round(stake * winMult)} Xu`;
  document.getElementById('daily-bet-loss-preview').textContent = `−${Math.round(stake * lossMult)} Xu`;

  const upfrontInfo = document.getElementById('daily-bet-upfront-info');
  if (paymentType === 'upfront') {
    upfrontInfo.classList.remove('hidden');
    document.getElementById('daily-bet-upfront-amount').textContent = stake;
  } else {
    upfrontInfo.classList.add('hidden');
  }
}

function createDailyBet() {
  const hrs = parseFloat(document.getElementById('daily-bet-target-hrs').value);
  const stake = parseInt(document.getElementById('daily-bet-stake').value, 10);
  const winMult = parseFloat(document.getElementById('daily-bet-win-mult').value);
  const lossMult = parseFloat(document.getElementById('daily-bet-loss-mult').value);
  const paymentType = document.getElementById('daily-bet-payment-type').value;

  if (isNaN(hrs) || hrs <= 0 || hrs > 24) {
    showToast('⚠️ Mục tiêu học từ 0.5 đến 24 giờ!', 'warning'); return;
  }
  if (isNaN(stake) || stake <= 0) {
    showToast('⚠️ Nhập số Xu đặt cược hợp lệ!', 'warning'); return;
  }
  if (winMult < 1) { showToast('⚠️ Hệ số thắng phải ≥ 1!', 'warning'); return; }
  if (lossMult < 1) { showToast('⚠️ Hệ số thua phải ≥ 1!', 'warning'); return; }

  if (paymentType === 'upfront' && state.coins < stake) {
    showToast(`💰 Không đủ Xu! Cần ${stake} Xu để trả trước.`, 'error'); return;
  }

  if (paymentType === 'upfront') {
    addCoins(-stake);
    showToast(`💰 Đã trừ ${stake} Xu (trả trước).`, 'info');
  }

  const targetMins = Math.round(hrs * 60);
  const todayStr = formatDateInput(new Date());

  if (!state.dailyBets) state.dailyBets = [];
  state.dailyBets.push({
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    targetDate: todayStr,
    targetMins,
    stake,
    winMult,
    lossMult,
    paymentType,
    status: 'active',
    resolution: null
  });

  saveState();
  closeDailyBetModal();
  renderDailyBets();
  const hrsLabel = Number.isInteger(hrs) ? `${hrs} giờ` : `${hrs} giờ (${targetMins} phút)`;
  showToast(`📅 Đã tạo phiếu cược! Mục tiêu: ${hrsLabel} hôm nay — chúc học tốt!`, 'success');
}

function renderDailyBets() {
  const container = document.getElementById('daily-bets-list');
  if (!container) return;

  const bets = state.dailyBets || [];
  if (bets.length === 0) {
    container.innerHTML = '<p class="empty-state">Chưa có phiếu cược ngày nào. Tạo ngay để thách thức bản thân!</p>';
    return;
  }

  const todayStr = formatDateInput(new Date());
  const active   = bets.filter(b => b.status === 'active');
  const resolved = [...bets].filter(b => b.status !== 'active').reverse().slice(0, 20);

  let html = '';

  // ── Active / pending bets ──
  if (active.length > 0) {
    html += '<div class="penalty-section-label">⏳ Đang theo dõi</div>';
    active.forEach(bet => {
      const actualMins = getDayStudyMins(bet.targetDate);
      const pct = Math.min(100, (actualMins / bet.targetMins) * 100);
      const isToday = bet.targetDate === todayStr;
      const isPast  = bet.targetDate < todayStr;
      const hrsTarget = parseFloat((bet.targetMins / 60).toFixed(1));
      const hrsActual = parseFloat((actualMins / 60).toFixed(1));
      const winAmount  = Math.round(bet.stake * bet.winMult);
      const lossAmount = Math.round(bet.stake * bet.lossMult);
      const remaining  = bet.targetMins - actualMins;
      const remainingLabel = remaining > 0
        ? `Còn thiếu <strong>${remaining} phút</strong> (${parseFloat((remaining/60).toFixed(1))} giờ)`
        : '✅ Đã đủ mục tiêu!';

      html += `
        <div class="daily-bet-item${isPast ? ' daily-bet-past' : ''} ${pct >= 100 ? 'daily-bet-on-track' : ''}"> 
          <div class="daily-bet-header">
            <div class="daily-bet-title">
              <span class="daily-bet-icon">📅</span>
              <div>
                <div class="daily-bet-date">
                  ${formatDisplayDate(bet.targetDate)}
                  ${isToday ? '<span class="today-badge">Hôm nay</span>' : ''}
                  ${isPast ? '<span class="overdue-badge">Đang xử lý...</span>' : ''}
                </div>
                <div class="daily-bet-target">Mục tiêu: <strong>${hrsTarget} giờ</strong> (${bet.targetMins} phút)</div>
              </div>
            </div>
            <div class="daily-bet-stakes">
              <span class="dbet-win">🏆 +${winAmount}</span>
              <span class="dbet-loss">💔 −${lossAmount}</span>
            </div>
          </div>

          <div class="daily-bet-progress-section">
            <div class="daily-bet-progress-header">
              <span>Đã học: <strong>${hrsActual} giờ</strong> (${actualMins} / ${bet.targetMins} phút)</span>
              <span class="dbet-pct ${pct >= 100 ? 'dbet-pct-done' : ''}">${Math.round(pct)}%</span>
            </div>
            <div class="dbet-bar-container">
              <div class="dbet-bar ${pct >= 100 ? 'dbet-bar-done' : ''}" style="width:${pct}%"></div>
            </div>
            <div class="dbet-remaining">${remainingLabel}</div>
          </div>

          <div class="daily-bet-footer">
            <span class="dbet-payment">
              ${bet.paymentType === 'upfront'
                ? `💰 Đã trả trước ${bet.stake} Xu`
                : `📅 Trả sau khi kết thúc ngày`}
            </span>
          </div>
        </div>
      `;
    });
  }

  // ── Resolved bets ──
  if (resolved.length > 0) {
    html += '<div class="penalty-section-label" style="margin-top:16px">📋 Đã kết thúc</div>';
    resolved.forEach(bet => {
      const r = bet.resolution;
      const ok = bet.status === 'success';
      const hrsTarget = parseFloat((bet.targetMins / 60).toFixed(1));
      const hrsActual = r ? parseFloat((r.actualMins / 60).toFixed(1)) : '?';
      html += `
        <div class="daily-bet-item daily-bet-resolved ${ok ? 'daily-bet-success' : 'daily-bet-failed'}">
          <div class="daily-bet-header">
            <div class="daily-bet-title">
              <span class="daily-bet-icon">${ok ? '🏆' : '💔'}</span>
              <div>
                <div class="daily-bet-date">${formatDisplayDate(bet.targetDate)}</div>
                <div class="daily-bet-target">
                  Mục tiêu: ${hrsTarget}h &nbsp;·&nbsp;
                  Thực tế: <strong>${hrsActual}h</strong>
                  ${r ? `(${r.actualMins} phút)` : ''}
                </div>
              </div>
            </div>
            <div class="dbet-result-amount ${ok ? 'positive' : 'negative'}">
              ${ok ? '+' : '−'}${r ? r.amount : '?'} Xu
            </div>
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}


// ═══════════════════════════════════════════
// 9d. TASKS
// ═══════════════════════════════════════════

let taskCountdownInterval = null;

function getTaskRemainingMs(task) {
  return Math.max(0, new Date(task.expiresAt).getTime() - Date.now());
}

function checkExpiredTasks() {
  if (!state.tasks || state.tasks.length === 0) return;
  let changed = false;
  state.tasks.forEach(task => {
    if (task.status !== 'active') return;
    if (getTaskRemainingMs(task) <= 0) {
      addCoins(-task.penalty);
      task.status = 'failed';
      task.completedAt = new Date().toISOString();
      SoundEngine.taskFailed();
      showToast(`⏰ Nhiệm vụ "${task.title}" hết giờ! −${task.penalty} Xu.`, 'error');
      changed = true;
    }
  });
  if (changed) { saveState(); renderTasks(); }
}

function openTaskModal() {
  document.getElementById('task-title').value = '';
  document.getElementById('task-reward').value = 20;
  document.getElementById('task-penalty').value = 50;
  document.getElementById('task-hours').value = 1;
  document.getElementById('task-minutes').value = 0;
  updateTaskPreview();
  document.getElementById('task-modal').classList.remove('hidden');
  document.getElementById('task-title').focus();
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.add('hidden');
}

function updateTaskPreview() {
  const reward  = parseInt(document.getElementById('task-reward').value, 10) || 0;
  const penalty = parseInt(document.getElementById('task-penalty').value, 10) || 0;
  document.getElementById('task-preview-win').textContent  = `+${reward} Xu`;
  document.getElementById('task-preview-loss').textContent = `−${penalty} Xu`;
}

function createTask() {
  const title   = document.getElementById('task-title').value.trim();
  const reward  = parseInt(document.getElementById('task-reward').value, 10);
  const penalty = parseInt(document.getElementById('task-penalty').value, 10);
  const hours   = parseInt(document.getElementById('task-hours').value, 10) || 0;
  const minutes = parseInt(document.getElementById('task-minutes').value, 10) || 0;
  const totalMins = hours * 60 + minutes;

  if (!title)                          { showToast('⚠️ Nhập tên nhiệm vụ!', 'warning');          return; }
  if (isNaN(reward)  || reward  < 0)  { showToast('⚠️ Phần thưởng không hợp lệ!', 'warning'); return; }
  if (isNaN(penalty) || penalty < 0)  { showToast('⚠️ Tiền phạt không hợp lệ!', 'warning');   return; }
  if (totalMins <= 0)                  { showToast('⚠️ Thời gian phải > 0!', 'warning');            return; }

  const now = Date.now();
  if (!state.tasks) state.tasks = [];
  state.tasks.push({
    id: now.toString(),
    title,
    reward,
    penalty,
    durationMins: totalMins,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + totalMins * 60 * 1000).toISOString(),
    status: 'active',
    completedAt: null
  });

  saveState();
  closeTaskModal();
  renderTasks();
  const label = hours > 0 ? `${hours}h${minutes > 0 ? minutes+'p' : ''}` : `${minutes}p`;
  SoundEngine.taskCreated();
  showToast(`✅ Đã tạo nhiệm vụ "${title}" (${label}) — cố lên!`, 'success');
}

function completeTask(id) {
  const task = (state.tasks || []).find(t => t.id === id);
  if (!task || task.status !== 'active') return;
  if (getTaskRemainingMs(task) <= 0) { checkExpiredTasks(); return; }
  showConfirm(
    '✅ Hoàn thành nhiệm vụ?',
    `Xác nhận đã hoàn thành "${task.title}"? Bạn sẽ nhận ${task.reward} Xu.`,
    () => {
      addCoins(task.reward);
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      saveState();
      renderTasks();
      SoundEngine.taskComplete();
      showToast(`🎉 Hoàn thành "${task.title}"! +${task.reward} Xu!`, 'success');
    }
  );
}

function startTaskCountdownInterval() {
  if (taskCountdownInterval) return;
  taskCountdownInterval = setInterval(() => {
    const active = (state.tasks || []).filter(t => t.status === 'active');
    if (active.length === 0) {
      clearInterval(taskCountdownInterval);
      taskCountdownInterval = null;
      return;
    }
    let anyExpired = false;
    active.forEach(task => {
      const rem = getTaskRemainingMs(task);
      const el  = document.getElementById(`task-cd-${task.id}`);
      if (el) {
        if (rem <= 0) {
          el.textContent = '⏰ Hết giờ!';
          el.className = 'task-countdown task-cd-expired';
          anyExpired = true;
        } else {
          const urgency = rem / (task.durationMins * 60000);
          el.textContent = formatTime(rem);
          el.className = `task-countdown ${urgency < 0.1 ? 'task-cd-urgent' : urgency < 0.25 ? 'task-cd-warn' : ''}`;
        }
      }
      // Update progress bar
      const barEl = document.getElementById(`task-bar-${task.id}`);
      if (barEl) {
        const pct = Math.max(0, (rem / (task.durationMins * 60000)) * 100);
        barEl.style.width = pct + '%';
        const urgency = rem / (task.durationMins * 60000);
        barEl.className = `task-progress-bar ${urgency < 0.1 ? 'task-bar-urgent' : urgency < 0.25 ? 'task-bar-warn' : ''}`;
      }
    });
    if (anyExpired) checkExpiredTasks();
  }, 1000);
}

function renderTasks() {
  const container = document.getElementById('tasks-list');
  if (!container) return;

  const tasks = state.tasks || [];
  if (tasks.length === 0) {
    container.innerHTML = '<p class="empty-state">Chưa có nhiệm vụ nào. Tạo ngay để bắt đầu!</p>';
    return;
  }

  const active   = tasks.filter(t => t.status === 'active');
  const finished = [...tasks].filter(t => t.status !== 'active').reverse().slice(0, 30);

  let html = '';

  if (active.length > 0) {
    html += '<div class="penalty-section-label">⚡ Đang thực hiện</div>';
    active.forEach(task => {
      const rem   = getTaskRemainingMs(task);
      const total = task.durationMins * 60000;
      const pct   = Math.max(0, (rem / total) * 100);
      const urg   = rem / total;
      const barCls = urg < 0.1 ? 'task-bar-urgent' : urg < 0.25 ? 'task-bar-warn' : '';
      const cdCls  = urg < 0.1 ? 'task-cd-urgent'  : urg < 0.25 ? 'task-cd-warn'  : '';
      const durLabel = task.durationMins >= 60
        ? `${Math.floor(task.durationMins/60)}h${task.durationMins%60>0?task.durationMins%60+'p':''}`
        : `${task.durationMins}p`;

      html += `
        <div class="task-item task-item-active">
          <div class="task-item-main">
            <div class="task-item-left">
              <div class="task-title-text">${escapeHtml(task.title)}</div>
              <div class="task-badges">
                <span class="badge-reward">🎁 +${task.reward} Xu</span>
                <span class="badge-penalty">⚠️ −${task.penalty} Xu</span>
                <span class="badge-dur">⏱️ ${durLabel}</span>
              </div>
            </div>
            <div class="task-item-right">
              <span class="task-countdown ${cdCls}" id="task-cd-${task.id}">${formatTime(rem)}</span>
              <button class="btn btn-success btn-small" onclick="completeTask('${task.id}')">
                ✅ Hoàn thành
              </button>
            </div>
          </div>
          <div class="task-bar-wrap">
            <div class="task-progress-bar ${barCls}" id="task-bar-${task.id}" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    });
  }

  if (finished.length > 0) {
    html += '<div class="penalty-section-label" style="margin-top:16px">📋 Đã kết thúc</div>';
    finished.forEach(task => {
      const ok = task.status === 'completed';
      const dt = new Date(task.completedAt).toLocaleDateString('vi-VN', {
        day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'
      });
      html += `
        <div class="task-item ${ok ? 'task-item-done' : 'task-item-failed'}">
          <div class="task-item-main">
            <div class="task-item-left">
              <div class="task-title-text">${escapeHtml(task.title)}</div>
              <div class="task-badges">
                <span class="badge-dur">🕐 ${dt}</span>
              </div>
            </div>
            <div class="task-result-amount ${ok ? 'positive' : 'negative'}">
              ${ok ? `🎉 +${task.reward}` : `💔 −${task.penalty}`} Xu
            </div>
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;
  if (active.length > 0) startTaskCountdownInterval();
}

// ═══════════════════════════════════════════
// 9e. CLEAR DATA (individual)
// ═══════════════════════════════════════════

function clearSessions() {
  showConfirm('📜 Xóa lịch sử phiên học?',
    'Xóa toàn bộ lịch sử phiên học? Thống kê tuần và tiến độ phiếu cược ngày cũng sẽ bị xóa.',
    () => {
      state.sessions = [];
      saveState();
      renderWeeklyChart(); renderSessionHistory(); renderDailyBets();
      showToast('🗑️ Đã xóa lịch sử phiên học.', 'info');
    });
}

function clearPenalties() {
  showConfirm('🚨 Xóa phiếu phạt?',
    'Xóa toàn bộ phiếu phạt (cả đã và chưa nộp)?',
    () => {
      state.penaltyTickets = [];
      saveState(); renderPenalties();
      showToast('🗑️ Đã xóa phiếu phạt.', 'info');
    });
}

function clearDailyBets() {
  showConfirm('📅 Xóa phiếu cược ngày?',
    'Xóa toàn bộ phiếu cược ngày (đang chạy và đã kết thúc)?',
    () => {
      state.dailyBets = [];
      saveState(); renderDailyBets();
      showToast('🗑️ Đã xóa phiếu cược ngày.', 'info');
    });
}

function clearFinishedTasks() {
  showConfirm('✅ Xóa nhiệm vụ đã kết thúc?',
    'Xóa lịch sử các nhiệm vụ đã hoàn thành và thất bại (nhiệm vụ đang chạy không bị xóa)?',
    () => {
      state.tasks = (state.tasks || []).filter(t => t.status === 'active');
      saveState(); renderTasks();
      showToast('🗑️ Đã xóa lịch sử nhiệm vụ.', 'info');
    });
}

function clearGoals() {
  showConfirm('🎯 Xóa mục tiêu dài hạn?',
    'Xóa toàn bộ hợp đồng / mục tiêu (đang hoạt động và đã kết thúc)?',
    () => {
      state.contracts = [];
      saveState(); renderGoals();
      showToast('🗑️ Đã xóa mục tiêu dài hạn.', 'info');
    });
}

// ═══════════════════════════════════════════
// 9f. ACHIEVEMENTS / BẰNG KHEN
// ═══════════════════════════════════════════

const ACH_LEVEL_META = {
  bronze:   { label: '🥉 ĐỒNG',        name: 'Đồng'        },
  silver:   { label: '🥈 BẠC',         name: 'Bạc'         },
  gold:     { label: '🥇 VÀNG',        name: 'Vàng'        },
  platinum: { label: '💎 BẠCH KIM',    name: 'Bạch kim'    },
  legend:   { label: '👑 HUYỀN THOẠI', name: 'Huyền thoại' },
  supreme:  { label: '♛ TỐI THƯỢNG',  name: 'Tối thượng'  },
};
const ACH_CAT_META = {
  study:     '📚 Học tập',
  streak:    '🔥 Streak',
  milestone: '🎯 Cột mốc',
  challenge: '⚡ Thử thách',
  special:   '✨ Đặc biệt',
};

/**
 * Build the HTML for a certificate card (gallery) or diploma (modal).
 * mode = 'card' | 'diploma'
 */
function buildCertHTML(a, mode = 'card') {
  const lm      = ACH_LEVEL_META[a.level] || ACH_LEVEL_META.gold;
  const catLabel = ACH_CAT_META[a.category] || a.category;
  const dateStr  = new Date(a.date).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const statsHtml = (a.stats || []).filter(s => s.label && s.value).map(s => `
    <div class="cert-stat">
      <span class="cert-stat-val">${escapeHtml(s.value)}</span>
      <span class="cert-stat-lbl">${escapeHtml(s.label)}</span>
    </div>
  `).join('');

  if (mode === 'card') {
    return `
      <div class="cert-card" data-level="${a.level}" onclick="viewAchievement('${a.id}')">
        <div class="cert-corner c-tl"></div>
        <div class="cert-corner c-tr"></div>
        <div class="cert-corner c-bl"></div>
        <div class="cert-corner c-br"></div>
        <div class="cert-shimmer-overlay"></div>
        <div class="cert-ribbon">${lm.label}</div>
        <div class="cert-body">
          <div class="cert-emoji">${a.emoji}</div>
          <div class="cert-title">${escapeHtml(a.title)}</div>
          ${a.description ? `<div class="cert-desc">${escapeHtml(a.description)}</div>` : ''}
          <div class="cert-divider"><span>✦</span><span>✦</span><span>✦</span></div>
          <div class="cert-meta">
            <span class="cert-date">📅 ${dateStr}</span>
            <span class="cert-cat">${catLabel}</span>
          </div>
          ${statsHtml ? `<div class="cert-stats-row">${statsHtml}</div>` : ''}
        </div>
        <div class="cert-seal">★</div>
      </div>
    `;
  }

  // mode === 'diploma'
  const dateFullStr = new Date(a.date).toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  return `
    <div class="cert-diploma" data-level="${a.level}">
      <div class="cert-corner c-tl"></div>
      <div class="cert-corner c-tr"></div>
      <div class="cert-corner c-bl"></div>
      <div class="cert-corner c-br"></div>
      <div class="cert-shimmer-overlay"></div>

      <div class="diploma-top">
        <div class="diploma-academy">MOMENTUM ENGINE</div>
        <div class="diploma-rule"></div>
        <div class="diploma-sub">Chứng nhận thành tích xuất sắc</div>
      </div>

      <div class="diploma-emoji">${a.emoji}</div>
      <div class="diploma-level-badge" data-level="${a.level}">${lm.label}</div>
      <div class="diploma-title">${escapeHtml(a.title)}</div>
      ${a.description ? `<div class="diploma-desc">"${escapeHtml(a.description)}"</div>` : ''}

      <div class="diploma-divider"><span>✦</span><span>✦</span><span>✦</span></div>

      <div class="diploma-date-line">
        <span class="diploma-date-prefix">Được trao ngày</span>
        <span class="diploma-date-val">${dateFullStr}</span>
      </div>

      ${statsHtml ? `<div class="diploma-stats-row">${statsHtml}</div>` : ''}

      <div class="diploma-footer">
        <div class="diploma-cat-badge">${catLabel}</div>
        <div class="diploma-seal">
          <div class="diploma-seal-ring">
            <div class="diploma-seal-inner">★</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAchievements() {
  const container = document.getElementById('achievements-gallery');
  if (!container) return;
  const list = state.achievements || [];
  if (list.length === 0) {
    container.innerHTML = `
      <div class="ach-empty">
        <div class="ach-empty-icon">🏆</div>
        <p>Chưa có bằng khen nào.<br>Tạo ngay để lưu lại chiến tích!</p>
      </div>`;
    return;
  }
  container.innerHTML = `<div class="cert-gallery-grid">${list.map(a => buildCertHTML(a,'card')).join('')}</div>`;
}

function openAchievementModal() {
  document.getElementById('ach-emoji').value = '🏆';
  document.getElementById('ach-title').value = '';
  document.getElementById('ach-level').value = 'gold';
  document.getElementById('ach-category').value = 'study';
  document.getElementById('ach-date').value = formatDateInput(new Date());
  document.getElementById('ach-description').value = '';
  document.querySelectorAll('.ach-stat-label,.ach-stat-value').forEach(i => i.value = '');
  updateAchPreview();
  document.getElementById('achievement-modal').classList.remove('hidden');
  document.getElementById('ach-title').focus();
}

function closeAchievementModal() {
  document.getElementById('achievement-modal').classList.add('hidden');
}

function updateAchPreview() {
  const preview = document.getElementById('ach-live-preview');
  if (!preview) return;
  const a = {
    id: '__preview__',
    emoji: document.getElementById('ach-emoji').value || '🏆',
    title: document.getElementById('ach-title').value.trim() || 'Tên thành tích',
    level: document.getElementById('ach-level').value,
    category: document.getElementById('ach-category').value,
    date: document.getElementById('ach-date').value || formatDateInput(new Date()),
    description: document.getElementById('ach-description').value.trim(),
    stats: [],
  };
  preview.innerHTML = buildCertHTML(a, 'card');
}

function createAchievement() {
  const emoji       = document.getElementById('ach-emoji').value.trim() || '🏆';
  const title       = document.getElementById('ach-title').value.trim();
  const level       = document.getElementById('ach-level').value;
  const category    = document.getElementById('ach-category').value;
  const date        = document.getElementById('ach-date').value;
  const description = document.getElementById('ach-description').value.trim();

  if (!title) { showToast('⚠️ Nhập tên thành tích!', 'warning');    return; }
  if (!date)  { showToast('⚠️ Chọn ngày đạt được!', 'warning');     return; }

  const statLabels = [...document.querySelectorAll('.ach-stat-label')];
  const statValues = [...document.querySelectorAll('.ach-stat-value')];
  const stats = statLabels
    .map((lbl, i) => ({ label: lbl.value.trim(), value: statValues[i].value.trim() }))
    .filter(s => s.label && s.value);

  if (!state.achievements) state.achievements = [];
  state.achievements.unshift({
    id: Date.now().toString(),
    emoji, title, level, category, date, description, stats,
    createdAt: new Date().toISOString(),
  });
  saveState();
  closeAchievementModal();
  renderAchievements();
  const lm = ACH_LEVEL_META[level] || ACH_LEVEL_META.gold;
  SoundEngine.achievement();
  showToast(`🏆 Đã cấp bằng khen ${lm.name}: "${title}"!`, 'success');
}

function viewAchievement(id) {
  if (id === '__preview__') return;
  const a = (state.achievements || []).find(x => x.id === id);
  if (!a) return;
  document.getElementById('cert-diploma-inner').innerHTML = buildCertHTML(a, 'diploma');
  const modal = document.getElementById('achievement-view-modal');
  modal.dataset.currentId = id;
  modal.classList.remove('hidden');
  // wire delete button
  document.getElementById('cert-view-delete-btn').onclick = () => deleteAchievement(id);
}

function closeAchievementView(e) {
  if (e.target === document.getElementById('achievement-view-modal')) {
    closeAchievementViewDirect();
  }
}
function closeAchievementViewDirect() {
  document.getElementById('achievement-view-modal').classList.add('hidden');
}

function deleteAchievement(id) {
  const a = (state.achievements || []).find(x => x.id === id);
  if (!a) return;
  showConfirm('🗑️ Xóa bằng khen?',
    `Xóa bằng khen "${a.title}"? Thao tác này không thể hoàn tác!`,
    () => {
      state.achievements = state.achievements.filter(x => x.id !== id);
      saveState();
      closeAchievementViewDirect();
      renderAchievements();
      showToast('🗑️ Đã xóa bằng khen.', 'info');
    });
}

// ═══════════════════════════════════════════
// 9. ANALYTICS & CHART
// ═══════════════════════════════════════════

let currentStatMode = 'week'; // 'week' | 'quarter'

/** Returns the Monday (week start) for a given Date, at midnight. */
function getWeekStart(d) {
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

/** Switches visible stat panel and re-renders the chosen chart. */
function switchStatMode(mode) {
  currentStatMode = mode;
  document.getElementById('stat-view-week').classList.toggle('hidden', mode !== 'week');
  document.getElementById('stat-view-quarter').classList.toggle('hidden', mode !== 'quarter');
  document.querySelectorAll('.stat-mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode)
  );
  if (mode === 'week') {
    renderWeeklyChart();
    renderWeeklySummary();
  } else {
    renderQuarterCharts();
  }
}

/** Renders the 4-chip summary row below the weekly bar chart. */
function renderWeeklySummary() {
  const el = document.getElementById('stat-week-summary');
  if (!el) return;
  const today  = new Date();
  const monday = getWeekStart(today);
  const dayData = new Array(7).fill(0);
  state.sessions.forEach(s => {
    const d    = new Date(s.date);
    const diff = Math.floor((d - monday) / 86400000);
    if (diff >= 0 && diff < 7) dayData[diff] += s.durationMins;
  });
  const totalMins  = dayData.reduce((a, b) => a + b, 0);
  const activeDays = dayData.filter(m => m > 0).length;
  const peakMins   = Math.max(...dayData);
  const endOfWeek  = new Date(monday.getTime() + 6 * 86400000);
  const fmtD = d => `${d.getDate()}/${d.getMonth()+1}`;
  document.getElementById('stat-week-label').textContent =
    `Tuần ${fmtD(monday)} – ${fmtD(endOfWeek)}`;
  el.innerHTML = `
    <div class="stat-chip">
      <span class="stat-chip-val">${(totalMins/60).toFixed(1)}h</span>
      <span class="stat-chip-lbl">Tổng tuần</span>
    </div>
    <div class="stat-chip">
      <span class="stat-chip-val">${activeDays}</span>
      <span class="stat-chip-lbl">Ngày có học</span>
    </div>
    <div class="stat-chip">
      <span class="stat-chip-val">${peakMins >= 60 ? (peakMins/60).toFixed(1)+'h' : peakMins+'p'}</span>
      <span class="stat-chip-lbl">Cao nhất / ngày</span>
    </div>
    <div class="stat-chip">
      <span class="stat-chip-val">${activeDays > 0 ? (totalMins/activeDays/60).toFixed(1)+'h' : '—'}</span>
      <span class="stat-chip-lbl">TB / ngày học</span>
    </div>
  `;
}

/**
 * Renders 4 mini-canvas charts (one per quarter).
 * Each bar = total study minutes in that week.
 */
function renderQuarterCharts() {
  const year = new Date().getFullYear();
  document.getElementById('stat-quarter-year-label').textContent = `Năm ${year}`;

  // Theme: [gradTop, gradBottom, shadowColor]
  const THEMES = [
    ['#6366f1', '#4338ca', 'rgba(99,102,241,0.5)'],
    ['#22c55e', '#15803d', 'rgba(34,197,94,0.5)'],
    ['#f59e0b', '#b45309', 'rgba(245,158,11,0.5)'],
    ['#ec4899', '#be185d', 'rgba(236,72,153,0.5)'],
  ];

  // Quarter month ranges [startMonth(0-idx), endMonth(0-idx exclusive)]
  const QRANGE = [[0,3],[3,6],[6,9],[9,12]];

  // Build weekStart → totalMins map for current year
  const weekMap = {};
  state.sessions.forEach(s => {
    const d = new Date(s.date);
    if (d.getFullYear() !== year) return;
    const ws  = getWeekStart(d);
    const key = formatDateInput(ws);
    weekMap[key] = (weekMap[key] || 0) + s.durationMins;
  });

  const curWeekKey = formatDateInput(getWeekStart(new Date()));
  let yearTotal = 0;

  QRANGE.forEach(([qStartM, qEndM], qi) => {
    const canvas = document.getElementById(`quarter-chart-${qi+1}`);
    if (!canvas) return;

    // Collect all Monday-starts whose week overlaps with this quarter
    const qStartDate = new Date(year, qStartM, 1);
    const qEndDate   = new Date(year, qEndM, 0);   // last day of quarter
    const weeks = [];
    let w = getWeekStart(qStartDate);
    // include this week even if it started slightly before quarter
    while (w <= qEndDate) {
      weeks.push(new Date(w));
      w = new Date(w.getTime() + 7 * 86400000);
    }
    // Trim to max 14 (some quarters have 13-14 weeks)
    const displayWeeks = weeks.slice(0, 14);
    const data = displayWeeks.map(ws => weekMap[formatDateInput(ws)] || 0);

    const qTotal = data.reduce((a, b) => a + b, 0);
    yearTotal += qTotal;

    const totalEl = document.getElementById(`q${qi+1}-total`);
    if (totalEl) totalEl.textContent = qTotal >= 60 ? `${(qTotal/60).toFixed(1)}h` : `${qTotal}p`;

    // ── Draw ──
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    const maxM = Math.max(60, ...data);
    const pad  = { top:20, right:6, bottom:26, left:32 };
    const cW   = W - pad.left - pad.right;
    const cH   = H - pad.top  - pad.bottom;
    const n    = displayWeeks.length;
    const barW = Math.max(3, (cW / n) * 0.6);
    const gap  = cW / n;
    const [ct, cb, cg] = THEMES[qi];

    // Grid
    ctx.strokeStyle = 'rgba(120,100,255,0.07)';
    ctx.lineWidth = 1;
    [0, 1, 2, 3].forEach(i => {
      const y = pad.top + (cH / 3) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W-pad.right, y); ctx.stroke();
      const v = Math.round(maxM - (maxM / 3) * i);
      ctx.fillStyle = '#6b6490';
      ctx.font = '9px Inter,sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(v >= 60 ? (v/60).toFixed(1)+'h' : v+'p', pad.left-3, y+3);
    });

    // Bars
    data.forEach((mins, i) => {
      const barH = (mins / maxM) * cH;
      const x    = pad.left + gap * i + (gap - barW) / 2;
      const y    = pad.top + cH - barH;
      const wsKey = formatDateInput(displayWeeks[i]);
      const isNow = wsKey === curWeekKey;

      if (barH > 0) {
        const grad = ctx.createLinearGradient(x, y, x, y+barH);
        grad.addColorStop(0, isNow ? ct : ct+'99');
        grad.addColorStop(1, isNow ? cb : cb+'33');
        const r = Math.min(3, barW/2);
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.lineTo(x+barW-r,y);
        ctx.quadraticCurveTo(x+barW,y,x+barW,y+r);
        ctx.lineTo(x+barW,y+barH); ctx.lineTo(x,y+barH); ctx.lineTo(x,y+r);
        ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
        ctx.fillStyle = grad;
        if (isNow) { ctx.shadowColor = cg; ctx.shadowBlur = 10; }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      // Value
      if (mins > 0 && barW > 12) {
        ctx.fillStyle = isNow ? ct : '#8b80b0';
        ctx.font = 'bold 8px Inter,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(mins>=60?(mins/60).toFixed(1)+'h':mins+'p', x+barW/2, y-3);
      }
      // Week label
      ctx.fillStyle = isNow ? '#eee8ff' : '#6b6490';
      ctx.font = (isNow?'bold ':'') + '8px Inter,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`T${i+1}`, x+barW/2, H-pad.bottom+13);
    });
  });

  // Year summary chips
  const summEl = document.getElementById('stat-quarter-summary');
  if (summEl) {
    const yearSessions = state.sessions.filter(s => new Date(s.date).getFullYear() === year);
    const totalWeeks = yearSessions.length > 0 ? Object.keys(weekMap).length : 0;
    summEl.innerHTML = `
      <div class="stat-chip">
        <span class="stat-chip-val">${(yearTotal/60).toFixed(1)}h</span>
        <span class="stat-chip-lbl">Tổng năm ${year}</span>
      </div>
      <div class="stat-chip">
        <span class="stat-chip-val">${totalWeeks}</span>
        <span class="stat-chip-lbl">Tuần có học</span>
      </div>
      <div class="stat-chip">
        <span class="stat-chip-val">${totalWeeks>0?(yearTotal/totalWeeks/60).toFixed(1)+'h':'—'}</span>
        <span class="stat-chip-lbl">TB / tuần</span>
      </div>
    `;
  }
}


function renderWeeklyChart() {
  const canvas = document.getElementById('weekly-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Make canvas crisp on high-DPI displays
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  ctx.clearRect(0, 0, W, H);

  // Get current week (Mon-Sun)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const dayData = new Array(7).fill(0); // minutes per day

  state.sessions.forEach(s => {
    const d = new Date(s.date);
    const diff = Math.floor((d - monday) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff < 7) {
      dayData[diff] += s.durationMins;
    }
  });

  const maxMins = Math.max(60, ...dayData);
  const padding = { top: 25, right: 20, bottom: 36, left: 48 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;
  const barW = chartW / 7 * 0.55;
  const gap = chartW / 7;

  // Grid lines
  ctx.strokeStyle = 'rgba(120, 100, 255, 0.08)';
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();

    // Y-axis labels
    const val = Math.round(maxMins - (maxMins / gridLines) * i);
    ctx.fillStyle = '#6b6490';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val + 'p', padding.left - 8, y + 4);
  }

  // Bars
  dayData.forEach((mins, i) => {
    const barH = (mins / maxMins) * chartH;
    const x = padding.left + gap * i + (gap - barW) / 2;
    const y = padding.top + chartH - barH;

    // Bar gradient
    const grad = ctx.createLinearGradient(x, y, x, y + barH);
    const isToday = i === ((dayOfWeek + 6) % 7);
    if (isToday) {
      grad.addColorStop(0, '#a855f7');
      grad.addColorStop(1, '#6366f1');
    } else {
      grad.addColorStop(0, 'rgba(99, 102, 241, 0.6)');
      grad.addColorStop(1, 'rgba(99, 102, 241, 0.2)');
    }

    // Rounded top corners
    const r = Math.min(4, barW / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
    ctx.lineTo(x + barW, y + barH);
    ctx.lineTo(x, y + barH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Glow effect for today
    if (isToday) {
      ctx.shadowColor = 'rgba(168, 85, 247, 0.4)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Value on top
    if (mins > 0) {
      ctx.fillStyle = isToday ? '#a855f7' : '#8b80b0';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      const hours = mins / 60;
      ctx.fillText(hours >= 1 ? hours.toFixed(1) + 'h' : mins + 'p', x + barW / 2, y - 6);
    }

    // Day label
    ctx.fillStyle = isToday ? '#eee8ff' : '#6b6490';
    ctx.font = (isToday ? 'bold ' : '') + '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(dayLabels[i], x + barW / 2, H - padding.bottom + 18);
  });
}

function renderSessionHistory() {
  const container = document.getElementById('session-history');
  const recent = [...state.sessions].reverse().slice(0, 20);

  if (recent.length === 0) {
    container.innerHTML = '<p class="empty-state">Chưa có phiên học nào. Bắt đầu ngay!</p>';
    return;
  }

  container.innerHTML = recent.map(s => {
    const dateStr = new Date(s.date).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const typeEmoji = s.type === 'warmup' ? '🔥' : '🎯';
    return `
      <div class="history-item">
        <div class="history-meta">
          <span class="history-date">${dateStr}</span>
          <span class="history-duration">${typeEmoji} ${s.durationMins} phút</span>
          ${s.notes ? `<span class="history-notes">"${escapeHtml(s.notes)}"</span>` : ''}
        </div>
        <div class="history-earnings">
          <div style="color:var(--green)">+${s.expEarned} EXP</div>
          <div style="color:var(--yellow)">+${s.coinsEarned} Xu</div>
        </div>
      </div>
    `;
  }).join('');
}

// ═══════════════════════════════════════════
// 10. TOASTS & CONFIRM MODAL
// ═══════════════════════════════════════════

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.setProperty('--toast-duration', '3.5s');
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3900);
}

let _confirmCallback = null;

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-modal').classList.remove('hidden');
  _confirmCallback = onConfirm;
}

function hideConfirm() {
  document.getElementById('confirm-modal').classList.add('hidden');
  _confirmCallback = null;
}

// ═══════════════════════════════════════════
// 11. UTILITY
// ═══════════════════════════════════════════

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDateInput(date) {
  // Bù trừ múi giờ địa phương trước khi lấy chuỗi YYYY-MM-DD
  // Tránh lỗi UTC làm lệch ngày so với giờ địa phương
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
}

function formatDisplayDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

// ═══════════════════════════════════════════
// 11b. RESET DATA
// ═══════════════════════════════════════════

function resetData() {
  showConfirm(
    '🗑️ Xóa toàn bộ dữ liệu?',
    'Thao tác này sẽ XÓA VĨNH VIỄN tất cả dữ liệu — cấp độ, Xu, phiên học, mục tiêu, phiếu phạt, vé nghỉ. Bạn CHẮ C HỮ không thể khôi phục! Nhập lại một lần nữa để xác nhận: thao tác này sẽ xóa toàn bộ tiến trình của bạn!',
    () => {
      // Double-confirm via a second showConfirm
      showConfirm(
        '⚠️ Xác nhận lần cuối',
        'Bạn ĐÃ CHẬe CHẮ N? Nhấn “Xác nhận” để xóa sạch toàn bộ tiến trình!',
        () => {
          // Stop any active timers
          stopTimerLoop();
          // Reset state to default
          state = { ...DEFAULT_STATE };
          saveState();
          // Reload all UI
          updateHeaderUI();
          renderWeeklyChart();
          renderSessionHistory();
          renderShop();
          renderGoals();
          renderPenalties();
          showStudySetup();
          showToast('🗑️ Đã xóa toàn bộ dữ liệu. Bắt đầu lại từ đầu!', 'info');
        }
      );
    }
  );
}

// ═══════════════════════════════════════════
// 11c. EDIT MODE
// ═══════════════════════════════════════════

function getTodayStudyMins() {
  const todayStr = formatDateInput(new Date());
  return state.sessions
    .filter(s => new Date(s.date).toISOString().split('T')[0] === todayStr)
    .reduce((sum, s) => sum + (s.durationMins || 0), 0);
}

function openEditMode() {
  // Populate fields
  document.getElementById('edit-coins').value = state.coins;

  // Bet amount
  const hasBet = state.activeBlock && state.activeBlock.betAmount >= 0;
  const betInput = document.getElementById('edit-bet-amount');
  const betHint = document.getElementById('edit-bet-hint');
  const noBet = document.getElementById('edit-no-bet');
  if (hasBet) {
    betInput.value = state.activeBlock.betAmount;
    betInput.disabled = false;
    betHint.classList.remove('hidden');
    noBet.classList.add('hidden');
  } else {
    betInput.value = 0;
    betInput.disabled = true;
    betHint.classList.add('hidden');
    noBet.classList.remove('hidden');
  }

  // Today study mins
  document.getElementById('edit-today-mins').value = getTodayStudyMins();

  document.getElementById('edit-mode-modal').classList.remove('hidden');
}

function closeEditMode() {
  document.getElementById('edit-mode-modal').classList.add('hidden');
}

function saveEditMode() {
  // Show confirm before saving
  showConfirm(
    '✏️ Lưu thay đổi?',
    'Bạn có chắc muốn lưu các thay đổi? Thao tác này sẽ ghi đè lên dữ liệu hiện tại.',
    () => {
      // ── 1. Coins ──
      const newCoins = parseInt(document.getElementById('edit-coins').value, 10);
      if (!isNaN(newCoins)) {
        state.coins = newCoins;
      }

      // ── 2. Active bet ──
      const betInput = document.getElementById('edit-bet-amount');
      if (!betInput.disabled && state.activeBlock) {
        const newBet = parseInt(betInput.value, 10);
        if (!isNaN(newBet) && newBet >= 0) {
          state.activeBlock.betAmount = newBet;
          updateBetActiveDisplay();
        }
      }

      // ── 3. Today study mins ──
      const newTodayMins = parseInt(document.getElementById('edit-today-mins').value, 10);
      if (!isNaN(newTodayMins) && newTodayMins >= 0) {
        const currentTodayMins = getTodayStudyMins();
        const delta = newTodayMins - currentTodayMins;
        if (delta !== 0) {
          const todayStr = formatDateInput(new Date());
          // Try to adjust the last today session
          const todaySessions = state.sessions.filter(
            s => new Date(s.date).toISOString().split('T')[0] === todayStr
          );
          if (delta > 0) {
            // Add a correction session
            state.sessions.push({
              id: Date.now().toString(),
              date: new Date().toISOString(),
              durationMins: delta,
              notes: '[Điều chỉnh bởi chế độ chỉnh sửa]',
              expEarned: 0,
              coinsEarned: 0,
              type: 'edit-correction'
            });
          } else if (delta < 0) {
            // Remove minutes from last today session(s)
            let toRemove = -delta;
            for (let i = todaySessions.length - 1; i >= 0 && toRemove > 0; i--) {
              const sess = state.sessions.find(s => s.id === todaySessions[i].id);
              if (sess) {
                if (sess.durationMins <= toRemove) {
                  toRemove -= sess.durationMins;
                  state.sessions = state.sessions.filter(s => s.id !== sess.id);
                } else {
                  sess.durationMins -= toRemove;
                  toRemove = 0;
                }
              }
            }
          }
        }
      }

      saveState();
      updateHeaderUI();
      renderWeeklyChart();
      renderSessionHistory();
      closeEditMode();
      showToast('✅ Đã lưu thay đổi thành công!', 'success');
    }
  );
}


// ═══════════════════════════════════════════
// 12. INITIALIZATION & EVENT BINDINGS
// ═══════════════════════════════════════════

function resumeActiveSession() {
  const s = state.timerSession;
  if (!s) return;

  if (s.type === 'break') {
    showStudyBreak();
    // Reset break UI
    document.getElementById('break-actions').classList.remove('hidden');
    document.getElementById('break-done-actions').classList.add('hidden');
    document.getElementById('break-emoji').textContent = '☕';
    document.getElementById('break-title').textContent = 'Nghỉ ngơi nào!';

    const remaining = getRemainingMs();
    if (remaining <= 0 && !s.isPaused) {
      // Break completed while away
      state.timerSession = null;
      saveState();
      showBreakDone();
      return;
    }

    updateBreakBlockProgress();
    startBreakTimerLoop();
    return;
  }

  // Check if timer already completed while away
  const remaining = getRemainingMs();
  if (remaining <= 0 && !s.isPaused) {
    showStudyActive();
    updateBetActiveDisplay();
    updateBlockProgressUI();
    onTimerComplete();
    return;
  }

  showStudyActive();
  updateBetActiveDisplay();
  updateBlockProgressUI();
  startTimerLoop();
}

function handlePendingReward() {
  if (state._pendingReward) {
    const r = state._pendingReward;
    document.getElementById('session-results').innerHTML = `
      <div class="result-row">
        <span class="result-label">⏱ Tổng thời gian</span>
        <span class="result-value">${r.totalMins} phút (${r.totalChunks} phiên)</span>
      </div>
      ${r.betWinnings > 0 ? `
      <div class="result-row">
        <span class="result-label">🎰 Thắng cược</span>
        <span class="result-value positive">+${r.betWinnings} Xu</span>
      </div>` : `
      <div class="result-row">
        <span class="result-label">🎉 Trạng thái</span>
        <span class="result-value positive">Hoàn thành xuất sắc!</span>
      </div>`}
    `;
    document.getElementById('retrospective-modal').classList.remove('hidden');
    showStudyActive();
    if (state.activeBlock) updateBlockProgressUI();
  }
}

function updateMaxBetInfo() {
  const mins = parseInt(document.getElementById('session-target-total').value, 10) || 25;
  const maxBet = getMaxBet(mins);
  document.getElementById('max-bet-info').textContent = `Tối đa: ${maxBet} Xu`;

  // Clamp current bet
  const betInput = document.getElementById('bet-amount');
  if (parseInt(betInput.value, 10) > maxBet) {
    betInput.value = maxBet;
  }
}

function updateSessionInfoBox() {
  const targetMins = parseInt(document.getElementById('session-target-total').value, 10) || 25;
  const chunkMins = parseInt(document.getElementById('session-chunk').value, 10) || 25;
  const totalChunks = Math.ceil(targetMins / chunkMins);
  document.getElementById('chunk-count').textContent = totalChunks;
  document.getElementById('chunk-duration-display').textContent = chunkMins;
}

function updateDailyInfo() {
  const paymentType = document.getElementById('goal-payment-type').value;
  const dailyDiv = document.getElementById('daily-info');
  if (paymentType === 'daily') {
    dailyDiv.classList.remove('hidden');
    const startDate = document.getElementById('goal-start').value;
    const endDate = document.getElementById('goal-end').value;
    const stake = parseInt(document.getElementById('goal-stake').value, 10) || 0;
    if (startDate && endDate && new Date(endDate) > new Date(startDate)) {
      const totalDays = getTotalDays(startDate, endDate);
      const daily = Math.ceil(stake / totalDays);
      document.getElementById('daily-stake-preview').textContent =
        `Xu mỗi ngày: ${daily} Xu (${totalDays} ngày)`;
    }
  } else {
    dailyDiv.classList.add('hidden');
  }
}

// Active pass timer refresh
function refreshActivePassTimer() {
  if (state.activeRestPass) {
    if (Date.now() > state.activeRestPass.expiresAt) {
      state.activeRestPass = null;
      saveState();
      showToast('⏰ Vé nghỉ ngơi đã hết hạn!', 'warning');
    }
    // Only refresh if shop tab is active
    if (!document.getElementById('tab-shop').classList.contains('hidden')) {
      renderInventory();
    }
  }
}

function init() {
  SoundEngine.init();
  loadState();
  updateHeaderUI();

  // ── Tab buttons ──
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      SoundEngine.click();
      switchTab(btn.dataset.tab);
    });
  });

  // ── Study tab ──
  document.getElementById('btn-warmup').addEventListener('click', startWarmup);
  document.getElementById('btn-start-session').addEventListener('click', startMainSession);
  document.getElementById('btn-pause').addEventListener('click', pauseSession);
  document.getElementById('btn-quit').addEventListener('click', quitSession);
  document.getElementById('btn-quit-break').addEventListener('click', quitSession);
  document.getElementById('btn-skip-break').addEventListener('click', skipBreak);
  document.getElementById('btn-start-next-chunk').addEventListener('click', () => {
    startNextChunk();
    showToast('🍅 Phiên mới bắt đầu — tập trung!', 'info');
  });
  document.getElementById('btn-save-retro').addEventListener('click', saveRetrospective);

  // Duration presets — apply to total target time
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('session-target-total').value = btn.dataset.mins;
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateMaxBetInfo();
      updateSessionInfoBox();
    });
  });

  document.getElementById('session-target-total').addEventListener('input', () => {
    updateMaxBetInfo();
    updateSessionInfoBox();
  });
  document.getElementById('session-chunk').addEventListener('input', updateSessionInfoBox);

  // ── Penalty tickets ──
  document.getElementById('btn-create-penalty').addEventListener('click', createPenaltyTicket);
  document.getElementById('dirty-mins-input').addEventListener('input', updateFinePreview);

  // ── Shop tab ──
  document.getElementById('btn-buy-passive').addEventListener('click', buyPassiveUpgrade);
  document.getElementById('btn-buy-45').addEventListener('click', () => buyRestPass('45min'));
  document.getElementById('btn-buy-3h').addEventListener('click', () => buyRestPass('3hr'));

  // ── Goals tab ──
  document.getElementById('btn-new-goal').addEventListener('click', openGoalModal);
  document.getElementById('btn-cancel-goal').addEventListener('click', closeGoalModal);
  document.getElementById('btn-create-goal').addEventListener('click', createGoal);
  document.getElementById('goal-payment-type').addEventListener('change', updateDailyInfo);
  document.getElementById('goal-start').addEventListener('change', updateDailyInfo);
  document.getElementById('goal-end').addEventListener('change', updateDailyInfo);
  document.getElementById('goal-stake').addEventListener('input', updateDailyInfo);

  // ── Daily Bet ──
  document.getElementById('btn-new-daily-bet').addEventListener('click', openDailyBetModal);
  document.getElementById('btn-cancel-daily-bet').addEventListener('click', closeDailyBetModal);
  document.getElementById('btn-create-daily-bet').addEventListener('click', createDailyBet);
  document.getElementById('daily-bet-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('daily-bet-modal')) closeDailyBetModal();
  });
  ['daily-bet-target-hrs','daily-bet-stake','daily-bet-win-mult','daily-bet-loss-mult','daily-bet-payment-type']
    .forEach(id => document.getElementById(id).addEventListener('input', updateDailyBetPreview));
  document.getElementById('daily-bet-payment-type').addEventListener('change', updateDailyBetPreview);

  // ── Confirm modal ──
  document.getElementById('confirm-cancel').addEventListener('click', hideConfirm);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    const cb = _confirmCallback;
    hideConfirm();       // ← đóng modal & clear callback TRƯỚC
    if (cb) cb();        // ← rồi mới chạy callback (tránh nested showConfirm bị ghi đè)
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (overlay.id === 'goal-modal') closeGoalModal();
        if (overlay.id === 'confirm-modal') hideConfirm();
      }
    });
  });

  // ── Resume session if exists ──
  if (state.timerSession) {
    resumeActiveSession();
  } else if (state._pendingReward) {
    handlePendingReward();
  } else if (state.activeBlock && state.activeBlock.completedMins < state.activeBlock.targetMins) {
    // Was in break-done state (waiting for user to start next chunk)
    showBreakDone();
  } else {
    if (state.activeBlock) state.activeBlock = null; // Clean up stale block
    showStudySetup();
  }

  // ── Initial renders ──
  renderWeeklyChart();
  renderSessionHistory();
  updateMaxBetInfo();
  updateSessionInfoBox();

  // ── Periodic refresh (rest passes, chart, penalties, daily bets) ──
  setInterval(refreshActivePassTimer, 10000);
  setInterval(checkOverduePenalties, 60000);
  setInterval(checkDailyBets, 60000);   // check daily bets every minute
  setInterval(checkExpiredTasks, 30000); // check tasks every 30s
  checkOverduePenalties();
  checkDailyBets();
  checkExpiredTasks();
  renderDailyBets();
  renderTasks();

  // ── Handle resize for chart ──
  window.addEventListener('resize', () => {
    renderWeeklyChart();
  });

  // ── Visibility change: re-sync timer when tab becomes visible + pull from Gist ──
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // Pull latest data from Gist silently when user returns to the tab
      if (GistSync.isConfigured() && !state.timerSession) {
        GistSync.syncFromRemote({ silent: true });
      }
      // Resume timer if one is active
      if (state.timerSession) {
        const remaining = getRemainingMs();
        if (remaining <= 0 && !state.timerSession.isPaused) {
          onTimerComplete();
        } else {
          updateTimerDisplay();
          if (!timerRAF && state.timerSession.type !== 'break') startTimerLoop();
          if (!breakRAF && state.timerSession.type === 'break') startBreakTimerLoop();
        }
      }
      // Check tasks & daily bets when returning to tab
      checkExpiredTasks();
      checkDailyBets();
      if ((state.tasks || []).some(t => t.status === 'active')) {
        startTaskCountdownInterval();
      }
    }
  });

  // ── Save state before unload ──
  window.addEventListener('beforeunload', () => {
    saveState();
  });

  // ── Settings tab buttons ──
  document.getElementById('btn-create-gist').addEventListener('click', () => GistSync.createNewGist());
  document.getElementById('btn-save-gist-settings').addEventListener('click', () => GistSync.saveSettingsAndSync());
  document.getElementById('btn-sync-now').addEventListener('click', async () => {
    await GistSync.syncFromRemote();
  });
  document.getElementById('btn-push-now').addEventListener('click', async () => {
    const { token, gistId } = GistSync.getSettings();
    if (!token || !gistId) { showToast('⚠️ Chưa cấu hình Gist!', 'warning'); return; }
    GistSync.debouncedPush();
    showToast('⬆️ Đang đẩy dữ liệu lên Gist…', 'info');
  });

  // Reveal / hide token field
  document.getElementById('btn-toggle-token').addEventListener('click', () => {
    const inp = document.getElementById('gist-token-input');
    const btn = document.getElementById('btn-toggle-token');
    if (inp.type === 'password') { inp.type = 'text';     btn.textContent = '🙈 Ẩn'; }
    else                         { inp.type = 'password'; btn.textContent = '👁 Hiện'; }
  });

  // ── Task tab ──
  document.getElementById('btn-new-task').addEventListener('click', openTaskModal);
  document.getElementById('btn-cancel-task').addEventListener('click', closeTaskModal);
  document.getElementById('btn-create-task').addEventListener('click', createTask);
  document.getElementById('task-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('task-modal')) closeTaskModal();
  });
  ['task-reward','task-penalty'].forEach(id =>
    document.getElementById(id).addEventListener('input', updateTaskPreview)
  );

  // ── Clear data buttons ──
  document.getElementById('btn-clear-sessions').addEventListener('click', clearSessions);
  document.getElementById('btn-clear-penalties').addEventListener('click', clearPenalties);
  document.getElementById('btn-clear-daily-bets').addEventListener('click', clearDailyBets);
  document.getElementById('btn-clear-tasks-done').addEventListener('click', clearFinishedTasks);
  document.getElementById('btn-clear-goals').addEventListener('click', clearGoals);

  // ── Achievement / Bằng khen ──
  document.getElementById('btn-new-achievement').addEventListener('click', openAchievementModal);
  document.getElementById('btn-cancel-achievement').addEventListener('click', closeAchievementModal);
  document.getElementById('btn-create-achievement').addEventListener('click', createAchievement);
  document.getElementById('achievement-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('achievement-modal')) closeAchievementModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeAchievementModal();
      closeAchievementViewDirect();
    }
  });

  // ── Stat mode toggle ──
  document.querySelectorAll('.stat-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchStatMode(btn.dataset.mode));
  });

  // ── Reset Data ──
  document.getElementById('btn-reset-data').addEventListener('click', resetData);

  // ── Edit Mode ──
  document.getElementById('btn-open-edit-mode').addEventListener('click', openEditMode);
  document.getElementById('edit-cancel').addEventListener('click', closeEditMode);
  document.getElementById('edit-save').addEventListener('click', saveEditMode);
  document.getElementById('edit-mode-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-mode-modal')) closeEditMode();
  });

  // ── Sound Settings ──
  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  const soundSlider = document.getElementById('sound-volume-slider');
  const soundPct = document.getElementById('sound-volume-pct');
  const testSoundBtn = document.getElementById('btn-test-sound');

  if (soundToggleBtn) {
    // Init slider value from saved prefs
    if (soundSlider) {
      soundSlider.value = SoundEngine.getVolume();
      soundPct.textContent = Math.round(SoundEngine.getVolume() * 100) + '%';
    }
    SoundEngine.updateSoundUI();

    soundToggleBtn.addEventListener('click', () => {
      SoundEngine.setEnabled(!SoundEngine.isEnabled());
      if (SoundEngine.isEnabled()) SoundEngine.notify();
    });

    if (soundSlider) {
      soundSlider.addEventListener('input', () => {
        const val = parseFloat(soundSlider.value);
        SoundEngine.setVolume(val);
        soundPct.textContent = Math.round(val * 100) + '%';
      });
      soundSlider.addEventListener('change', () => {
        SoundEngine.coinEarned(); // Preview sound on release
      });
    }
  }

  if (testSoundBtn) {
    testSoundBtn.addEventListener('click', () => {
      SoundEngine.victory();
    });
  }

  // ── Initial Gist pull on startup ──
  GistSync.syncFromRemote({ silent: true });
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
