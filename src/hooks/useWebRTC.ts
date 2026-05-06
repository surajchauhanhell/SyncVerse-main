import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type MicPermission = 'pending' | 'granted' | 'denied' | 'unavailable';

interface PeerState {
  pc: RTCPeerConnection;
  stableStream: MediaStream;       // stable stream we mutate, never replace
  iceCandidateQueue: RTCIceCandidateInit[];
  hasRemoteDescription: boolean;
  makingOffer: boolean;
  isPolite: boolean;               // polite peer defers on offer collision
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: 'turn:a.relay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:a.relay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:a.relay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export function useWebRTC(roomId: string) {
  const { user } = useAuth();

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const channelRef = useRef<any>(null);

  // remoteStreams: stable MediaStream objects mutated in-place
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [micPermission, setMicPermission] = useState<MicPermission>('pending');
  const [connectionState, setConnectionState] = useState<'new' | 'connecting' | 'connected' | 'failed'>('new');

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ─── Signaling ────────────────────────────────────────────────────────────

  const sendSignal = useCallback((targetId: string, type: string, payload: object) => {
    if (!channelRef.current || !user) return;
    console.log(`[WebRTC] Sending ${type} to ${targetId}`);
    channelRef.current.send({
      type: 'broadcast',
      event: 'webrtc-signal',
      payload: { ...payload, type, senderId: user.id, targetId },
    });
  }, [user]);

  // ─── ICE queue ────────────────────────────────────────────────────────────

  const drainQueue = async (peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer || !peer.hasRemoteDescription) return;
    console.log(`[WebRTC] Draining ICE queue for ${peerId} (${peer.iceCandidateQueue.length} candidates)`);
    while (peer.iceCandidateQueue.length > 0) {
      const c = peer.iceCandidateQueue.shift()!;
      try { 
        await peer.pc.addIceCandidate(new RTCIceCandidate(c)); 
      } catch (e) { 
        console.warn(`[WebRTC] Failed to add queued ICE candidate for ${peerId}:`, e);
      }
    }
  };

  // ─── Speaker detection ────────────────────────────────────────────────────

  const setupSpeaker = useCallback((peerId: string, stream: MediaStream) => {
    const old = analyserIntervalsRef.current.get(peerId);
    if (old) clearInterval(old);

    if (!stream.getAudioTracks().length) return;
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.8;
      src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const id = setInterval(() => {
        an.getByteFrequencyData(buf);
        const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length);
        setActiveSpeakers(prev => {
          const s = new Set(prev);
          rms > 18 ? s.add(peerId) : s.delete(peerId);
          return s;
        });
      }, 100);
      analyserIntervalsRef.current.set(peerId, id);
    } catch { /* no audio context */ }
  }, []);

  const resumeAudio = useCallback(async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  }, []);

  // ─── Peer removal ─────────────────────────────────────────────────────────

  const removePeer = useCallback((peerId: string) => {
    console.log(`[WebRTC] Removing peer ${peerId}`);
    const peer = peersRef.current.get(peerId);
    if (peer) { peer.pc.close(); peersRef.current.delete(peerId); }
    const iv = analyserIntervalsRef.current.get(peerId);
    if (iv) { clearInterval(iv); analyserIntervalsRef.current.delete(peerId); }
    setActiveSpeakers(prev => { const s = new Set(prev); s.delete(peerId); return s; });
    remoteStreamsRef.current.delete(peerId);
    setRemoteStreams(new Map(remoteStreamsRef.current));

    if (peersRef.current.size === 0) {
      setConnectionState('new');
    }
  }, []);

  // ─── Peer connection factory ───────────────────────────────────────────────
  // Creates a new RTCPeerConnection for a peer.
  // isPolite=true means we yield on offer collision (perfect negotiation).

  const createPeerConnection = useCallback((peerId: string, isPolite: boolean): PeerState => {
    console.log(`[WebRTC] Creating PeerConnection for ${peerId} (polite: ${isPolite})`);
    const existing = peersRef.current.get(peerId);
    if (existing) { 
      console.log(`[WebRTC] Closing existing connection for ${peerId}`);
      existing.pc.close(); 
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const stableStream = remoteStreamsRef.current.get(peerId) ?? new MediaStream();
    remoteStreamsRef.current.set(peerId, stableStream);

    const peer: PeerState = {
      pc, stableStream,
      iceCandidateQueue: [],
      hasRemoteDescription: false,
      makingOffer: false,
      isPolite,
    };
    peersRef.current.set(peerId, peer);

    // Add local audio
    const local = localStreamRef.current;
    if (local) {
      console.log(`[WebRTC] Adding local audio tracks to ${peerId}`);
      local.getTracks().forEach(t => pc.addTrack(t, local));
    }

    // Add screen if already sharing
    const screen = screenStreamRef.current;
    if (screen) {
      console.log(`[WebRTC] Adding local screen tracks to ${peerId}`);
      screen.getTracks().forEach(t => pc.addTrack(t, screen));
    }

    // ── onnegotiationneeded: handles initial offer AND renegotiation (screen share) ──
    pc.onnegotiationneeded = async () => {
      const p = peersRef.current.get(peerId);
      if (!p || p.makingOffer) return;
      try {
        console.log(`[WebRTC] Negotiation needed for ${peerId}`);
        p.makingOffer = true;
        await pc.setLocalDescription();           // browser creates optimal offer/answer
        sendSignal(peerId, 'offer', { sdp: pc.localDescription });
      } catch (e) {
        console.error('[WebRTC] onnegotiationneeded:', e);
      } finally {
        if (peersRef.current.get(peerId)) peersRef.current.get(peerId)!.makingOffer = false;
      }
    };

    // ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        // console.log(`[WebRTC] New local ICE candidate for ${peerId}`);
        sendSignal(peerId, 'ice-candidate', { candidate: candidate.toJSON() });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE Connection State (${peerId}): ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connecting' || pc.iceConnectionState === 'checking') {
        setConnectionState('connecting');
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionState('connected');
      } else if (pc.iceConnectionState === 'failed') {
        setConnectionState('failed');
        pc.restartIce();
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
        removePeer(peerId);
      }
    };

    // ── ontrack: mutate stableStream instead of replacing it → no flicker ──
    pc.ontrack = ({ track, streams }) => {
      console.log(`[WebRTC] Received track from ${peerId}: ${track.kind}`);
      const incoming = streams[0];
      if (!incoming) return;

      // Add new tracks to stable stream
      incoming.getTracks().forEach(t => {
        if (!stableStream.getTracks().find(e => e.id === t.id)) {
          stableStream.addTrack(t);
        }
      });

      // Remove tracks that ended
      stableStream.getTracks().forEach(t => {
        if (!incoming.getTracks().find(e => e.id === t.id)) {
          stableStream.removeTrack(t);
        }
      });

      // Remove ended tracks when they stop
      track.onended = () => {
        stableStream.removeTrack(track);
        setRemoteStreams(new Map(remoteStreamsRef.current));
      };

      setRemoteStreams(new Map(remoteStreamsRef.current));
      setupSpeaker(peerId, stableStream);
    };

    // Expose updated stream map immediately
    setRemoteStreams(new Map(remoteStreamsRef.current));
    return peer;
  }, [sendSignal, removePeer, setupSpeaker]);

  // ─── Signal handlers ──────────────────────────────────────────────────────

  const handleOffer = useCallback(async (senderId: string, sdp: RTCSessionDescriptionInit) => {
    console.log(`[WebRTC] Handling offer from ${senderId}`);
    let peer = peersRef.current.get(senderId);
    let pc: RTCPeerConnection;

    if (peer) {
      // Renegotiation on existing connection — perfect negotiation
      pc = peer.pc;
      const offerCollision = peer.makingOffer || pc.signalingState !== 'stable';
      if (!peer.isPolite && offerCollision) {
        console.log(`[WebRTC] Impolite peer ignoring offer collision from ${senderId}`);
        return;
      }
      if (offerCollision) {
        console.log(`[WebRTC] Handling offer collision from ${senderId}`);
        await Promise.all([
          pc.setLocalDescription({ type: 'rollback' }),
        ]);
      }
    } else {
      // First connection — we are polite (responder)
      peer = createPeerConnection(senderId, true);
      pc = peer.pc;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      peer.hasRemoteDescription = true;
      await drainQueue(senderId);
      await pc.setLocalDescription();
      sendSignal(senderId, 'answer', { sdp: pc.localDescription });
    } catch (e) {
      console.error('[WebRTC] handleOffer error:', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createPeerConnection, sendSignal]);

  const handleAnswer = useCallback(async (senderId: string, sdp: RTCSessionDescriptionInit) => {
    console.log(`[WebRTC] Handling answer from ${senderId}`);
    const peer = peersRef.current.get(senderId);
    if (!peer) return;
    try {
      if (peer.pc.signalingState === 'have-local-offer') {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        peer.hasRemoteDescription = true;
        await drainQueue(senderId);
      }
    } catch (e) { console.error('[WebRTC] handleAnswer error:', e); }
  }, []);

  const handleICE = useCallback(async (senderId: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current.get(senderId);
    if (!peer) return;
    if (!peer.hasRemoteDescription) {
      peer.iceCandidateQueue.push(candidate);
    } else {
      try { 
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); 
      } catch (e) { 
        // Silently ignore stale candidates
      }
    }
  }, []);

  // ─── Main effect ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !user) return;

    console.log(`[WebRTC] Initializing for room ${roomId}`);
    const channel = supabase.channel(`webrtc-v4-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'webrtc-signal' }, async ({ payload }) => {
        const { type, senderId, targetId, sdp, candidate } = payload;
        if (targetId && targetId !== user.id) return;

        switch (type) {
          case 'user-joined': {
            console.log(`[WebRTC] User joined: ${senderId}`);
            // We are the existing user — impolite offerer
            const peer = createPeerConnection(senderId, false);
            // onnegotiationneeded fires automatically once tracks are added
            // but addTrack was called in createPeerConnection, so it fires now.
            void peer; 
            break;
          }
          case 'offer':
            await handleOffer(senderId, sdp);
            break;
          case 'answer':
            await handleAnswer(senderId, sdp);
            break;
          case 'ice-candidate':
            await handleICE(senderId, candidate);
            break;
          case 'user-left':
            console.log(`[WebRTC] User left: ${senderId}`);
            removePeer(senderId);
            break;
        }
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          console.log(`[WebRTC] Subscribed to signaling channel`);
          channel.send({
            type: 'broadcast',
            event: 'webrtc-signal',
            payload: { type: 'user-joined', senderId: user.id },
          });
        }
      });

    channelRef.current = channel;

    // Mic
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      .then(stream => {
        console.log(`[WebRTC] Microphone access granted`);
        stream.getAudioTracks().forEach(t => (t.enabled = false));
        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicPermission('granted');
      })
      .catch(err => {
        console.warn(`[WebRTC] Microphone access denied:`, err);
        setMicPermission(err.name === 'NotFoundError' ? 'unavailable' : 'denied');
      });

    return () => {
      console.log(`[WebRTC] Cleaning up...`);
      channel.send({ type: 'broadcast', event: 'webrtc-signal', payload: { type: 'user-left', senderId: user.id } });
      supabase.removeChannel(channel);
      peersRef.current.forEach(({ pc }) => pc.close());
      peersRef.current.clear();
      analyserIntervalsRef.current.forEach(iv => clearInterval(iv));
      analyserIntervalsRef.current.clear();
      audioContextRef.current?.close();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.id]);

  // ─── Controls ─────────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setIsMuted(!t.enabled);
  }, []);

  const toggleDeafen = useCallback(() => setIsDeafened(p => !p), []);

  const startScreenShare = useCallback(async () => {
    try {
      console.log(`[WebRTC] Starting screen share`);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
      screenStreamRef.current = stream;
      setScreenStream(stream);

      // Add tracks to all existing peers — onnegotiationneeded handles renegotiation
      peersRef.current.forEach(({ pc }) => {
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
      });

      // Auto-stop when user clicks browser's "Stop sharing"
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (e) {
      console.error('[WebRTC] startScreenShare:', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopScreenShare = useCallback(() => {
    console.log(`[WebRTC] Stopping screen share`);
    const stream = screenStreamRef.current;
    if (!stream) return;
    stream.getTracks().forEach(t => t.stop());

    // Remove senders — onnegotiationneeded fires and renegotiates
    peersRef.current.forEach(({ pc }) => {
      pc.getSenders()
        .filter(s => stream.getTracks().includes(s.track!))
        .forEach(s => pc.removeTrack(s));
    });

    screenStreamRef.current = null;
    setScreenStream(null);
  }, []);

  return {
    localStream,
    screenStream,
    remoteStreams,
    isMuted,
    isDeafened,
    activeSpeakers,
    micPermission,
    connectionState,
    toggleMute,
    toggleDeafen,
    startScreenShare,
    stopScreenShare,
    resumeAudio,
  };
}
