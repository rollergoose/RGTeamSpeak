import * as network from './network.js';

let youtubeOverlay, youtubeInput, youtubeIframe, youtubeClear, youtubeInfo;
let isInChillZone = false;
let currentVideo = null;
let iframeLoaded = false;
let lastSyncTime = 0;

export function initYouTube() {
  youtubeOverlay = document.getElementById('youtube-overlay');
  youtubeInput = document.getElementById('youtube-input');
  youtubeIframe = document.getElementById('youtube-iframe');
  youtubeClear = document.getElementById('youtube-clear');
  youtubeInfo = document.getElementById('youtube-info');

  youtubeInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') submitUrl();
    if (e.key === 'Escape') youtubeInput.blur();
  });

  youtubeClear.addEventListener('click', () => {
    network.emit('youtube:clear', {});
  });

  network.on('youtube:update', (data) => {
    currentVideo = data;
    updateDisplay();
  });

  network.on('youtube:state', (data) => {
    currentVideo = data;
    updateDisplay();
  });

  network.on('youtube:cleared', () => {
    currentVideo = null;
    iframeLoaded = false;
    updateDisplay();
  });

  // Sync: when another player seeks, jump to their position
  network.on('youtube:seek', ({ time }) => {
    if (!isInChillZone || !currentVideo || !iframeLoaded) return;
    // Reload iframe at the new time
    youtubeIframe.src = `https://www.youtube.com/embed/${currentVideo.videoId}?autoplay=1&start=${Math.floor(time)}`;
  });

  // Detect when local user seeks — poll the iframe for time changes
  // (YouTube embed doesn't expose seek events directly, so we track via server timestamp)
  // When user submits a new URL, everyone syncs. For seeking within a video,
  // add a "Sync" button players can click to broadcast their current position.
  const syncBtn = document.createElement('button');
  syncBtn.textContent = '🔄 Sync All';
  syncBtn.className = 'youtube-sync-btn';
  syncBtn.title = 'Sync everyone to your current position in the video';
  syncBtn.addEventListener('click', () => {
    if (!currentVideo) return;
    // We can't read iframe time cross-origin, so use elapsed time since video started
    const elapsed = (Date.now() - currentVideo.startedAt) / 1000;
    // Ask user for approximate time
    const input = prompt('Enter the current video time (in seconds) to sync everyone:', Math.floor(elapsed));
    if (input === null) return;
    const time = parseInt(input) || 0;
    network.emit('youtube:seek', { time });
    // Update our own startedAt to match
    currentVideo.startedAt = Date.now() - time * 1000;
  });

  // Insert sync button after the clear button
  youtubeClear.parentElement.appendChild(syncBtn);
}

export function enterChillZone() {
  isInChillZone = true;
  youtubeOverlay.classList.add('visible');

  if (currentVideo && currentVideo.videoId) {
    loadVideo();
  }
}

export function leaveChillZone() {
  isInChillZone = false;
  youtubeOverlay.classList.remove('visible');

  if (youtubeIframe) {
    youtubeIframe.src = '';
    iframeLoaded = false;
  }
}

function submitUrl() {
  const url = youtubeInput.value.trim();
  if (!url) return;
  const videoId = parseYouTubeUrl(url);
  if (videoId) {
    network.emit('youtube:set', { url, videoId });
    youtubeInput.value = '';
  }
}

function loadVideo() {
  if (!currentVideo || !currentVideo.videoId) return;

  const elapsed = Math.floor((Date.now() - currentVideo.startedAt) / 1000);
  const start = Math.max(0, elapsed);

  youtubeIframe.src = `https://www.youtube.com/embed/${currentVideo.videoId}?autoplay=1&start=${start}`;
  youtubeIframe.style.display = 'block';
  youtubeInfo.textContent = currentVideo.setBy ? `Playing — set by ${currentVideo.setBy}` : 'Playing';
  youtubeClear.style.display = 'inline-block';
  iframeLoaded = true;
}

function updateDisplay() {
  if (!currentVideo || !currentVideo.videoId) {
    youtubeIframe.src = '';
    youtubeIframe.style.display = 'none';
    youtubeInfo.textContent = 'No video playing. Paste a YouTube URL below!';
    youtubeClear.style.display = 'none';
    iframeLoaded = false;
    return;
  }

  if (isInChillZone) {
    loadVideo();
  } else {
    youtubeInfo.textContent = currentVideo.setBy ? `Playing — set by ${currentVideo.setBy}` : 'Playing';
    youtubeClear.style.display = 'inline-block';
  }
}

function parseYouTubeUrl(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
