/* ═══════════════════════════════════════════════════════════════
   THE MOMENTUM ENGINE — APP.JS
   Full state management, timer engine, economy, shop, goals
   ═══════════════════════════════════════════════════════════════ */

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
    showToast('💀 Phá sản! Bạn đã bị xóa sạch EXP và trở về Cấp 1 do nợ quá sâu!', 'error');
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
    renderSessionHistory();
  } else if (tabName === 'shop') {
    renderShop();
    renderPenalties();
  } else if (tabName === 'goals') {
    renderGoals();
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
    showToast('▶ Tiếp tục — tập trung!', 'info');
  } else {
    // Pause
    s.isPaused = true;
    s.pauseStartTime = Date.now();
    saveState();
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
  showToast(`⚡ Nâng cấp thành công! +${state.passiveCoinUpgrades * 10}% Xu bonus`, 'success');
}

function buyRestPass(type) {
  const cost = type === '45min' ? 100 : 350;
  const name = type === '45min' ? 'Vé nghỉ 45 phút' : 'Vé nghỉ 3 giờ';
  if (state.coins < cost) {
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
  showToast(`🎫 Đã mua ${name}!`, 'success');
}

function activateRestPass(passId) {
  if (state.activeRestPass) {
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
  showToast(`📋 Đã tạo phiếu phạt ${dirtyMins} phút → ${fineAmount} Xu. Nộp phạt trước 5 ngày!`, 'warning');
}

function payPenaltyTicket(id) {
  const ticket = state.penaltyTickets.find(t => t.id === id);
  if (!ticket || ticket.paidAt) return;
  if (state.coins < ticket.fineAmount) {
    showToast(`💰 Không đủ Xu! Cần ${ticket.fineAmount} Xu để nộp phạt.`, 'error');
    return;
  }
  addCoins(-ticket.fineAmount);
  ticket.paidAt = new Date().toISOString();
  saveState();
  renderPenalties();
  showToast(`✅ Đã nộp phạt ${ticket.fineAmount} Xu! Lần sau nhớ mua vé nhé.`, 'success');
}

function demoteLevel() {
  if (state.level <= 1) {
    state.exp = 0;
    showToast('💀 Phiếu phạt quá hạn 5 ngày! EXP bị xóa (đã ở cấp 1).', 'error');
  } else {
    state.level--;
    state.exp = 0;
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
    showToast(`📅 Check-in thành công! Trả góp ${dailyStake} Xu.`, 'success');
  } else {
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
      showToast(`🎉 Mục tiêu thành công! +${payout} Xu!`, 'success');
    } else {
      const penalty = Math.round(contract.totalStake * contract.lossMult);
      addCoins(-penalty);
      contract.status = 'failed';
      contract.resolution = { type: 'failed', amount: penalty, date: new Date().toISOString() };
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
// 9. ANALYTICS & CHART
// ═══════════════════════════════════════════

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
  loadState();
  updateHeaderUI();

  // ── Tab buttons ──
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
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

  // ── Confirm modal ──
  document.getElementById('confirm-cancel').addEventListener('click', hideConfirm);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    if (_confirmCallback) _confirmCallback();
    hideConfirm();
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

  // ── Periodic refresh (rest passes, chart, penalties) ──
  setInterval(refreshActivePassTimer, 10000);
  setInterval(checkOverduePenalties, 60000); // check overdue every minute
  checkOverduePenalties(); // also check on load

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

  // ── Initial Gist pull on startup ──
  GistSync.syncFromRemote({ silent: true });
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
