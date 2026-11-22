/* STUDORA: homework planner, Pomodoro timer, work-hours log, notes, study tips, analytics and PDF export.
   No build step and no server. Everything is saved in this browser (localStorage). */
(() => {
  'use strict';

  /* ======================================================================
     State
     ====================================================================== */

  const KEY = 'studora.v1';
  const OLD_KEY = 'studyflow.v1';
  const WALL_KEY = 'studora.wallpaper';

  const MODES = { focus: 'Focus', short: 'Short break', long: 'Long break' };

  const defaults = () => ({
    tasks: [], sessions: [], shifts: [], notes: [], clock: null, cycle: 0,
    settings: {
      name: '', focus: 25, short: 5, long: 15, dailyGoal: 120, weekStart: 1, rate: '', currency: '$',
      tips: true, wall: 'black', dim: 0, blur: 0, accent: 'periwinkle', scene: true, motion: true,
    },
    timer: { mode: 'focus', running: false, endAt: 0, left: 25 * 60, segStart: 0, taskId: '' },
  });

  function merge(base, raw) {
    const out = { ...base, ...raw };
    out.settings = { ...base.settings, ...(raw.settings || {}) };
    out.timer = { ...base.timer, ...(raw.timer || {}) };
    for (const k of ['tasks', 'sessions', 'shifts', 'notes']) if (!Array.isArray(out[k])) out[k] = [];
    return out;
  }

  function load() {
    const base = defaults();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || 'null');
      if (raw && typeof raw === 'object') return merge(base, raw);
    } catch { /* storage blocked or corrupt: start fresh */ }
    return base;
  }

  let S = load();
  let customWall = '';
  try { customWall = localStorage.getItem(WALL_KEY) || ''; } catch { /* optional */ }
  if (S.settings.wall === 'custom' && !customWall) S.settings.wall = 'black';

  const ui = { week: 0, planWeek: 0, pdfWeek: 0, statsWeek: 0, noteId: '', doneOpen: false, tipCat: 'all', tipShift: 0, pop: null, popTrigger: null, q: '', flash: null, burst: false };
  let current = 'dashboard';
  let printing = false;
  let saveFailed = false;
  let saveTimer = 0;

  function save() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
      saveFailed = false;
    } catch {
      if (!saveFailed) {
        saveFailed = true;
        toast('Could not save. Your browser is blocking storage, so changes will be lost when you close this tab.');
      }
    }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); }
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  /* ======================================================================
     Helpers
     ====================================================================== */

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayStr = () => ymd(new Date());
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
  const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtDate = (s, opts) => parseYmd(s).toLocaleDateString(undefined, opts || { weekday: 'short', day: 'numeric', month: 'short' });
  const hue = str => { let h = 0; for (const c of String(str || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const mod = (n, m) => ((n % m) + m) % m;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function fmtClock(sec, withHours) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return withHours || h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function fmtDur(sec) {
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  function fmtShort(sec) {
    const m = Math.round(sec / 60), h = Math.floor(m / 60), r = m % 60;
    return h ? `${h}h ${pad(r)}m` : `${m}m`;
  }
  const fmtHours = sec => (sec / 3600).toFixed(2);
  const money = n => `${S.settings.currency || ''}${n.toFixed(2)}`;
  const rate = () => Math.max(0, Number(S.settings.rate) || 0);
  const mins = k => Math.max(1, Math.min(180, Math.round(Number(S.settings[k])) || defaults().settings[k]));
  const dur = mode => mins(mode) * 60;
  const goalSec = () => Math.max(10, Math.min(960, Math.round(Number(S.settings.dailyGoal)) || 120)) * 60;

  /* ======================================================================
     Icons (outline, 24 x 24)
     ====================================================================== */

  const ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l3 3 5-6.5"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3.5"/><path d="M3 10h18M8 2.5v4M16 2.5v4"/><path d="M8 14h2M14 14h2M8 17.5h2"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
    note: '<path d="M6 2.5h8.5L20 8v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 2.5V8h6M8.5 13h7M8.5 17h5"/>',
    pdf: '<path d="M6 2.5h8.5L20 8v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 2.5V8h6"/><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5M12 2.5v3"/>',
    chart: '<path d="M5 20v-7M12 20V5M19 20v-10"/>',
    bulb: '<path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.7 1.1 1.4 1.1 2.2h5c0-.8.3-1.5 1.1-2.2A6 6 0 0 0 12 3z"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 21h4"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16.5l-5-5-9 8.5"/>',
    play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
    pause: '<path d="M8.5 5v14M15.5 5v14" stroke-width="3"/>',
    reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
    coffee: '<path d="M4 9h12v4.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M7.5 3.5v2.5M11 3.5v2.5"/>',
    book: '<path d="M2.5 5.5c3-1.2 6.5-1 9.5 1 3-2 6.5-2.2 9.5-1v13c-3-1.2-6.5-1-9.5 1-3-2-6.5-2.2-9.5-1z"/><path d="M12 6.5v13"/>',
    flame: '<path d="M12 3c.5 3.5 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.2 1-3.7 2.2-4.8.2 1.8.9 2.8 2 3.2-.3-3 .4-6 1.3-8.9z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
    upload: '<path d="M12 16V4M7.5 8.5L12 4l4.5 4.5M4 15v4a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-4"/>',
    download: '<path d="M12 4v12M7.5 11.5L12 16l4.5-4.5M4 15v4a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  const ic = (name, size = 20, cls = '') =>
    `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

  const LOGO = `<svg class="logo-mark" width="58" height="58" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15c6-2.2 13-1.8 19 2 6-3.8 13-4.2 19-2v22c-6-2.2-13-1.8-19 2-6-3.8-13-4.2-19-2z"/><path d="M24 17v22"/><path d="M33 3v8M29 7h8" stroke-width="2"/><path d="M11 22c3-.8 6-.6 9 .8M11 28c3-.8 6-.6 9 .8" stroke-width="1.6"/></svg>`;

  /* ======================================================================
     Wallpaper and accent colour
     ====================================================================== */

  function sceneSVG() {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let stars = '';
    for (let i = 0; i < 52; i++) {
      stars += `<circle cx="${(rnd() * 1000).toFixed(0)}" cy="${(rnd() * 300).toFixed(0)}" r="${(0.6 + rnd() * 1.2).toFixed(1)}" fill="#dfe6ff" opacity="${(0.3 + rnd() * 0.6).toFixed(2)}"/>`;
    }
    const skyline = (hMin, hMax, fill, litChance) => {
      let s = '', x = -10;
      while (x < 1010) {
        const w = 38 + Math.floor(rnd() * 44), h = hMin + Math.floor(rnd() * (hMax - hMin));
        s += `<rect x="${x}" y="${470 - h}" width="${w}" height="${h}" fill="${fill}"/>`;
        for (let wx = x + 8; wx < x + w - 10; wx += 13) {
          for (let wy = 470 - h + 12; wy < 456; wy += 17) {
            if (rnd() < litChance) s += `<rect x="${wx}" y="${wy}" width="6" height="8" fill="#ffd98a" opacity="${(0.45 + rnd() * 0.5).toFixed(2)}"/>`;
          }
        }
        x += w + 4 + Math.floor(rnd() * 8);
      }
      return s;
    };
    const back = skyline(110, 270, '#0d1429', 0.3);
    const front = skyline(50, 130, '#080c1a', 0.22);
    let leaves = '';
    [-48, -26, -6, 16, 38].forEach((a, i) => {
      leaves += `<ellipse cx="100" cy="${372 + (i % 2) * 8}" rx="${15 + (i % 3) * 2}" ry="${54 + (i % 2) * 10}" transform="rotate(${a} 100 428)" fill="#0b1d1b"/>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="560" viewBox="0 0 1000 560">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b18"/><stop offset="0.6" stop-color="#101936"/><stop offset="1" stop-color="#1a2547"/></linearGradient>
<radialGradient id="moonglow"><stop offset="0" stop-color="#cfdcff" stop-opacity="0.5"/><stop offset="1" stop-color="#cfdcff" stop-opacity="0"/></radialGradient>
<radialGradient id="lampglow"><stop offset="0" stop-color="#ffb866" stop-opacity="0.5"/><stop offset="1" stop-color="#ffb866" stop-opacity="0"/></radialGradient>
<linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc47a" stop-opacity="0.32"/><stop offset="1" stop-color="#ffc47a" stop-opacity="0"/></linearGradient>
</defs>
<rect width="1000" height="560" fill="url(#sky)"/>
${stars}
<circle cx="780" cy="150" r="140" fill="url(#moonglow)"/>
<circle cx="780" cy="150" r="46" fill="#eaf0ff"/>
<circle cx="765" cy="140" r="9" fill="#cdd6ee" opacity="0.6"/><circle cx="796" cy="166" r="6" fill="#cdd6ee" opacity="0.55"/><circle cx="790" cy="132" r="4" fill="#cdd6ee" opacity="0.5"/>
${back}${front}
<g stroke="#04060c" stroke-width="16" fill="none"><rect x="8" y="8" width="984" height="462"/><path d="M250 8v462M640 8v462M8 250h984"/></g>
<rect y="470" width="1000" height="90" fill="#090b13"/>
<path d="M0 470.5h1000" stroke="#ffffff" stroke-opacity="0.07"/>
<path d="M60 470l10-46h60l10 46z" fill="#0e1220"/>${leaves}
<circle cx="945" cy="350" r="210" fill="url(#lampglow)"/>
<path d="M900 345l95 0 20 125H880z" fill="url(#cone)"/>
<ellipse cx="900" cy="468" rx="52" ry="8" fill="#0d101b"/>
<path d="M900 466l-18-86 52-54" stroke="#1b2133" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M896 320l68-26 26 52-72 8z" fill="#171c2c"/>
<path d="M918 351l70-6" stroke="#ffd9a0" stroke-width="3" stroke-opacity="0.85"/>
</svg>`;
  }
  const sceneURI = () => `url("data:image/svg+xml,${encodeURIComponent(sceneSVG())}")`;
  let sceneCache = '';
  const scene = () => sceneCache || (sceneCache = sceneURI());

  const WALLS = {
    black: { name: 'Black', css: () => 'none', color: '#05060A' },
    midnight: { name: 'Midnight', css: () => 'radial-gradient(ellipse 80% 75% at 85% -10%, #1f2b70 0%, transparent 100%), radial-gradient(ellipse 70% 70% at 0% 105%, #142852 0%, transparent 100%)', color: '#050813' },
    window: { name: 'Moonlit window', css: () => scene(), color: '#070b18' },
    aurora: { name: 'Aurora', css: () => 'radial-gradient(ellipse 60% 65% at 18% 8%, rgba(52,211,153,.34), transparent 100%), radial-gradient(ellipse 60% 65% at 88% 18%, rgba(129,140,248,.40), transparent 100%)', color: '#040810' },
    ember: { name: 'Ember', css: () => 'radial-gradient(ellipse 75% 75% at 50% 112%, rgba(251,146,60,.38), transparent 100%), radial-gradient(ellipse 55% 60% at 92% 0%, rgba(168,85,247,.30), transparent 100%)', color: '#09060c' },
  };
  const ACCENTS = {
    periwinkle: { name: 'Periwinkle', a: '#9DB4FF', b: '#5B77E6' },
    violet: { name: 'Violet', a: '#C4A6FF', b: '#8452F0' },
    teal: { name: 'Teal', a: '#7DE3D1', b: '#2BA899' },
    rose: { name: 'Rose', a: '#FFA3C0', b: '#E5527F' },
    amber: { name: 'Amber', a: '#FFD27A', b: '#E8962B' },
  };

  function applyTheme() {
    const s = S.settings, root = document.documentElement.style;
    const ac = ACCENTS[s.accent] || ACCENTS.periwinkle;
    root.setProperty('--acc', ac.a);
    root.setProperty('--acc-2', ac.b);
    const w = $('#wallpaper');
    if (!w) return;
    const wall = s.wall === 'custom' && customWall ? null : (WALLS[s.wall] || WALLS.black);
    w.style.backgroundColor = wall ? wall.color : '#05060A';
    w.style.backgroundImage = wall ? wall.css() : `url("${customWall}")`;
    w.style.filter = Number(s.blur) > 0 ? `blur(${Number(s.blur)}px)` : '';
    w.style.setProperty('--dim', String(Math.max(0, Math.min(0.9, Number(s.dim) / 100 || 0))));
    document.body.classList.toggle('has-wall', s.wall !== 'black');
    document.body.classList.toggle('no-motion', s.motion === false);
    const key = `${s.wall}|${customWall ? customWall.length : 0}`;
    if (w.dataset.k && w.dataset.k !== key && motionOn()) {
      w.classList.remove('swap');
      void w.offsetWidth;
      w.classList.add('swap');
    }
    w.dataset.k = key;
  }

  function paintThumbs() {
    document.querySelectorAll('[data-thumb]').forEach(el => {
      const id = el.dataset.thumb;
      if (id === 'custom') { if (customWall) el.style.backgroundImage = `url("${customWall}")`; return; }
      const w = WALLS[id];
      if (w) { el.style.backgroundColor = w.color; el.style.backgroundImage = w.css(); }
    });
  }

  function loadWallpaper(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Choose an image file (JPG, PNG or WebP).'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, 1920 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const data = c.toDataURL('image/jpeg', 0.82);
        try { localStorage.setItem(WALL_KEY, data); }
        catch { toast('That image is too large to keep in this browser. Try a smaller one.'); return; }
        customWall = data;
        S.settings.wall = 'custom';
        if (Number(S.settings.dim) < 25) S.settings.dim = 35;
        save(); applyTheme(); render(true); renderPop();
        toast('Wallpaper set.');
      } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('That file could not be read as an image.'); };
    img.src = url;
  }

  /* ======================================================================
     Toast
     ====================================================================== */

  let toastTimer = 0;
  function hideToast() { $('#toast').classList.remove('show'); }
  function toast(msg, undo) {
    const el = $('#toast');
    el.textContent = '';
    const span = document.createElement('span');
    span.textContent = msg;
    el.append(span);
    if (undo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Undo';
      b.addEventListener('click', () => { undo(); hideToast(); });
      el.append(b);
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 6500 : 4000);
  }

  /* ======================================================================
     Tasks
     ====================================================================== */

  const byDue = (a, b) => {
    const x = a.due || '9999', y = b.due || '9999';
    return x < y ? -1 : x > y ? 1 : 0;
  };
  const spentSec = id => S.sessions.reduce((n, s) => n + (s.taskId === id ? s.seconds : 0), 0);
  const dayKey = iso => ymd(new Date(iso));
  const secondsOn = day => S.sessions.reduce((n, s) => n + (dayKey(s.at) === day ? s.seconds : 0), 0);
  const openTasks = () => S.tasks.filter(t => !t.done).sort(byDue);

  function addTask({ title, subject = '', due = '', est = '' }) {
    const t = String(title || '').trim();
    if (!t) return false;
    const e = Math.round(Number(est));
    const id = uid();
    S.tasks.push({ id, title: t, subject: String(subject).trim(), due, est: e > 0 ? e : 0, done: false, doneAt: 0, created: Date.now() });
    ui.flash = { id, kind: 'new' };
    save();
    return true;
  }

  function dueLabel(t) {
    if (!t.due) return '';
    if (t.done) return `Due ${fmtDate(t.due)}`;
    const diff = daysBetween(todayStr(), t.due);
    if (diff < 0) return `${plural(-diff, 'day')} late`;
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Tomorrow';
    return fmtDate(t.due);
  }

  function timeLabel(t) {
    const spent = spentSec(t.id);
    if (t.est) return `${fmtDur(spent)} of ${t.est} min`;
    return spent ? `${fmtDur(spent)} focused` : '';
  }

  const tick = (t, label) => `
    <label class="tick">
      <input type="checkbox" data-change="toggle" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="${esc(label || `Done: ${t.title}`)}">
      <span class="box">${ic('check', 14, 'box-check')}</span>
    </label>`;

  function taskRow(t) {
    const late = !t.done && t.due && t.due < todayStr();
    const time = timeLabel(t);
    return `
      <li class="task${t.done ? ' is-done' : ''}">
        ${tick(t)}
        <div class="task-main">
          <p class="task-title">${esc(t.title)}</p>
          <p class="task-meta">
            ${t.subject ? `<span><i class="dot" style="--h:${hue(t.subject)}"></i>${esc(t.subject)}</span>` : ''}
            ${t.due ? `<span class="${late ? 'late' : ''}">${esc(dueLabel(t))}</span>` : ''}
            ${time ? `<span>${esc(time)}</span>` : ''}
          </p>
        </div>
        <div class="task-actions">
          ${t.done ? '' : `<button type="button" class="link" data-act="focus" data-id="${t.id}">Focus</button>`}
          <button type="button" class="link danger" data-act="del-task" data-id="${t.id}" aria-label="Delete ${esc(t.title)}">Delete</button>
        </div>
      </li>`;
  }

  /* ======================================================================
     Stats
     ====================================================================== */

  function focusByDay() {
    const m = {};
    S.sessions.forEach(s => { const k = dayKey(s.at); m[k] = (m[k] || 0) + s.seconds; });
    return m;
  }

  function streak() {
    const active = new Set(S.sessions.filter(s => s.seconds >= 60).map(s => dayKey(s.at)));
    S.tasks.forEach(t => { if (t.done && t.doneAt) active.add(ymd(new Date(t.doneAt))); });
    let d = new Date();
    if (!active.has(ymd(d))) d = addDays(d, -1);
    let n = 0;
    while (active.has(ymd(d))) { n += 1; d = addDays(d, -1); }
    return n;
  }

  function weekStart(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return addDays(x, -((x.getDay() - Number(S.settings.weekStart) + 7) % 7));
  }
  const weekDays = offset => { const f = addDays(weekStart(new Date()), offset * 7); return [...Array(7)].map((_, i) => addDays(f, i)); };
  const weekLabel = days => `${fmtDate(ymd(days[0]), { day: 'numeric', month: 'short' })} to ${fmtDate(ymd(days[6]), { day: 'numeric', month: 'short', year: 'numeric' })}`;

  function subjectOf(taskId) {
    const t = S.tasks.find(x => x.id === taskId);
    return t ? (t.subject || 'No subject') : 'Other';
  }

  /* ======================================================================
     Pomodoro timer
     ====================================================================== */

  const RING = 2 * Math.PI * 62;
  const timerLeft = () => S.timer.running ? Math.max(0, Math.ceil((S.timer.endAt - Date.now()) / 1000)) : S.timer.left;

  function logFocus() {
    const t = S.timer;
    if (t.mode !== 'focus' || !t.running) return;
    const seconds = Math.round((Math.min(Date.now(), t.endAt) - t.segStart) / 1000);
    if (seconds >= 5) S.sessions.push({ id: uid(), taskId: t.taskId, seconds, at: new Date().toISOString() });
  }
  function startTimer() {
    const t = S.timer;
    t.running = true;
    t.segStart = Date.now();
    t.endAt = t.segStart + t.left * 1000;
    save(); render(true);
  }
  function pauseTimer() {
    const t = S.timer;
    logFocus();
    t.left = Math.max(1, Math.ceil((t.endAt - Date.now()) / 1000));
    t.running = false;
    save(); render(true); setTitle();
  }
  function resetTimer() {
    logFocus();
    S.timer.running = false;
    S.timer.left = dur(S.timer.mode);
    save(); render(true); setTitle();
  }
  function setMode(mode) {
    if (!MODES[mode]) return;
    logFocus();
    S.timer.running = false;
    S.timer.mode = mode;
    S.timer.left = dur(mode);
    save(); render(true); setTitle();
  }
  function completeTimer() {
    const t = S.timer;
    logFocus();
    beep();
    let next = 'focus', msg = 'Break over. Ready for another focus session?';
    if (t.mode === 'focus') {
      S.cycle += 1;
      next = S.cycle % 4 === 0 ? 'long' : 'short';
      msg = `Focus session done. Take a ${next === 'long' ? 'long' : 'short'} break.`;
    }
    t.running = false;
    t.mode = next;
    t.left = dur(next);
    ui.burst = true;
    save(); render(true); setTitle();
    toast(msg);
  }

  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const c = new Ctx();
      [0, 0.25, 0.5].forEach(d => {
        const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + d;
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        o.connect(g).connect(c.destination);
        o.start(t0); o.stop(t0 + 0.22);
      });
      setTimeout(() => c.close(), 1500);
    } catch { /* sound is optional */ }
  }

  function paintTimer(left) {
    const d = $('#digits'), r = $('#ring');
    if (d) d.textContent = fmtClock(left);
    if (r) r.style.strokeDashoffset = String(RING * (left / dur(S.timer.mode)));
    setTitle();
  }

  function tickAll() {
    if (S.timer.running) {
      const left = timerLeft();
      if (left <= 0) completeTimer(); else paintTimer(left);
    }
    if (S.clock) {
      const el = $('#elapsed');
      if (el) el.textContent = fmtClock((Date.now() - S.clock.start) / 1000, true);
    }
  }

  function sessionLine() {
    const t = S.timer;
    if (t.mode === 'long') return 'Long break. You earned it.';
    if (t.mode === 'short') return `Short break after session ${(S.cycle % 4) || 4} of 4`;
    return `Session ${(S.cycle % 4) + 1} of 4`;
  }

  function timerCard(big) {
    const t = S.timer, left = timerLeft(), total = dur(t.mode);
    const open = openTasks();
    const label = t.running ? 'Pause' : left < total ? 'Resume' : 'Start';
    return `
      <section class="card timer${big ? ' big' : ''}${t.running ? ' running' : ''}" aria-label="Pomodoro timer">
        <header class="card-head">
          <h2>${ic('timer', 22)}Pomodoro timer</h2>
          <button type="button" class="icon-btn sm" data-act="go" data-id="settings" aria-label="Timer settings">${ic('sliders', 18)}</button>
        </header>
        <div class="timer-body">
          <div class="ring" aria-hidden="true">
            <svg viewBox="0 0 140 140"><circle class="ring-track" cx="70" cy="70" r="62"/><circle id="ring" class="ring-arc" cx="70" cy="70" r="62" stroke-dasharray="${RING.toFixed(2)}" stroke-dashoffset="${(RING * (left / total)).toFixed(2)}"/></svg>
            ${ic(t.mode === 'focus' ? 'book' : 'coffee', big ? 54 : 44)}
          </div>
          <div class="timer-main">
            <div class="modes" role="group" aria-label="Timer mode">
              ${Object.entries(MODES).map(([k, l]) => `<button type="button" data-act="mode" data-id="${k}" aria-pressed="${t.mode === k}">${l}</button>`).join('')}
            </div>
            <p class="digits" id="digits" role="timer">${fmtClock(left)}</p>
            <div class="controls">
              <button type="button" class="btn-start" data-act="toggle-timer">${ic(t.running ? 'pause' : 'play', 18)}${label}</button>
              <button type="button" class="icon-btn round" data-act="reset-timer" aria-label="Reset timer">${ic('reset', 20)}</button>
            </div>
            <p class="small muted">${esc(sessionLine())}</p>
          </div>
        </div>
        <div class="timer-task">
          <label>Task
            <select data-change="timer-task">
              <option value="">No task, just track the time</option>
              ${open.map(x => `<option value="${x.id}" ${x.id === t.taskId ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}
            </select>
          </label>
        </div>
      </section>`;
  }

  /* ======================================================================
     Study tips
     ====================================================================== */

  const CATS = { focus: 'Focus', memory: 'Remembering', plan: 'Planning', habits: 'Habits' };
  const TIPS = [
    { cat: 'focus', title: 'Work in 25-minute blocks', body: 'Set the timer for 25 minutes, work on one thing, then rest for 5. After four rounds, take a longer break. Short blocks make it easier to start and to stay focused.', action: { href: '#pomodoro', label: 'Open the timer' } },
    { cat: 'focus', title: 'Put your phone out of sight', body: 'A phone on the desk pulls at your attention even when it is silent. Put it in a bag or another room for the length of one focus block.' },
    { cat: 'focus', title: 'Keep only one thing open', body: 'Open only what the task needs. Every switch between tasks costs time and focus, so finish one thing before you start the next.' },
    { cat: 'focus', title: 'Agree to just five minutes', body: 'When you do not feel like starting, promise yourself five minutes. Most of the resistance is in the starting, and you can stop after five if you really want to.' },
    { cat: 'focus', title: 'Do the hardest task first', body: 'Your attention is best at the start of a session. Use it on the task you are most likely to avoid, and leave the easier work for later.' },
    { cat: 'focus', title: 'Rest without a screen', body: 'In a break, stand up, drink water, stretch or look out of a window. Scrolling on your phone is not a rest for your brain.' },
    { cat: 'memory', title: 'Test yourself instead of rereading', body: 'Close the book and write down everything you remember, or answer practice questions. Pulling facts out of memory builds recall much more than reading them again.', action: { href: '#notes', label: 'Write your questions in Notes' } },
    { cat: 'memory', title: 'Spread your study over several days', body: 'Thirty minutes on each of four days usually works better than two hours in one night. Review new material after a day, again a few days later, and again a week later.' },
    { cat: 'memory', title: 'Mix up problem types', body: 'In maths and science, practise a mix of question types in one session instead of ten of the same kind. It feels harder, but you learn to choose the right method, which is what exams ask for.' },
    { cat: 'memory', title: 'Explain it out loud', body: 'Pretend you are teaching the topic to a friend, in simple words. Wherever you get stuck or start to waffle is exactly what you still need to learn.' },
    { cat: 'memory', title: 'Write questions, not just notes', body: 'While you read, write a question for each section in the margin. Later, cover your notes and answer your own questions.' },
    { cat: 'memory', title: 'Do practice questions and past papers', body: 'Try them without your notes first, then check your answers. Mark what you got wrong and study that part next.' },
    { cat: 'memory', title: 'Keep a list of your mistakes', body: 'Write down each mistake with the correct answer next to it. Read the list before a test. It shows what you are most likely to get wrong again.' },
    { cat: 'memory', title: 'Use the highlighter less', body: 'Highlighting makes a page look studied, but it does little for memory. After you highlight something, close the book and say it in your own words.' },
    { cat: 'plan', title: 'Break big tasks into small steps', body: '"Write essay" is too big to start. "List three points" and "Write the first paragraph" are not. Add each small step as its own task.', action: { href: '#tasks', label: 'Add a task' } },
    { cat: 'plan', title: 'Give yourself more time than you think', body: 'People usually underestimate how long work takes. Add about half again to your first estimate, then compare it with the time you actually focused so you guess better next time.' },
    { cat: 'plan', title: 'Work back from the due date', body: 'For a big assignment, start with the due date, then set earlier dates for research, a first draft and a final check. Finishing a day early leaves room for surprises.', action: { href: '#plan', label: 'Open the study plan' } },
    { cat: 'plan', title: 'Plan tomorrow tonight', body: 'Before you stop for the day, write down the top three tasks for tomorrow. You start the next day knowing where to begin instead of deciding while tired.' },
    { cat: 'habits', title: 'Use the same time and place', body: 'Studying at the same desk at the same time each day turns it into a habit, so it takes less effort to get started.' },
    { cat: 'habits', title: 'Protect your sleep', body: 'Sleep helps your brain store what you studied. An all-nighter usually costs you more in the exam than the extra hours give you.' },
    { cat: 'habits', title: 'Ask for help early', body: 'If you have been stuck on the same thing for 20 minutes, write down your exact question and ask a teacher, classmate or tutor. Small gaps grow into big ones.' },
    { cat: 'habits', title: 'Study with a friend who quizzes you', body: 'Take turns asking each other questions. Explaining answers helps you both, and a fixed time makes it easier to show up.' },
    { cat: 'habits', title: 'Reward finished work', body: 'Decide on a small reward before you start, such as a snack, a walk or an episode, and take it only when the session is done.' },
  ];
  const QUOTES = [
    'A little progress each day adds up to big results.',
    'Start small. Starting is the hardest part.',
    'One focused session beats three distracted hours.',
    'Rest is part of the plan, not a break from it.',
    'Done today means less worry tomorrow.',
    'You do not need to feel ready. You just need to begin.',
  ];

  const dailyTip = () => TIPS[mod(daysBetween('2026-01-01', todayStr()) + ui.tipShift, TIPS.length)];
  const dailyQuote = () => QUOTES[mod(daysBetween('2026-01-01', todayStr()), QUOTES.length)];

  /* A tip that reacts to what is in the planner right now. Returns null when nothing stands out. */
  function smartTip() {
    const td = todayStr();
    const open = S.tasks.filter(t => !t.done);
    const late = open.filter(t => t.due && t.due < td);
    const today = open.filter(t => t.due === td);
    const tomorrow = open.filter(t => t.due && daysBetween(td, t.due) === 1);
    const weekAgo = Date.now() - 7 * 864e5;
    const focusedThisWeek = S.sessions.some(x => new Date(x.at).getTime() > weekAgo);

    if (late.length) {
      const small = [...late].sort((a, b) => (a.est || 9999) - (b.est || 9999))[0];
      return {
        smart: true,
        title: `You have ${plural(late.length, 'late task')}. Start with the smallest.`,
        body: `Finish "${small.title}"${small.est ? ` (about ${small.est} min)` : ''} first. A quick win makes the rest easier to start.`,
        action: { act: 'focus', id: small.id, label: 'Focus on it now' },
      };
    }
    if (today.length) {
      const need = today.reduce((n, t) => n + (t.est || 0), 0);
      if (need) {
        const blocks = Math.ceil(need / mins('focus'));
        return {
          smart: true,
          title: `Today's tasks need about ${fmtDur(need * 60)}.`,
          body: `That is ${plural(blocks, 'focus session')} of ${mins('focus')} minutes with breaks in between. Start the first one now so it does not pile up in the evening.`,
        };
      }
      return {
        smart: true,
        title: `You have ${plural(today.length, 'task')} due today.`,
        body: 'Add the minutes each one needs, so you can see whether today fits.',
        action: { href: '#tasks', label: 'Add time estimates' },
      };
    }
    if (tomorrow.length) {
      return {
        smart: true,
        title: `${plural(tomorrow.length, 'task')} due tomorrow.`,
        body: 'Do them this evening while they are fresh, then get a good night of sleep. Sleep helps your brain keep what you studied.',
      };
    }
    if (!focusedThisWeek) {
      return {
        smart: true,
        title: 'No focus time yet this week.',
        body: 'Start one 25-minute session. Beginning is the hardest part, and you can stop after one.',
      };
    }
    if (open.some(t => !t.est)) {
      return {
        smart: true,
        title: 'Add minutes needed to your tasks.',
        body: 'Estimates show you how much time a day really needs. Add about half again to your first guess, because work usually takes longer than expected.',
        action: { href: '#tasks', label: 'Open tasks' },
      };
    }
    return null;
  }

  function tipAction(a) {
    if (!a) return '';
    if (a.act) return `<button type="button" class="link" data-act="${esc(a.act)}" data-id="${esc(a.id || '')}">${esc(a.label)}</button>`;
    if (a.href === `#${current}`) return '';
    return `<a class="link" href="${esc(a.href)}">${esc(a.label)}</a>`;
  }

  function tipBlock(t) {
    return `
      <article class="tip">
        <h3>${esc(t.title)}</h3>
        <p>${esc(t.body)}</p>
        ${t.cat ? `<p class="task-meta"><span><i class="dot" style="--h:${hue(t.cat)}"></i>${esc(CATS[t.cat])}</span></p>` : ''}
        ${tipAction(t.action)}
      </article>`;
  }

  /* ======================================================================
     Layout: sidebar, top bar, popovers, search
     ====================================================================== */

  const NAV = [
    ['dashboard', 'Dashboard', 'home'], ['tasks', 'Tasks', 'check'], ['plan', 'Study plan', 'calendar'],
    ['hours', 'Work hours', 'briefcase'], ['notes', 'Notes', 'note'], ['pdf', 'PDF tools', 'pdf'],
    ['pomodoro', 'Pomodoro', 'timer'], ['analytics', 'Analytics', 'chart'], ['tips', 'Study tips', 'bulb'],
    ['settings', 'Settings', 'sliders'],
  ];
  const LABELS = Object.fromEntries(NAV.map(([id, l]) => [id, l]));
  const ALIAS = { today: 'dashboard', homework: 'tasks' };

  function renderChrome() {
    $('#side').innerHTML = `
      <a class="logo" href="#dashboard" aria-label="STUDORA dashboard">
        ${LOGO}
        <span class="logo-name">STUDORA</span>
        <span class="logo-tag">Plan • Focus • Achieve</span>
      </a>
      <nav class="nav" aria-label="Main">
        ${NAV.map(([id, l, i], n) => `<a class="nav-link" href="#${id}" data-view="${id}" style="--n:${n}">${ic(i, 22)}<span>${l}</span></a>`).join('')}
      </nav>
      <figure class="quote">
        <svg class="quote-spark" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2 7 7 3-7 3-2 7-2-7-7-3 7-3z"/></svg>
        <blockquote>${esc(dailyQuote())}</blockquote>
      </figure>`;

    $('#topbar').innerHTML = `
      <button type="button" class="icon-btn menu" data-act="menu" aria-label="Open menu" aria-expanded="false">${ic('menu', 22)}</button>
      <div class="search">
        ${ic('search', 20, 'search-ic')}
        <label class="sr-only" for="q">Search tasks, notes and tips</label>
        <input id="q" type="search" placeholder="Search anything..." autocomplete="off" data-input="search" aria-controls="results">
        <div class="results" id="results" hidden></div>
      </div>
      <div class="top-actions">
        <button type="button" class="icon-btn" data-act="pop" data-id="bell" aria-label="Reminders" aria-haspopup="dialog">${ic('bell', 22)}<i class="notif" id="notif" hidden></i></button>
        <button type="button" class="icon-btn" data-act="pop" data-id="wall" aria-label="Change wallpaper" aria-haspopup="dialog">${ic('image', 22)}</button>
      </div>`;
  }

  function reminders() {
    const td = todayStr();
    const open = S.tasks.filter(t => !t.done);
    return {
      late: open.filter(t => t.due && t.due < td).sort(byDue),
      today: open.filter(t => t.due === td),
    };
  }

  function bellPanel() {
    const r = reminders();
    const item = t => `<li><button type="button" class="pop-item" data-act="goto-task" data-id="${t.id}"><span>${esc(t.title)}</span><small class="${r.late.includes(t) ? 'late' : ''}">${esc(dueLabel(t))}</small></button></li>`;
    return `
      <h2>Reminders</h2>
      ${r.late.length || r.today.length ? `
        <ul class="pop-list">${[...r.late, ...r.today].map(item).join('')}</ul>`
        : '<p class="muted">You are all caught up. Nothing is late or due today.</p>'}`;
  }

  function wallControls() {
    const s = S.settings;
    const opt = (id, name) => `
      <button type="button" class="wall-opt" data-act="wall" data-id="${id}" aria-pressed="${s.wall === id}">
        <span class="wall-thumb" data-thumb="${id}"></span><span>${esc(name)}</span>
      </button>`;
    return `
      <div class="wall-grid">
        ${Object.entries(WALLS).map(([id, w]) => opt(id, w.name)).join('')}
        ${customWall ? opt('custom', 'Your photo') : ''}
      </div>
      <div class="row wall-row">
        <label class="btn-ghost file-btn">${ic('upload', 18)}Upload your photo
          <input type="file" accept="image/*" data-change="wall-upload" class="sr-only">
        </label>
        ${customWall ? '<button type="button" class="link danger" data-act="wall-remove">Remove my photo</button>' : ''}
      </div>
      <label class="slider"><span>Dim</span>
        <input type="range" min="0" max="85" step="5" value="${Number(s.dim) || 0}" data-input="wall-dim">
        <span class="val">${Number(s.dim) || 0}%</span></label>
      <label class="slider"><span>Blur</span>
        <input type="range" min="0" max="20" step="1" value="${Number(s.blur) || 0}" data-input="wall-blur">
        <span class="val">${Number(s.blur) || 0}px</span></label>
      <div class="accents" role="group" aria-label="Accent colour">
        <span class="small muted">Accent colour</span>
        ${Object.entries(ACCENTS).map(([id, a]) => `<button type="button" class="swatch" data-act="accent" data-id="${id}" aria-pressed="${s.accent === id}" aria-label="${a.name}" style="--a:${a.a};--b:${a.b}"></button>`).join('')}
      </div>
      <label class="check-row"><input type="checkbox" data-change="setting" name="scene" ${s.scene !== false ? 'checked' : ''}> Show the moonlit window on the dashboard</label>
      ${customWall ? '<p class="small muted">Your photo stays on this device. It is not included in backups.</p>' : ''}`;
  }

  function renderPop(fresh) {
    const el = $('#pop');
    if (!ui.pop) { el.innerHTML = ''; return; }
    const isBell = ui.pop === 'bell';
    el.innerHTML = `
      <div class="pop-scrim" data-act="pop-close"></div>
      <div class="pop pop-${ui.pop}${fresh && motionOn() ? ' fresh' : ''}" role="dialog" aria-label="${isBell ? 'Reminders' : 'Wallpaper'}" tabindex="-1">
        ${isBell ? bellPanel() : `<h2>Wallpaper</h2>${wallControls()}`}
        <button type="button" class="link pop-close" data-act="pop-close">Close</button>
      </div>`;
    paintThumbs();
  }

  function closePop(restoreFocus = true) {
    if (!ui.pop) return;
    ui.pop = null;
    renderPop();
    if (restoreFocus && ui.popTrigger && document.contains(ui.popTrigger)) ui.popTrigger.focus();
    ui.popTrigger = null;
  }

  function updateBell() {
    const r = reminders(), n = r.late.length + r.today.length;
    const dot = $('#notif');
    if (dot) dot.hidden = n === 0;
    const btn = dot && dot.closest('button');
    if (btn) btn.setAttribute('aria-label', n ? `Reminders, ${n} to do` : 'Reminders');
  }

  function searchResults(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    S.tasks.forEach(t => { if (`${t.title} ${t.subject}`.toLowerCase().includes(q)) out.push({ kind: 'task', id: t.id, title: t.title, meta: t.done ? 'Finished task' : (dueLabel(t) || 'Task') }); });
    S.notes.forEach(n => { if (`${n.title} ${n.body}`.toLowerCase().includes(q)) out.push({ kind: 'note', id: n.id, title: n.title.trim() || 'Untitled note', meta: 'Note' }); });
    TIPS.forEach((t, i) => { if (`${t.title} ${t.body}`.toLowerCase().includes(q)) out.push({ kind: 'tip', id: String(i), title: t.title, meta: 'Study tip' }); });
    return out.slice(0, 8);
  }

  function paintResults() {
    const box = $('#results');
    if (!box) return;
    const q = ui.q.trim();
    if (!q) { box.hidden = true; box.innerHTML = ''; return; }
    const list = searchResults(q);
    box.innerHTML = list.length
      ? `<ul>${list.map(r => `<li><button type="button" class="pop-item" data-act="open-result" data-kind="${r.kind}" data-id="${esc(r.id)}"><span>${esc(r.title)}</span><small>${esc(r.meta)}</small></button></li>`).join('')}</ul>`
      : '<p class="muted small res-empty">Nothing found. Try a different word.</p>';
    box.hidden = false;
  }

  /* ======================================================================
     Views
     ====================================================================== */

  function viewDashboard() {
    const td = todayStr(), s = S.settings;
    const all = S.tasks.filter(t => t.due === td), done = all.filter(t => t.done).length;
    const todaySec = secondsOn(td), goal = goalSec();
    const st = streak();
    const everDone = S.tasks.filter(t => t.done).length, total = S.tasks.length;
    const overall = total ? Math.round((everDone / total) * 100) : 0;
    const late = S.tasks.filter(t => !t.done && t.due && t.due < td);
    const plan = [...late.sort(byDue), ...S.tasks.filter(t => t.due === td)];
    const shown = plan.slice(0, 6);
    const upcoming = openTasks().filter(t => t.due && t.due > td).slice(0, 3);
    const tip = s.tips === false ? null : (smartTip() || dailyTip());
    const heroName = s.name.trim() || 'STUDORA';
    const sub = all.length - done > 0 || late.length ? `You have ${plural(all.length - done + late.length, 'task')} to finish. Let's go.` : "Keep going. You're doing great!";

    const stat = (icon, label, value, pct, cls) => `
      <div class="stat ${cls}">
        <span class="stat-ic">${ic(icon, 26)}</span>
        <div class="stat-body">
          <p class="stat-label">${label}</p>
          <p class="stat-value">${value}</p>
          <div class="bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></i></div>
        </div>
      </div>`;

    return `
      <section class="hero${s.scene === false ? ' no-art' : ''}">
        <div class="hero-art" aria-hidden="true"></div>
        <div class="hero-text">
          <h1><span class="hi">Welcome back,</span><span class="brand-big">${esc(heroName)}</span></h1>
          <p class="hero-sub">${esc(sub)}</p>
        </div>
      </section>

      <section class="stats" aria-label="Your progress">
        ${stat('check', 'Tasks today', `${done} / ${all.length}`, all.length ? (done / all.length) * 100 : 0, 'c1')}
        ${stat('calendar', 'Study time', esc(fmtShort(todaySec)), (todaySec / goal) * 100, 'c2')}
        ${stat('flame', 'Streak', plural(st, 'day').replace(/^(\d+) /, '$1 ').replace('day', 'Day'), (Math.min(st, 7) / 7) * 100, 'c3')}
        ${stat('chart', 'Overall progress', `${overall}%`, overall, 'c4')}
      </section>

      <div class="dash">
        <section class="card plan" aria-label="Today's plan">
          <header class="card-head"><h2>${ic('calendar', 22)}Today's plan</h2><a class="more" href="#tasks">View all${ic('arrow', 16)}</a></header>
          ${shown.length ? `<ul class="plan-list">${shown.map(t => `
            <li class="plan-item${t.done ? ' is-done' : ''}${t.id === S.timer.taskId ? ' is-focus' : ''}">
              <span class="rail" aria-hidden="true"></span>
              ${tick(t)}
              <button type="button" class="plan-title" data-act="pick-task" data-id="${t.id}" ${t.done ? 'disabled' : ''} aria-pressed="${t.id === S.timer.taskId}">${esc(t.title)}</button>
              ${!t.done && t.due && t.due < td ? '<span class="chip late">Late</span>' : ''}
              ${t.est ? `<span class="chip">${t.est} min</span>` : ''}
            </li>`).join('')}</ul>`
            : '<p class="empty">Nothing planned for today. Add a task below.</p>'}
          <form class="quick" data-form="quick-task">
            <label class="sr-only" for="qt">New task for today</label>
            <input id="qt" name="title" placeholder="Add a task for today" required autocomplete="off">
            <button type="submit" class="btn-ghost">${ic('plus', 18)}Add</button>
          </form>
        </section>

        ${timerCard(false)}

        <section class="card upcoming" aria-label="Upcoming">
          <header class="card-head"><h2>${ic('calendar', 22)}Upcoming</h2><a class="more" href="#plan">View all${ic('arrow', 16)}</a></header>
          ${upcoming.length ? `<ul class="up-list">${upcoming.map(t => `
            <li class="up-item"><span class="up-ic">${ic('note', 26)}</span>
              <div><p class="up-title">${esc(t.title)}</p><p class="small muted">${esc(dueLabel(t))} • ${t.est ? `${t.est} min` : 'no estimate'}</p></div></li>`).join('')}</ul>`
            : '<p class="empty">Nothing coming up. Add a task with a due date.</p>'}
        </section>

        <section class="card tools" aria-label="Quick tools">
          <header class="card-head"><h2>${ic('sliders', 22)}Quick tools</h2></header>
          <div class="tool-grid">
            <button type="button" class="tool" data-act="new-note">${ic('note', 26)}<span>New note</span></button>
            <button type="button" class="tool" data-act="go" data-id="pdf">${ic('pdf', 26)}<span>Generate PDF</span></button>
            <button type="button" class="tool" data-act="go" data-id="plan">${ic('calendar', 26)}<span>Plan schedule</span></button>
            <button type="button" class="tool" data-act="go" data-id="tips">${ic('bulb', 26)}<span>Study tips</span></button>
          </div>
        </section>

        ${statsCard()}
      </div>

      ${tip ? `
        <section class="card tipcard" aria-label="Study tip">
          <span class="tip-ic">${ic('bulb', 26)}</span>
          <div class="tip-text">${tipBlock(tip)}</div>
          <div class="tip-links">
            ${tip.smart ? '' : '<button type="button" class="link" data-act="next-tip">Show another tip</button>'}
            <a class="more" href="#tips">All tips${ic('arrow', 16)}</a>
          </div>
        </section>` : ''}`;
  }

  /* Smooth line through the points (Catmull-Rom converted to Bezier). */
  function smoothPath(pts, floor) {
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(floor, p1[1] + (p2[1] - p0[1]) / 6)];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(floor, p2[1] - (p3[1] - p1[1]) / 6)];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  function statsCard() {
    const days = weekDays(ui.statsWeek), by = focusByDay();
    const vals = days.map(d => by[ymd(d)] || 0);
    const max = Math.max(...vals, 1), W = 420, H = 150, top = 16, floor = 112;
    const pts = vals.map((v, i) => [(i + 0.5) * (W / 7), floor - (v / max) * (floor - top)]);
    const peak = vals.indexOf(Math.max(...vals));
    const any = vals.some(v => v > 0);
    return `
      <section class="card stats-card" aria-label="Study stats">
        <header class="card-head">
          <h2>${ic('chart', 22)}Study stats</h2>
          <select class="mini-select" data-change="stats-week" aria-label="Week to show">
            <option value="0" ${ui.statsWeek === 0 ? 'selected' : ''}>This week</option>
            <option value="-1" ${ui.statsWeek === -1 ? 'selected' : ''}>Last week</option>
          </select>
        </header>
        <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Focus time each day: ${days.map((d, i) => `${d.toLocaleDateString(undefined, { weekday: 'long' })} ${fmtDur(vals[i])}`).join(', ')}">
          <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--acc)" stop-opacity=".28"/><stop offset="1" stop-color="var(--acc)" stop-opacity="0"/></linearGradient></defs>
          <path class="area" d="${smoothPath(pts, floor)} L${pts[6][0].toFixed(1)},${floor} L${pts[0][0].toFixed(1)},${floor} Z" fill="url(#area)"/>
          <path d="${smoothPath(pts, floor)}" class="line" fill="none" pathLength="1"/>
          ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${any && i === peak ? 6 : 3.5}" class="pt${any && i === peak ? ' peak' : ''}" style="--p:${i}"><title>${esc(days[i].toLocaleDateString(undefined, { weekday: 'long' }))}: ${esc(fmtDur(vals[i]))}</title></circle>`).join('')}
          ${days.map((d, i) => `<text x="${((i + 0.5) * (W / 7)).toFixed(1)}" y="140" text-anchor="middle" class="axis">${esc(d.toLocaleDateString(undefined, { weekday: 'short' }))}</text>`).join('')}
        </svg>
        ${any ? `<p class="small muted">${esc(fmtDur(vals.reduce((a, b) => a + b, 0)))} focused ${ui.statsWeek ? 'last' : 'this'} week</p>` : '<p class="small muted">No focus time logged yet. Start a Pomodoro to see your week here.</p>'}
      </section>`;
  }

  function viewPomodoro() {
    const td = todayStr();
    const list = S.sessions.filter(x => dayKey(x.at) === td).reverse();
    const sec = secondsOn(td), goal = goalSec();
    return `
      <div class="page-head"><h1>Pomodoro</h1><p class="sub">${esc(fmtDur(sec))} of ${esc(fmtDur(goal))} goal today</p></div>
      <div class="pomo">
        ${timerCard(true)}
        <section class="card" aria-label="Sessions today">
          <header class="card-head"><h2>${ic('clock', 22)}Sessions today</h2></header>
          <div class="bar wide" aria-hidden="true"><i style="width:${Math.min(100, Math.round((sec / goal) * 100))}%"></i></div>
          ${list.length ? `<ul class="rows">${list.map(x => `
            <li><span>${hhmm(new Date(x.at))}</span><span class="grow">${esc(x.taskId ? (S.tasks.find(t => t.id === x.taskId)?.title || 'Deleted task') : 'No task')}</span><b>${esc(fmtDur(x.seconds))}</b></li>`).join('')}</ul>`
            : '<p class="empty">No sessions yet today. Press Start and focus for one block.</p>'}
        </section>
      </div>`;
  }

  function viewTasks() {
    const td = todayStr();
    const open = openTasks();
    const done = S.tasks.filter(t => t.done).sort((a, b) => b.doneAt - a.doneAt);
    const groups = [
      ['Late', open.filter(t => t.due && t.due < td), 'late'],
      ['Due today', open.filter(t => t.due === td), ''],
      ['Coming up', open.filter(t => t.due > td), ''],
      ['No due date', open.filter(t => !t.due), ''],
    ].filter(g => g[1].length);
    const subjects = [...new Set(S.tasks.map(t => t.subject).filter(Boolean))];

    return `
      <div class="page-head">
        <h1>Tasks</h1>
        <button type="button" class="btn-ghost" data-act="pdf-homework"${S.tasks.length ? '' : ' disabled'}>${ic('pdf', 18)}Save as PDF</button>
      </div>
      <form class="card add" data-form="task">
        <div class="field grow"><label for="t-title">Task</label>
          <input id="t-title" name="title" required autocomplete="off" placeholder="Read chapter 4"></div>
        <div class="field"><label for="t-subject">Subject</label>
          <input id="t-subject" name="subject" list="subjects" autocomplete="off" placeholder="Biology"></div>
        <div class="field"><label for="t-due">Due date</label>
          <input id="t-due" name="due" type="date"></div>
        <div class="field"><label for="t-est">Minutes needed</label>
          <input id="t-est" name="est" type="number" min="1" max="1440" inputmode="numeric" placeholder="45"></div>
        <datalist id="subjects">${subjects.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
        <button type="submit" class="btn-start">${ic('plus', 18)}Add task</button>
      </form>
      ${groups.length ? groups.map(([name, list, cls]) => `
        <h2 class="group-title ${cls}">${name} (${list.length})</h2>
        <ul class="card tasks">${list.map(taskRow).join('')}</ul>`).join('')
        : '<p class="empty card">No tasks to do. Add one above to start your list.</p>'}
      ${done.length ? `
        <details class="done-box" ${ui.doneOpen ? 'open' : ''}>
          <summary>Finished (${done.length})</summary>
          <ul class="card tasks">${done.map(taskRow).join('')}</ul>
        </details>` : ''}`;
  }

  function viewPlan() {
    const days = weekDays(ui.planWeek), td = todayStr();
    const late = ui.planWeek === 0 ? S.tasks.filter(t => !t.done && t.due && t.due < td).sort(byDue) : [];
    const undated = S.tasks.filter(t => !t.done && !t.due);
    const mini = t => `
      <li class="mini${t.done ? ' is-done' : ''}">
        ${tick(t)}
        <span class="mini-title">${esc(t.title)}</span>
        ${t.subject ? `<i class="dot" style="--h:${hue(t.subject)}" title="${esc(t.subject)}"></i>` : ''}
      </li>`;
    return `
      <div class="page-head">
        <h1>Study plan</h1>
        <div class="weeknav">
          <button type="button" class="icon-btn sm" data-act="plan-week" data-id="-1" aria-label="Previous week">${ic('arrow', 18, 'flip')}</button>
          <span class="weeklabel">${esc(weekLabel(days))}</span>
          <button type="button" class="icon-btn sm" data-act="plan-week" data-id="1" aria-label="Next week">${ic('arrow', 18)}</button>
          ${ui.planWeek ? '<button type="button" class="link" data-act="plan-week" data-id="0">This week</button>' : ''}
        </div>
      </div>
      ${late.length ? `
        <section class="card late-box" aria-label="Late tasks">
          <h2>Late (${late.length})</h2>
          <ul class="mini-list">${late.map(mini).join('')}</ul>
        </section>` : ''}
      <div class="board scroll">
        ${days.map(d => {
          const key = ymd(d), list = S.tasks.filter(t => t.due === key).sort((a, b) => a.done - b.done);
          const need = list.filter(t => !t.done).reduce((n, t) => n + (t.est || 0), 0);
          return `
            <section class="card daycol${key === td ? ' is-today' : ''}" aria-label="${esc(d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}">
              <header><h2>${esc(d.toLocaleDateString(undefined, { weekday: 'short' }))} <span>${d.getDate()}</span></h2>
                <p class="small muted">${need ? esc(fmtDur(need * 60)) : (list.length ? 'No estimate' : 'Free')}</p></header>
              <ul class="mini-list">${list.map(mini).join('')}</ul>
              <form data-form="plan-add" data-date="${key}">
                <label class="sr-only" for="pa-${key}">Add a task for ${esc(fmtDate(key))}</label>
                <input id="pa-${key}" name="title" placeholder="Add task" autocomplete="off">
              </form>
            </section>`;
        }).join('')}
      </div>
      ${undated.length ? `
        <section class="card">
          <h2>No due date (${undated.length})</h2>
          <ul class="mini-list">${undated.map(mini).join('')}</ul>
        </section>` : ''}`;
  }

  function weekData(offset) {
    const days = weekDays(offset);
    const a = ymd(days[0]), b = ymd(days[6]);
    const shifts = S.shifts
      .filter(s => { const d = ymd(new Date(s.start)); return d >= a && d <= b; })
      .sort((x, y) => (x.start < y.start ? -1 : 1));
    const shiftSec = s => Math.max(0, (new Date(s.end) - new Date(s.start)) / 1000);
    const perDay = days.map(d => shifts.reduce((n, s) => n + (ymd(new Date(s.start)) === ymd(d) ? shiftSec(s) : 0), 0));
    return { days, shifts, perDay, total: perDay.reduce((n, v) => n + v, 0), label: weekLabel(days) };
  }
  const shiftSec = s => Math.max(0, (new Date(s.end) - new Date(s.start)) / 1000);

  function viewHours() {
    const w = weekData(ui.week);
    const max = Math.max(...w.perDay, 1);
    const jobs = [...new Set(S.shifts.map(s => s.job).filter(Boolean))];
    const pay = rate() ? (w.total / 3600) * rate() : 0;
    const td = todayStr();

    return `
      <div class="page-head">
        <h1>Work hours</h1>
        <button type="button" class="btn-ghost" data-act="pdf-hours"${w.shifts.length ? '' : ' disabled'}>${ic('pdf', 18)}Save week as PDF</button>
      </div>

      <section class="card clock" aria-label="Clock in and out">
        ${S.clock ? `
          <div>
            <p class="muted">Clocked in to <b>${esc(S.clock.job)}</b> at ${hhmm(new Date(S.clock.start))}</p>
            <p class="elapsed" id="elapsed">${fmtClock((Date.now() - S.clock.start) / 1000, true)}</p>
          </div>
          <button type="button" class="btn-start" data-act="clock-out">Clock out</button>` : `
          <form data-form="clock-in">
            <div class="field grow"><label for="job">What are you working on?</label>
              <input id="job" name="job" list="jobs" required autocomplete="off" placeholder="Job or client"></div>
            <datalist id="jobs">${jobs.map(j => `<option value="${esc(j)}">`).join('')}</datalist>
            <button type="submit" class="btn-start">${ic('clock', 18)}Clock in</button>
          </form>`}
      </section>

      <details class="manual">
        <summary>Add hours you forgot to clock</summary>
        <form class="card add" data-form="manual-shift">
          <div class="field grow"><label for="m-job">Job</label>
            <input id="m-job" name="job" list="jobs" required autocomplete="off"></div>
          <div class="field"><label for="m-date">Date</label><input id="m-date" name="date" type="date" value="${td}" required></div>
          <div class="field"><label for="m-from">From</label><input id="m-from" name="from" type="time" required></div>
          <div class="field"><label for="m-to">To</label><input id="m-to" name="to" type="time" required></div>
          <button type="submit" class="btn-start">Add hours</button>
        </form>
      </details>

      <div class="weeknav spaced">
        <button type="button" class="icon-btn sm" data-act="week" data-id="-1" aria-label="Previous week">${ic('arrow', 18, 'flip')}</button>
        <h2>${esc(w.label)}</h2>
        <button type="button" class="icon-btn sm" data-act="week" data-id="1" aria-label="Next week">${ic('arrow', 18)}</button>
        ${ui.week ? '<button type="button" class="link" data-act="week" data-id="0">This week</button>' : ''}
      </div>

      <div class="card weekbar" role="img" aria-label="Hours worked each day: ${w.days.map((d, i) => `${fmtDate(ymd(d), { weekday: 'long' })} ${fmtHours(w.perDay[i])}`).join(', ')}">
        ${w.days.map((d, i) => `
          <div class="wd${ymd(d) === td ? ' today-col' : ''}">
            <b>${w.perDay[i] ? fmtHours(w.perDay[i]) : '-'}</b>
            <div class="col"><i style="height:${w.perDay[i] ? Math.max(3, Math.round((w.perDay[i] / max) * 100)) : 0}%"></i></div>
            <span>${esc(d.toLocaleDateString(undefined, { weekday: 'short' }))} ${d.getDate()}</span>
          </div>`).join('')}
      </div>

      ${w.shifts.length ? `
        <div class="card scroll"><table class="table">
          <thead><tr><th>Date</th><th>Job</th><th>From</th><th>To</th><th class="num">Hours</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            ${w.shifts.map(s => `
              <tr>
                <td>${esc(fmtDate(ymd(new Date(s.start))))}</td>
                <td>${esc(s.job)}</td>
                <td>${hhmm(new Date(s.start))}</td>
                <td>${hhmm(new Date(s.end))}</td>
                <td class="num">${fmtHours(shiftSec(s))}</td>
                <td><button type="button" class="link danger" data-act="del-shift" data-id="${s.id}" aria-label="Delete entry for ${esc(s.job)}">Delete</button></td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr><td colspan="4">Total hours</td><td class="num">${fmtHours(w.total)}</td><td></td></tr>
            ${pay ? `<tr><td colspan="4">Pay at ${esc(money(rate()))} per hour</td><td class="num">${esc(money(pay))}</td><td></td></tr>` : ''}
          </tfoot>
        </table></div>`
        : '<p class="empty card">No hours logged this week. Clock in above when you start work.</p>'}`;
  }

  function viewNotes() {
    const list = [...S.notes].sort((a, b) => b.updated - a.updated);
    const cur = S.notes.find(n => n.id === ui.noteId) || list[0];
    if (cur) ui.noteId = cur.id;
    return `
      <div class="page-head"><h1>Notes</h1></div>
      <div class="notes">
        <div>
          <button type="button" class="btn-start" data-act="new-note">${ic('plus', 18)}New note</button>
          <div class="note-list">
            ${list.map(n => `
              <button type="button" class="note-item" data-act="open-note" data-id="${n.id}" ${n.id === ui.noteId ? 'aria-current="true"' : ''}>
                <b>${esc(n.title.trim() || 'Untitled note')}</b>
                <small>${esc(new Date(n.updated).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</small>
              </button>`).join('')}
          </div>
        </div>
        ${cur ? `
          <div class="card editor">
            <label class="sr-only" for="note-title">Note title</label>
            <input id="note-title" class="note-title" data-input="note-title" value="${esc(cur.title)}" placeholder="Note title" autocomplete="off">
            <label class="sr-only" for="note-body">Note text</label>
            <textarea id="note-body" data-input="note-body" placeholder="Write your notes here">${esc(cur.body)}</textarea>
            <div class="row">
              <button type="button" class="btn-ghost" data-act="pdf-note">${ic('pdf', 18)}Save as PDF</button>
              <button type="button" class="link danger" data-act="del-note" data-id="${cur.id}">Delete note</button>
            </div>
          </div>`
          : '<p class="empty card">No notes yet. Create one for class notes, formulas or meeting points.</p>'}
      </div>`;
  }

  function viewPdf() {
    const w = weekData(ui.pdfWeek);
    const sw = studyWeek(ui.pdfWeek);
    const open = S.tasks.filter(t => !t.done).length, finished = S.tasks.length - open;
    const weeks = [...Array(8)].map((_, i) => -i);
    const note = S.notes.find(n => n.id === ui.noteId) || S.notes[0];
    const card = (icon, title, text, action, label, disabled) => `
      <section class="card pdf-card">
        <span class="pdf-ic">${ic(icon, 28)}</span>
        <h2>${title}</h2>
        <p class="muted">${text}</p>
        <button type="button" class="btn-start" data-act="${action}"${disabled ? ' disabled' : ''}>${ic('download', 18)}${label}</button>
      </section>`;
    return `
      <div class="page-head"><h1>PDF tools</h1><p class="sub">Each button opens your print window. Choose "Save as PDF" there.</p></div>
      <div class="card pdf-week">
        <label>Week for the timesheet and study report
          <select data-change="pdf-week">
            ${weeks.map(o => `<option value="${o}" ${ui.pdfWeek === o ? 'selected' : ''}>${esc(weekLabel(weekDays(o)))}${o === 0 ? ' (this week)' : ''}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="pdf-grid">
        ${card('check', 'Homework plan', `${plural(open, 'task')} to do and ${finished} finished, with due dates and time.`, 'pdf-homework', 'Create homework PDF', !S.tasks.length)}
        ${card('briefcase', 'Timesheet', `${plural(w.shifts.length, 'entry')} and ${fmtHours(w.total)} hours, with signature and date lines.`, 'pdf-hours', 'Create timesheet PDF', !w.shifts.length)}
        ${card('chart', 'Study report', `${esc(fmtDur(sw.total))} of focus time and ${plural(sw.done.length, 'finished task')} this week.`, 'pdf-study', 'Create study report PDF', !sw.total && !sw.done.length)}
        ${card('note', 'Note', note ? `"${esc(note.title.trim() || 'Untitled note')}". Pick another on the Notes page.` : 'Write a note first, then save it as a PDF.', 'pdf-note', 'Create note PDF', !note)}
      </div>`;
  }

  function viewAnalytics() {
    const by = focusByDay();
    const totalSec = S.sessions.reduce((n, s) => n + s.seconds, 0);
    const last7 = [...Array(7)].map((_, i) => by[ymd(addDays(new Date(), -i))] || 0);
    const avg = last7.reduce((a, b) => a + b, 0) / 7;
    const days = [...Array(14)].map((_, i) => addDays(new Date(), i - 13));
    const vals = days.map(d => by[ymd(d)] || 0);
    const max = Math.max(...vals, 1);
    const cutoff = Date.now() - 30 * 864e5, subj = {};
    S.sessions.forEach(s => { if (new Date(s.at).getTime() >= cutoff) { const k = subjectOf(s.taskId); subj[k] = (subj[k] || 0) + s.seconds; } });
    const subjects = Object.entries(subj).sort((a, b) => b[1] - a[1]);
    const smax = subjects.length ? subjects[0][1] : 1;
    const kpi = (icon, label, value) => `<div class="stat"><span class="stat-ic">${ic(icon, 26)}</span><div class="stat-body"><p class="stat-label">${label}</p><p class="stat-value">${value}</p></div></div>`;
    return `
      <div class="page-head"><h1>Analytics</h1></div>
      <section class="stats" aria-label="Totals">
        ${kpi('clock', 'Total focus time', esc(fmtShort(totalSec)))}
        ${kpi('timer', 'Sessions', String(S.sessions.length))}
        ${kpi('target', 'Daily average (7 days)', esc(fmtShort(avg)))}
        ${kpi('flame', 'Streak', plural(streak(), 'day'))}
      </section>
      <div class="an-grid">
        <section class="card" aria-label="Last 14 days">
          <header class="card-head"><h2>${ic('chart', 22)}Last 14 days</h2></header>
          <div class="bars" role="img" aria-label="Focus time per day for the last 14 days">
            ${days.map((d, i) => `
              <div class="bcol" title="${esc(fmtDate(ymd(d)))}: ${esc(fmtDur(vals[i]))}">
                <div class="bbar"><i style="height:${vals[i] ? Math.max(4, Math.round((vals[i] / max) * 100)) : 0}%"></i></div>
                <span>${d.getDate()}</span>
              </div>`).join('')}
          </div>
          ${totalSec ? '' : '<p class="small muted">No focus time logged yet.</p>'}
        </section>
        <section class="card" aria-label="Focus by subject">
          <header class="card-head"><h2>${ic('book', 22)}Focus by subject (30 days)</h2></header>
          ${subjects.length ? `<ul class="subj">${subjects.map(([k, v]) => `
            <li><div class="subj-top"><span><i class="dot" style="--h:${hue(k)}"></i>${esc(k)}</span><b>${esc(fmtDur(v))}</b></div>
            <div class="bar" aria-hidden="true"><i style="width:${Math.round((v / smax) * 100)}%"></i></div></li>`).join('')}</ul>`
            : '<p class="empty">Pick a task with a subject in the timer to see where your time goes.</p>'}
        </section>
      </div>`;
  }

  function viewTips() {
    const smart = smartTip();
    const list = TIPS.filter(t => ui.tipCat === 'all' || t.cat === ui.tipCat);
    return `
      <div class="tips-page">
        <div class="page-head">
          <h1>Study tips</h1>
          <p class="sub">${TIPS.length} ways to study smarter</p>
        </div>
        ${smart ? `
          <section class="card tipcard solo" aria-label="Tip for you">
            <span class="tip-ic">${ic('bulb', 26)}</span>
            <div class="tip-text"><h2>For you today</h2>${tipBlock(smart)}</div>
          </section>` : ''}
        <div class="tabs" role="group" aria-label="Tip topics">
          ${[['all', 'All'], ...Object.entries(CATS)].map(([k, l]) =>
            `<button type="button" data-act="tip-cat" data-id="${k}" aria-pressed="${ui.tipCat === k}">${l}</button>`).join('')}
        </div>
        <div class="tip-list">${list.map(t => tipBlock(t)).join('')}</div>
      </div>`;
  }

  function viewSettings() {
    const s = S.settings;
    return `
      <div class="page-head"><h1>Settings</h1></div>
      <div class="set-grid">
        <section class="card">
          <h2>You</h2>
          <div class="stack">
            <div class="field"><label for="s-name">Your name (shown on the dashboard and PDFs)</label>
              <input id="s-name" data-change="setting" name="name" value="${esc(s.name)}" autocomplete="name"></div>
            <label class="check-row"><input type="checkbox" data-change="setting" name="tips" ${s.tips !== false ? 'checked' : ''}> Show a study tip on the dashboard</label>
            <label class="check-row"><input type="checkbox" data-change="setting" name="motion" ${s.motion !== false ? 'checked' : ''}> Animations</label>
          </div>
        </section>
        <section class="card">
          <h2>Timer and goals</h2>
          <div class="stack">
            <div class="row-fields">
              <div class="field"><label for="s-focus">Focus (minutes)</label>
                <input id="s-focus" data-change="setting" name="focus" type="number" min="1" max="180" value="${mins('focus')}"></div>
              <div class="field"><label for="s-short">Short break</label>
                <input id="s-short" data-change="setting" name="short" type="number" min="1" max="180" value="${mins('short')}"></div>
              <div class="field"><label for="s-long">Long break</label>
                <input id="s-long" data-change="setting" name="long" type="number" min="1" max="180" value="${mins('long')}"></div>
            </div>
            <div class="field"><label for="s-goal">Daily study goal (minutes)</label>
              <input id="s-goal" data-change="setting" name="dailyGoal" type="number" min="10" max="960" value="${goalSec() / 60}"></div>
          </div>
        </section>
        <section class="card">
          <h2>Work week and pay</h2>
          <div class="stack">
            <div class="field"><label for="s-week">Week starts on</label>
              <select id="s-week" data-change="setting" name="weekStart">
                ${[[6, 'Saturday'], [0, 'Sunday'], [1, 'Monday']].map(([v, l]) => `<option value="${v}" ${Number(s.weekStart) === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select></div>
            <div class="row-fields">
              <div class="field"><label for="s-rate">Hourly pay (optional)</label>
                <input id="s-rate" data-change="setting" name="rate" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(s.rate)}"></div>
              <div class="field"><label for="s-cur">Currency symbol</label>
                <input id="s-cur" data-change="setting" name="currency" maxlength="4" value="${esc(s.currency)}"></div>
            </div>
          </div>
        </section>
        <section class="card wall-card">
          <h2>Wallpaper and colour</h2>
          ${wallControls()}
        </section>
        <section class="card">
          <h2>Your data</h2>
          <p class="muted">Everything is saved in this browser only. Download a backup to move it to another device or keep it safe.</p>
          <div class="row">
            <button type="button" class="btn-ghost" data-act="backup">${ic('download', 18)}Download backup</button>
            <label class="btn-ghost file-btn">${ic('upload', 18)}Restore backup
              <input type="file" accept="application/json,.json" data-change="restore" class="sr-only"></label>
          </div>
          <p><button type="button" class="link danger" data-act="wipe">Delete all my data</button></p>
        </section>
      </div>`;
  }

  const VIEWS = {
    dashboard: viewDashboard, tasks: viewTasks, plan: viewPlan, hours: viewHours, notes: viewNotes,
    pdf: viewPdf, pomodoro: viewPomodoro, analytics: viewAnalytics, tips: viewTips, settings: viewSettings,
  };
  const view = $('#view');

  function setTitle() {
    if (printing) return;
    document.title = S.timer.running
      ? `${fmtClock(timerLeft())} ${MODES[S.timer.mode]} - STUDORA`
      : `${LABELS[current]} - STUDORA`;
  }

  /* ======================================================================
     Motion. Page-enter effects play only when you change page (route), never on
     small updates such as ticking a task, so nothing replays while you work.
     ====================================================================== */

  function motionOn() {
    return S.settings.motion !== false &&
      !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  const WRAPS = '.stats, .dash, .an-grid, .set-grid, .pomo, .pdf-grid, .board, .notes, .tip-list, .tips-page';

  function countUp(el) {
    const text = el.textContent;
    const to = (text.match(/\d+/g) || []).map(Number);
    if (!to.length) return;
    const t0 = performance.now(), D = 800;
    const step = now => {
      const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3);
      if (p >= 1) { el.textContent = text; return; }
      let i = 0;
      el.textContent = text.replace(/\d+/g, () => String(Math.round(to[i++] * e)));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function playEnter() {
    if (!motionOn()) return;
    const blocks = [];
    const walk = root => {
      for (const c of root.children) { if (c.matches(WRAPS)) walk(c); else blocks.push(c); }
    };
    walk(view);
    blocks.forEach((el, i) => { el.style.setProperty('--i', String(Math.min(i, 8))); el.classList.add('anim'); });
    view.classList.add('enter');
    view.querySelectorAll('.stat-value').forEach(countUp);
  }

  function playFlash() {
    const f = ui.flash, burst = ui.burst;
    ui.flash = null; ui.burst = false;
    if (!motionOn()) return;
    if (f) {
      const input = view.querySelector(`.tick input[data-id="${f.id}"]`);
      const row = input && input.closest('li');
      if (row) row.classList.add(f.kind === 'new' ? 'fresh' : 'flash');
      if (f.kind === 'done' && input) input.closest('.tick').classList.add('pop');
    }
    if (burst) view.querySelectorAll('.ring').forEach(r => r.classList.add('burst'));
  }

  function render(keepScroll) {
    const y = window.scrollY;
    view.classList.remove('enter');
    view.innerHTML = VIEWS[current]();
    document.querySelectorAll('.nav-link').forEach(a => {
      if (a.dataset.view === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    updateBell();
    paintThumbs();
    paintHero();
    setTitle();
    playFlash();
    if (keepScroll) window.scrollTo(0, y);
  }

  function paintHero() {
    const art = $('.hero-art');
    if (art && S.settings.scene !== false) art.style.backgroundImage = scene();
  }

  function closeNav() {
    document.body.classList.remove('nav-open');
    const b = $('[data-act="menu"]');
    if (b) b.setAttribute('aria-expanded', 'false');
  }

  function route() {
    const raw = location.hash.slice(1);
    const name = ALIAS[raw] || raw;
    current = VIEWS[name] ? name : 'dashboard';
    closeNav();
    render(false);
    playEnter();
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }
  function go(name) { if (current === name) render(true); else location.hash = `#${name}`; }

  /* ======================================================================
     PDF (uses the browser's print dialog: choose "Save as PDF")
     ====================================================================== */

  function printDoc(html, title) {
    const root = $('#print-root');
    root.innerHTML = `<div class="doc">${html}</div>`;
    const prev = document.title;
    printing = true;
    document.title = title;
    const done = () => {
      root.innerHTML = '';
      printing = false;
      document.title = prev;
      setTitle();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    toast('In the print window, choose "Save as PDF" as the destination.');
    setTimeout(() => window.print(), 60);
  }

  const docHead = (title, extra = '') => `
    <header class="doc-head">
      <h1>${esc(title)}</h1>
      ${S.settings.name ? `<p>Name: ${esc(S.settings.name)}</p>` : ''}
      ${extra}
      <p>Created: ${esc(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
    </header>`;

  function docHomework() {
    const open = S.tasks.filter(t => !t.done).sort(byDue);
    const done = S.tasks.filter(t => t.done).sort((a, b) => b.doneAt - a.doneAt);
    const rows = (list, ticked) => list.map(t => `
      <tr>
        <td><span class="tick-box${ticked ? ' on' : ''}"></span></td>
        <td>${esc(t.title)}</td>
        <td>${esc(t.subject)}</td>
        <td>${t.due ? esc(fmtDate(t.due)) : ''}</td>
        <td class="num">${esc(timeLabel(t))}</td>
      </tr>`).join('');
    const table = (list, ticked) => `
      <table class="doc-table fixed">
        <colgroup><col style="width:9%"><col style="width:36%"><col style="width:16%"><col style="width:17%"><col style="width:22%"></colgroup>
        <thead><tr><th>Done</th><th>Task</th><th>Subject</th><th>Due</th><th class="num">Time</th></tr></thead>
        <tbody>${rows(list, ticked)}</tbody>
      </table>`;
    const focus = S.sessions.reduce((n, s) => n + s.seconds, 0);
    return `
      ${docHead('Homework plan')}
      <h2>To do (${open.length})</h2>
      ${open.length ? table(open, false) : '<p>Nothing left to do.</p>'}
      ${done.length ? `<h2>Finished (${done.length})</h2>${table(done, true)}` : ''}
      <p class="doc-sum">Total focus time logged: ${esc(fmtDur(focus))}</p>`;
  }

  function docHours(w) {
    const r = rate();
    return `
      ${docHead('Timesheet', `<p>Week: ${esc(w.label)}</p>`)}
      <table class="doc-table">
        <thead><tr><th>Date</th><th>Job</th><th>From</th><th>To</th><th class="num">Hours</th></tr></thead>
        <tbody>
          ${w.shifts.map(s => `
            <tr><td>${esc(fmtDate(ymd(new Date(s.start))))}</td><td>${esc(s.job)}</td>
            <td>${hhmm(new Date(s.start))}</td><td>${hhmm(new Date(s.end))}</td>
            <td class="num">${fmtHours(shiftSec(s))}</td></tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="4">Total hours</td><td class="num">${fmtHours(w.total)}</td></tr>
          ${r ? `<tr><td colspan="4">Pay at ${esc(money(r))} per hour</td><td class="num">${esc(money((w.total / 3600) * r))}</td></tr>` : ''}
        </tfoot>
      </table>
      <p class="sign">Signature</p>
      <p class="sign">Date</p>`;
  }

  function studyWeek(offset) {
    const days = weekDays(offset), a = ymd(days[0]), b = ymd(days[6]);
    const by = focusByDay();
    const perDay = days.map(d => by[ymd(d)] || 0);
    const subj = {};
    S.sessions.forEach(s => { const d = dayKey(s.at); if (d >= a && d <= b) { const k = subjectOf(s.taskId); subj[k] = (subj[k] || 0) + s.seconds; } });
    const done = S.tasks.filter(t => t.done && t.doneAt && ymd(new Date(t.doneAt)) >= a && ymd(new Date(t.doneAt)) <= b);
    return { days, perDay, subjects: Object.entries(subj).sort((x, y) => y[1] - x[1]), done, total: perDay.reduce((n, v) => n + v, 0), label: weekLabel(days) };
  }

  function docStudy(w) {
    return `
      ${docHead('Study report', `<p>Week: ${esc(w.label)}</p>`)}
      <h2>Focus time each day</h2>
      <table class="doc-table">
        <thead><tr><th>Day</th><th class="num">Focus time</th></tr></thead>
        <tbody>${w.days.map((d, i) => `<tr><td>${esc(fmtDate(ymd(d)))}</td><td class="num">${w.perDay[i] ? esc(fmtDur(w.perDay[i])) : '-'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${esc(fmtDur(w.total))}</td></tr></tfoot>
      </table>
      ${w.subjects.length ? `
        <h2>Focus time by subject</h2>
        <table class="doc-table">
          <thead><tr><th>Subject</th><th class="num">Focus time</th></tr></thead>
          <tbody>${w.subjects.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${esc(fmtDur(v))}</td></tr>`).join('')}</tbody>
        </table>` : ''}
      <h2>Tasks finished (${w.done.length})</h2>
      ${w.done.length ? `<table class="doc-table"><tbody>${w.done.map(t => `<tr><td>${esc(t.title)}</td><td>${esc(t.subject)}</td></tr>`).join('')}</tbody></table>` : '<p>No tasks finished this week.</p>'}`;
  }

  function docNote(n) {
    return `
      <header class="doc-head">
        <h1>${esc(n.title.trim() || 'Untitled note')}</h1>
        ${S.settings.name ? `<p>Name: ${esc(S.settings.name)}</p>` : ''}
        <p>Last edited: ${esc(new Date(n.updated).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
      </header>
      <div class="doc-body">${esc(n.body)}</div>`;
  }

  /* ======================================================================
     Actions and events
     ====================================================================== */

  const ACT = {
    mode: id => setMode(id),
    'toggle-timer': () => (S.timer.running ? pauseTimer() : startTimer()),
    'reset-timer': () => resetTimer(),

    go: id => { closePop(false); go(id); },
    menu: (id, b) => {
      const open = document.body.classList.toggle('nav-open');
      b.setAttribute('aria-expanded', String(open));
    },
    'menu-close': () => closeNav(),

    pop: (id, b) => {
      if (ui.pop === id) { closePop(); return; }
      ui.pop = id;
      ui.popTrigger = b;
      renderPop(true);
      const p = $('#pop .pop');
      if (p) p.focus();
    },
    'pop-close': () => closePop(),

    wall: id => {
      if (id === 'custom' && !customWall) return;
      S.settings.wall = id;
      save(); applyTheme(); render(true); renderPop();
    },
    'wall-remove': () => {
      try { localStorage.removeItem(WALL_KEY); } catch { /* ignore */ }
      customWall = '';
      if (S.settings.wall === 'custom') S.settings.wall = 'black';
      save(); applyTheme(); render(true); renderPop();
      toast('Your photo was removed.');
    },
    accent: id => { if (ACCENTS[id]) { S.settings.accent = id; save(); applyTheme(); render(true); renderPop(); } },

    focus: id => { S.timer.taskId = id; save(); closePop(false); go('pomodoro'); },
    'pick-task': id => { S.timer.taskId = S.timer.taskId === id ? '' : id; save(); render(true); },
    'goto-task': () => { closePop(false); go('tasks'); },

    'next-tip': () => { ui.tipShift += 1; render(true); },
    'tip-cat': id => { ui.tipCat = id; render(true); },

    'new-note': () => {
      const n = { id: uid(), title: '', body: '', updated: Date.now() };
      S.notes.push(n);
      ui.noteId = n.id;
      save();
      if (current === 'notes') { render(true); } else { go('notes'); }
      setTimeout(() => $('#note-title')?.focus(), 0);
    },
    'open-note': id => { ui.noteId = id; render(true); },
    'del-note': id => {
      const i = S.notes.findIndex(n => n.id === id);
      if (i < 0) return;
      const [n] = S.notes.splice(i, 1);
      ui.noteId = '';
      save(); render(true);
      toast('Note deleted.', () => { S.notes.push(n); ui.noteId = n.id; save(); render(true); });
    },

    'open-result': (id, b) => {
      const kind = b.dataset.kind;
      ui.q = '';
      const q = $('#q'); if (q) q.value = '';
      paintResults();
      if (kind === 'note') { ui.noteId = id; go('notes'); }
      else if (kind === 'tip') { ui.tipCat = 'all'; go('tips'); }
      else go('tasks');
    },

    'del-task': id => {
      const i = S.tasks.findIndex(t => t.id === id);
      if (i < 0) return;
      const [t] = S.tasks.splice(i, 1);
      const wasFocus = S.timer.taskId === id;
      if (wasFocus) S.timer.taskId = '';
      save(); render(true);
      toast('Task deleted.', () => {
        S.tasks.splice(Math.min(i, S.tasks.length), 0, t);
        if (wasFocus) S.timer.taskId = id;
        save(); render(true);
      });
    },

    'clock-out': () => {
      const c = S.clock;
      if (!c) return;
      const s = { id: uid(), job: c.job, start: new Date(c.start).toISOString(), end: new Date().toISOString() };
      S.shifts.push(s);
      S.clock = null;
      ui.week = 0;
      save(); render(true);
      toast(`Clocked out. ${fmtDur(shiftSec(s))} logged.`);
    },
    'del-shift': id => {
      const i = S.shifts.findIndex(s => s.id === id);
      if (i < 0) return;
      const [s] = S.shifts.splice(i, 1);
      save(); render(true);
      toast('Entry deleted.', () => { S.shifts.push(s); save(); render(true); });
    },
    week: id => { ui.week = id === '0' ? 0 : ui.week + Number(id); render(true); },
    'plan-week': id => { ui.planWeek = id === '0' ? 0 : ui.planWeek + Number(id); render(true); },

    'pdf-homework': () => printDoc(docHomework(), 'Homework plan'),
    'pdf-hours': () => {
      const w = weekData(current === 'pdf' ? ui.pdfWeek : ui.week);
      if (w.shifts.length) printDoc(docHours(w), `Timesheet ${w.label}`);
    },
    'pdf-study': () => {
      const w = studyWeek(ui.pdfWeek);
      printDoc(docStudy(w), `Study report ${w.label}`);
    },
    'pdf-note': () => {
      const n = S.notes.find(x => x.id === ui.noteId) || S.notes[0];
      if (n) printDoc(docNote(n), n.title.trim() || 'Note');
    },

    backup: () => {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `studora-backup-${todayStr()}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    wipe: () => {
      if (!confirm('Delete all tasks, hours, notes and settings from this browser? This cannot be undone.')) return;
      S = defaults();
      customWall = '';
      try { localStorage.removeItem(WALL_KEY); } catch { /* ignore */ }
      ui.week = 0; ui.noteId = '';
      save(); applyTheme(); render(true);
      toast('All data deleted.');
    },
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b && ACT[b.dataset.act]) { ACT[b.dataset.act](b.dataset.id, b, e); return; }
    if (!e.target.closest('.search')) {
      const r = $('#results');
      if (r && !r.hidden) r.hidden = true;
    }
  });

  document.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, d = Object.fromEntries(new FormData(f));
    switch (f.dataset.form) {
      case 'quick-task':
        if (addTask({ title: d.title, due: todayStr() })) { render(true); $('#qt')?.focus(); }
        break;
      case 'plan-add':
        if (addTask({ title: d.title, due: f.dataset.date })) {
          render(true);
          $(`#pa-${f.dataset.date}`)?.focus();
        }
        break;
      case 'task':
        if (addTask(d)) { render(true); $('#t-title')?.focus(); }
        break;
      case 'clock-in': {
        const job = String(d.job || '').trim();
        if (!job) return;
        S.clock = { job, start: Date.now() };
        save(); render(true);
        break;
      }
      case 'manual-shift': {
        const start = new Date(`${d.date}T${d.from}`), end = new Date(`${d.date}T${d.to}`);
        if (isNaN(start) || isNaN(end)) return toast('Enter a date and both times.');
        if (end <= start) return toast('The end time must be after the start time.');
        S.shifts.push({ id: uid(), job: String(d.job).trim(), start: start.toISOString(), end: end.toISOString() });
        ui.week = Math.round(daysBetween(ymd(weekStart(new Date())), ymd(weekStart(start))) / 7);
        save(); render(true);
        toast(`Added ${fmtDur((end - start) / 1000)}.`);
        break;
      }
    }
  });

  document.addEventListener('change', e => {
    const el = e.target, kind = el.dataset.change;
    if (!kind) return;
    if (kind === 'toggle') {
      const t = S.tasks.find(x => x.id === el.dataset.id);
      if (!t) return;
      t.done = el.checked;
      t.doneAt = el.checked ? Date.now() : 0;
      if (t.done && S.timer.taskId === t.id) S.timer.taskId = '';
      ui.flash = t.done ? { id: t.id, kind: 'done' } : null;
      save(); render(true);
    } else if (kind === 'timer-task') {
      S.timer.taskId = el.value;
      save(); render(true);
    } else if (kind === 'stats-week') {
      ui.statsWeek = Number(el.value) === -1 ? -1 : 0;
      render(true);
    } else if (kind === 'pdf-week') {
      ui.pdfWeek = Number(el.value) || 0;
      render(true);
    } else if (kind === 'wall-upload') {
      loadWallpaper(el.files && el.files[0]);
      el.value = '';
    } else if (kind === 'setting') {
      const k = el.name;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'focus' || k === 'short' || k === 'long') {
        v = Math.max(1, Math.min(180, Math.round(Number(v)) || defaults().settings[k]));
        el.value = v;
        if (!S.timer.running && S.timer.mode === k) S.timer.left = v * 60;
      } else if (k === 'dailyGoal') {
        v = Math.max(10, Math.min(960, Math.round(Number(v)) || 120));
        el.value = v;
      } else if (k === 'weekStart') v = Number(v);
      else if (k === 'rate') { v = v === '' ? '' : Math.max(0, Number(v) || 0); el.value = v; }
      S.settings[k] = v;
      save();
      if (k === 'motion') applyTheme();
      if (k === 'scene' || k === 'tips') { render(true); renderPop(); } else toast('Saved.');
    } else if (kind === 'restore') {
      const file = el.files && el.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = JSON.parse(String(reader.result));
          if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) throw new Error('bad file');
          if (!confirm('Replace everything in this browser with the data from this backup?')) { el.value = ''; return; }
          S = merge(defaults(), raw);
          S.timer.running = false;
          S.timer.left = dur(S.timer.mode);
          if (S.settings.wall === 'custom' && !customWall) S.settings.wall = 'black';
          save(); applyTheme(); render(true);
          toast('Backup restored.');
        } catch {
          el.value = '';
          toast('That file is not a STUDORA backup.');
        }
      };
      reader.readAsText(file);
    }
  });

  document.addEventListener('input', e => {
    const el = e.target, k = el.dataset.input;
    if (!k) return;
    if (k === 'search') { ui.q = el.value; paintResults(); return; }
    if (k === 'wall-dim' || k === 'wall-blur') {
      const v = Number(el.value) || 0;
      S.settings[k === 'wall-dim' ? 'dim' : 'blur'] = v;
      const out = el.closest('label')?.querySelector('.val');
      if (out) out.textContent = k === 'wall-dim' ? `${v}%` : `${v}px`;
      applyTheme(); saveSoon();
      return;
    }
    if (k === 'note-title' || k === 'note-body') {
      const n = S.notes.find(x => x.id === ui.noteId);
      if (!n) return;
      n[k === 'note-title' ? 'title' : 'body'] = el.value;
      n.updated = Date.now();
      saveSoon();
      if (k === 'note-title') {
        const b = $(`.note-item[data-id="${n.id}"] b`);
        if (b) b.textContent = n.title.trim() || 'Untitled note';
      }
    }
  });

  document.addEventListener('toggle', e => {
    if (e.target.matches && e.target.matches('details.done-box')) ui.doneOpen = e.target.open;
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (ui.pop) { closePop(); return; }
      const r = $('#results');
      if (r && !r.hidden) { r.hidden = true; return; }
      closeNav();
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); $('#q')?.focus(); }
  });

  /* ======================================================================
     Start
     ====================================================================== */

  renderChrome();
  applyTheme();
  window.addEventListener('hashchange', route);
  setInterval(tickAll, 500);
  route();
})();
