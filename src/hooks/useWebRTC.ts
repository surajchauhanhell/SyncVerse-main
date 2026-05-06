import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface PeerConnection {
  pc: RTCPeerConnection;
  stream: MediaStream;
}

export function useWebRTC(roomId: string) {
  const { user } = useAuth();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream[]>>(new Map());
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());

  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const channelRef = useRef<any>(null);

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  useEffect(() => {
    if (!roomId || !user) return;

    // Initialize Supabase Broadcast Channel for WebRTC Signaling
    const channel = supabase.channel(`webrtc-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'webrtc-signal' }, async ({ payload }) => {
        const { type, senderId, targetId, sdp, candidate } = payload;
        
        // Ignore if not targeted at us (or if it's a broadcast offer, we check sender)
        if (targetId && targetId !== user.id) return;

        if (type === 'user-joined') {
          // New user joined, let's create an offer and send it to them
          createOffer(senderId);
        } else if (type === 'offer') {
          handleOffer(senderId, sdp);
        } else if (type === 'answer') {
          handleAnswer(senderId, sdp);
        } else if (type === 'ice-candidate') {
          handleNewICECandidateMsg(senderId, candidate);
        } else if (type === 'user-left') {
          removePeer(senderId);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Announce ourselves to the room
          channel.send({
            type: 'broadcast',
            event: 'webrtc-signal',
            payload: { type: 'user-joined', senderId: user.id },
          });
        }
      });

    channelRef.current = channel;

    // Get Local Microphone
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        setLocalStream(stream);
        // Start muted by default
        stream.getAudioTracks().forEach(track => track.enabled = false);
      })
      .catch((err) => console.error("Microphone access denied:", err));

    return () => {
      // Cleanup
      channel.send({
        type: 'broadcast',
        event: 'webrtc-signal',
        payload: { type: 'user-left', senderId: user.id },
      });
      supabase.removeChannel(channel);
      
      peersRef.current.forEach(({ pc }) => pc.close());
      peersRef.current.clear();
      
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [roomId, user]);

  const sendSignal = (targetId: string, type: string, payload: any) => {
    if (!channelRef.current || !user) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'webrtc-signal',
      payload: { ...payload, type, senderId: user.id, targetId },
    });
  };

  const createPeerConnection = (targetId: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local stream tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }
    
    // Add screen stream tracks if already sharing when someone joins
    if (screenStream) {
      screenStream.getTracks().forEach((track) => pc.addTrack(track, screenStream));
    }

    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(targetId, 'offer', { sdp: pc.localDescription });
      } catch (e) {
        console.error("Negotiation error", e);
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(targetId, 'ice-candidate', { candidate: event.candidate });
      }
    };

    // Handle incoming tracks
    pc.ontrack = (event) => {
      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        const peerStreams = newMap.get(targetId) || [];
        const stream = event.streams[0];
        
        if (stream && !peerStreams.find(s => s.id === stream.id)) {
          newMap.set(targetId, [...peerStreams, stream]);
        }
        return newMap;
      });
      
      // Setup audio context for active speaker detection (basic implementation)
      // Real app might use a more robust Web Audio API analyser here
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        removePeer(targetId);
      }
    };

    peersRef.current.set(targetId, { pc, stream: new MediaStream() });
    return pc;
  };

  const createOffer = async (targetId: string) => {
    const pc = createPeerConnection(targetId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(targetId, 'offer', { sdp: offer });
    } catch (e) {
      console.error(e);
    }
  };

  const handleOffer = async (senderId: string, sdp: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection(senderId);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(senderId, 'answer', { sdp: answer });
    } catch (e) {
      console.error(e);
    }
  };

  const handleAnswer = async (senderId: string, sdp: RTCSessionDescriptionInit) => {
    const peer = peersRef.current.get(senderId);
    if (peer) {
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleNewICECandidateMsg = async (senderId: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current.get(senderId);
    if (peer) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const removePeer = (peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.pc.close();
      peersRef.current.delete(peerId);
      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.delete(peerId);
        return newMap;
      });
    }
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleDeafen = () => {
    setIsDeafened(!isDeafened);
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setScreenStream(stream);

      // Add to all existing connections
      peersRef.current.forEach(({ pc }) => {
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
      });

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare(stream);
      };
    } catch (err) {
      console.error("Error starting screen share", err);
    }
  };

  const stopScreenShare = (streamToStop = screenStream) => {
    if (streamToStop) {
      streamToStop.getTracks().forEach(track => track.stop());
      
      peersRef.current.forEach(({ pc }) => {
        const senders = pc.getSenders();
        streamToStop.getTracks().forEach(track => {
          const sender = senders.find(s => s.track === track);
          if (sender) pc.removeTrack(sender);
        });
      });
      
      if (streamToStop === screenStream) {
        setScreenStream(null);
      }
    }
  };

  return {
    localStream,
    screenStream,
    remoteStreams,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    activeSpeakers,
    startScreenShare,
    stopScreenShare
  };
}
