/* ============================================================
   PIG GAME — game engine
   Two-player dice game. Roll to build a turn total; banking
   adds it to your score. Roll a 1 and you bust, losing the
   turn total and your turn. First to the target wins.
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Constants & state ---------- */
  const STORAGE_KEY = 'pig-game.v3';
  const MIN_TARGET = 20;
  const MAX_TARGET = 300;
  const TARGET_STEP = 10;
  const MAX_NAME = 16;

  const AVATAR_SET = ['🦊', '🐼', '🐯', '🦄', '🐸', '🐙', '🚀', '👾', '🤖', '🐲', '🦁', '🐨', '🦉', '⚡', '🌟', '🎮'];

  const state = {
    scores: [0, 0],
    current: 0,
    active: 0,          // 0 or 1
    target: 100,
    playing: true,
    rolling: false,
    locked: false,      // true during a pending turn transition (hold/bust pause)
    names: ['Player 1', 'Player 2'],
    wins: [0, 0],
    avatars: ['🦊', '🐼'],
    sound: true,
    theme: 'light',
  };

  // Container rotation (deg) that brings each die value flat to the front.
  const FACE_ROTATION = {
    1: { x: 0,   y: 0 },
    2: { x: -90, y: 0 },
    3: { x: 0,   y: -90 },
    4: { x: 0,   y: 90 },
    5: { x: 90,  y: 0 },
    6: { x: 0,   y: 180 },
  };

  let accX = 0; // accumulated dice rotation so it always spins forward
  let accY = 0;

  /* ---------- Element refs ---------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    board: $('board'),
    players: [$('player-0'), $('player-1')],
    scores: [$('score-0'), $('score-1')],
    currents: [$('current-0'), $('current-1')],
    names: [$('name-0'), $('name-1')],
    wins: [$('wins-0'), $('wins-1')],
    avatars: [$('avatar-0'), $('avatar-1')],
    banked: [$('banked-0'), $('banked-1')],
    pending: [$('pending-0'), $('pending-1')],
    plabels: [$('plabel-0'), $('plabel-1')],
    progress: [$('progress-0'), $('progress-1')],
    dice: $('dice'),
    diceStage: $('diceStage'),
    status: $('status'),
    rollBtn: $('rollBtn'),
    holdBtn: $('holdBtn'),
    newBtn: $('newBtn'),
    targetValue: $('targetValue'),
    targetUp: $('targetUp'),
    targetDown: $('targetDown'),
    soundToggle: $('soundToggle'),
    themeToggle: $('themeToggle'),
    overlay: $('overlay'),
    winTitle: $('winTitle'),
    winSub: $('winSub'),
    winAvatar: $('winAvatar'),
    playAgainBtn: $('playAgainBtn'),
    confetti: $('confetti'),
  };

  /* ---------- Persistence ---------- */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        names: state.names,
        wins: state.wins,
        avatars: state.avatars,
        target: state.target,
        sound: state.sound,
        theme: state.theme,
      }));
    } catch (e) { /* storage unavailable — ignore */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d.names) && d.names.length === 2) state.names = d.names;
      if (Array.isArray(d.wins) && d.wins.length === 2) state.wins = d.wins.map((n) => +n || 0);
      if (Array.isArray(d.avatars) && d.avatars.length === 2) state.avatars = d.avatars;
      if (typeof d.target === 'number') state.target = clampTarget(d.target);
      if (typeof d.sound === 'boolean') state.sound = d.sound;
      if (d.theme === 'light' || d.theme === 'dark') state.theme = d.theme;
    } catch (e) { /* corrupt/unavailable — ignore */ }
  }

  const clampTarget = (t) => Math.max(MIN_TARGET, Math.min(MAX_TARGET, Math.round(t / TARGET_STEP) * TARGET_STEP));
  const defaultName = (i) => (i === 0 ? 'Player 1' : 'Player 2');

  /* ---------- Sound (Web Audio, no assets) ---------- */
  let audioCtx = null;
  function tone(freq, duration, type, gain, when) {
    if (!state.sound) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t0 = audioCtx.currentTime + (when || 0);
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.14, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch (e) { /* audio blocked — ignore */ }
  }

  const sfx = {
    roll() { tone(220, 0.18, 'triangle', 0.10); tone(330, 0.14, 'triangle', 0.07, 0.05); },
    land(v) { tone(300 + v * 40, 0.12, 'sine', 0.12); },
    bust() { tone(200, 0.18, 'sawtooth', 0.14); tone(120, 0.28, 'sawtooth', 0.12, 0.08); },
    hold() { tone(440, 0.1, 'sine', 0.12); tone(660, 0.14, 'sine', 0.1, 0.08); },
    tick() { tone(520, 0.06, 'square', 0.06); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'sine', 0.14, i * 0.12)); },
  };

  /* ---------- Rendering ---------- */
  function animateNumber(node, from, to) {
    if (from === to) { node.textContent = to; return; }
    const dur = 420;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = Math.round(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
      else node.textContent = to;
    };
    requestAnimationFrame(step);
  }

  function renderProgress() {
    for (let i = 0; i < 2; i++) {
      const bankedPct = Math.max(0, Math.min(100, (state.scores[i] / state.target) * 100));
      const rawPending = i === state.active && state.playing ? (state.current / state.target) * 100 : 0;
      const pendingPct = Math.max(0, Math.min(100 - bankedPct, rawPending));
      el.banked[i].parentElement.style.setProperty('--banked', bankedPct + '%');
      el.banked[i].parentElement.style.setProperty('--pending', pendingPct + '%');
      el.plabels[i].textContent = `${state.scores[i]} / ${state.target}`;
      el.progress[i].setAttribute('aria-valuemax', state.target);
      el.progress[i].setAttribute('aria-valuenow', state.scores[i]);
    }
  }

  function renderScores(animate) {
    state.scores.forEach((s, i) => {
      const node = el.scores[i];
      const prev = parseInt(node.textContent, 10) || 0;
      if (animate && prev !== s) {
        animateNumber(node, prev, s);
        node.classList.remove('bump');
        void node.offsetWidth;
        node.classList.add('bump');
      } else {
        node.textContent = s;
      }
    });
    renderProgress();
    renderLeading();
  }

  function renderCurrent(pop) {
    el.currents.forEach((node, i) => {
      node.textContent = i === state.active ? state.current : 0;
    });
    if (pop) {
      const node = el.currents[state.active];
      node.classList.remove('pop');
      void node.offsetWidth;
      node.classList.add('pop');
    }
    renderProgress();
  }

  function renderActive() {
    el.players.forEach((p, i) => {
      p.classList.toggle('is-active', i === state.active && state.playing);
      p.classList.remove('is-winner', 'is-loser');
    });
    if (state.playing) el.board.setAttribute('data-active', state.active);
  }

  function renderLeading() {
    let leader = -1;
    if (state.scores[0] !== state.scores[1] && Math.max(state.scores[0], state.scores[1]) > 0) {
      leader = state.scores[0] > state.scores[1] ? 0 : 1;
    }
    el.players.forEach((p, i) => p.classList.toggle('is-leading', i === leader && state.playing));
  }

  function renderNames() {
    state.names.forEach((n, i) => { if (el.names[i].textContent !== n) el.names[i].textContent = n; });
  }

  function renderAvatars() {
    state.avatars.forEach((a, i) => {
      el.avatars[i].textContent = a;
    });
  }

  function renderWins() {
    state.wins.forEach((w, i) => { el.wins[i].textContent = `🏆 ${w} ${w === 1 ? 'win' : 'wins'}`; });
  }

  function renderTarget() {
    el.targetValue.textContent = state.target;
    el.targetDown.disabled = state.target <= MIN_TARGET;
    el.targetUp.disabled = state.target >= MAX_TARGET;
    renderProgress();
  }

  function setStatus(text, kind) {
    el.status.textContent = text;
    el.status.classList.remove('flash-bust', 'flash-good');
    if (kind) {
      void el.status.offsetWidth;
      el.status.classList.add(kind === 'bust' ? 'flash-bust' : 'flash-good');
    }
  }

  function setControls() {
    const busy = state.rolling || state.locked || !state.playing;
    el.rollBtn.disabled = busy;
    el.holdBtn.disabled = busy || state.current === 0;
  }

  /* ---------- Theme ---------- */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', state.theme === 'dark' ? '#0b1020' : '#6d5cff');
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    save();
    sfx.tick();
  }

  /* ---------- Dice animation ---------- */
  function nextAngle(current, residue, minSpin) {
    const base = ((residue % 360) + 360) % 360;
    const k = Math.ceil((current + minSpin - base) / 360);
    return base + k * 360;
  }

  function spinDiceTo(value) {
    const rot = FACE_ROTATION[value];
    accX = nextAngle(accX, rot.x, 540 + Math.floor(Math.random() * 3) * 360);
    accY = nextAngle(accY, rot.y, 540 + Math.floor(Math.random() * 3) * 360);
    el.dice.classList.add('rolling');
    el.dice.style.transform = `rotateX(${accX}deg) rotateY(${accY}deg)`;
    el.dice.setAttribute('aria-label', `Dice showing ${value}`);
  }

  /* ---------- Core game actions ---------- */
  function rollDice() {
    if (state.rolling || state.locked || !state.playing) return;
    const value = Math.floor(Math.random() * 6) + 1;

    state.rolling = true;
    setControls();
    sfx.roll();
    spinDiceTo(value);

    window.setTimeout(() => {
      el.dice.classList.remove('rolling');
      state.rolling = false;

      if (value === 1) {
        sfx.bust();
        state.current = 0;
        state.locked = true;
        setControls();
        el.diceStage.classList.remove('bust');
        void el.diceStage.offsetWidth;
        el.diceStage.classList.add('bust');
        renderCurrent(false);
        setStatus(`💥 ${state.names[state.active]} rolled a 1 — turn lost!`, 'bust');
        window.setTimeout(switchPlayer, 850);
      } else {
        sfx.land(value);
        state.current += value;
        renderCurrent(true);
        const total = state.scores[state.active] + state.current;
        if (total >= state.target) {
          setStatus(`${state.names[state.active]} can win — hit Hold! (${total})`, 'good');
        } else {
          setStatus(`${state.names[state.active]} rolled a ${value} — roll again or hold.`);
        }
        setControls();
      }
    }, 1050);
  }

  function hold() {
    if (state.rolling || state.locked || !state.playing || state.current === 0) return;
    sfx.hold();
    const banked = state.current;
    state.scores[state.active] += state.current;
    state.current = 0;
    renderScores(true);
    renderCurrent(false);

    if (state.scores[state.active] >= state.target) {
      win(state.active);
    } else {
      state.locked = true;
      setControls();
      setStatus(`${state.names[state.active]} banked ${banked} — now on ${state.scores[state.active]}.`, 'good');
      window.setTimeout(switchPlayer, 650);
    }
  }

  function switchPlayer() {
    state.locked = false;
    if (!state.playing) return;
    state.current = 0;
    state.active = state.active === 0 ? 1 : 0;
    renderCurrent(false);
    renderActive();
    setStatus(`${state.names[state.active]}'s turn — roll the dice!`);
    setControls();
  }

  function win(index) {
    state.playing = false;
    state.wins[index] += 1;
    renderWins();
    save();
    setControls();

    el.players.forEach((p, i) => {
      p.classList.remove('is-active', 'is-leading');
      p.classList.toggle('is-winner', i === index);
      p.classList.toggle('is-loser', i !== index);
    });
    el.board.setAttribute('data-active', index);

    setStatus(`🏆 ${state.names[index]} wins with ${state.scores[index]} points!`, 'good');
    sfx.win();

    el.winAvatar.textContent = state.avatars[index];
    el.winTitle.textContent = state.names[index];
    el.winSub.textContent = `reached ${state.scores[index]} points!`;
    el.overlay.classList.add('is-open');
    el.overlay.setAttribute('aria-hidden', 'false');
    launchConfetti();
  }

  function newGame() {
    state.scores = [0, 0];
    state.current = 0;
    state.active = 0;
    state.playing = true;
    state.rolling = false;
    state.locked = false;
    stopConfetti();
    el.overlay.classList.remove('is-open');
    el.overlay.setAttribute('aria-hidden', 'true');
    el.dice.classList.remove('rolling');
    el.diceStage.classList.remove('bust');
    el.players.forEach((p) => p.classList.remove('is-winner', 'is-loser', 'is-leading'));
    renderScores(false);
    renderCurrent(false);
    renderActive();
    renderTarget();
    setControls();
    setStatus(`New game to ${state.target} — ${state.names[0]}, roll to start!`);
  }

  /* ---------- Target control ---------- */
  function changeTarget(delta) {
    if (!state.playing) return;
    state.target = clampTarget(state.target + delta * TARGET_STEP);
    renderTarget();
    save();
    sfx.tick();
    if (state.scores[0] === 0 && state.scores[1] === 0 && state.current === 0) {
      setStatus(`First to ${state.target} wins — ${state.names[state.active]}, roll to start!`);
    }
  }

  /* ---------- Names ---------- */
  function commitName(i) {
    let text = el.names[i].textContent.replace(/\s+/g, ' ').trim();
    if (!text) text = defaultName(i);
    if (text.length > MAX_NAME) text = text.slice(0, MAX_NAME);
    state.names[i] = text;
    el.names[i].textContent = text;
    save();
    if (state.playing && !state.rolling && state.current === 0 &&
        state.scores[0] === 0 && state.scores[1] === 0) {
      setStatus(`${state.names[state.active]}, roll the dice to start!`);
    }
  }

  /* ---------- Avatars ---------- */
  function cycleAvatar(i) {
    const cur = AVATAR_SET.indexOf(state.avatars[i]);
    let next = (cur + 1) % AVATAR_SET.length;
    if (AVATAR_SET[next] === state.avatars[1 - i]) next = (next + 1) % AVATAR_SET.length; // avoid a clash
    state.avatars[i] = AVATAR_SET[next];
    el.avatars[i].textContent = state.avatars[i];
    el.avatars[i].classList.remove('pop');
    void el.avatars[i].offsetWidth;
    el.avatars[i].classList.add('pop');
    save();
    sfx.tick();
  }

  /* ---------- Sound toggle ---------- */
  function toggleSound() {
    state.sound = !state.sound;
    el.soundToggle.setAttribute('aria-pressed', String(state.sound));
    save();
    if (state.sound) sfx.hold();
  }

  /* ---------- Confetti (canvas, self-contained) ---------- */
  let confettiRAF = null;
  let confettiPieces = [];
  const ctx = el.confetti.getContext('2d');

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.confetti.width = window.innerWidth * dpr;
    el.confetti.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function launchConfetti() {
    sizeCanvas();
    const colors = ['#7c5cff', '#a855f7', '#06b6d4', '#14b8a6', '#f59e0b', '#22c55e', '#ef4444'];
    const W = window.innerWidth;
    confettiPieces = [];
    const count = Math.min(200, Math.floor(W / 5));
    for (let i = 0; i < count; i++) {
      confettiPieces.push({
        x: Math.random() * W,
        y: -20 - Math.random() * window.innerHeight * 0.5,
        r: 5 + Math.random() * 7,
        c: colors[(Math.random() * colors.length) | 0],
        vx: -1.5 + Math.random() * 3,
        vy: 2 + Math.random() * 3.5,
        rot: Math.random() * Math.PI,
        vr: -0.15 + Math.random() * 0.3,
        shape: Math.random() > 0.5 ? 'rect' : 'circ',
      });
    }
    if (confettiRAF) cancelAnimationFrame(confettiRAF);
    const start = performance.now();
    const tick = (now) => {
      const H = window.innerHeight;
      ctx.clearRect(0, 0, window.innerWidth, H);
      let alive = false;
      const fade = Math.max(0, 1 - (now - start) / 6500);
      confettiPieces.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03;
        p.rot += p.vr;
        if (p.y < H + 30) alive = true;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        if (p.shape === 'rect') ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        else { ctx.beginPath(); ctx.arc(0, 0, p.r / 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      });
      if (alive && fade > 0) confettiRAF = requestAnimationFrame(tick);
      else stopConfetti();
    };
    confettiRAF = requestAnimationFrame(tick);
  }

  function stopConfetti() {
    if (confettiRAF) cancelAnimationFrame(confettiRAF);
    confettiRAF = null;
    confettiPieces = [];
    if (ctx) ctx.clearRect(0, 0, el.confetti.width, el.confetti.height);
  }

  /* ---------- Event wiring ---------- */
  function bind() {
    el.rollBtn.addEventListener('click', rollDice);
    el.holdBtn.addEventListener('click', hold);
    el.newBtn.addEventListener('click', newGame);
    el.playAgainBtn.addEventListener('click', newGame);
    el.dice.addEventListener('click', () => { if (!state.rolling && !state.locked && state.playing) rollDice(); });

    el.targetUp.addEventListener('click', () => changeTarget(1));
    el.targetDown.addEventListener('click', () => changeTarget(-1));
    el.soundToggle.addEventListener('click', toggleSound);
    el.themeToggle.addEventListener('click', toggleTheme);

    el.avatars.forEach((btn, i) => btn.addEventListener('click', () => cycleAvatar(i)));

    document.querySelectorAll('.btn').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const rect = btn.getBoundingClientRect();
        btn.style.setProperty('--rx', ((e.clientX - rect.left) / rect.width) * 100 + '%');
        btn.style.setProperty('--ry', ((e.clientY - rect.top) / rect.height) * 100 + '%');
      });
    });

    el.names.forEach((node, i) => {
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); node.blur(); }
      });
      node.addEventListener('blur', () => commitName(i));
    });

    document.addEventListener('keydown', (e) => {
      if (document.activeElement && document.activeElement.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (el.overlay.classList.contains('is-open')) {
        if (k === 'n' || k === 'enter' || k === ' ') { e.preventDefault(); newGame(); }
        return;
      }
      if (k === 'r') { e.preventDefault(); rollDice(); }
      else if (k === 'h') { e.preventDefault(); hold(); }
      else if (k === 'n') { e.preventDefault(); newGame(); }
      else if (k === 't') { e.preventDefault(); toggleTheme(); }
    });

    window.addEventListener('resize', () => { if (confettiRAF) sizeCanvas(); });
  }

  /* ---------- Init ---------- */
  function init() {
    load();
    applyTheme();
    el.soundToggle.setAttribute('aria-pressed', String(state.sound));
    renderNames();
    renderAvatars();
    renderWins();
    renderTarget();
    renderScores(false);
    renderCurrent(false);
    renderActive();
    setControls();
    setStatus(`First to ${state.target} wins — ${state.names[0]}, roll the dice to start!`);
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
