import { ICE_SERVERS, DEFAULT_BANDWIDTH, BANDWIDTH_OPTIONS } from './constants.js';
import * as network from './network.js';

let localScreenStream = null;
let screenPeers = new Map(); // peerId -> { pc, videoEl }
let isSharing = false;
let currentBitrate = DEFAULT_BANDWIDTH;
let onScreenStateChange = null;
let activeSharerSocket = null;

export function setScreenStateCallback(cb) { onScreenStateChange = cb; }
export function getIsSharing() { return isSharing; }
export function getActiveSharer() { return activeSharerSocket; }

export async function startScreenShare() {
  if (isSharing) return;

  try {
    localScreenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: true,
    });
  } catch (err) {
    console.warn('Screen share cancelled:', err);
    return;
  }

  isSharing = true;

  // Handle browser stop-sharing button
  localScreenStream.getVideoTracks()[0].onended = () => {
    stopScreenShare();
  };

  network.emit('screen:start', {});
  notifyState();
}

export function stopScreenShare() {
  if (!isSharing) return;
  isSharing = false;

  // Close all screen share peer connections
  for (const [id, peer] of screenPeers) {
    peer.pc.close();
    if (peer.videoEl) {
      peer.videoEl.srcObject = null;
    }
  }
  screenPeers.clear();

  // Stop local screen stream
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(t => t.stop());
    localScreenStream = null;
  }

  network.emit('screen:stop', {});
  notifyState();
}

export async function setBitrate(kbps) {
  currentBitrate = kbps;
  for (const [id, peer] of screenPeers) {
    const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (!sender) continue;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = kbps * 1000;
    try {
      await sender.setParameters(params);
    } catch (e) {
      console.warn('Failed to set bitrate:', e);
    }
  }
}

function notifyState() {
  if (onScreenStateChange) onScreenStateChange({ isSharing, activeSharerSocket });
}

// === Screen share signaling ===

export function initScreenShare() {
  // Someone started sharing - we need to receive their stream
  network.on('screen:active', async ({ playerId }) => {
    activeSharerSocket = playerId;
    notifyState();
  });

  network.on('screen:ended', ({ playerId }) => {
    activeSharerSocket = null;
    // Clean up viewer peer connection
    const peer = screenPeers.get(playerId);
    if (peer) {
      peer.pc.close();
      if (peer.videoEl) peer.videoEl.srcObject = null;
      screenPeers.delete(playerId);
    }
    notifyState();
  });

  // Screen share offer from the sharer
  network.on('screen:offer', async ({ fromId, sdp }) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const videoEl = document.getElementById('screenshare-video');

    const peer = { pc, videoEl };
    screenPeers.set(fromId, peer);

    pc.ontrack = (event) => {
      if (videoEl && event.streams[0]) {
        videoEl.srcObject = event.streams[0];
        videoEl.play().catch(() => {});
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        network.emit('screen:ice', { targetId: fromId, candidate: event.candidate });
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    network.emit('screen:answer', { targetId: fromId, sdp: answer.sdp });
  });

  network.on('screen:answer', async ({ fromId, sdp }) => {
    const peer = screenPeers.get(fromId);
    if (!peer) return;
    await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
  });

  network.on('screen:ice', async ({ fromId, candidate }) => {
    const peer = screenPeers.get(fromId);
    if (!peer) return;
    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('Screen share ICE error:', e);
    }
  });

  // When we start sharing, server tells us who to send to
  network.on('screen:send-to', async ({ peerIds }) => {
    if (!isSharing || !localScreenStream) return;
    for (const peerId of peerIds) {
      await createShareSender(peerId);
    }
  });

  // New viewer joined while we're sharing
  network.on('screen:new-viewer', async ({ peerId }) => {
    if (!isSharing || !localScreenStream) return;
    await createShareSender(peerId);
  });
}

async function createShareSender(peerId) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const peer = { pc, videoEl: null };
  screenPeers.set(peerId, peer);

  // Add screen tracks
  localScreenStream.getTracks().forEach(track => {
    pc.addTrack(track, localScreenStream);
  });

  // Apply bandwidth
  const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
  if (sender) {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = currentBitrate * 1000;
    try {
      await sender.setParameters(params);
    } catch (e) { /* ok */ }
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      network.emit('screen:ice', { targetId: peerId, candidate: event.candidate });
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  network.emit('screen:offer', { targetId: peerId, sdp: offer.sdp });
}
