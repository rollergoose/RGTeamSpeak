import * as network from './network.js';

let boardOverlay, boardNowCol, boardNextCol, addForm;
let boardData = [];
let isOpen = false;

export function initBoard() {
  boardOverlay = document.getElementById('board-overlay');
  boardNowCol = document.getElementById('board-now');
  boardNextCol = document.getElementById('board-next');

  document.getElementById('board-close').addEventListener('click', closeBoard);
  document.getElementById('board-add-btn').addEventListener('click', showAddForm);

  network.on('board:sync', ({ board }) => {
    boardData = board;
    if (isOpen) renderBoard();
  });
}

export function loadBoard(board) {
  boardData = board || [];
}

export function openBoard() {
  isOpen = true;
  boardOverlay.classList.add('visible');
  network.emit('board:get', {});
  renderBoard();
}

export function closeBoard() {
  isOpen = false;
  boardOverlay.classList.remove('visible');
}

export function isOpen_() { return isOpen; }

function renderBoard() {
  const nowCards = boardData.filter(c => c.column === 'now');
  const nextCards = boardData.filter(c => c.column === 'next');

  boardNowCol.innerHTML = '';
  boardNextCol.innerHTML = '';

  for (const card of nowCards) renderCard(card, boardNowCol);
  for (const card of nextCards) renderCard(card, boardNextCol);

  if (nowCards.length === 0) boardNowCol.innerHTML = '<div class="board-empty">No tasks</div>';
  if (nextCards.length === 0) boardNextCol.innerHTML = '<div class="board-empty">No tasks</div>';
}

function renderCard(card, container) {
  const el = document.createElement('div');
  el.className = 'board-card';
  el.style.borderLeftColor = card.color || '#e94560';
  el.innerHTML = `
    <div class="board-card-header">
      <span class="board-card-assignee" style="color:${card.color || '#e94560'}">${esc(card.assignee)}</span>
      <span class="board-card-duration">${esc(card.duration)}</span>
    </div>
    <div class="board-card-task">${esc(card.task)}</div>
    <div class="board-card-actions">
      <button class="board-card-move" data-id="${card.id}" data-col="${card.column === 'now' ? 'next' : 'now'}">${card.column === 'now' ? 'Move to Next' : 'Move to Now'}</button>
      <button class="board-card-delete" data-id="${card.id}">Remove</button>
    </div>
  `;

  el.querySelector('.board-card-move').addEventListener('click', (e) => {
    const id = e.target.dataset.id;
    const col = e.target.dataset.col;
    network.emit('board:update', { id, column: col });
  });

  el.querySelector('.board-card-delete').addEventListener('click', (e) => {
    network.emit('board:remove', { id: e.target.dataset.id });
  });

  container.appendChild(el);
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
