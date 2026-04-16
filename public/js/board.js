import * as network from './network.js';

let boardOverlay, boardNowCol, boardNextCol, boardDoneCol;
let xpTotalEl, xpYouLvlEl, xpYouCountEl, xpBarFillEl;
let boardData = [];
let isOpen = false;
let mySelfStats = { tasksCompleted: 0 };
let mySelfLevels = { achiever: 0 };

export function initBoard() {
  boardOverlay = document.getElementById('board-overlay');
  boardNowCol = document.getElementById('board-now');
  boardNextCol = document.getElementById('board-next');
  boardDoneCol = document.getElementById('board-done');
  xpTotalEl = document.getElementById('board-xp-total');
  xpYouLvlEl = document.getElementById('board-xp-you-lvl');
  xpYouCountEl = document.getElementById('board-xp-you-count');
  xpBarFillEl = document.getElementById('board-xp-bar-fill');

  document.getElementById('board-close').addEventListener('click', closeBoard);
  document.getElementById('board-add-btn').addEventListener('click', showAddForm);

  network.on('board:sync', ({ board }) => {
    boardData = board;
    if (isOpen) renderBoard();
    updateXpStrip();
  });

  // Set up drop zones on each column
  setupDropZone(boardNowCol, 'now');
  setupDropZone(boardNextCol, 'next');
  setupDropZone(boardDoneCol, 'done');

  // React to task completion broadcasts — animate the relevant card if the board is open
  network.on('celebrate:task-done', ({ completer, color }) => {
    if (!isOpen) return;
    // Find the just-completed card (latest completedBy match) and pulse it
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

// Called by main.js whenever the local player's stats/levels change, so the XP strip reflects them.
export function setLocalStats(stats, levels) {
  mySelfStats = stats || mySelfStats;
  mySelfLevels = levels || mySelfLevels;
  updateXpStrip();
}

export function openBoard() {
  isOpen = true;
  boardOverlay.classList.add('visible');
  network.emit('board:get', {});
  network.emit('stats:get', {});
  renderBoard();
  updateXpStrip();
}

export function closeBoard() {
  isOpen = false;
  boardOverlay.classList.remove('visible');
}

export function isOpen_() { return isOpen; }

function renderBoard() {
  const nowCards = boardData.filter(c => c.column === 'now');
  const nextCards = boardData.filter(c => c.column === 'next');
  const doneCards = boardData.filter(c => c.column === 'done');

  boardNowCol.innerHTML = '';
  boardNextCol.innerHTML = '';
  boardDoneCol.innerHTML = '';

  for (const card of nowCards) renderCard(card, boardNowCol);
  for (const card of nextCards) renderCard(card, boardNextCol);
  for (const card of doneCards) renderCard(card, boardDoneCol);

  if (nowCards.length === 0) boardNowCol.innerHTML = '<div class="board-empty">No tasks in progress</div>';
  if (nextCards.length === 0) boardNextCol.innerHTML = '<div class="board-empty">Nothing queued</div>';
  if (doneCards.length === 0) boardDoneCol.innerHTML = '<div class="board-empty">Complete a task to celebrate 🎉</div>';
}

function renderCard(card, container) {
  const el = document.createElement('div');
  el.className = 'board-card';
  el.dataset.id = card.id;
  el.dataset.col = card.column;
  el.draggable = true;
  el.style.borderLeftColor = card.color || '#e94560';

  const footerBits = [];
  if (card.column === 'next') {
    footerBits.push(`<button class="board-card-move" data-action="start" data-id="${card.id}">▶ Start</button>`);
    footerBits.push(`<button class="board-card-delete" data-id="${card.id}">Remove</button>`);
  } else if (card.column === 'now') {
    footerBits.push(`<button class="board-card-move board-card-complete" data-action="complete" data-id="${card.id}">✅ Complete</button>`);
    footerBits.push(`<button class="board-card-move" data-action="queue" data-id="${card.id}">⏭ Back to Next</button>`);
    footerBits.push(`<button class="board-card-delete" data-id="${card.id}">Remove</button>`);
  } else if (card.column === 'done') {
    footerBits.push(`<button class="board-card-move" data-action="restore" data-id="${card.id}">↩ Restore</button>`);
    footerBits.push(`<button class="board-card-delete" data-id="${card.id}">✕</button>`);
  }

  const doneMeta = card.column === 'done' && card.completedBy
    ? `<div class="board-card-completed">Done by ${esc(card.completedBy)}</div>`
    : '';

  el.innerHTML = `
    <div class="board-card-header">
      <span class="board-card-assignee" style="color:${card.color || '#e94560'}">${esc(card.assignee)}</span>
      <span class="board-card-duration">${esc(card.duration)}</span>
    </div>
    <div class="board-card-task">${esc(card.task)}</div>
    ${doneMeta}
    <div class="board-card-actions">
      ${footerBits.join('')}
    </div>
  `;

  // Drag source
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', card.id);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('board-card-dragging');
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('board-card-dragging');
  });

  // Action buttons
  el.querySelectorAll('.board-card-move').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      const id = e.target.dataset.id;
      moveCard(id, action);
    });
  });
  el.querySelector('.board-card-delete').addEventListener('click', (e) => {
    network.emit('board:remove', { id: e.target.dataset.id });
  });

  container.appendChild(el);
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
    // Only remove if we actually left the zone (not a child)
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

function updateXpStrip() {
  if (!xpTotalEl) return;
  const doneCount = boardData.filter(c => c.column === 'done').length;
  xpTotalEl.textContent = doneCount;
  const tasksCompleted = (mySelfStats && mySelfStats.tasksCompleted) || 0;
  const level = (mySelfLevels && mySelfLevels.achiever) || 0;
  xpYouLvlEl.textContent = level;
  xpYouCountEl.textContent = tasksCompleted;
  // Achiever perLevel = 5 tasks (see LEVEL_CATEGORIES in constants.js); cap level 10
  const perLevel = 5;
  const intoLevel = tasksCompleted - level * perLevel;
  const pct = level >= 10 ? 100 : Math.max(0, Math.min(100, (intoLevel / perLevel) * 100));
  xpBarFillEl.style.width = pct + '%';
}

function showAddForm() {
  const existing = document.getElementById('board-add-form');
  if (existing) { existing.remove(); return; }

  const form = document.createElement('div');
  form.id = 'board-add-form';
  form.className = 'board-add-form';
  form.innerHTML = `
    <input type="text" id="board-f-assignee" placeholder="Assignee" maxlength="30">
    <input type="text" id="board-f-task" placeholder="Task description" maxlength="200">
    <input type="text" id="board-f-duration" placeholder="Duration (e.g. 2h)" maxlength="30">
    <div class="board-form-row">
      <select id="board-f-col">
        <option value="now">Doing Now</option>
        <option value="next">Up Next</option>
      </select>
      <button id="board-f-submit">Add Card</button>
    </div>
  `;

  document.querySelector('.board-content').insertBefore(form, document.querySelector('.board-columns'));

  // Stop key propagation so game doesn't move
  form.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('keydown', e => e.stopPropagation());
    el.addEventListener('focus', () => {
      const { setInputFocused } = require_game();
      if (setInputFocused) setInputFocused(true);
    });
    el.addEventListener('blur', () => {
      const { setInputFocused } = require_game();
      if (setInputFocused) setInputFocused(false);
    });
  });

  document.getElementById('board-f-submit').addEventListener('click', () => {
    const assignee = document.getElementById('board-f-assignee').value.trim();
    const task = document.getElementById('board-f-task').value.trim();
    const duration = document.getElementById('board-f-duration').value.trim();
    const column = document.getElementById('board-f-col').value;
    if (!assignee || !task) return;
    network.emit('board:add', { assignee, task, duration, column });
    form.remove();
  });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// Lazy import to avoid circular
let _setInputFocused = null;
function require_game() {
  return { setInputFocused: _setInputFocused };
}
import('./game.js').then(m => { _setInputFocused = m.setInputFocused; });
