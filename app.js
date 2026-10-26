const DEFAULTS = { focus: 25, short: 5, long: 15, interval: 4, autoStart: false };
const LABELS = { focus: "Focus", short: "Short break", long: "Long break" };

const $ = (sel) => document.querySelector(sel);
const timeEl = $("#time");
const toggleBtn = $("#toggle");
const progressEl = $(".progress");
const form = $("#settings");

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
progressEl.style.strokeDasharray = CIRCUMFERENCE;

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const settings = { ...DEFAULTS, ...load("pomodoro:settings", {}) };
const today = new Date().toDateString();
const stats = load("pomodoro:stats", {});
if (stats.date !== today) Object.assign(stats, { date: today, done: 0 });

const state = {
  mode: "focus",
  session: 1,            // which focus session we're on in the current cycle
  remaining: settings.focus * 60 * 1000,
  endsAt: null,          // timestamp when running; null when paused
  tick: null,
};

const duration = (mode) => settings[mode] * 60 * 1000;

function format(ms) {
  const total = Math.ceil(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function render() {
  const ms = state.endsAt ? Math.max(0, state.endsAt - Date.now()) : state.remaining;
  const text = format(ms);
  timeEl.textContent = text;
  document.title = `${text} · ${LABELS[state.mode]}`;
  progressEl.style.strokeDashoffset = CIRCUMFERENCE * (1 - ms / duration(state.mode));
  toggleBtn.textContent = state.endsAt ? "Pause" : state.remaining < duration(state.mode) ? "Resume" : "Start";
  document.body.dataset.mode = state.mode;
  document.querySelectorAll(".modes button").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === state.mode));
  $("#session").textContent = state.session;
  $("#done").textContent = stats.done;
}

function start() {
  if (state.endsAt) return;
  state.endsAt = Date.now() + state.remaining;
  state.tick = setInterval(() => {
    if (Date.now() >= state.endsAt) complete();
    else render();
  }, 250);
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  render();
}

function pause() {
  if (!state.endsAt) return;
  state.remaining = Math.max(0, state.endsAt - Date.now());
  state.endsAt = null;
  clearInterval(state.tick);
  render();
}

function setMode(mode) {
  pause();
  state.mode = mode;
  state.remaining = duration(mode);
  render();
}

function next() {
  if (state.mode === "focus") {
    setMode(state.session % settings.interval === 0 ? "long" : "short");
  } else {
    if (state.mode === "long") state.session = 0;
    state.session++;
    setMode("focus");
  }
}

function complete() {
  const finished = state.mode;
  if (finished === "focus") {
    stats.done++;
    save("pomodoro:stats", stats);
  }
  chime();
  notify(finished === "focus" ? "Focus session done — take a break." : "Break's over — back to focus.");
  next();
  if (settings.autoStart) start();
}

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = [660, 880, 990][i];
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.45);
    });
  } catch {}
}

function notify(body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Pomodoro", { body });
  }
}

// --- Wiring ---

toggleBtn.addEventListener("click", () => (state.endsAt ? pause() : start()));
$("#reset").addEventListener("click", () => setMode(state.mode));
$("#skip").addEventListener("click", next);
document.querySelectorAll(".modes button").forEach((b) =>
  b.addEventListener("click", () => setMode(b.dataset.mode)));

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;
  if (e.code === "Space") { e.preventDefault(); toggleBtn.click(); }
  else if (e.key === "r") setMode(state.mode);
  else if (e.key === "s") next();
});

for (const [key, value] of Object.entries(settings)) {
  const input = form.elements[key];
  if (!input) continue;
  if (input.type === "checkbox") input.checked = value;
  else input.value = value;
}

form.addEventListener("change", (e) => {
  const input = e.target;
  if (input.type === "checkbox") {
    settings[input.name] = input.checked;
  } else {
    const n = Math.round(Number(input.value));
    if (!(n >= Number(input.min) && n <= Number(input.max))) { input.value = settings[input.name]; return; }
    settings[input.name] = n;
  }
  save("pomodoro:settings", settings);
  // Apply a new duration right away to the current timer if it isn't running
  if (!state.endsAt && input.name === state.mode) setMode(state.mode);
});

render();
