import * as network from './network.js';

let youtubeOverlay, youtubeInput, youtubeIframe, youtubeClear, youtubeInfo;
let isInChillZone = false;
let currentVideo = null;
let iframeLoaded = false;

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
}

export function enterChillZone() {
  isInChillZone = true;
  youtubeOverlay.classList.add('visible');

  if (currentVideo && currentVideo.videoId) {
    if (!iframeLoaded) {
      // Load the video fresh with sound
      loadVideo();
    } else {
      // Already loaded — unmute by reloading with autoplay
      // YouTube iframe API doesn't allow unmuting from outside, so reload
      loadVideo();
    }
  }
}

export function leaveChillZone() {
  isInChillZone = false;
  youtubeOverlay.classList.remove('visible');

  // Mute by removing the iframe src (stops playback entirely)
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

  // Only auto-load if we're in the chill zone
  if (isInChillZone) {
    loadVideo();
  } else {
    // Update info text but don't load video (we're not in the zone)
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
