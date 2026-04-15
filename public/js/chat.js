import * as network from './network.js';
import { setChatFocused } from './game.js';
import { handlePetCommand } from './pets.js';

let chatMessages, chatInput, chatSend;

export function initChat() {
  chatMessages = document.getElementById('chat-messages');
  chatInput = document.getElementById('chat-input');
  chatSend = document.getElementById('chat-send');

  chatInput.addEventListener('focus', () => setChatFocused(true));
  chatInput.addEventListener('blur', () => setChatFocused(false));

  chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Don't let game handle these keys
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === 'Escape') {
      chatInput.blur();
    }
  });

  chatSend.addEventListener('click', sendMessage);

  // Listen for incoming messages
  network.on('chat:message', (msg) => {
    appendMessage(msg);
  });

  network.on('chat:history', (data) => {
    const { messages } = data;
    // History comes newest-first, reverse to show oldest first
    for (const msg of messages.reverse()) {
      appendMessage(msg, true);
    }
  });

  // System messages (player join/leave)
  network.on('player:join', (data) => {
    appendSystem(`${data.username} joined the office`);
  });

  network.on('player:leave', (data) => {
    appendSystem(`${data.username} left the office`);
  });
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  // Check for pet commands
  if (text.startsWith('/')) {
    // We need the player position — get it from a global or pass it in
    // For now, just emit the command and let pets.js handle it
    const handled = handlePetCommand(text, window._playerX || 0, window._playerY || 0);
    if (handled) {
      chatInput.value = '';
      return;
    }
  }

  network.emit('chat:send', { message: text });
  chatInput.value = '';
}

function appendMessage(msg, prepend = false) {
  const el = document.createElement('div');
  el.className = 'chat-msg';

  const time = document.createElement('span');
  time.className = 'chat-time';
  time.textContent = formatTime(msg.timestamp);

  const name = document.createElement('span');
  name.className = 'chat-name';
  name.textContent = msg.username;
  if (msg.color) name.style.color = msg.color;

  const text = document.createElement('span');
  text.className = 'chat-text';
  text.textContent = msg.message;

  el.appendChild(time);
  el.appendChild(name);
  el.appendChild(text);

  if (prepend) {
    chatMessages.prepend(el);
  } else {
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function appendSystem(text) {
  const el = document.createElement('div');
  el.className = 'chat-msg chat-system';
  el.textContent = text;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
