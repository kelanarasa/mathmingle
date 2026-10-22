'use strict';
/* MATH MINGLE - logika permainan (JavaScript murni, tanpa backend) */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rand = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- Pengaturan & status ---------- */
const cfg = { grade: 1, ops: ['+'], rounds: 5, mingle: 15, music: true };
const S = {};                 // status sesi
let timer = null;             // SATU-SATUNYA interval hitung mundur (mencegah timer ganda)

function resetState() {
  Object.assign(S, { round: 0, played: 0, answered: 0, success: 0, score: 0,
                     q: null, phase: 'menu', paused: false, revealed: false, think: 0, left: 0 });
  used.clear(); bag = [];
}

/* ---------- Generator soal (jawaban SELALU 2-8) ---------- */
// Batas bilangan per kelas
const LIM = {
  1: { add: 6, sub: 10, mulMin: 1, div: 10 },
  2: { add: 8, sub: 20, mulMin: 2, div: 20 },
  3: { add: 8, sub: 30, mulMin: 2, div: 64 },
  4: { add: 8, sub: 60,  mulMin: 2, div: 100, subMin: 10, divMin: 4 },
  5: { add: 8, sub: 120, mulMin: 2, div: 150, subMin: 20, divMin: 6 },
  6: { add: 8, sub: 250, mulMin: 2, div: 240, subMin: 40, divMin: 8 }
};
// Nilai awal pengurang / pembagi (kelas 1-3 memakai bawaan)
Object.values(LIM).forEach(L => { L.subMin = L.subMin || 1; L.divMin = L.divMin || 2; });

// Buat semua soal valid untuk satu operasi dan satu kelas
function buildPool(grade, op) {
  const L = LIM[grade], pool = [];
  for (let r = 2; r <= 8; r++) {                       // r = jawaban
    if (op === '+' && r <= L.add) for (let a = 1; a < r; a++) pool.push({ a, b: r - a, op, r });
    if (op === '-') for (let b = L.subMin; r + b <= L.sub; b++) pool.push({ a: r + b, b, op, r });
    if (op === '×') for (let a = L.mulMin; a <= r; a++)
      if (r % a === 0 && r / a >= L.mulMin) pool.push({ a, b: r / a, op, r });
    if (op === '÷') for (let b = L.divMin; b * r <= L.div; b++) pool.push({ a: b * r, b, op, r });
  }
  return pool;
}

// Pemeriksa terakhir: hitung ulang soal dan pastikan hasil 2-8 (bulat)
function isValid(q) {
  const v = { '+': q.a + q.b, '-': q.a - q.b, '×': q.a * q.b, '÷': q.b === 0 ? NaN : q.a / q.b }[q.op];
  return Number.isInteger(v) && v >= 2 && v <= 8 && v === q.r;
}

let pools = {}, used = new Set(), bag = [];
const qKey = q => `${q.a}${q.op}${q.b}`;

function nextQuestion() {
  if (!bag.length) bag = shuffle([...cfg.ops]);        // setiap operasi terpilih pasti dipakai
  const op = bag.pop();
  let pool = pools[op].filter(q => !used.has(qKey(q)));
  if (!pool.length) { pools[op].forEach(q => used.delete(qKey(q))); pool = pools[op].slice(); }
  const diff = pool.filter(q => !S.q || q.r !== S.q.r); // hindari jawaban sama beruntun
  if (diff.length) pool = diff;
  const q = pool[rand(pool.length)];
  used.add(qKey(q));
  return isValid(q) ? q : nextQuestion();
}

/* ---------- Audio (Web Audio API, tanpa file eksternal) ---------- */
let ac = null, muted = false, musicTimer = null, step = 0;
const MEL  = [523,659,784,659,587,698,880,698,523,659,784,1047,880,784,659,587];
const BASS = [131,175,196,165];

function tone(f, d = .15, type = 'sine', v = .15, delay = 0) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + delay;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d);
  } catch (e) { /* audio tidak tersedia: abaikan */ }
}
const seq = (notes, d = .14, type = 'square') => notes.forEach((f, i) => tone(f, d, type, .12, i * d));
const sfx = {
  click:    () => tone(700, .06, 'square', .08),
  question: () => seq([392, 523, 659, 784]),
  reveal:   () => seq([659, 784, 1047], .18, 'triangle'),
  tick:     () => tone(880, .1, 'square', .12),
  go:       () => seq([523, 784], .12),
  timesup:  () => seq([784, 659, 523, 392], .2, 'sawtooth'),
  success:  () => seq([523, 659, 784, 1047], .13, 'triangle'),
  finish:   () => seq([523, 659, 784, 659, 784, 1047, 1319], .16, 'triangle')
};
/* ---------- BGM dari file MP3 ----------
   Ganti nama file di bawah jika nama file mp3 Anda berbeda.
   Simpan file di folder "audio" (sejajar dengan index.html). */
const BGM_FILES  = { move: 'audio/bgm-bergerak.mp3',   // fase "AYO BERGERAK"
                     count: 'audio/bgm-countdown.mp3' }; // fase soal + hitung mundur
const BGM_VOLUME = 0.6;                                  // 0.0 - 1.0
const BGM = {};
Object.entries(BGM_FILES).forEach(([k, src]) => {
  const a = new Audio(src); a.loop = true; a.preload = 'auto'; a.volume = BGM_VOLUME; BGM[k] = a;
});

// Musik mana yang cocok untuk fase sekarang
const phaseBgm = () => S.phase === 'music' ? 'move' : S.phase === 'mingle' ? 'count' : null;

// Cadangan: nada sintesis jika file "move" tidak ditemukan
function startSynth() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    tone(MEL[step % MEL.length], .22, 'triangle', .12);
    if (step % 2 === 0) tone(BASS[(step >> 1) % 4], .3, 'sine', .1);
    step++;
  }, 260);
}
function stopSynth() { clearInterval(musicTimer); musicTimer = null; }

// reset=true: mulai dari awal; reset=false: lanjut (dipakai setelah jeda/unmute)
function startMusic(reset = true) {
  stopMusic();
  const name = phaseBgm();
  if (!name || muted || !cfg.music) return;
  const a = BGM[name];
  if (reset) a.currentTime = 0;
  a.play().catch(() => { if (name === 'move') startSynth(); }); // file hilang -> nada cadangan
}
function stopMusic() { Object.values(BGM).forEach(a => a.pause()); stopSynth(); }

/* ---------- Utilitas tampilan ---------- */
function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
function setPhase(p) {
  S.phase = p; $$('.phase').forEach(e => e.classList.toggle('active', e.id === 'p-' + p));
  document.body.classList.toggle('moving', p === 'music');   // lingkaran latar berputar hanya saat "AYO BERGERAK"
}
function stopTimer() { clearInterval(timer); timer = null; }
function stopAll() { stopTimer(); stopMusic(); }
function pop(el) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
const qStr = (q, withAns) => `${q.a} ${q.op} ${q.b} = ${withAns ? q.r : '?'}`;
function hud() {
  $('#roundInfo').textContent = `Ronde ${S.round} / ${cfg.rounds}`;
  $('#scoreInfo').textContent = `⭐ ${S.score}`;
}

// Ilustrasi anak sederhana (SVG)
const kidSvg = c => `<svg class="kid" viewBox="0 0 60 92" aria-hidden="true">
  <path d="M16 42L5 58M44 42l11 16M24 66v18M36 66v18" stroke="#15121a" stroke-width="5" stroke-linecap="round"/>
  <rect x="14" y="32" width="32" height="36" rx="12" fill="${c}" stroke="#15121a" stroke-width="3"/>
  <circle cx="30" cy="17" r="14" fill="#ffd9a8" stroke="#15121a" stroke-width="3"/>
  <circle cx="25" cy="16" r="2" fill="#15121a"/><circle cx="35" cy="16" r="2" fill="#15121a"/>
  <path d="M24 22q6 5 12 0" stroke="#15121a" stroke-width="2.5" fill="none"/></svg>`;
const KID_COLORS = ['#ff3d8b','#0c9b6e','#8ec5ff','#ffd84d','#b79cff','#ff3d8b','#0c9b6e'];
$('#kids').innerHTML = KID_COLORS.map((c, i) =>
  `<span class="orb" style="--a:${(i * 360 / KID_COLORS.length).toFixed(2)}deg">${kidSvg(c)}</span>`).join('');

/* ---------- Pengaturan menu ---------- */
$$('.chips').forEach(box => box.addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  if (box.dataset.multi) {                                // operasi: boleh banyak, minimal satu
    if (b.classList.contains('on') && box.querySelectorAll('.on').length === 1) return;
    b.classList.toggle('on');
  } else {
    box.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
    b.classList.add('on');
  }
  readSettings(); sfx.click();
}));
function readSettings() {
  const v = k => $(`[data-key=${k}] .on`).dataset.v;
  cfg.grade = +v('grade'); cfg.rounds = +v('rounds'); cfg.mingle = +v('mingle'); cfg.music = v('music') === '1';
  cfg.ops = $$('[data-key=ops] .on').map(b => b.dataset.v);
}

/* ---------- Alur permainan ---------- */
function startGame() {
  stopAll(); readSettings(); resetState();
  document.body.classList.remove('paused');
  pools = {}; cfg.ops.forEach(op => pools[op] = buildPool(cfg.grade, op));
  $('#pauseOv').hidden = true;
  show('game'); newRound();
}

// Awal ronde -> Fase 1 (musik)
function newRound() {
  S.round++; S.q = nextQuestion(); S.revealed = false; hud();
  setPhase('music'); startMusic();
}

// Fase 2+3: soal muncul dan hitung mundur LANGSUNG berjalan (jawaban belum ditampilkan)
function showQuestion() { stopAll(); startMingle(); }
// Fase 3: hitung mundur mingle
function startMingle() {
  setPhase('mingle'); S.left = cfg.mingle;
  const q = $('#qMini'); q.textContent = qStr(S.q, false); pop(q);   // soal saja, tanpa jawaban
  startMusic();                                                       // BGM soal/countdown dari awal
  sfx.question(); runCount();
}
function renderCount() {
  const c = $('#count'); c.textContent = S.left; c.classList.toggle('warn', S.left <= 5); pop(c);
}
function runCount() {
  stopTimer(); renderCount();
  timer = setInterval(() => {
    S.left--;
    if (S.left <= 0) { stopTimer(); timesUp(); return; }
    renderCount(); if (S.left <= 5) sfx.tick();
  }, 1000);
}

// Fase 4: guru mengecek (game tidak menilai otomatis)
function timesUp() {
  stopTimer(); stopMusic(); sfx.timesup(); S.answered++; setPhase('check');   // jawaban baru dibuka di sini
  $('#qCheck').textContent = qStr(S.q, true);
  $('#sizeCheck').textContent = `JAWABANNYA ${S.q.r}! KELOMPOK ${S.q.r} ANAK`;
  setTimeout(() => S.phase === 'check' && sfx.reveal(), 900);
}
function finishRound(ok) {
  S.played++;
  if (ok) { S.success++; S.score += 10; sfx.success(); } else { S.score += 2; sfx.click(); } // poin semangat, tidak pernah dikurangi
  if (S.round >= cfg.rounds) endGame(); else newRound();
}

function endGame() {
  stopAll(); S.phase = 'end'; show('end'); sfx.finish();
  document.body.classList.remove('moving');
  const st = [['Ronde dimainkan', S.played], ['Soal dijawab', S.answered], ['Ronde berhasil', S.success], ['Skor sesi', S.score]];
  $('#finalStats').innerHTML = st.map(([l, v]) => `<div class="stat"><b>${v}</b>${l}</div>`).join('');
}

/* ---------- Jeda, suara, layar penuh ---------- */
function pauseGame() {
  if (!['music','mingle','check'].includes(S.phase) || S.paused) return;
  S.paused = true; stopAll(); $('#pauseOv').hidden = false;
  document.body.classList.add('paused');
}
function resumeGame() {
  if (!S.paused) return;
  S.paused = false; $('#pauseOv').hidden = true;
  document.body.classList.remove('paused');
  startMusic(false);                       // lanjutkan BGM fase ini (jika ada)
  if (S.phase === 'mingle') runCount();
}
function toggleMute() {
  muted = !muted; $('#btnMute').textContent = muted ? '🔇 Senyap' : '🔊 Suara';
  if (muted) stopMusic(); else if (!S.paused) startMusic(false);
}
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen();
  else (document.documentElement.requestFullscreen || (() => {})).call(document.documentElement);
}
function toMenu() {
  stopAll(); resetState(); $('#pauseOv').hidden = true; show('menu');
  document.body.classList.remove('moving', 'paused');
}

/* ---------- Tombol ---------- */
$('#btnStart').onclick      = startGame;
$('#btnHow').onclick        = () => $('#howOv').hidden = false;
$('#btnCloseHow').onclick   = () => $('#howOv').hidden = true;
$('#btnStopMusic').onclick  = showQuestion;   // stop musik -> soal + hitung mundur
$('#btnOk').onclick         = () => finishRound(true);
$('#btnNext').onclick       = () => finishRound(false);
$('#btnRepeat').onclick     = startMingle;           // timer lama dihentikan di dalam runCount()
$('#btnPause').onclick      = pauseGame;
$('#btnResume').onclick     = resumeGame;
$('#btnMute').onclick       = toggleMute;
$('#btnFull').onclick       = toggleFull;
$('#btnRestart').onclick    = startGame;             // reset ronde, skor, timer, status
$('#btnMenu').onclick       = toMenu;
$('#btnAgain').onclick      = startGame;
$('#btnBack').onclick       = toMenu;

resetState(); readSettings();
