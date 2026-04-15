import * as network from './network.js';
import { setInputFocused } from './game.js';

let youtubeOverlay, youtubeInput, youtubeClear, youtubeInfo;
let playerDiv, controlsDiv;
let isInChillZone = false;
let currentVideo = null;
let ytPlayer = null;
let apiReady = false;
let timeDisplay = null;
let isPaused = false;

// Load YouTube IFrame API
function loadYTApi() {
  if (window.YT && window.YT.Player) { apiReady = true; return; }
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => { apiReady = true; };
}

export function initYouTube() {
  loadYTApi();

  youtubeOverlay = document.getElementById('youtube-overlay');
  youtubeInput = document.getElementById('youtube-input');
  youtubeClear = document.getElementById('youtube-clear');
  youtubeInfo = document.getElementById('youtube-info');
  playerDiv = document.getElementById('youtube-iframe');
  controlsDiv = document.getElementById('youtube-controls');
  timeDisplay = document.getElementById('yt-time');

  youtubeInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') submitUrl();
    if (e.key === 'Escape') youtubeInput.blur();
  });
  youtubeInput.addEventListener('focus', () => setInputFocused(true));
  youtubeInput.addEventListener('blur', () => setInputFocused(false));

  youtubeClear.addEventListener('click', () => {
    network.emit('youtube:clear', {});
  });

  // Controls
  document.getElementById('yt-pause').addEventListener('click', () => {
    if (ytPlayer && ytPlayer.pauseVideo) {
      ytPlayer.pauseVideo();
      isPaused = true;
      const time = ytPlayer.getCurrentTime();
      network.emit('youtube:pause', {});
    }
  });

  document.getElementById('yt-play').addEventListener('click', () => {
    if (ytPlayer && ytPlayer.playVideo) {
      ytPlayer.playVideo();
      isPaused = false;
      const time = ytPlayer.getCurrentTime();
      network.emit('youtube:play', { time });
    }
  });

  document.getElementById('yt-back').addEventListener('click', () => {
    if (ytPlayer && ytPlayer.seekTo) {
      const newTime = Math.max(0, ytPlayer.getCurrentTime() - 10);
      ytPlayer.seekTo(newTime, true);
      network.emit('youtube:seek', { time: newTime });
    }
  });

  document.getElementById('yt-fwd').addEventListener('click', () => {
    if (ytPlayer && ytPlayer.seekTo) {
      const newTime = ytPlayer.getCurrentTime() + 10;
      ytPlayer.seekTo(newTime, true);
      network.emit('youtube:seek', { time: newTime });
    }
  });

  // Time display update
  setInterval(() => {
    if (ytPlayer && ytPlayer.getCurrentTime && timeDisplay && !isPaused) {
      const t = Math.floor(ytPlayer.getCurrentTime());
      const m = Math.floor(t / 60);
      const s = t % 60;
      timeDisplay.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }
  }, 500);

  // Server events
  network.on('youtube:update', (data) => {
    currentVideo = data;
    if (isInChillZone) loadVideo();
    youtubeInfo.textContent = data.setBy ? `Playing — set by ${data.setBy}` : 'Playing';
    youtubeClear.style.display = 'inline-block';
    controlsDiv.style.display = 'flex';
  });

  network.on('youtube:cleared', () => {
    currentVideo = null;
    destroyPlayer();
    youtubeInfo.textContent = 'No video playing. Paste a YouTube URL below!';
    youtubeClear.style.display = 'none';
    controlsDiv.style.display = 'none';
  });

  network.on('youtube:pause', () => {
    if (ytPlayer && ytPlayer.pauseVideo) {
      ytPlayer.pauseVideo();
      isPaused = true;
    }
  });

  network.on('youtube:play', ({ time }) => {
    if (ytPlayer && ytPlayer.seekTo) {
      ytPlayer.seekTo(time, true);
      ytPlayer.playVideo();
      isPaused = false;
    }
  });

  network.on('youtube:seek', ({ time }) => {
    if (ytPlayer && ytPlayer.seekTo) {
      ytPlayer.seekTo(time, true);
    }
  });
}

export function enterChillZone() {
  isInChillZone = true;
  youtubeOverlay.classList.add('visible');
  if (currentVideo) loadVideo();
}

export function leaveChillZone() {
  isInChillZone = false;
  youtubeOverlay.classList.remove('visible');
  destroyPlayer();
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
  if (!apiReady) {
    // Retry in 500ms
    setTimeout(loadVideo, 500);
    return;
  }

  const elapsed = Math.floor((Date.now() - currentVideo.startedAt) / 1000);
  const start = Math.max(0, elapsed);

  // Destroy existing player
  destroyPlayer();

  // The iframe element must exist as a div for YT.Player to replace
  playerDiv.style.display = 'block';
  playerDiv.removeAttribute('src');
  playerDiv.id = 'youtube-iframe';

  // YT.Player needs a div, not an iframe — create a fresh div
  const container = playerDiv.parentElement;
  const newDiv = document.createElement('div');
  newDiv.id = 'yt-player-target';
  newDiv.style.width = '100%';
  newDiv.style.height = '225px';
  container.insertBefore(newDiv, controlsDiv);
  playerDiv.style.display = 'none';

  ytPlayer = new YT.Player('yt-player-target', {
    videoId: currentVideo.videoId,
    playerVars: {
      autoplay: 1,
      start: start,
      controls: 0, // hide YT controls, we have our own
      modestbranding: 1,
      rel: 0,
    },
    events: {
      onReady: () => {
        isPaused = false;
        controlsDiv.style.display = 'flex';
      },
    },
  });
}

function destroyPlayer() {
  if (ytPlayer && ytPlayer.destroy) {
    try { ytPlayer.destroy(); } catch {}
    ytPlayer = null;
  }
  // Remove the target div if it exists
  const target = document.getElementById('yt-player-target');
  if (target) target.remove();
  isPaused = false;
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
