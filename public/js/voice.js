import { ICE_SERVERS } from './constants.js';
import * as network from './network.js';

let localStream = null;
let peers = new Map(); // peerId -> { pc, audioEl }
let isInVoice = false;
let isMuted = false;
let onVoiceStateChange = null;

export function setVoiceStateCallback(cb) { onVoiceStateChange = cb; }
export function getIsInVoice() { return isInVoice; }
export function getIsMuted() { return isMuted; }

export async function joinVoice() {
  if (isInVoice) return;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    console.warn('Microphone access denied:', err);
    localStream = null;
  }

  isInVoice = true;
  isMuted = false;
  network.emit('voice:join', {});
  notifyState();
}

export function leaveVoice() {
  if (!isInVoice) return;
  isInVoice = false;

  // Close all peer connections
  for (const [id, peer] of peers) {
    peer.pc.close();
    if (peer.audioEl) {
      peer.audioEl.srcObject = null;
      peer.audioEl.remove();
    }
  }
  peers.clear();

  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  network.emit('voice:leave', {});
  notifyState();
}

export function toggleMute() {
  isMuted = !isMuted;
  if (localStream) {
    localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
  }
  network.emit('voice:mute', { muted: isMuted });
  notifyState();
}

function notifyState() {
  if (onVoiceStateChange) onVoiceStateChange({ isInVoice, isMuted });
}

// === WebRTC Signaling ===

export function initVoice() {
  network.on('voice:peers', async ({ peerIds }) => {
    // We just joined, create offers to all existing peers
    for (const peerId of peerIds) {
      await createPeerConnection(peerId, true);
    }
  });

  network.on('voice:peer-joined', async ({ peerId }) => {
    // A new peer joined, wait for their offer (they will initiate)
  });

  network.on('voice:peer-left', ({ peerId }) => {
    removePeer(peerId);
  });

  network.on('voice:offer', async ({ fromId, sdp }) => {
    if (!isInVoice) return;
    const peer = await createPeerConnection(fromId, false);
    await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    network.emit('voice:answer', { targetId: fromId, sdp: answer.sdp });
  });

  network.on('voice:answer', async ({ fromId, sdp }) => {
    const peer = peers.get(fromId);
    if (!peer) return;
    await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
  });

  network.on('voice:ice', async ({ fromId, candidate }) => {
    const peer = peers.get(fromId);
    if (!peer) return;
    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('ICE candidate error:', e);
    }
  });
}

async function createPeerConnection(peerId, isInitiator) {
  if (peers.has(peerId)) return peers.get(peerId);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  audioEl.style.display = 'none';
  document.body.appendChild(audioEl);

  const peer = { pc, audioEl };
  peers.set(peerId, peer);

  // Add local audio track
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  // Handle remote stream
  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      audioEl.srcObject = event.streams[0];
    }
  };

  // ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      network.emit('voice:ice', { targetId: peerId, candidate: event.candidate });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      removePeer(peerId);
    }
  };

  // If we are the initiator, create and send an offer
  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    network.emit('voice:offer', { targetId: peerId, sdp: offer.sdp });
  }

  return peer;
}

function removePeer(peerId) {
  const peer = peers.get(peerId);
  if (!peer) return;
  peer.pc.close();
  if (peer.audioEl) {
    peer.audioEl.srcObject = null;
    peer.audioEl.remove();
  }
  peers.delete(peerId);
}
