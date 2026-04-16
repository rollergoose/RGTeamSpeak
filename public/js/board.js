import * as network from './network.js';

// === DOM refs (populated in initBoard) ===
let boardOverlay;
let boardNowCol, boardNextCol, boardDoneCol;
let landingEl, landingGridEl, kanbanEl, kanbanTitleEl, backBtnEl, addBtnEl, headerTitleEl;
let xpTotalEl, xpYouLvlEl, xpYouCountEl, xpBarFillEl;

// === State ===
let boardData = [];
let isOpen = false;
// `selectedAssignee === null` → landing page. Otherwise: string username or 'Unassigned'.
let selectedAssignee = null;
// The currently-expanded card's id (only one at a time). We preserve its DOM across board:sync
// re-renders so the user's edits aren't clobbered mid-typing.
let expandedCardId = null;
let mySelfStats = { tasksCompleted: 0 };
let mySelfLevels = { achiever: 0 };

// === Lifecycle ===
export function initBoard() {
  boardOverlay   = document.getElementById('board-overlay');
  boardNowCol    = document.getElementById('board-now');
  boardNextCol   = document.getElementById('board-next');
  boardDoneCol   = document.getElementById('board-done');
  landingEl      = document.getElementById('board-landing');
  landingGridEl  = document.getElementById('board-landing-grid');
  kanbanEl       = document.getElementById('board-kanban');
  kanbanTitleEl  = document.getElementById('board-kanban-title');
  backBtnEl      = document.getElementById('board-back-btn');
  addBtnEl       = document.getElementById('board-add-btn');
  headerTitleEl  = document.getElementById('board-header-title');
  xpTotalEl      = document.getElementById('board-xp-total');
  xpYouLvlEl     = document.getElementById('board-xp-you-lvl');
  xpYouCountEl   = document.getElementById('board-xp-you-count');
  xpBarFillEl    = document.getElementById('board-xp-bar-fill');

  document.getElementById('board-close').addEventListener('click', closeBoard);
  addBtnEl.addEventListener('click', showAddForm);
  backBtnEl.addEventListener('click', () => {
    selectedAssignee = null;
    expandedCardId = null;
    renderBoard();
  });

  network.on('board:sync', ({ board }) => {
    boardData = board;
    if (isOpen) renderBoard();
    updateXpStrip();
  });

  // Drop zones are permanent — the column containers don't get destroyed.
  setupDropZone(boardNowCol, 'now');
  setupDropZone(boardNextCol, 'next');
  setupDropZone(boardDoneCol, 'done');

  // React to completions — pulse the newly-completed card if visible.
  network.on('celebrate:task-done', ({ completer }) => {
    if (!isOpen) return;
    const card = [...boardData].reverse().find(c => c.column === 'done' && c.completedBy === completer);
    if (!card) return;
    const el = document.querySelector(`.board-card[data-id="${card.id}"]`);
    if (!el) return;
    el.classList.add('card-completing');
    el.addEventListener('animationend', () => el.classList.remove('card-completing'), { once: true });
  });
}

export function loadBoard(board) {
  boardData = board || [];
  updateXpStrip();
}

export function setLocalStats(stats, levels) {
  mySelfStats = stats || mySelfStats;
  mySelfLevels = levels || mySelfLevels;
  updateXpStrip();
}

export function openBoard() {
  isOpen = true;
  boardOverlay.classList.add('visible');
  selectedAssignee = null;
  expandedCardId = null;
  network.emit('board:get', {});
  network.emit('stats:get', {});
  renderBoard();
  updateXpStrip();
}

export function closeBoard() {
  isOpen = false;
  boardOverlay.classList.remove('visible');
  // Remove any open add-card form so it doesn't leak across sessions.
  const form = document.getElementById('board-add-form');
  if (form) form.remove();
}

export function isOpen_() { return isOpen; }

// === Rendering ===
function renderBoard() {
  if (selectedAssignee === null) {
    landingEl.style.display = 'flex';
    kanbanEl.style.display = 'none';
    addBtnEl.style.display = 'none';
    headerTitleEl.textContent = '📋 Planning Board';
    renderLanding();
  } else {
    landingEl.style.display = 'none';
    kanbanEl.style.display = 'flex';
    addBtnEl.style.display = '';
    kanbanTitleEl.textContent = selectedAssignee;
    headerTitleEl.textContent = `📋 ${selectedAssignee}'s Planning`;
    renderKanban();
  }
}

function renderLanding() {
  // Group cards by assignee (trimmed, falling back to 'Unassigned').
  const counts = new Map();
  const samples = new Map(); // username → first card's color
  for (const c of boardData) {
    const who = (c.assignee || '').trim() || 'Unassigned';
    if (!counts.has(who)) counts.set(who, { total: 0, now: 0, next: 0, done: 0 });
    const bucket = counts.get(who);
    bucket.total++;
    bucket[c.column] = (bucket[c.column] || 0) + 1;
    if (!samples.has(who)) samples.set(who, c.color || '#e94560');
  }

  // Sorted list: named assignees alphabetically, then Unassigned last.
  const names = [...counts.keys()].filter(n => n !== 'Unassigned').sort((a, b) => a.localeCompare(b));
  if (counts.has('Unassigned')) names.push('Unassigned');

  landingGridEl.innerHTML = '';
  if (names.length === 0) {
    landingGridEl.innerHTML = '<div class="board-landing-empty">No planning boards yet. Click + Add Card inside a board to get started.</div>';
  }
  for (const name of names) {
    const { total, now = 0, next = 0, done = 0 } = counts.get(name);
    const color = samples.get(name);
    const btn = document.createElement('button');
    btn.className = 'board-landing-card';
    btn.style.borderLeftColor = color;
    btn.innerHTML = `
      <div class="bl-name">${esc(name)}</div>
      <div class="bl-stats">
        <span class="bl-pill bl-pill-now">🔵 ${now}</span>
        <span class="bl-pill bl-pill-next">⏭️ ${next}</span>
        <span class="bl-pill bl-pill-done">✅ ${done}</span>
      </div>
      <div class="bl-total">${total} task${total === 1 ? '' : 's'}</div>
    `;
    btn.addEventListener('click', () => {
      selectedAssignee = name;
      expandedCardId = null;
      renderBoard();
    });
    landingGridEl.appendChild(btn);
  }

  // Also offer a "New planning" button so you can create the first card for a new person.
  const newBtn = document.createElement('button');
  newBtn.className = 'board-landing-card board-landing-new';
  newBtn.innerHTML = `<div class="bl-name">+ New task</div><div class="bl-stats bl-muted">Opens the add form</div>`;
  newBtn.addEventListener('click', () => {
    // Jump straight to an assignee view of either the current player (if any) or Unassigned,
    // then pop the add form open.
    selectedAssignee = 'Unassigned';
    expandedCardId = null;
    renderBoard();
    showAddForm();
  });
  landingGridEl.appendChild(newBtn);
}

function renderKanban() {
  // Filter by currently-selected assignee (with 'Unassigned' matching empty strings).
  const scope = boardData.filter(c => {
    const who = (c.assignee || '').trim() || 'Unassigned';
    return who === selectedAssignee;
  });

  const nowCards = scope.filter(c => c.column === 'now');
  const nextCards = scope.filter(c => c.column === 'next').sort(sortByStartAscending);
  const doneCards = scope.filter(c => c.column === 'done');

  renderColumn(boardNowCol, nowCards, 'No tasks in progress');
  renderColumn(boardNextCol, nextCards, 'Nothing queued');
  renderColumn(boardDoneCol, doneCards, 'Complete a task to celebrate 🎉');
}

function renderColumn(container, cards, emptyText) {
  // Preserve the currently-expanded card's DOM (if present in this column) so edits in progress
  // don't get wiped out by incoming board:sync redraws.
  const preservedEl = expandedCardId
    ? container.querySelector(`.board-card[data-id="${expandedCardId}"].expanded`)
    : null;
  container.innerHTML = '';
  if (cards.length === 0) {
    container.innerHTML = `<div class="board-empty">${esc(emptyText)}</div>`;
    return;
  }
  for (const card of cards) {
    if (preservedEl && card.id === expandedCardId) {
      container.appendChild(preservedEl);
      continue;
    }
    container.appendChild(buildCardEl(card));
  }
}

function buildCardEl(card) {
  const el = document.createElement('div');
  el.className = 'board-card';
  el.dataset.id = card.id;
  el.dataset.col = card.column;
  el.draggable = true;
  el.style.borderLeftColor = card.color || '#e94560';

  attachDragHandlers(el, card);
  renderCollapsed(el, card);
  return el;
}

function renderCollapsed(el, card) {
  el.classList.remove('expanded');
  el.classList.add('collapsed');
  // Collapsed cards drag → kanban columns.
  el.draggable = true;

  const progress = typeof card.progress === 'number' ? card.progress : 0;
  const daysInfo = card.column === 'next' ? daysUntil(card.startDate) : null;
  const daysBadge = daysInfo
    ? `<span class="board-card-days ${daysInfo.overdue ? 'overdue' : ''}">${esc(daysInfo.label)}</span>`
    : '';
  const durationBadge = card.duration
    ? `<span class="board-card-duration">${esc(card.duration)}</span>`
    : '';
  // Column-contextual quick-action icon so moving a card is a single click (no expand).
  const quickBtn = quickActionHtml(card);

  el.innerHTML = `
    <div class="board-card-collapsed-row">
      <div class="board-card-task-line">${esc(card.task)}</div>
      <div class="board-card-badges">${daysBadge}${durationBadge}${quickBtn}</div>
    </div>
    <div class="board-card-progress-mini"><div class="board-card-progress-fill" data-complete="${progress >= 100 ? 1 : 0}" style="width:${progress}%;--p:${(progress / 100).toFixed(2)}"></div></div>
  `;

  // Wire up the quick-action button: click moves the card without expanding.
  el.querySelector('.board-card-quick')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const action = e.currentTarget.dataset.action;
    moveCard(card.id, action);
  });

  // Click anywhere else on the card toggles expansion.
  el.addEventListener('click', (e) => {
    if (e.target.closest('button,input,textarea,select,a')) return;
    expandedCardId = card.id;
    renderExpanded(el, card);
  });
}

// Returns the HTML for a small icon button that performs the most useful move from this column.
function quickActionHtml(card) {
  if (card.column === 'next') {
    return `<button class="board-card-quick" data-action="start" title="Start — move to Doing Now">▶</button>`;
  }
  if (card.column === 'now') {
    return `<button class="board-card-quick board-card-quick-done" data-action="complete" title="Complete — mark as done">✓</button>`;
  }
  if (card.column === 'done') {
    return `<button class="board-card-quick" data-action="restore" title="Restore — move back to Doing Now">↩</button>`;
  }
  return '';
}

function renderExpanded(el, card) {
  el.classList.remove('collapsed');
  el.classList.add('expanded');
  // Expanded cards are edit mode — dragging would hijack slider/text-field interaction.
  el.draggable = false;

  const progress = typeof card.progress === 'number' ? card.progress : 0;
  const daysInfo = card.column === 'next' ? daysUntil(card.startDate) : null;

  const actionBtns = actionButtonsHtml(card);

  el.innerHTML = `
    <div class="board-card-header">
      <input type="text" class="bc-field bc-task" data-field="task" value="${esc(card.task)}" maxlength="200" placeholder="Task title">
      <button class="bc-collapse" title="Collapse">▴</button>
    </div>
    <div class="bc-grid">
      <label class="bc-label">Assignee</label>
      <input type="text" class="bc-field" data-field="assignee" value="${esc(card.assignee || '')}" maxlength="30" placeholder="Assignee">

      <label class="bc-label">Start date</label>
      <input type="date" class="bc-field" data-field="startDate" value="${esc(card.startDate || '')}">

      <label class="bc-label">Done by</label>
      <input type="date" class="bc-field" data-field="endDate" value="${esc(card.endDate || '')}">

      <label class="bc-label">Estimated time</label>
      <input type="text" class="bc-field" data-field="duration" value="${esc(card.duration || '')}" maxlength="30" placeholder="e.g. 2h, 3 days">

      <label class="bc-label">Description</label>
      <textarea class="bc-field bc-textarea" data-field="description" maxlength="2000" placeholder="Notes, context, sub-steps…">${esc(card.description || '')}</textarea>

      <label class="bc-label">Working folder</label>
      <div class="bc-link-row">
        <input type="url" class="bc-field" data-field="link" value="${esc(card.link || '')}" maxlength="500" placeholder="https://…">
        <button class="bc-open-btn" type="button">Open</button>
      </div>
    </div>
    <div class="bc-progress-row">
      <label class="bc-label">Progress</label>
      <input type="range" class="bc-slider" min="0" max="100" step="1" value="${progress}">
      <span class="bc-progress-value">${progress}%</span>
    </div>
    ${daysInfo ? `<div class="bc-days-line ${daysInfo.overdue ? 'overdue' : ''}">${esc(daysInfo.label)}</div>` : ''}
    <div class="board-card-actions">${actionBtns}</div>
  `;

  // Stop the game from capturing keys while editing.
  el.querySelectorAll('input, textarea').forEach(f => {
    f.addEventListener('keydown', e => e.stopPropagation());
    f.addEventListener('focus', () => setGameInputFocused(true));
    f.addEventListener('blur', () => setGameInputFocused(false));
  });

  // Save text fields on change (blur or Enter). Dates fire change on pick.
  el.querySelectorAll('.bc-field[data-field]').forEach(f => {
    f.addEventListener('change', () => {
      const field = f.dataset.field;
      const value = f.value;
      network.emit('board:update', { id: card.id, [field]: value });
    });
  });

  // Slider: update the display live (filled track + number + bump), but only emit on release.
  const slider = el.querySelector('.bc-slider');
  const valueEl = el.querySelector('.bc-progress-value');
  const paintSlider = (v) => {
    slider.style.setProperty('--progress', v + '%');
    const complete = v >= 100 ? '1' : '0';
    slider.setAttribute('data-complete', complete);
    valueEl.setAttribute('data-complete', complete);
    valueEl.textContent = v + '%';
  };
  paintSlider(progress);
  let lastBumpVal = progress;
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    paintSlider(v);
    // Give the number a little spring every whole integer change — cheap, feels juicy.
    if (v !== lastBumpVal) {
      lastBumpVal = v;
      valueEl.classList.remove('bump');
      void valueEl.offsetWidth; // restart animation
      valueEl.classList.add('bump');
    }
  });
  valueEl.addEventListener('transitionend', () => valueEl.classList.remove('bump'));
  slider.addEventListener('change', () => {
    const v = Number(slider.value);
    network.emit('board:update', { id: card.id, progress: v });
    // If they just hit 100%, a tiny confetti burst right from the slider — celebratory finish.
    if (v >= 100) {
      import('./main.js').then(m => {
        if (typeof m.spawnConfetti === 'function') {
          const rect = slider.getBoundingClientRect();
          // Temp container positioned at the slider so pieces rain from there
          const host = document.createElement('div');
          host.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top - 10}px;width:${rect.width}px;height:0;pointer-events:none;z-index:1200;`;
          document.body.appendChild(host);
          m.spawnConfetti(host, 18, ['#2ecc71', '#58d68d', '#f1c40f']);
          setTimeout(() => host.remove(), 2500);
        }
      }).catch(() => {});
    }
  });

  // Collapse button
  el.querySelector('.bc-collapse').addEventListener('click', () => {
    expandedCardId = null;
    renderCollapsed(el, boardData.find(c => c.id === card.id) || card);
  });

  // Open link in a new tab.
  el.querySelector('.bc-open-btn').addEventListener('click', () => {
    const url = (card.link || el.querySelector('[data-field="link"]').value || '').trim();
    if (!url) return;
    // Safety: only follow http(s) URLs
    if (!/^https?:\/\//i.test(url)) { alert('Link must start with http:// or https://'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  // Action buttons (Start / Complete / Restore / Remove) — same logic as before.
  el.querySelectorAll('.board-card-move').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      moveCard(card.id, action);
    });
  });
  el.querySelector('.board-card-delete')?.addEventListener('click', () => {
    network.emit('board:remove', { id: card.id });
  });
}

function actionButtonsHtml(card) {
  if (card.column === 'next') {
    return `
      <button class="board-card-move" data-action="start">▶ Start</button>
      <button class="board-card-delete">Remove</button>
    `;
  }
  if (card.column === 'now') {
    return `
      <button class="board-card-move board-card-complete" data-action="complete">✅ Complete</button>
      <button class="board-card-move" data-action="queue">⏭ Back to Next</button>
      <button class="board-card-delete">Remove</button>
    `;
  }
  // done
  return `
    <button class="board-card-move" data-action="restore">↩ Restore</button>
    <button class="board-card-delete">✕</button>
  `;
}

function attachDragHandlers(el, card) {
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', card.id);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('board-card-dragging');
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('board-card-dragging');
  });
}

function moveCard(id, action) {
  if (action === 'complete') {
    network.emit('board:complete', { id });
  } else if (action === 'start') {
    network.emit('board:update', { id, column: 'now' });
  } else if (action === 'queue') {
    network.emit('board:update', { id, column: 'next' });
  } else if (action === 'restore') {
    network.emit('board:update', { id, column: 'now' });
  }
}

function setupDropZone(el, targetCol) {
  if (!el) return;
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('board-drop-target');
  });
  el.addEventListener('dragleave', (e) => {
    if (!el.contains(e.relatedTarget)) el.classList.remove('board-drop-target');
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('board-drop-target');
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const card = boardData.find(c => c.id === id);
    if (!card || card.column === targetCol) return;
    if (targetCol === 'done') {
      network.emit('board:complete', { id });
    } else {
      network.emit('board:update', { id, column: targetCol });
    }
  });
}

// === Sorting / time helpers ===
// Sort helper: cards with a start date first, sorted by days-until-start ascending
// (overdue tasks come before imminent ones — since their "days until" is negative).
// Cards without a start date sink to the bottom.
function sortByStartAscending(a, b) {
  const aHas = !!a.startDate;
  const bHas = !!b.startDate;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  if (!aHas && !bHas) return 0;
  const ta = Date.parse(a.startDate + 'T00:00:00');
  const tb = Date.parse(b.startDate + 'T00:00:00');
  return ta - tb;
}

// Returns { label, overdue } or null if no date. Format: "Starts in 3 days" / "Starts today" / "-2 days".
function daysUntil(isoDate) {
  if (!isoDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - today.getTime();
  const days = Math.round(diffMs / 86400000);
  if (days === 0) return { label: 'Starts today', overdue: false };
  if (days > 0) return { label: `Starts in ${days} day${days === 1 ? '' : 's'}`, overdue: false };
  // Overdue: show with leading '-' per user request.
  return { label: `-${-days} day${days === -1 ? '' : 's'}`, overdue: true };
}

// === XP strip (unchanged behavior) ===
function updateXpStrip() {
  if (!xpTotalEl) return;
  const doneCount = boardData.filter(c => c.column === 'done').length;
  xpTotalEl.textContent = doneCount;
  const tasksCompleted = (mySelfStats && mySelfStats.tasksCompleted) || 0;
  const level = (mySelfLevels && mySelfLevels.achiever) || 0;
  xpYouLvlEl.textContent = level;
  xpYouCountEl.textContent = tasksCompleted;
  const perLevel = 5;
  const intoLevel = tasksCompleted - level * perLevel;
  const pct = level >= 10 ? 100 : Math.max(0, Math.min(100, (intoLevel / perLevel) * 100));
  xpBarFillEl.style.width = pct + '%';
}

// === Add-card form ===
function showAddForm() {
  const existing = document.getElementById('board-add-form');
  if (existing) { existing.remove(); return; }

  const defaultAssignee = selectedAssignee && selectedAssignee !== 'Unassigned' ? selectedAssignee : '';

  const form = document.createElement('div');
  form.id = 'board-add-form';
  form.className = 'board-add-form';
  form.innerHTML = `
    <input type="text" id="board-f-assignee" placeholder="Assignee" maxlength="30" value="${esc(defaultAssignee)}">
    <input type="text" id="board-f-task" placeholder="Task title" maxlength="200">
    <input type="text" id="board-f-duration" placeholder="Estimated time (e.g. 2h)" maxlength="30">
    <div class="board-form-row">
      <input type="date" id="board-f-start" title="Start date">
      <input type="date" id="board-f-end" title="Done by">
    </div>
    <input type="url" id="board-f-link" placeholder="Working folder link (optional)" maxlength="500">
    <textarea id="board-f-desc" placeholder="Description (optional)" maxlength="2000" rows="2"></textarea>
    <div class="board-form-row">
      <select id="board-f-col">
        <option value="next">Up Next</option>
        <option value="now">Doing Now</option>
      </select>
      <button id="board-f-submit">Add Card</button>
    </div>
  `;

  kanbanEl.insertBefore(form, kanbanEl.querySelector('.board-columns'));

  form.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('keydown', e => e.stopPropagation());
    el.addEventListener('focus', () => setGameInputFocused(true));
    el.addEventListener('blur', () => setGameInputFocused(false));
  });

  document.getElementById('board-f-submit').addEventListener('click', () => {
    const assignee = document.getElementById('board-f-assignee').value.trim();
    const task = document.getElementById('board-f-task').value.trim();
    const duration = document.getElementById('board-f-duration').value.trim();
    const column = document.getElementById('board-f-col').value;
    const startDate = document.getElementById('board-f-start').value;
    const endDate = document.getElementById('board-f-end').value;
    const link = document.getElementById('board-f-link').value.trim();
    const description = document.getElementById('board-f-desc').value.trim();
    if (!task) return;
    network.emit('board:add', { assignee, task, duration, column, startDate, endDate, link, description });
    form.remove();
  });
}

// === Misc helpers ===
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

// Lazy link to game.js to avoid circular import
let _setInputFocused = null;
function setGameInputFocused(v) { if (_setInputFocused) _setInputFocused(v); }
import('./game.js').then(m => { _setInputFocused = m.setInputFocused; });
