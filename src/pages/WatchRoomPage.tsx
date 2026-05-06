import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import ReactPlayer from 'react-player';
import { useVideoSync } from '../hooks/useVideoSync';
import { useWebRTC } from '../hooks/useWebRTC';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Subtitles, Mic, MicOff, Video, VideoOff, MonitorUp,
  Settings, LogOut, Copy, Check, Send, Smile,
  Users, Hash, ChevronRight, ChevronLeft, X, ScreenShare, ScreenShareOff
} from 'lucide-react';

interface Message {
  id: string;
  content: string;
  type: string;
  created_at: string;
  user_id: string;
  profiles?: { username: string } | null;
}

interface Participant {
  id: string;
  user_id: string;
  role: string;
  is_muted: boolean;
  is_deafened: boolean;
  is_video_on: boolean;
  is_screen_sharing: boolean;
  profiles?: { username: string } | null;
}

const EMOJIS = ['🔥', '❤️', '😂', '😮', '👏', '🎉', '💀', '👀'];

export default function WatchRoomPage() {
  const { roomId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [copied, setCopied] = useState(false);
  const [volume, setVolume] = useState(80);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tempUrl, setTempUrl] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Initialize Custom Hooks for Video and WebRTC
  const {
    playerRef,
    isPlaying,
    playedSeconds,
    isHost,
    handlePlay,
    handlePause,
    handleSeek,
    handleProgress,
    setIsSeeking
  } = useVideoSync(roomId!, room?.host_id);

  const {
    screenStream,
    remoteStreams,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    startScreenShare,
    stopScreenShare
  } = useWebRTC(roomId!);

  useEffect(() => {
    if (!user || !roomId) {
      navigate('/login');
      return;
    }
    fetchRoom();
    fetchMessages();
    fetchParticipants();

    const msgChannel = supabase
      .channel(`room-${roomId}-messages`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();

    const partChannel = supabase
      .channel(`room-${roomId}-participants`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'room_members',
        filter: `room_id=eq.${roomId}`,
      }, () => {
        fetchParticipants();
      })
      .subscribe();

    const roomChannel = supabase
      .channel(`room-${roomId}-update`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        setRoom(payload.new);
      })
      .subscribe();

    // Prevent StrictMode race conditions with database inserts
    let isMounted = true;
    
    // Mark user as joined in DB if not already
    supabase.from('room_members').select('id').eq('room_id', roomId).eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (!data && isMounted) {
        supabase.from('room_members').insert({ room_id: roomId, user_id: user.id }).then();
      }
    });

    return () => {
      isMounted = false;
      supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', user.id).then();
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(partChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [roomId, user]);

  useEffect(() => {
    if (room?.current_video_url && !tempUrl) {
      setTempUrl(room.current_video_url);
    }
  }, [room?.current_video_url]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchRoom = async () => {
    const { data } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
    if (data) setRoom(data);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles:user_id(username)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (data) setMessages(data as any);
  };

  const fetchParticipants = async () => {
    const { data } = await supabase
      .from('room_members')
      .select('*, profiles:user_id(username)')
      .eq('room_id', roomId);
    if (data) setParticipants(data as any);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !roomId) return;
    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: user.id,
      content: newMessage.trim()
    });
    setNewMessage('');
  };

  const copyInviteLink = () => {
    if (room) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const leaveRoom = async () => {
    if (!user || !roomId) return;
    await supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', user.id);
    navigate('/dashboard');
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoContainerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseFloat(e.target.value);
    const duration = playerRef.current?.getDuration?.() || 0;
    handleSeek((pct / 100) * duration);
  };

  // Find active screen stream
  let activeScreenStream: MediaStream | null = null;
  if (screenStream) {
    activeScreenStream = screenStream;
  } else {
    for (const streams of remoteStreams.values()) {
      for (const stream of streams) {
        if (stream.getVideoTracks().length > 0) {
          activeScreenStream = stream;
          break;
        }
      }
      if (activeScreenStream) break;
    }
  }

  return (
    <div className="h-screen bg-surface-0 flex flex-col relative overflow-hidden">
      {/* Remote Audio Elements */}
      {Array.from(remoteStreams.entries()).flatMap(([peerId, streams]) => 
        streams.map((stream, idx) => (
          <audio
            key={`${peerId}-${idx}`}
            ref={el => { if (el) el.srcObject = stream; }}
            autoPlay
            muted={isDeafened}
            className="hidden"
          />
        ))
      )}

      {/* Background glow */}
      <div className="floating-orb w-[400px] h-[400px] bg-neon-indigo top-[-100px] left-[-100px] opacity-10" />

      {/* Top Bar */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong flex-shrink-0 z-30"
      >
        <div className="px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={leaveRoom}
              className="w-9 h-9 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-semibold text-sm md:text-base">{room?.name || 'Watch Room'}</h1>
              <div className="flex items-center gap-2 text-xs text-white/30">
                <Hash className="w-3 h-3" />
                {roomId}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 glass !rounded-full px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
              <span className="text-xs text-white/50">Synced</span>
            </div>

            <button
              onClick={copyInviteLink}
              className="btn-secondary !py-1.5 !px-3 !text-xs !rounded-xl flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-neon-green" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Invite</span>
            </button>

            <button
              onClick={leaveRoom}
              className="w-9 h-9 rounded-xl glass flex items-center justify-center text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div
            ref={videoContainerRef}
            className="flex-1 relative bg-black flex items-center justify-center group"
          >
            {activeScreenStream ? (
               <div className="absolute inset-0">
                 <video
                   ref={(el) => { if (el) el.srcObject = activeScreenStream; }}
                   autoPlay
                   playsInline
                   muted // Audio is handled by the hidden <audio> tags above
                   className="w-full h-full object-contain"
                 />
               </div>
            ) : room?.current_video_url ? (
               <div className="absolute inset-0">
                 <ReactPlayer
                    ref={playerRef}
                    url={room.current_video_url}
                    width="100%"
                    height="100%"
                    playing={isPlaying}
                    volume={volume / 100}
                    onProgress={handleProgress as any}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    controls={false} // Custom controls overlay
                    style={{ pointerEvents: isHost ? 'auto' : 'none' }} // Only host can directly click player
                 />
               </div>
            ) : (
               <div className="text-white/50 flex flex-col items-center">
                  <Play className="w-16 h-16 mb-4 opacity-20" />
                  <p>Waiting for host to select a video...</p>
               </div>
            )}

            {/* Cinematic overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

            {/* Video controls overlay */}
            <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="mb-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={playerRef.current && typeof playerRef.current.getDuration === 'function' ? (playedSeconds / (playerRef.current.getDuration() || 1)) * 100 : 0}
                  onChange={handleSeekChange}
                  onMouseDown={() => setIsSeeking(true)}
                  className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  disabled={!isHost}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={isPlaying ? handlePause : handlePlay}
                    disabled={!isHost}
                    className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
                  </button>
                  <div className="flex items-center gap-2 w-24">
                    <Volume2 className="w-4 h-4 text-white/50" />
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isHost && (
                    <button
                      onClick={() => screenStream ? stopScreenShare() : startScreenShare()}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${screenStream ? 'bg-neon-indigo' : 'glass hover:bg-white/10'}`}
                    >
                      {screenStream ? <ScreenShareOff className="w-5 h-5" /> : <ScreenShare className="w-5 h-5" />}
                    </button>
                  )}
                  <button
                    onClick={toggleFullscreen}
                    className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors"
                  >
                    {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Sidebar */}
        <AnimatePresence>
          {showChat && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="hidden md:flex flex-col border-l border-white/5 bg-surface-1/50 backdrop-blur-xl flex-shrink-0"
            >
              {/* Chat tabs */}
              <div className="flex items-center border-b border-white/5 px-4">
                <button
                  onClick={() => setShowParticipants(false)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                    !showParticipants ? 'text-white border-neon-indigo' : 'text-white/30 border-transparent'
                  }`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setShowParticipants(true)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                    showParticipants ? 'text-white border-neon-indigo' : 'text-white/30 border-transparent'
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <Users className="w-4 h-4" />
                    Participants ({participants.length})
                  </span>
                </button>
              </div>

              {!showParticipants ? (
                <>
                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.map((msg, i) => (
                      <motion.div key={msg.id || i} className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-indigo/30 to-neon-cyan/30 flex-shrink-0 flex items-center justify-center text-xs font-semibold">
                          {(msg.profiles as any)?.username?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-white/80">
                              {(msg.profiles as any)?.username || 'Unknown'}
                            </span>
                          </div>
                          <p className="text-sm text-white/50">{msg.content}</p>
                        </div>
                      </motion.div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Message input */}
                  <div className="p-4 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Send a message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        className="input-field !py-2.5 !text-sm !rounded-xl flex-1 bg-surface-2 border-white/10 px-3 text-white"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim()}
                        className="w-9 h-9 rounded-xl bg-neon-indigo flex items-center justify-center disabled:opacity-30"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* Participants list */
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
                      Voice Channel
                    </h3>
                    {participants.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-neon-indigo/30 to-neon-cyan/30 flex items-center justify-center text-xs font-semibold">
                          {(p.profiles as any)?.username?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {(p.profiles as any)?.username || 'Unknown'}
                            {p.user_id === room?.host_id && " (Host)"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Voice Controls */}
      <motion.div className="glass-strong flex-shrink-0 z-30 border-t border-white/5">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                isMuted ? 'bg-red-500/20 text-red-400' : 'glass text-white'
              }`}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <button
              onClick={toggleDeafen}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                isDeafened ? 'bg-red-500/20 text-red-400' : 'glass text-white'
              }`}
            >
              {isDeafened ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="w-11 h-11 rounded-2xl glass flex items-center justify-center text-white/50 hover:text-white"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowChat(!showChat)}
              className="w-11 h-11 rounded-2xl glass flex items-center justify-center text-white"
            >
              {showChat ? <X className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card p-6 w-full max-w-sm"
            >
              <h2 className="text-lg font-bold mb-4">Room Settings</h2>
              <div className="space-y-4">
                {isHost && (
                  <div>
                    <label className="text-sm text-white/60 block mb-2">Video URL</label>
                    <input
                      type="text"
                      placeholder="https://youtube.com/..."
                      value={tempUrl}
                      onChange={(e) => setTempUrl(e.target.value)}
                      className="input-field !text-sm"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/60">Subtitles</span>
                  <button
                    onClick={() => setShowSubtitles(!showSubtitles)}
                    className={`w-10 h-6 rounded-full transition-all ${showSubtitles ? 'bg-neon-indigo' : 'bg-white/10'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${showSubtitles ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
              </div>
              <button
                onClick={() => {
                  if (isHost && tempUrl !== room?.current_video_url) {
                    supabase.from('rooms').update({ current_video_url: tempUrl }).eq('id', roomId).then();
                    setRoom({ ...room, current_video_url: tempUrl });
                  }
                  setShowSettings(false);
                }}
                className="btn-primary w-full mt-6"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
