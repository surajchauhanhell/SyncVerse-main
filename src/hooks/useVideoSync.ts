import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface PlaybackState {
  room_id: string;
  is_playing: boolean;
  timestamp_seconds: number;
  updated_at: string;
  updated_by: string;
}

export function useVideoSync(roomId: string, hostId: string | null) {
  const { user } = useAuth();
  const playerRef = useRef<any>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  
  const isHost = user?.id === hostId;

  // Subscribe to playback_state changes
  useEffect(() => {
    if (!roomId || !user) return;

    // Fetch initial state
    const fetchInitialState = async () => {
      const { data } = await supabase
        .from('playback_state')
        .select('*')
        .eq('room_id', roomId)
        .maybeSingle();

      if (data) {
        setIsPlaying(data.is_playing);
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
           if (Math.abs(playerRef.current.getCurrentTime() - data.timestamp_seconds) > 2) {
             if (typeof playerRef.current.seekTo === 'function') {
               playerRef.current.seekTo(data.timestamp_seconds, 'seconds');
             }
           }
        }
      } else if (isHost) {
        // Initialize playback state for the room if it doesn't exist
        await supabase.from('playback_state').upsert({
          room_id: roomId,
          is_playing: false,
          timestamp_seconds: 0,
          updated_by: user.id
        });
      }
    };

    fetchInitialState();

    const channel = supabase
      .channel(`room-${roomId}-playback`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'playback_state', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const newState = payload.new as PlaybackState;
          
          if (newState.updated_by === user.id) return; // Ignore our own updates

          setIsPlaying(newState.is_playing);
          
          // Only seek if we are out of sync by more than 2 seconds
          if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function' && !isSeeking) {
            const currentLocalTime = playerRef.current.getCurrentTime();
            const timeDiff = Math.abs(currentLocalTime - newState.timestamp_seconds);
            
            if (timeDiff > 2.0) {
              if (typeof playerRef.current.seekTo === 'function') {
                playerRef.current.seekTo(newState.timestamp_seconds, 'seconds');
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, user, isHost]);

  // Host broadcast functions
  const broadcastState = async (playing: boolean, time: number) => {
    if (!isHost || !user) return;
    
    await supabase.from('playback_state').upsert({
      room_id: roomId,
      is_playing: playing,
      timestamp_seconds: time,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    });
  };

  const handlePlay = () => {
    setIsPlaying(true);
    if (isHost && playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
      broadcastState(true, playerRef.current.getCurrentTime());
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (isHost && playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
      broadcastState(false, playerRef.current.getCurrentTime());
    }
  };

  const handleSeek = (seconds: number) => {
    setIsSeeking(false);
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(seconds, 'seconds');
    }
    if (isHost) {
      broadcastState(isPlaying, seconds);
    }
  };

  const handleProgress = (state: { playedSeconds: number }) => {
    if (!isSeeking) {
      setPlayedSeconds(state.playedSeconds);
    }
    
    // Host periodically syncs timestamp every 10 seconds to ensure late joiners or drifted clients catch up
    if (isHost && isPlaying && Math.floor(state.playedSeconds) % 10 === 0) {
      broadcastState(true, state.playedSeconds);
    }
  };

  return {
    playerRef,
    isPlaying,
    playedSeconds,
    isHost,
    handlePlay,
    handlePause,
    handleSeek,
    handleProgress,
    setIsSeeking
  };
}
