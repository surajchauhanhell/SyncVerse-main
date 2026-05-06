import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Play, Plus, Users, Clock, TrendingUp, LogOut,
  Copy, Check, X, Search, ChevronRight, Hash, Globe, Lock
} from 'lucide-react';

interface Room {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  is_private: boolean;
  current_video_url: string;
  host_id: string;
  created_at: string;
}

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchRooms();
  }, [user]);

  const fetchRooms = async () => {
    setLoading(true);
    const [roomsRes, publicRes] = await Promise.all([
      supabase.from('rooms').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('rooms').select('*').eq('is_private', false).order('created_at', { ascending: false }).limit(10),
    ]);
    if (roomsRes.data) setRooms(roomsRes.data);
    if (publicRes.data) setPublicRooms(publicRes.data);
    setLoading(false);
  };

  const createRoom = async () => {
    if (!newRoomName.trim() || !user) return;
    
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        name: newRoomName,
        description: newRoomDesc,
        is_private: !isPublic,
        host_id: user.id,
        invite_code: inviteCode
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return;
    }

    if (data) {
      await supabase.from('room_members').insert({
        room_id: data.id,
        user_id: user.id,
      });
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomDesc('');
      navigate(`/room/${data.id}`);
    }
  };

  const joinRoom = async () => {
    if (!inviteCode.trim() || !user) return;
    const { data: room } = await supabase
      .from('rooms')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase())
      .maybeSingle();

    if (!room) {
      alert('Room not found');
      return;
    }

    await supabase.from('room_members').insert({
      room_id: room.id,
      user_id: user.id,
    });

    setShowJoinModal(false);
    setInviteCode('');
    navigate(`/room/${room.id}`);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(''), 2000);
  };

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPublic = publicRooms.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-surface-0 relative overflow-hidden">
      {/* Background */}
      <div className="floating-orb w-[500px] h-[500px] bg-neon-indigo top-[-200px] right-[-200px]" />
      <div className="floating-orb w-[300px] h-[300px] bg-neon-cyan bottom-[10%] left-[-100px]" />

      {/* Top bar */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong sticky top-0 z-40"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-neon-indigo to-neon-cyan flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">SyncVerse</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowJoinModal(true)}
              className="btn-secondary !py-2 !px-4 !text-sm !rounded-xl flex items-center gap-2"
            >
              <Hash className="w-4 h-4" />
              Join
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary !py-2 !px-4 !text-sm !rounded-xl flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Room
            </button>
            <div className="w-px h-8 bg-white/10 mx-1" />
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-neon-indigo/40 to-neon-cyan/40 flex items-center justify-center text-sm font-semibold">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={async () => { await signOut(); navigate('/'); }}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
          <input
            type="text"
            placeholder="Search rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field !pl-12"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Recent Rooms */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Clock className="w-5 h-5 text-neon-indigo" />
                  Recent Rooms
                </h2>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="glass-card p-6 animate-pulse">
                      <div className="h-4 bg-white/5 rounded w-3/4 mb-3" />
                      <div className="h-3 bg-white/5 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : filteredRooms.length === 0 ? (
                <div className="glass-card p-12 text-center">
                  <Users className="w-12 h-12 text-white/10 mx-auto mb-4" />
                  <p className="text-white/30 text-sm">No rooms yet. Create one to get started!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredRooms.map((room) => (
                    <motion.div
                      key={room.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -2 }}
                      onClick={() => navigate(`/room/${room.id}`)}
                      className="glass-card p-6 cursor-pointer group hover:border-white/10 transition-all duration-300"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {!room.is_private ? (
                            <Globe className="w-4 h-4 text-neon-cyan" />
                          ) : (
                            <Lock className="w-4 h-4 text-white/30" />
                          )}
                          <h3 className="font-semibold text-sm group-hover:text-neon-indigo transition-colors">
                            {room.name}
                          </h3>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyCode(room.invite_code);
                          }}
                          className="text-white/20 hover:text-white/50 transition-colors"
                        >
                          {copied === room.invite_code ? (
                            <Check className="w-4 h-4 text-neon-green" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {room.description && (
                        <p className="text-white/30 text-xs mb-3 line-clamp-2">{room.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white/20 text-xs">
                          <Hash className="w-3 h-3" />
                          {room.invite_code}
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/10 group-hover:text-white/30 transition-colors" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>

            {/* Trending Public Rooms */}
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-neon-cyan" />
                Trending Public Rooms
              </h2>

              {filteredPublic.length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <Globe className="w-8 h-8 text-white/10 mx-auto mb-3" />
                  <p className="text-white/30 text-sm">No public rooms available right now.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPublic.map((room) => (
                    <motion.div
                      key={room.id}
                      whileHover={{ x: 4 }}
                      onClick={() => navigate(`/room/${room.id}`)}
                      className="glass-card !rounded-xl p-4 cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-green/20 flex items-center justify-center">
                          <Globe className="w-5 h-5 text-neon-cyan" />
                        </div>
                        <div>
                          <h3 className="font-medium text-sm">{room.name}</h3>
                          <p className="text-white/30 text-xs">{room.invite_code}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/10 group-hover:text-white/30 transition-colors" />
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Active Friends */}
            <div className="glass-card p-6">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                Active Friends
              </h3>
              <div className="space-y-3">
                {['Alex', 'Jordan', 'Sam', 'Riley'].map((name, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-neon-indigo/30 to-neon-cyan/30 flex items-center justify-center text-xs font-semibold">
                        {name[0]}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-neon-green border-2 border-surface-0" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{name}</div>
                      <div className="text-xs text-white/30">In a room</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="glass-card p-6">
              <h3 className="font-semibold text-sm mb-4">Your Stats</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-sm">Rooms joined</span>
                  <span className="font-semibold text-neon-indigo">12</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-sm">Hours watched</span>
                  <span className="font-semibold text-neon-cyan">48</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-sm">Friends</span>
                  <span className="font-semibold text-neon-green">7</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Create Room Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card p-8 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Create Room</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-white/30 hover:text-white/60">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-white/40 mb-1.5 block">Room Name</label>
                  <input
                    type="text"
                    placeholder="Friday Movie Night"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="text-sm text-white/40 mb-1.5 block">Description</label>
                  <input
                    type="text"
                    placeholder="What are we watching?"
                    value={newRoomDesc}
                    onChange={(e) => setNewRoomDesc(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="flex items-center justify-between glass !rounded-xl p-4">
                  <div>
                    <div className="text-sm font-medium">Public Room</div>
                    <div className="text-xs text-white/30">Anyone can discover and join</div>
                  </div>
                  <button
                    onClick={() => setIsPublic(!isPublic)}
                    className={`w-12 h-7 rounded-full transition-all duration-300 ${
                      isPublic ? 'bg-neon-indigo' : 'bg-white/10'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform duration-300 mx-1 ${
                        isPublic ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <button onClick={createRoom} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Plus className="w-5 h-5" />
                  Create Room
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Join Room Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowJoinModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card p-8 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Join Room</h2>
                <button onClick={() => setShowJoinModal(false)} className="text-white/30 hover:text-white/60">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-white/40 mb-1.5 block">Invite Code</label>
                  <input
                    type="text"
                    placeholder="ABC12345"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="input-field !text-center !text-lg !tracking-widest !font-mono"
                    maxLength={8}
                  />
                </div>
                <button onClick={joinRoom} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Hash className="w-5 h-5" />
                  Join Room
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
