import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface PeerState {
  pc: RTCPeerConnection;
  iceCandidateQueue: RTCIceCandidateInit[];
  hasRemoteDescription: boolean;
  makingOffer: boolean;
}

export type MicPermission = 'pending' | 'granted' | 'denied' | 'unavailable';

export function useWebRTC(roomId: string) {
  const { user } = useAuth();

  // Use refs for values that must be stable across async closures
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const channelRef = useRef<any>(null);

  // State for UI reactivity
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [micPermission, setMicPermission] = useState<MicPermission>('pending');

  // Active speaker detection refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserNodesRef = useRef<Map<string, { analyser: AnalyserNode; interval: ReturnType<typeof setInterval> }>>(new Map());

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      // Free TURN servers for NAT traversal (metered.ca public)
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
    ],
  };

  // ----- Signaling helpers -----

  const sendSignal = useCallback((targetId: string, type: string, payload: object) => {
    if (!channelRef.current || !user) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'webrtc-signal',
      payload: { ...payload, type, senderId: user.id, targetId },
    });
  }, [user]);

  // ----- ICE candidate queuing -----

  const drainCandidateQueue = async (peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer || !peer.hasRemoteDescription) return;
    while (peer.iceCandidateQueue.length > 0) {
      const candidate = peer.iceCandidateQueue.shift()!;
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        // Ignore — candidate may be stale
      }
    }
  };

  // ----- Peer connection factory -----

  const createPeerConnection = useCallback((targetId: string): RTCPeerConnection => {
    // If a connection already exists, close it first
    const existing = peersRef.current.get(targetId);
    if (existing) {
      existing.pc.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const peerState: PeerState = {
      pc,
      iceCandidateQueue: [],
      hasRemoteDescription: false,
      makingOffer: false,
    };
    peersRef.current.set(targetId, peerState);

    // Add local audio track
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    // Add screen share if active
    const sStream = screenStreamRef.current;
    if (sStream) {
      sStream.getTracks().forEach((track) => pc.addTrack(track, sStream));
    }

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(targetId, 'ice-candidate', { candidate: event.candidate.toJSON() });
      }
    };

    // Incoming track handling — one MediaStream per peer
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;

      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.set(targetId, stream);
        return newMap;
      });

      // Setup active speaker detection for the incoming audio
      setupSpeakerDetection(targetId, stream);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
        removePeer(targetId);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        removePeer(targetId);
      }
    };

    return pc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendSignal]);

  // ----- Active speaker detection -----

  const setupSpeakerDetection = (peerId: string, stream: MediaStream) => {
    // Clean up any existing analyser for this peer
    teardownSpeakerDetection(peerId);

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }
      const audioCtx = audioContextRef.current;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const interval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        // Calculate RMS volume
        const sum = dataArray.reduce((acc, val) => acc + val * val, 0);
        const rms = Math.sqrt(sum / dataArray.length);
        const isSpeaking = rms > 18; // Threshold

        setActiveSpeakers((prev) => {
          const newSet = new Set(prev);
          if (isSpeaking) {
            newSet.add(peerId);
          } else {
            newSet.delete(peerId);
          }
          return newSet;
        });
      }, 100);

      analyserNodesRef.current.set(peerId, { analyser, interval });
    } catch (e) {
      console.warn('Speaker detection unavailable:', e);
    }
  };

  const teardownSpeakerDetection = (peerId: string) => {
    const node = analyserNodesRef.current.get(peerId);
    if (node) {
      clearInterval(node.interval);
      analyserNodesRef.current.delete(peerId);
    }
    setActiveSpeakers((prev) => {
      const newSet = new Set(prev);
      newSet.delete(peerId);
      return newSet;
    });
  };

  // ----- Peer lifecycle -----

  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.pc.close();
      peersRef.current.delete(peerId);
    }
    teardownSpeakerDetection(peerId);
    setRemoteStreams((prev) => {
      const newMap = new Map(prev);
      newMap.delete(peerId);
      return newMap;
    });
  }, []);

  // ----- Offer/Answer flow -----

  const createOffer = useCallback(async (targetId: string) => {
    const pc = createPeerConnection(targetId);
    const peer = peersRef.current.get(targetId)!;

    try {
      peer.makingOffer = true;
      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable') return; // Bail if state changed
      await pc.setLocalDescription(offer);
      sendSignal(targetId, 'offer', { sdp: pc.localDescription });
    } catch (e) {
      console.error('[WebRTC] createOffer error:', e);
    } finally {
      peer.makingOffer = false;
    }
  }, [createPeerConnection, sendSignal]);

  const handleOffer = useCallback(async (senderId: string, sdp: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection(senderId);
    const peer = peersRef.current.get(senderId)!;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      peer.hasRemoteDescription = true;
      await drainCandidateQueue(senderId);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(senderId, 'answer', { sdp: pc.localDescription });
    } catch (e) {
      console.error('[WebRTC] handleOffer error:', e);
    }
  }, [createPeerConnection, sendSignal]);

  const handleAnswer = useCallback(async (senderId: string, sdp: RTCSessionDescriptionInit) => {
    const peer = peersRef.current.get(senderId);
    if (!peer) return;
    try {
      if (peer.pc.signalingState === 'have-local-offer') {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        peer.hasRemoteDescription = true;
        await drainCandidateQueue(senderId);
      }
    } catch (e) {
      console.error('[WebRTC] handleAnswer error:', e);
    }
  }, []);

  const handleICECandidate = useCallback(async (senderId: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current.get(senderId);
    if (!peer) return;

    if (!peer.hasRemoteDescription) {
      peer.iceCandidateQueue.push(candidate);
    } else {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        // Ignore stale candidates
      }
    }
  }, []);

  // ----- Main effect: signaling channel + mic -----

  useEffect(() => {
    if (!roomId || !user) return;

    // 1. Setup Supabase Broadcast Channel for WebRTC signaling
    const channel = supabase.channel(`webrtc-v2-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'webrtc-signal' }, async ({ payload }) => {
        const { type, senderId, targetId, sdp, candidate } = payload;
        if (targetId && targetId !== user.id) return;

        switch (type) {
          case 'user-joined':
            // The existing user creates an offer to the newcomer
            createOffer(senderId);
            break;
          case 'offer':
            await handleOffer(senderId, sdp);
            break;
          case 'answer':
            await handleAnswer(senderId, sdp);
            break;
          case 'ice-candidate':
            await handleICECandidate(senderId, candidate);
            break;
          case 'user-left':
            removePeer(senderId);
            break;
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'webrtc-signal',
            payload: { type: 'user-joined', senderId: user.id },
          });
        }
      });

    channelRef.current = channel;

    // 2. Request microphone access
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      .then((stream) => {
        // Start muted by default
        stream.getAudioTracks().forEach((track) => (track.enabled = false));
        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicPermission('granted');
      })
      .catch((err) => {
        console.error('[WebRTC] Microphone access denied:', err);
        setMicPermission(err.name === 'NotFoundError' ? 'unavailable' : 'denied');
      });

    // 3. Cleanup
    return () => {
      channel.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: { type: 'user-left', senderId: user.id },
      });
      supabase.removeChannel(channel);

      peersRef.current.forEach(({ pc }) => pc.close());
      peersRef.current.clear();

      // Stop all analyser intervals
      analyserNodesRef.current.forEach(({ interval }) => clearInterval(interval));
      analyserNodesRef.current.clear();

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }

      // Stop local tracks
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);

      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
    };
  // These callbacks are stable via useCallback, so this is correct
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.id]);

  // ----- Controls -----

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
    setIsMuted(!audioTrack.enabled);
  }, []);

  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => !prev);
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      setScreenStream(stream);

      // Add to all existing peer connections
      peersRef.current.forEach(({ pc }) => {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      });

      stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) {
      console.error('[WebRTC] Screen share error:', err);
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    const stream = screenStreamRef.current;
    if (!stream) return;

    stream.getTracks().forEach((t) => t.stop());

    peersRef.current.forEach(({ pc }) => {
      const senders = pc.getSenders();
      stream.getTracks().forEach((track) => {
        const sender = senders.find((s) => s.track === track);
        if (sender) pc.removeTrack(sender);
      });
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
    toggleMute,
    toggleDeafen,
    startScreenShare,
    stopScreenShare,
  };
}
