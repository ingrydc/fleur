/* ════════════════════════════════════════
   FLEUR — Weekly Planner
   app.js
════════════════════════════════════════ */

// ── CONSTANTS ──────────────────────────

const CATS = [
  { id: 'pessoal',  label: 'pessoal',  color: '#c4607a' },
  { id: 'trabalho', label: 'trabalho', color: '#8a9e8a' },
  { id: 'saude',    label: 'saúde',    color: '#d4896a' },
  { id: 'social',   label: 'social',   color: '#a89ab8' },
  { id: 'outro',    label: 'outro',    color: '#c9a46a' },
];

const PT_DAYS   = ['dom','seg','ter','qua','qui','sex','sáb'];
const PT_MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MOODS     = ['😔','😐','🙂','😊','🌸'];
const STORAGE_KEY = 'fleur_v4';

// ── STATE ──────────────────────────────

let state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {
  tasks: {}, moods: {}, notes: {}, intention: {}, weekOffset: 0
};

let activeCatFilter = new Set(CATS.map(c => c.id));

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── DATE HELPERS ───────────────────────

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getWeekStart(offset) {
  const t = today();
  const dow = t.getDay();
  return addDays(t, (dow === 0 ? -6 : 1 - dow) + offset * 7);
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── BUILD CATEGORY CHIPS ───────────────

function buildCatChips() {
  const catRowEl = document.getElementById('catRow');
  CATS.forEach(c => {
    const chip = document.createElement('button');
    chip.className = 'cat-chip active';
    chip.dataset.id = c.id;
    chip.innerHTML = `<div class="cat-dot" style="background:${c.color}"></div>${c.label}`;
    chip.onclick = () => toggleCat(c.id);
    catRowEl.appendChild(chip);
  });
}

function toggleCat(id) {
  if (activeCatFilter.has(id)) {
    activeCatFilter.delete(id);
  } else {
    activeCatFilter.add(id);
  }
  if (activeCatFilter.size === 0) {
    activeCatFilter = new Set(CATS.map(c => c.id));
  }
  syncCatChips();
  render();
}

function toggleAllCats() {
  activeCatFilter = new Set(CATS.map(c => c.id));
  syncCatChips();
  render();
}

function syncCatChips() {
  const allActive = activeCatFilter.size === CATS.length;
  document.getElementById('catAllBtn').classList.toggle('active', allActive);
  document.querySelectorAll('.cat-chip[data-id]').forEach(chip => {
    chip.classList.toggle('active', activeCatFilter.has(chip.dataset.id));
  });
}

// ── CATEGORY DROPDOWN ──────────────────

let openDdId = null;

function toggleCatDd(id, e) {
  e.stopPropagation();
  if (openDdId && openDdId !== id) {
    document.getElementById('catdd-' + openDdId)?.classList.remove('open');
  }
  const dd = document.getElementById('catdd-' + id);
  if (!dd) return;
  const isOpen = dd.classList.toggle('open');
  openDdId = isOpen ? id : null;
}

function changeCat(taskId, newCat, e) {
  e.stopPropagation();
  for (const ds in state.tasks) {
    const t = state.tasks[ds].find(t => t.id === taskId);
    if (t) { t.cat = newCat; break; }
  }
  document.getElementById('catdd-' + taskId)?.classList.remove('open');
  openDdId = null;
  save();
  render();
}

// ── DRAG & DROP (mouse) ────────────────

let dragId = null;
let dragFromDs = null;

function onDragStart(id, ds, e) {
  dragId = id;
  dragFromDs = ds;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => document.getElementById('pill-' + id)?.classList.add('dragging'), 0);
}

function onDragEnd(id) {
  document.getElementById('pill-' + id)?.classList.remove('dragging');
  document.querySelectorAll('.day-drop-zone').forEach(z => z.classList.remove('drag-over'));
}

function onDropZoneDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function onDropZoneDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDropZoneDrop(targetDs, e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragId || dragFromDs === targetDs) return;
  const srcTasks = state.tasks[dragFromDs] || [];
  const idx = srcTasks.findIndex(t => t.id === dragId);
  if (idx === -1) return;
  const [task] = srcTasks.splice(idx, 1);
  state.tasks[dragFromDs] = srcTasks;
  if (!state.tasks[targetDs]) state.tasks[targetDs] = [];
  state.tasks[targetDs].push(task);
  dragId = null;
  dragFromDs = null;
  save();
  render();
}

// ── DRAG & DROP (touch) ────────────────

let touchTask = null;
let touchFromDs = null;
let ghostEl = null;

function onTouchStart(id, ds, e) {
  // don't drag if touching interactive elements
  const tag = e.target.tagName.toLowerCase();
  const cls = e.target.className || '';
  if (tag === 'button' || tag === 'input' || cls.includes('pill-check') || cls.includes('pill-del') || cls.includes('pill-tag') || cls.includes('cat-option')) return;
  touchTask = id;
  touchFromDs = ds;
  const pill = document.getElementById('pill-' + id);
  if (!pill) return;
  ghostEl = pill.cloneNode(true);
  ghostEl.style.cssText = `position:fixed;opacity:.7;pointer-events:none;z-index:9000;width:${pill.offsetWidth}px;`;
  document.body.appendChild(ghostEl);
  moveTouchGhost(e.touches[0]);
}

function moveTouchGhost(touch) {
  if (!ghostEl) return;
  ghostEl.style.left = (touch.clientX - 40) + 'px';
  ghostEl.style.top  = (touch.clientY - 20) + 'px';
}

function onTouchMove(e) {
  if (!touchTask) return;
  e.preventDefault();
  const touch = e.touches[0];
  moveTouchGhost(touch);
  document.querySelectorAll('.day-drop-zone').forEach(z => z.classList.remove('drag-over'));
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  el?.closest('.day-drop-zone')?.classList.add('drag-over');
}

function onTouchEnd(e) {
  if (!touchTask) return;
  ghostEl?.remove();
  ghostEl = null;
  document.querySelectorAll('.day-drop-zone').forEach(z => z.classList.remove('drag-over'));
  const touch = e.changedTouches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const zone = el?.closest('.day-drop-zone');
  const targetDs = zone?.dataset.ds;
  if (targetDs && targetDs !== touchFromDs) {
    const srcTasks = state.tasks[touchFromDs] || [];
    const idx = srcTasks.findIndex(t => t.id === touchTask);
    if (idx !== -1) {
      const [task] = srcTasks.splice(idx, 1);
      state.tasks[touchFromDs] = srcTasks;
      if (!state.tasks[targetDs]) state.tasks[targetDs] = [];
      state.tasks[targetDs].push(task);
      save();
      render();
    }
  }
  touchTask = null;
  touchFromDs = null;
}

// ── INLINE EDIT ────────────────────────

function startEdit(id, e) {
  e.stopPropagation();
  const textEl = document.querySelector(`#pill-${id} .task-pill-text`);
  if (!textEl) return;
  const task = findTask(id);
  if (!task) return;
  const inp = document.createElement('input');
  inp.className = 'task-pill-input';
  inp.value = task.text;
  textEl.replaceWith(inp);
  inp.focus();
  inp.select();
  const finish = () => {
    const val = inp.value.trim();
    if (val) { task.text = val; save(); }
    render();
  };
  inp.onblur = finish;
  inp.onkeydown = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { inp.value = task.text; inp.blur(); }
    e.stopPropagation();
  };
}

function findTask(id) {
  for (const ds in state.tasks) {
    const t = state.tasks[ds].find(t => t.id === id);
    if (t) return t;
  }
  return null;
}

// ── RENDER ─────────────────────────────

function render() {
  const mon  = getWeekStart(state.weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const tf   = fmt(today());
  const wk   = fmt(mon);

  // week label
  const end = days[6];
  document.getElementById('weekLabel').textContent =
    `${mon.getDate()} ${PT_MONTHS[mon.getMonth()]} — ${end.getDate()} ${PT_MONTHS[end.getMonth()]} ${end.getFullYear()}`;

  // intention
  const intEl = document.getElementById('intentionInput');
  intEl.value = state.intention[wk] || '';
  intEl.oninput = () => { state.intention[wk] = intEl.value; save(); };

  // notes
  const notesEl = document.getElementById('weekNotes');
  notesEl.value = state.notes[wk] || '';
  notesEl.oninput = () => { state.notes[wk] = notesEl.value; save(); };

  // grid
  const grid = document.getElementById('plannerGrid');
  grid.innerHTML = '';
  let total = 0, done = 0;

  days.forEach(d => {
    const ds       = fmt(d);
    const isToday  = ds === tf;
    const isWknd   = d.getDay() === 0 || d.getDay() === 6;
    const allTasks = state.tasks[ds] || [];
    const tasks    = allTasks.filter(t => activeCatFilter.has(t.cat));
    total += tasks.length;
    done  += tasks.filter(t => t.done).length;

    const col = document.createElement('div');
    col.className = `day-col ${isToday ? 'today' : ''} ${isWknd ? 'weekend' : ''}`;
    col.innerHTML = `
      <div class="day-header">
        <div class="day-name">${PT_DAYS[d.getDay()]}</div>
        <div class="day-num">${d.getDate()}</div>
        <div class="day-month">${PT_MONTHS[d.getMonth()]}</div>
        <div class="day-count">${tasks.length > 0 ? `${tasks.filter(t=>t.done).length}/${tasks.length}` : ''}</div>
      </div>
      <div class="day-tasks day-drop-zone" data-ds="${ds}"
           ondragover="onDropZoneDragOver(event)"
           ondragleave="onDropZoneDragLeave(event)"
           ondrop="onDropZoneDrop('${ds}',event)">${tasks.map(t => taskHTML(t, ds)).join('')}</div>
      <button class="add-task-btn" onclick="openInline('${ds}')">
        <span style="font-size:15px;line-height:1">+</span>
      </button>
      <div class="inline-input-wrap" id="inline-${ds}">
        <input class="inline-input" id="input-${ds}" type="text"
          placeholder="nova tarefa…"
          onkeydown="handleKey(event,'${ds}')"
          onblur="closeInline('${ds}')"/>
      </div>`;
    grid.appendChild(col);
  });

  buildMoods(days);
  syncCatChips();

  // footer
  const isFiltered = activeCatFilter.size < CATS.length;
  const hint = isFiltered ? ` · ${activeCatFilter.size} categoria${activeCatFilter.size > 1 ? 's' : ''}` : '';
  document.getElementById('footerStats').textContent =
    total === 0
      ? (isFiltered ? 'nenhuma tarefa nessa categoria' : 'nenhuma tarefa esta semana')
      : `${done} de ${total} concluídas${hint}`;

  save();
}

function taskHTML(t, ds) {
  const cat = CATS.find(c => c.id === t.cat) || CATS[4];
  const catOpts = CATS.map(c => `
    <div class="cat-option ${c.id === t.cat ? 'current' : ''}" onclick="changeCat('${t.id}','${c.id}',event)">
      <div class="cat-option-dot" style="background:${c.color}"></div>${c.label}
    </div>`).join('');

  return `
    <div class="task-pill ${t.done ? 'done' : ''}" id="pill-${t.id}"
         draggable="true"
         ondragstart="onDragStart('${t.id}','${ds}',event)"
         ondragend="onDragEnd('${t.id}')"
         ontouchstart="onTouchStart('${t.id}','${ds}',event)">
      <span class="pill-drag" title="arrastar">⠿</span>
      <button class="pill-check" onclick="toggleTask('${t.id}')">
        <div class="check-dot"></div>
      </button>
      <span class="task-pill-text" ondblclick="startEdit('${t.id}',event)">${esc(t.text)}</span>
      <div class="pill-tag-wrap">
        <div class="pill-tag" style="background:${cat.color}"
             onclick="toggleCatDd('${t.id}',event)" title="categoria"></div>
        <div class="cat-dropdown" id="catdd-${t.id}">${catOpts}</div>
      </div>
      <button class="pill-del" onclick="deleteTask('${t.id}')">×</button>
    </div>`;
}

function buildMoods(days) {
  const grid = document.getElementById('moodGrid');
  grid.innerHTML = '';
  days.forEach(d => {
    const ds  = fmt(d);
    const row = document.createElement('div');
    row.className = 'mood-row';
    row.innerHTML = `
      <div class="mood-day-label">${PT_DAYS[d.getDay()]}</div>
      <div class="mood-emojis">
        ${MOODS.map(m => `<button class="mood-opt ${state.moods[ds] === m ? 'sel' : ''}"
          onclick="setMood('${ds}','${m}')">${m}</button>`).join('')}
      </div>`;
    grid.appendChild(row);
  });
}

// ── ACTIONS ────────────────────────────

function openInline(ds) {
  document.getElementById(`inline-${ds}`).classList.add('open');
  setTimeout(() => document.getElementById(`input-${ds}`)?.focus(), 50);
}

function closeInline(ds) {
  setTimeout(() => document.getElementById(`inline-${ds}`)?.classList.remove('open'), 150);
}

function handleKey(e, ds) {
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    if (!val) return;
    const firstActive = [...activeCatFilter][0] || 'outro';
    if (!state.tasks[ds]) state.tasks[ds] = [];
    state.tasks[ds].push({ id: Date.now().toString(), text: val, cat: firstActive, done: false });
    render();
    setTimeout(() => openInline(ds), 50);
  }
  if (e.key === 'Escape') e.target.blur();
}

function toggleTask(id) {
  for (const ds in state.tasks) {
    const t = state.tasks[ds].find(t => t.id === id);
    if (t) { t.done = !t.done; save(); render(); return; }
  }
}

function deleteTask(id) {
  for (const ds in state.tasks) {
    const idx = state.tasks[ds].findIndex(t => t.id === id);
    if (idx !== -1) { state.tasks[ds].splice(idx, 1); save(); render(); return; }
  }
}

function setMood(ds, emoji) {
  state.moods[ds] = state.moods[ds] === emoji ? null : emoji;
  save();
  render();
}

function changeWeek(dir) {
  state.weekOffset = dir === 0 ? 0 : state.weekOffset + dir;
  render();
}

// ── GLOBAL EVENT LISTENERS ─────────────

document.addEventListener('click', () => {
  if (openDdId) {
    document.getElementById('catdd-' + openDdId)?.classList.remove('open');
    openDdId = null;
  }
});

document.addEventListener('touchmove', onTouchMove, { passive: false });
document.addEventListener('touchend', onTouchEnd);

// ── SEED DATA ──────────────────────────

function seedData() {
  if (Object.keys(state.tasks).length) return;
  const mon  = getWeekStart(0);
  const seed = [
    { o: 0, tasks: [{ id:'s1', text:'reunião de equipe', cat:'trabalho', done:true  }, { id:'s2', text:'comprar flores',       cat:'pessoal', done:false }] },
    { o: 1, tasks: [{ id:'s3', text:'pilates',           cat:'saude',    done:true  }, { id:'s4', text:'ler 30 min',            cat:'pessoal', done:false }] },
    { o: 2, tasks: [{ id:'s5', text:'ligar pra mamãe',   cat:'social',   done:false }] },
    { o: 3, tasks: [{ id:'s6', text:'entregar relatório',cat:'trabalho', done:false }, { id:'s7', text:'skincare night',        cat:'saude',   done:false }] },
  ];
  seed.forEach(s => { state.tasks[fmt(addDays(mon, s.o))] = s.tasks; });
  state.intention[fmt(mon)] = 'ser gentil comigo mesma e com os outros 🌸';
  for (let i = 0; i < 3; i++) {
    state.moods[fmt(addDays(mon, i))] = MOODS[Math.floor(Math.random() * MOODS.length)];
  }
}

// ── INIT ───────────────────────────────

buildCatChips();
seedData();
render();
