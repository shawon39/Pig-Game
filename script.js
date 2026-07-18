/* ============================================================
   PIG GAME — game engine
   Two-player dice game. Roll to build a turn total; banking
   adds it to your score. Roll a 1 and you bust, losing the
   turn total and your turn. First to the target wins.
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Constants & state ---------- */
  const STORAGE_KEY = 'pig-game.v2';
  const MIN_TARGET = 20;
  const MAX_TARGET = 300;
  const TARGET_STEP = 10;

  const state = {
    scores: [0, 0],
    current: 0,
    active: 0,          // 0 or 1
    target: 100,
    playing: true,
    rolling: false,
    locked: false,      // true during a pending turn transition (hold/bust pause)
    names: ['Shawon', 'Sizan'],
    wins: [0, 0],
    sound: true,
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

  // Running (accumulated) rotation so the die always spins forward.
  let accX = 0;
  let accY = 0;

  /* ---------- Element refs ---------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    players: [$('player-0'), $('player-1')],
    scores: [$('score-0'), $('score-1')],
    currents: [$('current-0'), $('current-1')],
    names: [$('name-0'), $('name-1')],
    wins: [$('wins-0'), $('wins-1')],
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
    overlay: $('overlay'),
    winTitle: $('winTitle'),
    winSub: $('winSub'),
    playAgainBtn: $('playAgainBtn'),
    confetti: $('confetti'),
  };

  /* ---------- Persistence ---------- */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        names: state.names,
        wins: state.wins,
        target: state.target,
        sound: state.sound,
      }));
    } catch (e) { /* storage unavailable — ignore */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.names) && data.names.length === 2) state.names = data.names;
      if (Array.isArray(data.wins) && data.wins.length === 2) state.wins = data.wins.map((n) => +n || 0);
      if (typeof data.target === 'number') state.target = clampTarget(data.target);
      if (typeof data.sound === 'boolean') state.sound = data.sound;
    } catch (e) { /* corrupt/unavailable — ignore */ }
  }

  const clampTarget = (t) => Math.max(MIN_TARGET, Math.min(MAX_TARGET, Math.round(t / TARGET_STEP) * TARGET_STEP));

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
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'sine', 0.14, i * 0.12));
    },
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
  }

  function renderActive() {
    el.players.forEach((p, i) => {
      p.classList.toggle('is-active', i === state.active && state.playing);
      p.classList.remove('is-winner', 'is-loser');
    });
  }

  function renderNames() {
    state.names.forEach((n, i) => { if (el.names[i].textContent !== n) el.names[i].textContent = n; });
  }

  function renderWins() {
    state.wins.forEach((w, i) => { el.wins[i].textContent = '★ ' + w; });
  }

  function renderTarget() {
    el.targetValue.textContent = state.target;
    el.targetDown.disabled = state.target <= MIN_TARGET;
    el.targetUp.disabled = state.target >= MAX_TARGET;
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

  /* ---------- Dice animation ---------- */
  // Smallest angle >= current + minSpin whose value mod 360 matches `residue`.
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

    // Resolve outcome after the tumble settles.
    window.setTimeout(() => {
      el.dice.classList.remove('rolling');
      state.rolling = false;

      if (value === 1) {
        // Bust: lose current, pass turn.
        sfx.bust();
        state.current = 0;
        state.locked = true;
        setControls();
        el.diceStage.classList.remove('bust');
        void el.diceStage.offsetWidth;
        el.diceStage.classList.add('bust');
        renderCurrent(false);
        setStatus(`💥 ${state.names[state.active]} rolled a 1 and busts!`, 'bust');
        window.setTimeout(switchPlayer, 850);
      } else {
        sfx.land(value);
        state.current += value;
        renderCurrent(true);
        const total = state.scores[state.active] + state.current;
        if (total >= state.target) {
          setStatus(`${state.names[state.active]} could win — bank it! (${total})`, 'good');
        } else {
          setStatus(`${state.names[state.active]} rolled a ${value}. Roll again or hold.`);
        }
        setControls();
      }
    }, 1050);
  }

  function hold() {
    if (state.rolling || state.locked || !state.playing || state.current === 0) return;
    sfx.hold();
    const prev = state.scores[state.active];
    state.scores[state.active] += state.current;
    state.current = 0;
    renderScores(true);
    renderCurrent(false);

    if (state.scores[state.active] >= state.target) {
      win(state.active);
    } else {
      state.locked = true;
      setControls();
      setStatus(`${state.names[state.active]} banked ${state.scores[state.active] - prev}. Now ${state.scores[state.active]}.`, 'good');
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
      p.classList.remove('is-active');
      p.classList.toggle('is-winner', i === index);
      p.classList.toggle('is-loser', i !== index);
    });

    setStatus(`🏆 ${state.names[index]} wins with ${state.scores[index]} points!`, 'good');
    sfx.win();

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
    renderScores(false);
    renderCurrent(false);
    renderActive();
    renderTarget();
    setControls();
    setStatus(`New game to ${state.target} — ${state.names[0]}, roll to start!`);
  }

  /* ---------- Target control ---------- */
  function changeTarget(delta) {
    if (!canEditSettings()) return;
    state.target = clampTarget(state.target + delta * TARGET_STEP);
    renderTarget();
    save();
    if (state.scores[0] === 0 && state.scores[1] === 0 && state.current === 0) {
      setStatus(`First to ${state.target} wins — ${state.names[state.active]}, roll to start!`);
    }
  }

  // Only allow retargeting before the game has meaningfully started.
  function canEditSettings() {
    return state.playing;
  }

  /* ---------- Names ---------- */
  function commitName(i) {
    let text = el.names[i].textContent.replace(/\s+/g, ' ').trim();
    if (!text) text = i === 0 ? 'Player 1' : 'Player 2';
    if (text.length > 16) text = text.slice(0, 16);
    state.names[i] = text;
    el.names[i].textContent = text;
    save();
    if (state.playing && !state.rolling) {
      // refresh any status that references the current player's name
      if (state.current === 0 && state.scores[0] === 0 && state.scores[1] === 0) {
        setStatus(`${state.names[state.active]}, roll the dice to start!`);
      }
    }
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
    const colors = ['#ff5f8f', '#ff9d6c', '#4facfe', '#38f9d7', '#ffd76a', '#b388ff'];
    const W = window.innerWidth;
    confettiPieces = [];
    const count = Math.min(180, Math.floor(W / 6));
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
    el.dice.addEventListener('click', () => { if (!state.rolling && state.playing) rollDice(); });

    el.targetUp.addEventListener('click', () => changeTarget(1));
    el.targetDown.addEventListener('click', () => changeTarget(-1));
    el.soundToggle.addEventListener('click', toggleSound);

    // Ripple origin for buttons
    document.querySelectorAll('.btn').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const rect = btn.getBoundingClientRect();
        btn.style.setProperty('--rx', ((e.clientX - rect.left) / rect.width) * 100 + '%');
        btn.style.setProperty('--ry', ((e.clientY - rect.top) / rect.height) * 100 + '%');
      });
    });

    // Editable names
    el.names.forEach((node, i) => {
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); node.blur(); }
      });
      node.addEventListener('blur', () => commitName(i));
    });

    // Keyboard shortcuts (ignore while typing a name)
    document.addEventListener('keydown', (e) => {
      const typing = document.activeElement && document.activeElement.isContentEditable;
      if (typing) return;
      const k = e.key.toLowerCase();
      if (el.overlay.classList.contains('is-open')) {
        if (k === 'n' || k === 'enter' || k === ' ') { e.preventDefault(); newGame(); }
        return;
      }
      if (k === 'r') { e.preventDefault(); rollDice(); }
      else if (k === 'h') { e.preventDefault(); hold(); }
      else if (k === 'n') { e.preventDefault(); newGame(); }
    });

    window.addEventListener('resize', () => { if (confettiRAF) sizeCanvas(); });
  }

  /* ---------- Init ---------- */
  function init() {
    load();
    renderNames();
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
