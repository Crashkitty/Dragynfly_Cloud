// Adapted from /home/dream/Documents/meet/public/room.js.
// Same WebRTC mesh + WebSocket signaling as the source; copy-link, mute,
// camera toggle, screen-share, chat, and reconnection are preserved.

const roomId = window.location.pathname.split("/").pop();
const roomIdEl = document.getElementById("room-id");
if (roomIdEl) roomIdEl.textContent = roomId || "";

const statusEl = document.getElementById("status");
function setStatus(text) { if (statusEl) statusEl.textContent = text; }

const localVideo = document.getElementById("local-video");
const localLabel = document.getElementById("local-label");
const remoteContainer = document.getElementById("remote-videos");

const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");

const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const shareBtn = document.getElementById("share-btn");
const copyLinkBtn = document.getElementById("copy-link-btn");
const leaveBtn = document.getElementById("leave-btn");

const selfId = crypto.randomUUID();
let userName = localStorage.getItem("dragonfly.userName") || "";
const peers = new Map();
let ws;
let localStream;
let screenStream;
let isMuted = false;
let isCameraOff = false;
let isSharing = false;

if (!userName) {
  const name = prompt("Enter your name:");
  userName = (name && name.trim()) || "Guest";
  localStorage.setItem("dragonfly.userName", userName);
}

// ICE config is fetched from /api/ice (operator-supplied via Worker env).
// We do NOT bake in any third-party STUN/TURN server. If the operator
// has not configured any servers, iceServers stays empty and the call
// works only on permissive networks — surface that to the user.
const rtcConfig = {
  iceServers: [],
  iceCandidatePoolSize: 10,
};

async function loadIceConfig() {
  try {
    const res = await fetch("/api/ice", { cache: "no-store" });
    if (!res.ok) throw new Error("ICE fetch failed: " + res.status);
    const data = await res.json();
    if (Array.isArray(data.iceServers)) {
      rtcConfig.iceServers = data.iceServers;
    }
    if (rtcConfig.iceServers.length === 0) {
      setStatus(
        "No STUN/TURN servers configured. Both peers need to be on the same " +
        "network (or you must set STUN_URLS / TURN_URLS on the telemed Worker).",
      );
    }
  } catch (err) {
    console.error(err);
    setStatus("Could not load ICE config; trying without STUN/TURN.");
  }
}

leaveBtn?.addEventListener("click", () => { window.location.href = "/"; });

copyLinkBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    const original = copyLinkBtn.textContent;
    copyLinkBtn.textContent = "Copied!";
    setTimeout(() => { copyLinkBtn.textContent = original; }, 2000);
  } catch (err) {
    alert("Failed to copy: " + err.message);
  }
});

micBtn?.addEventListener("click", () => {
  if (!localStream) return;
  const t = localStream.getAudioTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  isMuted = !t.enabled;
  micBtn.classList.toggle("muted", isMuted);
  micBtn.textContent = isMuted ? "🔇" : "🎤";
});

camBtn?.addEventListener("click", () => {
  if (!localStream) return;
  const t = localStream.getVideoTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  isCameraOff = !t.enabled;
  camBtn.classList.toggle("off", isCameraOff);
  camBtn.textContent = isCameraOff ? "📷" : "📹";
});

shareBtn?.addEventListener("click", async () => {
  if (isSharing) stopScreenShare();
  else await startScreenShare();
});

async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const videoTrack = screenStream.getVideoTracks()[0];
    for (const peerData of peers.values()) {
      const sender = peerData.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(videoTrack);
    }
    if (localVideo) localVideo.srcObject = screenStream;
    isSharing = true;
    shareBtn.classList.add("sharing");
    shareBtn.textContent = "⏹️";
    videoTrack.onended = () => stopScreenShare();
  } catch (err) {
    console.error("Screen share error:", err);
    setStatus("Screen share failed: " + err.message);
  }
}

async function stopScreenShare() {
  if (!screenStream) return;
  screenStream.getTracks().forEach((t) => t.stop());
  screenStream = null;
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    for (const peerData of peers.values()) {
      const sender = peerData.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(videoTrack);
    }
    if (localVideo) localVideo.srcObject = localStream;
  }
  isSharing = false;
  shareBtn.classList.remove("sharing");
  shareBtn.textContent = "🖥️";
}

function addChatMessage(sender, message, isSelf = false) {
  if (!chatMessages) return;
  const msgDiv = document.createElement("div");
  msgDiv.className = "chat-message" + (isSelf ? " self" : "");
  const senderDiv = document.createElement("div");
  senderDiv.className = "sender";
  senderDiv.textContent = sender;
  const textDiv = document.createElement("div");
  textDiv.textContent = message;
  msgDiv.appendChild(senderDiv);
  msgDiv.appendChild(textDiv);
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChatMessage() {
  if (!chatInput?.value.trim()) return;
  const message = chatInput.value.trim();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "chat", from: selfId, name: userName, message }));
  }
  addChatMessage("You", message, true);
  chatInput.value = "";
}

chatSend?.addEventListener("click", sendChatMessage);
chatInput?.addEventListener("keypress", (e) => { if (e.key === "Enter") sendChatMessage(); });

async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localVideo) localVideo.srcObject = localStream;
    if (localLabel) localLabel.textContent = userName + " (You)";
  } catch (err) {
    console.error("Media access error:", err);
    if (err.name === "NotFoundError" || err.name === "NotAllowedError") {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        if (localVideo) localVideo.srcObject = localStream;
        if (localLabel) localLabel.textContent = userName + " (You · audio only)";
        setStatus("Camera unavailable, audio-only.");
      } catch {
        throw new Error("Please grant microphone or camera access to start the call.");
      }
    } else {
      throw err;
    }
  }
}

function ensurePeer(peerId, isInitiator, remoteName = "Guest") {
  if (peers.has(peerId)) return peers.get(peerId).pc;
  const pc = new RTCPeerConnection(rtcConfig);
  peers.set(peerId, { pc, name: remoteName });

  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  pc.onicecandidate = (event) => {
    if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ice", from: selfId, target: peerId, candidate: event.candidate }));
    }
  };

  pc.ontrack = (event) => {
    let wrapper = document.getElementById("remote-wrapper-" + peerId);
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = "remote-wrapper-" + peerId;
      wrapper.className = "video-wrapper";
      const video = document.createElement("video");
      video.id = "remote-" + peerId;
      video.autoplay = true;
      video.playsInline = true;
      const label = document.createElement("div");
      label.className = "video-label";
      label.textContent = remoteName;
      const indicator = document.createElement("div");
      indicator.className = "connection-status connecting";
      indicator.id = "status-" + peerId;
      wrapper.appendChild(video);
      wrapper.appendChild(label);
      wrapper.appendChild(indicator);
      remoteContainer.appendChild(wrapper);
    }
    const video = document.getElementById("remote-" + peerId);
    if (video) video.srcObject = event.streams[0];
  };

  pc.onconnectionstatechange = () => {
    const indicator = document.getElementById("status-" + peerId);
    if (pc.connectionState === "connected") {
      setStatus("Connected to " + remoteName);
      indicator?.classList.remove("connecting", "disconnected");
      setTimeout(() => setStatus(""), 2000);
    } else if (pc.connectionState === "connecting") {
      indicator?.classList.add("connecting");
    } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      indicator?.classList.add("disconnected");
      indicator?.classList.remove("connecting");
      setStatus(remoteName + " disconnected");
      setTimeout(() => {
        document.getElementById("remote-wrapper-" + peerId)?.remove();
        peers.delete(peerId);
      }, 3000);
    }
  };

  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({
        type: "offer", from: selfId, target: peerId, sdp: pc.localDescription, name: userName,
      }));
    };
  }
  return pc;
}

function handleSignal(msg) {
  const { type, from, target, sdp, candidate, name, message } = msg;
  if (!from || from === selfId) return;
  if (type === "chat") { addChatMessage(name || "Guest", message, false); return; }
  if (type === "join") {
    if (selfId > from) ensurePeer(from, true, name || "Guest");
    return;
  }
  if (target && target !== selfId) return;
  const remoteName = name || "Guest";
  if (type === "offer") {
    const pc = ensurePeer(from, false, remoteName);
    pc.setRemoteDescription(new RTCSessionDescription(sdp)).then(async () => {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({
        type: "answer", from: selfId, target: from, sdp: pc.localDescription, name: userName,
      }));
    });
  } else if (type === "answer") {
    const peer = peers.get(from);
    if (!peer) return;
    peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    if (name) {
      peer.name = name;
      const label = document.querySelector(`#remote-wrapper-${from} .video-label`);
      if (label) label.textContent = name;
    }
  } else if (type === "ice") {
    const peer = peers.get(from);
    if (!peer) return;
    peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

async function connect() {
  if (!roomId) { setStatus("No room id."); return; }
  try {
    await loadIceConfig();
    await initMedia();
    setStatus("Connecting to room…");
    const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${wsProto}://${window.location.host}/ws/${roomId}`);
    ws.onopen = () => {
      setStatus("Waiting for the other side to join…");
      ws.send(JSON.stringify({ type: "join", from: selfId, name: userName }));
    };
    ws.onmessage = (event) => {
      try { handleSignal(JSON.parse(event.data)); } catch (e) { console.error("Bad message", e); }
    };
    ws.onclose = () => {
      setStatus("Disconnected.");
      setTimeout(() => { setStatus("Reconnecting…"); connect(); }, 3000);
    };
    ws.onerror = () => setStatus("Connection error.");
  } catch (err) {
    console.error(err);
    setStatus("Error: " + err.message);
  }
}

connect();
