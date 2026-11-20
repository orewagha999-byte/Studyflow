/* StudyFlow: homework planner, focus timer, work-hours log, notes and PDF export.
   No build step and no server. Everything is saved in this browser (localStorage). */
(() => {
  'use strict';

  /* ---------- state ---------- */

  const KEY = 'studyflow.v1';
  const MODES = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  const LABELS = { today: 'Today', homework: 'Homework', hours: 'Work hours', notes: 'Notes', tips: 'Study tips', settings: 'Settings' };

  const defaults = () => ({
    tasks: [], sessions: [], shifts: [], notes: [], clock: null, cycle: 0,
    settings: { name: '', focus: 25, short: 5, long: 15, weekStart: 1, rate: '', currency: '$', tips: true },
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
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') return merge(base, raw);
    } catch { /* storage blocked or corrupt: start fresh */ }
    return base;
  }

  let S = load();
  const ui = { week: 0, noteId: '', doneOpen: false, tipCat: 'all', tipShift: 0 };
  let current = 'today';
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

  /* ---------- helpers ---------- */

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
  const fmtHours = sec => (sec / 3600).toFixed(2);
  const money = n => `${S.settings.currency || ''}${n.toFixed(2)}`;
  const rate = () => Math.max(0, Number(S.settings.rate) || 0);

  const mins = k => Math.max(1, Math.min(180, Math.round(Number(S.settings[k])) || defaults().settings[k]));
  const dur = mode => mins(mode) * 60;

  /* ---------- toast ---------- */

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

  /* ---------- tasks ---------- */

  const byDue = (a, b) => {
    const x = a.due || '9999', y = b.due || '9999';
    return x < y ? -1 : x > y ? 1 : 0;
  };
  const spentSec = id => S.sessions.reduce((n, s) => n + (s.taskId === id ? s.seconds : 0), 0);
  const secondsOn = day => S.sessions.reduce((n, s) => n + (ymd(new Date(s.at)) === day ? s.seconds : 0), 0);

  function addTask({ title, subject = '', due = '', est = '' }) {
    const t = String(title || '').trim();
    if (!t) return false;
    const e = Math.round(Number(est));
    S.tasks.push({ id: uid(), title: t, subject: String(subject).trim(), due, est: e > 0 ? e : 0, done: false, doneAt: 0, created: Date.now() });
    save();
    return true;
  }

  function dueLabel(t) {
    if (!t.due) return '';
    if (t.done) return `Due ${fmtDate(t.due)}`;
    const diff = daysBetween(todayStr(), t.due);
    if (diff < 0) return `${-diff} day${diff === -1 ? '' : 's'} late`;
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    return `Due ${fmtDate(t.due)}`;
  }

  function timeLabel(t) {
    const spent = spentSec(t.id);
    if (t.est) return `${fmtDur(spent)} of ${t.est} min`;
    return spent ? `${fmtDur(spent)} focused` : '';
  }

  function taskRow(t) {
    const late = !t.done && t.due && t.due < todayStr();
    const time = timeLabel(t);
    return `
      <li class="task${t.done ? ' is-done' : ''}">
        <label class="check">
          <input type="checkbox" data-change="toggle" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Done: ${esc(t.title)}">
          <span class="box"></span>
        </label>
        <div>
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

  /* ---------- study tips ---------- */

  const CATS = { focus: 'Focus', memory: 'Remembering', plan: 'Planning', habits: 'Habits' };
  const TIPS = [
    { cat: 'focus', title: 'Work in 25-minute blocks', body: 'Set the timer for 25 minutes, work on one thing, then rest for 5. After four rounds, take a longer break. Short blocks make it easier to start and to stay focused.', action: { href: '#today', label: 'Open the timer' } },
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
    { cat: 'plan', title: 'Break big tasks into small steps', body: '"Write essay" is too big to start. "List three points" and "Write the first paragraph" are not. Add each small step as its own homework task.', action: { href: '#homework', label: 'Add homework' } },
    { cat: 'plan', title: 'Give yourself more time than you think', body: 'People usually underestimate how long work takes. Add about half again to your first estimate, then compare it with the time you actually focused so you guess better next time.' },
    { cat: 'plan', title: 'Work back from the due date', body: 'For a big assignment, start with the due date, then set earlier dates for research, a first draft and a final check. Finishing a day early leaves room for surprises.' },
    { cat: 'plan', title: 'Plan tomorrow tonight', body: 'Before you stop for the day, write down the top three tasks for tomorrow. You start the next day knowing where to begin instead of deciding while tired.' },
    { cat: 'habits', title: 'Use the same time and place', body: 'Studying at the same desk at the same time each day turns it into a habit, so it takes less effort to get started.' },
    { cat: 'habits', title: 'Protect your sleep', body: 'Sleep helps your brain store what you studied. An all-nighter usually costs you more in the exam than the extra hours give you.' },
    { cat: 'habits', title: 'Ask for help early', body: 'If you have been stuck on the same thing for 20 minutes, write down your exact question and ask a teacher, classmate or tutor. Small gaps grow into big ones.' },
    { cat: 'habits', title: 'Study with a friend who quizzes you', body: 'Take turns asking each other questions. Explaining answers helps you both, and a fixed time makes it easier to show up.' },
    { cat: 'habits', title: 'Reward finished work', body: 'Decide on a small reward before you start, such as a snack, a walk or an episode, and take it only when the session is done.' },
  ];

  const mod = (n, m) => ((n % m) + m) % m;
  const dailyTip = () => TIPS[mod(daysBetween('2026-01-01', todayStr()) + ui.tipShift, TIPS.length)];

  /* A tip that reacts to what is in the planner right now. Returns null when nothing stands out. */
  function smartTip() {
    const td = todayStr();
    const open = S.tasks.filter(t => !t.done);
    const late = open.filter(t => t.due && t.due < td);
    const today = open.filter(t => t.due === td);
    const tomorrow = open.filter(t => t.due && daysBetween(td, t.due) === 1);
    const weekAgo = Date.now() - 7 * 864e5;
    const focusedThisWeek = S.sessions.some(x => new Date(x.at).getTime() > weekAgo);
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

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
          title: `Today's homework needs about ${fmtDur(need * 60)}.`,
          body: `That is ${plural(blocks, 'focus session')} of ${mins('focus')} minutes with breaks in between. Start the first one now so it does not pile up in the evening.`,
        };
      }
      return {
        smart: true,
        title: `You have ${plural(today.length, 'task')} due today.`,
        body: 'Add the minutes each one needs, so you can see whether today fits.',
        action: { href: '#homework', label: 'Add time estimates' },
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
        title: 'Add minutes needed to your homework.',
        body: 'Estimates show you how much time a day really needs. Add about half again to your first guess, because work usually takes longer than expected.',
        action: { href: '#homework', label: 'Open homework' },
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

  /* ---------- focus timer ---------- */

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
    const d = $('#digits'), f = $('#barfill');
    if (d) d.textContent = fmtClock(left);
    if (f) f.style.width = `${Math.round((1 - left / dur(S.timer.mode)) * 100)}%`;
    setTitle();
  }

  function tick() {
    if (S.timer.running) {
      const left = timerLeft();
      if (left <= 0) completeTimer(); else paintTimer(left);
    }
    if (S.clock) {
      const el = $('#elapsed');
      if (el) el.textContent = fmtClock((Date.now() - S.clock.start) / 1000, true);
    }
  }

  function setTitle() {
    if (printing) return;
    document.title = S.timer.running
      ? `${fmtClock(timerLeft())} ${MODES[S.timer.mode]} - StudyFlow`
      : `${LABELS[current]} - StudyFlow`;
  }

  /* ---------- views ---------- */

  function viewToday() {
    const t = S.timer, left = timerLeft(), total = dur(t.mode);
    const open = S.tasks.filter(x => !x.done).sort(byDue);
    const next = open.slice(0, 6);
    const pct = Math.round((1 - left / total) * 100);
    const label = t.running ? 'Pause' : left < total ? 'Resume' : 'Start';
    const tip = S.settings.tips === false ? null : (smartTip() || dailyTip());
    return `
      <div class="page-head">
        <h1>Today</h1>
        <p class="sub">${esc(fmtDate(todayStr(), { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
      </div>
      <div class="today">
        <section aria-label="Focus timer">
          <div class="modes" role="group" aria-label="Timer mode">
            ${Object.entries(MODES).map(([k, l]) => `<button type="button" data-act="mode" data-id="${k}" aria-pressed="${t.mode === k}">${l}</button>`).join('')}
          </div>
          <p class="digits" id="digits" role="timer">${fmtClock(left)}</p>
          <div class="bar" aria-hidden="true"><i id="barfill" style="width:${pct}%"></i></div>
          <div class="controls">
            <button type="button" class="primary" data-act="toggle-timer">${label}</button>
            <button type="button" data-act="reset-timer">Reset</button>
          </div>
          <div class="working">
            <label for="timer-task">Task you are working on</label>
            <select id="timer-task" data-change="timer-task">
              <option value="">No task, just track the time</option>
              ${open.map(x => `<option value="${x.id}" ${x.id === t.taskId ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}
            </select>
          </div>
          <p class="today-total">Focus time today: <b>${fmtDur(secondsOn(todayStr()))}</b></p>
          ${tip ? `
            <section class="tip-box" aria-label="Study tip">
              <h2>Study tip</h2>
              ${tipBlock(tip)}
              ${tip.smart ? '' : '<button type="button" class="link" data-act="next-tip">Show another tip</button>'}
              <a class="link" href="#tips">All study tips</a>
            </section>` : ''}
        </section>

        <section aria-label="Up next">
          <h2>Up next</h2>
          <form class="row quick" data-form="quick-task">
            <div class="field grow">
              <label class="sr-only" for="qt">New task for today</label>
              <input id="qt" name="title" placeholder="Add a task for today" required autocomplete="off">
            </div>
            <button type="submit" class="primary">Add</button>
          </form>
          ${next.length
            ? `<ul class="tasks">${next.map(taskRow).join('')}</ul>`
            : '<p class="empty">Nothing to do yet. Add a task above.</p>'}
          <a class="link" href="#homework">See all homework</a>
        </section>
      </div>`;
  }

  function viewHomework() {
    const td = todayStr();
    const open = S.tasks.filter(t => !t.done).sort(byDue);
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
        <h1>Homework</h1>
        <button type="button" data-act="pdf-homework"${S.tasks.length ? '' : ' disabled'}>Save as PDF</button>
      </div>
      <form class="add" data-form="task">
        <div class="field grow"><label for="t-title">Task</label>
          <input id="t-title" name="title" required autocomplete="off" placeholder="Read chapter 4"></div>
        <div class="row-fields">
          <div class="field"><label for="t-subject">Subject</label>
            <input id="t-subject" name="subject" list="subjects" autocomplete="off" placeholder="Biology"></div>
          <div class="field"><label for="t-due">Due date</label>
            <input id="t-due" name="due" type="date"></div>
          <div class="field"><label for="t-est">Minutes needed</label>
            <input id="t-est" name="est" type="number" min="1" max="1440" inputmode="numeric" placeholder="45"></div>
        </div>
        <datalist id="subjects">${subjects.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
        <button type="submit" class="primary">Add homework</button>
      </form>
      ${groups.length ? groups.map(([name, list, cls]) => `
        <h2 class="group-title ${cls}">${name} (${list.length})</h2>
        <ul class="tasks">${list.map(taskRow).join('')}</ul>`).join('')
        : '<p class="empty">No homework to do. Add a task above to start your list.</p>'}
      ${done.length ? `
        <details class="done-box" ${ui.doneOpen ? 'open' : ''}>
          <summary>Finished (${done.length})</summary>
          <ul class="tasks">${done.map(taskRow).join('')}</ul>
        </details>` : ''}`;
  }

  /* week helpers for the hours view */
  function weekStart(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return addDays(x, -((x.getDay() - Number(S.settings.weekStart) + 7) % 7));
  }
  const shiftSec = s => Math.max(0, (new Date(s.end) - new Date(s.start)) / 1000);
  function weekData(offset) {
    const first = addDays(weekStart(new Date()), offset * 7);
    const days = [...Array(7)].map((_, i) => addDays(first, i));
    const a = ymd(days[0]), b = ymd(days[6]);
    const shifts = S.shifts
      .filter(s => { const d = ymd(new Date(s.start)); return d >= a && d <= b; })
      .sort((x, y) => (x.start < y.start ? -1 : 1));
    const perDay = days.map(d => shifts.reduce((n, s) => n + (ymd(new Date(s.start)) === ymd(d) ? shiftSec(s) : 0), 0));
    const total = perDay.reduce((n, v) => n + v, 0);
    const label = `${fmtDate(a, { day: 'numeric', month: 'short' })} to ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return { days, shifts, perDay, total, label };
  }

  function viewHours() {
    const w = weekData(ui.week);
    const max = Math.max(...w.perDay, 1);
    const jobs = [...new Set(S.shifts.map(s => s.job).filter(Boolean))];
    const pay = rate() ? (w.total / 3600) * rate() : 0;
    const td = todayStr();

    return `
      <div class="page-head">
        <h1>Work hours</h1>
        <button type="button" data-act="pdf-hours"${w.shifts.length ? '' : ' disabled'}>Save week as PDF</button>
      </div>

      <section class="clock" aria-label="Clock in and out">
        ${S.clock ? `
          <div>
            <p class="muted">Clocked in to <b>${esc(S.clock.job)}</b> at ${hhmm(new Date(S.clock.start))}</p>
            <p class="elapsed" id="elapsed">${fmtClock((Date.now() - S.clock.start) / 1000, true)}</p>
          </div>
          <button type="button" class="primary" data-act="clock-out">Clock out</button>` : `
          <form data-form="clock-in">
            <div class="field grow"><label for="job">What are you working on?</label>
              <input id="job" name="job" list="jobs" required autocomplete="off" placeholder="Job or client"></div>
            <datalist id="jobs">${jobs.map(j => `<option value="${esc(j)}">`).join('')}</datalist>
            <button type="submit" class="primary">Clock in</button>
          </form>`}
      </section>

      <details class="manual">
        <summary>Add hours you forgot to clock</summary>
        <form class="add" data-form="manual-shift">
          <div class="field grow"><label for="m-job">Job</label>
            <input id="m-job" name="job" list="jobs" required autocomplete="off"></div>
          <div class="row-fields">
            <div class="field"><label for="m-date">Date</label><input id="m-date" name="date" type="date" value="${td}" required></div>
            <div class="field"><label for="m-from">From</label><input id="m-from" name="from" type="time" required></div>
            <div class="field"><label for="m-to">To</label><input id="m-to" name="to" type="time" required></div>
          </div>
          <button type="submit" class="primary">Add hours</button>
        </form>
      </details>

      <div class="weeknav">
        <button type="button" data-act="week" data-id="-1" aria-label="Previous week">Previous</button>
        <h2>${esc(w.label)}</h2>
        <button type="button" data-act="week" data-id="1" aria-label="Next week">Next</button>
        ${ui.week ? '<button type="button" class="link" data-act="week" data-id="0">This week</button>' : ''}
      </div>

      <div class="weekbar" role="img" aria-label="Hours worked each day: ${w.days.map((d, i) => `${fmtDate(ymd(d), { weekday: 'long' })} ${fmtHours(w.perDay[i])}`).join(', ')}">
        ${w.days.map((d, i) => `
          <div class="wd${ymd(d) === td ? ' today-col' : ''}">
            <span>${esc(d.toLocaleDateString(undefined, { weekday: 'short' }))} ${d.getDate()}</span>
            <div class="col"><i style="height:${w.perDay[i] ? Math.max(3, Math.round((w.perDay[i] / max) * 100)) : 0}%"></i></div>
            <b>${w.perDay[i] ? fmtHours(w.perDay[i]) : '-'}</b>
          </div>`).join('')}
      </div>

      ${w.shifts.length ? `
        <div class="scroll"><table class="table">
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
        : '<p class="empty">No hours logged this week. Clock in above when you start work.</p>'}`;
  }

  function viewNotes() {
    const list = [...S.notes].sort((a, b) => b.updated - a.updated);
    const cur = S.notes.find(n => n.id === ui.noteId) || list[0];
    if (cur) ui.noteId = cur.id;
    return `
      <div class="page-head"><h1>Notes</h1></div>
      <div class="notes">
        <div>
          <button type="button" class="primary" data-act="new-note">New note</button>
          <div class="note-list">
            ${list.map(n => `
              <button type="button" class="note-item" data-act="open-note" data-id="${n.id}" ${n.id === ui.noteId ? 'aria-current="true"' : ''}>
                <b>${esc(n.title.trim() || 'Untitled note')}</b>
                <small>${esc(new Date(n.updated).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</small>
              </button>`).join('')}
          </div>
        </div>
        ${cur ? `
          <div class="editor">
            <label class="sr-only" for="note-title">Note title</label>
            <input id="note-title" class="note-title" data-input="title" value="${esc(cur.title)}" placeholder="Note title" autocomplete="off">
            <label class="sr-only" for="note-body">Note text</label>
            <textarea id="note-body" data-input="body" placeholder="Write your notes here">${esc(cur.body)}</textarea>
            <div class="row">
              <button type="button" data-act="pdf-note">Save as PDF</button>
              <button type="button" class="link danger" data-act="del-note" data-id="${cur.id}">Delete note</button>
            </div>
          </div>`
          : '<p class="empty">No notes yet. Create one for class notes, formulas or meeting points.</p>'}
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
          <section class="tip-box" aria-label="Tip for you">
            <h2>For you today</h2>
            ${tipBlock(smart)}
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
      <div class="stack">
        <div class="field"><label for="s-name">Your name (shown on PDFs)</label>
          <input id="s-name" data-change="setting" name="name" value="${esc(s.name)}" autocomplete="name"></div>
        <div class="row-fields">
          <div class="field"><label for="s-focus">Focus (minutes)</label>
            <input id="s-focus" data-change="setting" name="focus" type="number" min="1" max="180" value="${mins('focus')}"></div>
          <div class="field"><label for="s-short">Short break</label>
            <input id="s-short" data-change="setting" name="short" type="number" min="1" max="180" value="${mins('short')}"></div>
          <div class="field"><label for="s-long">Long break</label>
            <input id="s-long" data-change="setting" name="long" type="number" min="1" max="180" value="${mins('long')}"></div>
        </div>
        <div class="field"><label for="s-week">Work week starts on</label>
          <select id="s-week" data-change="setting" name="weekStart">
            ${[[6, 'Saturday'], [0, 'Sunday'], [1, 'Monday']].map(([v, l]) => `<option value="${v}" ${Number(s.weekStart) === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <label class="check-row"><input type="checkbox" data-change="setting" name="tips" ${s.tips !== false ? 'checked' : ''}> Show a study tip on the Today page</label>
        <div class="row-fields">
          <div class="field"><label for="s-rate">Hourly pay (optional)</label>
            <input id="s-rate" data-change="setting" name="rate" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(s.rate)}"></div>
          <div class="field"><label for="s-cur">Currency symbol</label>
            <input id="s-cur" data-change="setting" name="currency" maxlength="4" value="${esc(s.currency)}"></div>
        </div>
      </div>
      <div class="backup">
        <h2>Your data</h2>
        <p class="muted">Everything is saved in this browser only. Download a backup to move it to another device or keep it safe.</p>
        <div class="row">
          <button type="button" data-act="backup">Download backup</button>
          <div class="field"><label for="restore">Restore from backup</label>
            <input id="restore" type="file" accept="application/json,.json" data-change="restore"></div>
        </div>
        <p><button type="button" class="link danger" data-act="wipe">Delete all my data</button></p>
      </div>`;
  }

  const VIEWS = { today: viewToday, homework: viewHomework, hours: viewHours, notes: viewNotes, tips: viewTips, settings: viewSettings };
  const view = $('#view');

  function render(keepScroll) {
    const y = window.scrollY;
    view.innerHTML = VIEWS[current]();
    document.querySelectorAll('.nav-link').forEach(a => {
      if (a.dataset.view === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    setTitle();
    if (keepScroll) window.scrollTo(0, y);
  }

  function route() {
    const name = location.hash.slice(1);
    current = VIEWS[name] ? name : 'today';
    render(false);
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }
  function go(name) { if (current === name) render(true); else location.hash = `#${name}`; }

  /* ---------- PDF (uses the browser's print dialog: choose "Save as PDF") ---------- */

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
        <td><span class="tick${ticked ? ' on' : ''}"></span></td>
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

  function docNote(n) {
    return `
      <header class="doc-head">
        <h1>${esc(n.title.trim() || 'Untitled note')}</h1>
        ${S.settings.name ? `<p>Name: ${esc(S.settings.name)}</p>` : ''}
        <p>Last edited: ${esc(new Date(n.updated).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
      </header>
      <div class="doc-body">${esc(n.body)}</div>`;
  }

  /* ---------- actions ---------- */

  const ACT = {
    mode: id => setMode(id),
    'toggle-timer': () => (S.timer.running ? pauseTimer() : startTimer()),
    'reset-timer': () => resetTimer(),

    'next-tip': () => { ui.tipShift += 1; render(true); },
    'tip-cat': id => { ui.tipCat = id; render(true); },

    focus: id => { S.timer.taskId = id; save(); go('today'); },

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

    'new-note': () => {
      const n = { id: uid(), title: '', body: '', updated: Date.now() };
      S.notes.push(n);
      ui.noteId = n.id;
      save(); render(true);
      $('#note-title')?.focus();
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

    'pdf-homework': () => printDoc(docHomework(), 'Homework plan'),
    'pdf-hours': () => {
      const w = weekData(ui.week);
      if (w.shifts.length) printDoc(docHours(w), `Timesheet ${w.label}`);
    },
    'pdf-note': () => {
      const n = S.notes.find(x => x.id === ui.noteId);
      if (n) printDoc(docNote(n), n.title.trim() || 'Note');
    },

    backup: () => {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `studyflow-backup-${todayStr()}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    wipe: () => {
      if (!confirm('Delete all tasks, hours, notes and settings from this browser? This cannot be undone.')) return;
      S = defaults();
      ui.week = 0; ui.noteId = '';
      save(); render(true);
      toast('All data deleted.');
    },
  };

  view.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b && ACT[b.dataset.act]) ACT[b.dataset.act](b.dataset.id, b);
  });

  view.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, d = Object.fromEntries(new FormData(f));
    switch (f.dataset.form) {
      case 'quick-task':
        if (addTask({ title: d.title, due: todayStr() })) { render(true); $('#qt')?.focus(); }
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

  view.addEventListener('change', e => {
    const el = e.target, kind = el.dataset.change;
    if (!kind) return;
    if (kind === 'toggle') {
      const t = S.tasks.find(x => x.id === el.dataset.id);
      if (!t) return;
      t.done = el.checked;
      t.doneAt = el.checked ? Date.now() : 0;
      if (t.done && S.timer.taskId === t.id) S.timer.taskId = '';
      save(); render(true);
    } else if (kind === 'timer-task') {
      S.timer.taskId = el.value;
      save();
    } else if (kind === 'setting') {
      const k = el.name;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'focus' || k === 'short' || k === 'long') {
        v = Math.max(1, Math.min(180, Math.round(Number(v)) || defaults().settings[k]));
        el.value = v;
        if (!S.timer.running && S.timer.mode === k) S.timer.left = v * 60;
      } else if (k === 'weekStart') v = Number(v);
      else if (k === 'rate') { v = v === '' ? '' : Math.max(0, Number(v) || 0); el.value = v; }
      S.settings[k] = v;
      save();
      toast('Saved.');
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
          save(); render(true);
          toast('Backup restored.');
        } catch {
          el.value = '';
          toast('That file is not a StudyFlow backup.');
        }
      };
      reader.readAsText(file);
    }
  });

  view.addEventListener('input', e => {
    const k = e.target.dataset.input;
    if (!k) return;
    const n = S.notes.find(x => x.id === ui.noteId);
    if (!n) return;
    n[k] = e.target.value;
    n.updated = Date.now();
    saveSoon();
    if (k === 'title') {
      const b = $(`.note-item[data-id="${n.id}"] b`);
      if (b) b.textContent = n.title.trim() || 'Untitled note';
    }
  });

  view.addEventListener('toggle', e => {
    if (e.target.matches('details.done-box')) ui.doneOpen = e.target.open;
  }, true);

  /* ---------- start ---------- */

  window.addEventListener('hashchange', route);
  setInterval(tick, 500);
  route();
})();
