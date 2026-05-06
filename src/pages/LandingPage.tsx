import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Play, Users, MessageCircle, Shield, Zap, Globe, Monitor, Smartphone, Headphones, Star, ArrowRight, ChevronRight } from 'lucide-react';
import ParticleField from '../components/ParticleField';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: 'easeOut' as const },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.1 } },
};

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface-0 relative overflow-hidden">
      <ParticleField />

      {/* Floating orbs */}
      <div className="floating-orb w-[600px] h-[600px] bg-neon-indigo top-[-200px] left-[-200px]" />
      <div className="floating-orb w-[400px] h-[400px] bg-neon-cyan bottom-[-100px] right-[-100px]" />
      <div className="floating-orb w-[300px] h-[300px] bg-neon-blue top-[40%] right-[10%]" />

      {/* Navbar */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 right-0 z-50 glass-strong"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-neon-indigo to-neon-cyan flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">SyncVerse</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-white/60 hover:text-white transition-colors">Features</a>
            <a href="#testimonials" className="text-sm text-white/60 hover:text-white transition-colors">Testimonials</a>
            <a href="#pricing" className="text-sm text-white/60 hover:text-white transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="btn-secondary !py-2.5 !px-5 !text-sm !rounded-xl">
              Log In
            </button>
            <button onClick={() => navigate('/signup')} className="btn-primary !py-2.5 !px-5 !text-sm !rounded-xl">
              Get Started
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Hero */}
      <section className="relative z-10 pt-40 pb-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="inline-flex items-center gap-2 glass-card !rounded-full px-5 py-2 mb-8">
              <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
              <span className="text-sm text-white/70">Now in public beta</span>
            </div>
          </motion.div>

          <motion.h1
            {...fadeUp}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold leading-[1.05] tracking-tight mb-6"
          >
            Watch Together.
            <br />
            <span className="bg-gradient-to-r from-neon-indigo via-neon-blue to-neon-cyan bg-clip-text text-transparent">
              Feel Together.
            </span>
          </motion.h1>

          <motion.p
            {...fadeUp}
            transition={{ delay: 0.15, duration: 0.6 }}
            className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Real-time synchronized streaming and communication for friends.
            Share the experience, no matter the distance.
          </motion.p>

          <motion.div
            {...fadeUp}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button
              onClick={() => navigate('/signup')}
              className="btn-primary flex items-center gap-2 text-base"
            >
              Create Room
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="btn-secondary flex items-center gap-2 text-base"
            >
              Join Room
              <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>

          {/* Device mockups */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
            className="mt-20 relative"
          >
            <div className="glass-card p-2 max-w-4xl mx-auto">
              <div className="bg-surface-1 rounded-[20px] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                  <div className="flex-1 flex justify-center">
                    <div className="glass !rounded-full px-4 py-1 text-xs text-white/40">
                      syncverse.app/room/abc123
                    </div>
                  </div>
                </div>
                <div className="aspect-video bg-gradient-to-br from-surface-2 to-surface-3 flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="relative z-10 flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-full glass-strong flex items-center justify-center neon-glow">
                      <Play className="w-8 h-8 text-neon-indigo fill-neon-indigo" />
                    </div>
                    <div className="flex items-center gap-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="w-10 h-10 rounded-full glass-strong border border-white/10 flex items-center justify-center"
                        >
                          <Users className="w-4 h-4 text-white/40" />
                        </div>
                      ))}
                      <div className="glass !rounded-full px-3 py-1.5 text-xs text-white/50">
                        +12 watching
                      </div>
                    </div>
                  </div>
                  {/* Chat sidebar preview */}
                  <div className="absolute right-0 top-0 bottom-0 w-64 glass-strong hidden md:flex flex-col p-4 gap-3">
                    <div className="text-xs text-white/40 font-medium mb-1">Live Chat</div>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-neon-indigo/30 to-neon-cyan/30 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-[10px] text-white/30 mb-0.5">User {i}</div>
                          <div className="text-[11px] text-white/60">This scene is incredible!</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Glow under mockup */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-neon-indigo/10 blur-[80px] rounded-full" />
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            {...fadeUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Everything you need to{' '}
              <span className="bg-gradient-to-r from-neon-indigo to-neon-cyan bg-clip-text text-transparent">
                watch together
              </span>
            </h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">
              Built for seamless shared experiences with zero lag and maximum immersion.
            </p>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-100px' }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {[
              { icon: Play, title: 'Sync Playback', desc: 'Frame-perfect video synchronization for everyone in the room. Play, pause, seek — all in perfect harmony.', color: 'from-neon-indigo to-neon-blue' },
              { icon: Headphones, title: 'Voice Chat', desc: 'Crystal-clear voice communication with noise suppression. Talk naturally while watching together.', color: 'from-neon-cyan to-neon-green' },
              { icon: MessageCircle, title: 'Live Chat', desc: 'Real-time text chat with reactions, emojis, and typing indicators. Never miss a moment.', color: 'from-neon-blue to-neon-indigo' },
              { icon: Shield, title: 'Private Rooms', desc: 'Create invite-only rooms with secure links. Your watch party, your rules.', color: 'from-neon-green to-neon-cyan' },
              { icon: Zap, title: 'Zero Latency', desc: 'Sub-second synchronization powered by WebRTC. No buffering, no delays, just the experience.', color: 'from-neon-pink to-neon-indigo' },
              { icon: Globe, title: 'Anywhere Access', desc: 'Works on any device, any browser. Desktop, tablet, or phone — the experience adapts.', color: 'from-neon-cyan to-neon-blue' },
            ].map((feature, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="glass-card p-8 group hover:border-white/10 transition-all duration-500 hover:-translate-y-1"
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Device showcase */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            {...fadeUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Beautiful on{' '}
              <span className="bg-gradient-to-r from-neon-cyan to-neon-green bg-clip-text text-transparent">
                every screen
              </span>
            </h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">
              Adaptive design that delivers a cinematic experience regardless of your device.
            </p>
          </motion.div>

          <div className="flex flex-col md:flex-row items-center justify-center gap-8">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="glass-card p-6 max-w-sm"
            >
              <Monitor className="w-8 h-8 text-neon-indigo mb-4" />
              <h3 className="text-lg font-semibold mb-2">Desktop</h3>
              <p className="text-white/40 text-sm">Full immersive experience with split-screen video and chat.</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="glass-card p-6 max-w-sm neon-glow"
            >
              <Smartphone className="w-8 h-8 text-neon-cyan mb-4" />
              <h3 className="text-lg font-semibold mb-2">Mobile</h3>
              <p className="text-white/40 text-sm">Optimized touch controls with collapsible chat and floating controls.</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="glass-card p-6 max-w-sm"
            >
              <Monitor className="w-8 h-8 text-neon-green mb-4" />
              <h3 className="text-lg font-semibold mb-2">Tablet</h3>
              <p className="text-white/40 text-sm">Perfect balance of screen real estate and portability.</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="relative z-10 py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            {...fadeUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Loved by{' '}
              <span className="bg-gradient-to-r from-neon-indigo to-neon-pink bg-clip-text text-transparent">
                watch parties
              </span>
            </h2>
            <p className="text-white/40 text-lg">See what our community has to say.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Sarah K.', role: 'Movie Enthusiast', text: 'SyncVerse changed how I watch movies with friends. The sync is flawless — it really feels like we\'re in the same room.', stars: 5 },
              { name: 'Marcus T.', role: 'Gaming Streamer', text: 'The voice chat quality is incredible. I host weekly watch parties and my viewers love the real-time interaction.', stars: 5 },
              { name: 'Aisha R.', role: 'Long-distance Friend', text: 'Being able to watch shows together while chatting has made long-distance friendships so much easier to maintain.', stars: 5 },
            ].map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="glass-card p-8"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-white/60 text-sm leading-relaxed mb-6">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-indigo/40 to-neon-cyan/40" />
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-white/30">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            {...fadeUp}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Simple{' '}
              <span className="bg-gradient-to-r from-neon-cyan to-neon-green bg-clip-text text-transparent">
                pricing
              </span>
            </h2>
            <p className="text-white/40 text-lg">Start free. Upgrade when you need more.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Free', price: '$0', period: '/month', features: ['Up to 4 viewers per room', 'Text chat', 'Basic sync', '2 rooms'], cta: 'Get Started', featured: false },
              { name: 'Pro', price: '$9', period: '/month', features: ['Up to 20 viewers per room', 'Voice chat', 'HD sync', 'Unlimited rooms', 'Priority support'], cta: 'Go Pro', featured: true },
              { name: 'Team', price: '$24', period: '/month', features: ['Up to 100 viewers per room', 'Voice + video chat', '4K sync', 'Unlimited rooms', 'Custom branding', 'API access'], cta: 'Contact Sales', featured: false },
            ].map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className={`glass-card p-8 relative ${plan.featured ? 'neon-glow border-neon-indigo/30' : ''}`}
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-neon-indigo to-neon-cyan text-white text-xs font-semibold px-4 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-white/30 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-white/60">
                      <div className="w-1.5 h-1.5 rounded-full bg-neon-indigo" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/signup')}
                  className={plan.featured ? 'btn-primary w-full' : 'btn-secondary w-full'}
                >
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-neon-indigo to-neon-cyan flex items-center justify-center">
                  <Play className="w-4 h-4 text-white fill-white" />
                </div>
                <span className="font-bold">SyncVerse</span>
              </div>
              <p className="text-white/30 text-sm">Watch together, feel together.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-white/30">
                <li className="hover:text-white/60 transition-colors cursor-pointer">Features</li>
                <li className="hover:text-white/60 transition-colors cursor-pointer">Pricing</li>
                <li className="hover:text-white/60 transition-colors cursor-pointer">Changelog</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-white/30">
                <li className="hover:text-white/60 transition-colors cursor-pointer">About</li>
                <li className="hover:text-white/60 transition-colors cursor-pointer">Blog</li>
                <li className="hover:text-white/60 transition-colors cursor-pointer">Careers</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-white/30">
                <li className="hover:text-white/60 transition-colors cursor-pointer">Privacy</li>
                <li className="hover:text-white/60 transition-colors cursor-pointer">Terms</li>
                <li className="hover:text-white/60 transition-colors cursor-pointer">Contact</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-white/20 text-sm">2026 SyncVerse. All rights reserved.</p>
            <div className="flex items-center gap-4 text-white/20 text-sm">
              <span className="hover:text-white/40 transition-colors cursor-pointer">Twitter</span>
              <span className="hover:text-white/40 transition-colors cursor-pointer">Discord</span>
              <span className="hover:text-white/40 transition-colors cursor-pointer">GitHub</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
