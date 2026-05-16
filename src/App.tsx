import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import { 
  Send, Bot, User, Loader2, Sparkles, Plus, Clock, 
  MessageSquare, ChevronRight, Trash2, LayoutDashboard,
  Settings, LogOut, Search, Zap, Globe, Shield, Terminal,
  Activity, Lock, Database, Cpu, ArrowUpRight, BarChart3
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';

type Tab = 'chat' | 'dashboard' | 'governance' | 'protocol';

interface Message {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

const QUICK_SUGGESTIONS = [
  "Strategic planning for Q4",
  "Technical architecture review",
  "Optimize customer acquisition",
  "Automate support workflows"
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentSession = useMemo(() => 
    sessions.find(s => s.id === currentSessionId) || null
  , [sessions, currentSessionId]);

  const messages = currentSession?.messages || [];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('bework_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
        if (parsed.length > 0) {
          setCurrentSessionId(parsed[0].id);
        }
      } catch (e) {
        console.error('Failed to parse sessions', e);
      }
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('bework_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentResponse]);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: 'New Discussion',
      messages: [],
      updatedAt: Date.now(),
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      const remaining = sessions.filter(s => s.id !== id);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, customInput?: string) => {
    if (e) e.preventDefault();
    const messageToSend = customInput || input;
    if (!messageToSend.trim() || isLoading) return;

    let targetSessionId = currentSessionId;
    
    // Auto-create session if none active
    if (!targetSessionId) {
      const newSession: ChatSession = {
        id: crypto.randomUUID(),
        title: messageToSend.slice(0, 40) + '...',
        messages: [],
        updatedAt: Date.now(),
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      targetSessionId = newSession.id;
    }

    const userMessage: Message = { role: 'user', parts: [{ text: messageToSend }] };
    
    // Update local state immediately
    setSessions(prev => prev.map(s => {
      if (s.id === targetSessionId) {
        return {
          ...s,
          messages: [...s.messages, userMessage],
          updatedAt: Date.now(),
          title: s.messages.length === 0 ? messageToSend.slice(0, 40) : s.title
        };
      }
      return s;
    }));

    setInput('');
    setIsLoading(true);
    setCurrentResponse('');

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageToSend,
          history: messages,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullAssistantText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') break;
              
              try {
                const { text, error } = JSON.parse(data);
                if (error) throw new Error(error);
                if (text) {
                  fullAssistantText += text;
                  setCurrentResponse(fullAssistantText);
                }
              } catch (e) { }
            }
          }
        }
      }

      setSessions(prev => prev.map(s => {
        if (s.id === targetSessionId) {
          return {
            ...s,
            messages: [...s.messages, { role: 'model', parts: [{ text: fullAssistantText }] }],
            updatedAt: Date.now()
          };
        }
        return s;
      }));
      setCurrentResponse('');
    } catch (error: any) {
      console.error('Chat Error:', error);
      const errorMessage: Message = { role: 'model', parts: [{ text: `I apologize, but I encountered an error: ${error.message}` }] };
      setSessions(prev => prev.map(s => s.id === targetSessionId ? { ...s, messages: [...s.messages, errorMessage] } : s));
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[100dvh] bg-[#020617] text-slate-100 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-fuchsia-600/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute inset-0 bg-[#020617]/40" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <LayoutGroup>
        {/* Sidebar - Desktop */}
        <motion.aside 
          layout
          className="hidden md:flex w-96 flex-col border-r border-white/[0.03] bg-[#020617]/50 backdrop-blur-3xl relative z-40"
        >
          <div className="px-8 py-12">
            <div className="flex items-center gap-4 mb-14 group cursor-default">
              <motion.div 
                whileHover={{ rotate: 180, scale: 1.15 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="bg-gradient-to-tr from-indigo-500 via-violet-600 to-fuchsia-600 p-3.5 rounded-[1.25rem] shadow-2xl shadow-indigo-500/30"
              >
                <Zap className="text-white w-7 h-7 fill-white" />
              </motion.div>
              <div className="flex flex-col">
                 <span className="font-black text-3xl tracking-tighter text-white leading-none">Bework</span>
                 <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mt-1.5 opacity-80">Intelligence Agent</span>
              </div>
            </div>

            <button 
              onClick={createNewSession}
              className="group relative flex items-center justify-between w-full px-7 py-5 bg-gradient-to-r from-white to-indigo-50 text-slate-900 rounded-[1.75rem] transition-all hover:scale-[1.02] active:scale-95 font-black text-sm shadow-[0_20px_50px_rgba(255,255,255,0.05)]"
            >
              <div className="flex items-center gap-3">
                <Plus className="w-5 h-5 text-indigo-600 stroke-[3px]" /> New Conversation
              </div>
              <motion.div 
                animate={{ scale: [1, 1.2, 1] }} 
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.8)]" 
              />
            </button>
          </div>

          <div className="px-8 mb-8">
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
              <input 
                type="text" 
                placeholder="Search repository..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-13 pr-4 py-4 bg-white/[0.03] border border-white/5 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none text-slate-300 placeholder:text-slate-600 hover:bg-white/[0.07]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 space-y-2.5 scrollbar-hide">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-5 px-5 mt-4 flex items-center gap-2">
              <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse"></div>
              Neural Context History
            </div>
            <AnimatePresence mode="popLayout">
              {filteredSessions.map(session => (
                <motion.div 
                  layout
                  key={session.id}
                  onClick={() => setCurrentSessionId(session.id)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  whileHover={{ x: 6, backgroundColor: "rgba(255,255,255,0.05)" }}
                  className={`group flex items-center gap-4 px-5 py-4.5 rounded-[1.5rem] cursor-pointer transition-all relative overflow-hidden active:scale-98 ${
                    currentSessionId === session.id 
                      ? 'bg-indigo-600/15 text-white border border-indigo-500/25 ring-1 ring-indigo-500/10' 
                      : 'text-slate-400 border border-transparent'
                  }`}
                >
                  {currentSessionId === session.id && (
                    <motion.div 
                      layoutId="active-indicator"
                      className="absolute inset-0 bg-indigo-500/5 backdrop-blur-sm -z-0"
                    />
                  )}
                  <MessageSquare className={`w-4.5 h-4.5 shrink-0 relative z-10 ${currentSessionId === session.id ? 'text-indigo-400' : 'text-slate-600'}`} />
                  <span className="text-sm font-bold truncate pr-8 relative z-10">{session.title}</span>
                  <button 
                    onClick={(e) => deleteSession(e, session.id)}
                    className="absolute right-5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 transition-all p-2 rounded-xl bg-slate-800/50 backdrop-blur-sm z-20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="p-8 mt-auto">
            <div className="p-1 px-1 bg-white/[0.03] rounded-[2rem] border border-white/5 shadow-2xl">
              <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-[1.75rem] border border-white/5">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-2xl shadow-indigo-500/30 group cursor-pointer">
                      <User className="w-7 h-7 text-white group-hover:scale-110 transition-transform" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-[#020617] rounded-full" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-black text-white tracking-tight">Kornel Das</span>
                    <span className="text-[9px] text-indigo-400 font-black uppercase tracking-[0.15em] mt-0.5">Quantum Neural Tier</span>
                  </div>
                </div>
                <div className="p-2.5 hover:bg-white/10 rounded-[1rem] transition-all cursor-pointer group">
                  <Settings className="w-5.5 h-5.5 text-slate-500 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mt-6">
               <button className="flex items-center justify-center gap-2 py-3.5 px-2 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest border border-indigo-500/10">
                 <Globe className="w-3.5 h-3.5" /> Region
               </button>
               <button className="flex items-center justify-center gap-2 py-3.5 px-2 bg-red-500/5 hover:bg-red-500/10 text-red-500/60 hover:text-red-400 rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest border border-red-500/10">
                 <LogOut className="w-3.5 h-3.5" /> Logout
               </button>
            </div>
          </div>
        </motion.aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative max-w-full overflow-hidden z-10">
          {/* Header */}
          <header className="h-28 flex items-center justify-between px-6 md:px-12 bg-[#020617]/50 backdrop-blur-3xl border-b border-white/[0.03] sticky top-0 z-50">
            <div className="flex items-center gap-4 md:gap-6">
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-3 rounded-2xl bg-white/5 border border-white/5 text-slate-400 hover:text-white transition-all active:scale-95"
              >
                <LayoutDashboard className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-4 group cursor-pointer" onClick={() => setActiveTab('chat')}>
                 <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 p-2.5 rounded-2xl shadow-xl shadow-indigo-600/20 group-hover:rotate-12 transition-transform"><Zap className="text-white w-6 h-6 fill-white" /></div>
                 <span className="font-black text-2xl md:text-3xl tracking-tighter text-white">Bework</span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-10">
               <div className="flex items-center gap-8 text-[11px] font-black text-slate-500 uppercase tracking-[0.25em]">
                 <button 
                  onClick={() => setActiveTab('dashboard')}
                  className={`flex items-center gap-2.5 cursor-pointer transition-all group ${activeTab === 'dashboard' ? 'text-white' : 'hover:text-white'}`}
                 >
                   <LayoutDashboard className={`w-4.5 h-4.5 ${activeTab === 'dashboard' ? 'text-indigo-400' : 'group-hover:text-indigo-400 group-hover:-translate-y-0.5 transition-transform'}`} /> Dashboard
                 </button>
                 <button 
                  onClick={() => setActiveTab('governance')}
                  className={`flex items-center gap-2.5 cursor-pointer transition-all group ${activeTab === 'governance' ? 'text-white' : 'hover:text-white'}`}
                 >
                   <Shield className={`w-4.5 h-4.5 ${activeTab === 'governance' ? 'text-indigo-400' : 'group-hover:text-indigo-400 group-hover:-translate-y-0.5 transition-transform'}`} /> Governance
                 </button>
                 <button 
                  onClick={() => setActiveTab('protocol')}
                  className={`flex items-center gap-2.5 cursor-pointer transition-all group ${activeTab === 'protocol' ? 'text-white' : 'hover:text-white'}`}
                 >
                   <Terminal className={`w-4.5 h-4.5 ${activeTab === 'protocol' ? 'text-indigo-400' : 'group-hover:text-indigo-400 group-hover:-translate-y-0.5 transition-transform'}`} /> Protocol
                 </button>
                 {activeTab !== 'chat' && (
                   <button 
                    onClick={() => setActiveTab('chat')}
                    className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-all group"
                   >
                     <MessageSquare className="w-4.5 h-4.5 group-hover:text-indigo-400 group-hover:-translate-y-0.5 transition-transform" /> Chat
                   </button>
                 )}
               </div>
            </div>
            <div className="flex items-center gap-5">
              <motion.div 
                 whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.08)" }}
                 onClick={() => setIsCommandPaletteOpen(true)}
                 className="p-3.5 rounded-2xl bg-white/5 border border-white/5 cursor-pointer text-slate-400 hover:text-white transition-all hidden md:block"
              >
                <Search className="w-6 h-6" />
              </motion.div>
            </div>
          </header>

        {/* Command Palette Overlay */}
        <AnimatePresence>
          {isCommandPaletteOpen && (
            <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsCommandPaletteOpen(false)}
                className="absolute inset-0 bg-[#020617]/80 backdrop-blur-xl"
              />
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="relative w-full max-w-2xl bg-[#070d1d] border border-white/10 rounded-[2.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.8)] overflow-hidden"
              >
                <div className="p-8 flex items-center gap-6 border-b border-white/5">
                  <Search className="w-8 h-8 text-indigo-400" />
                  <input 
                    autoFocus
                    placeholder="Search neural repository... (or hit Esc)" 
                    className="w-full bg-transparent border-none focus:outline-none text-2xl font-black placeholder:text-slate-700 text-white"
                  />
                </div>
                <div className="p-6 max-h-[400px] overflow-y-auto">
                   <div className="space-y-2">
                     <span className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest block mb-4">Command Suggestions</span>
                     {[
                       { icon: LayoutDashboard, label: 'Navigate to Dashboard', cmd: '⌘D' },
                       { icon: Clock, label: 'Recents Cycles', cmd: '⌘R' },
                       { icon: Plus, label: 'Establish New Interaction', cmd: '⌘N' },
                       { icon: Settings, label: 'Operator Settings', cmd: '⌘,' },
                     ].map(item => (
                       <button key={item.label} className="w-full flex items-center justify-between p-4 hover:bg-white/5 rounded-2xl group transition-all">
                         <div className="flex items-center gap-4">
                           <item.icon className="w-5 h-5 text-slate-500 group-hover:text-indigo-400" />
                           <span className="text-sm font-bold text-slate-400 group-hover:text-white">{item.label}</span>
                         </div>
                         <span className="text-[10px] font-mono text-slate-700 bg-white/5 px-2 py-1 rounded">{item.cmd}</span>
                       </button>
                     ))}
                   </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Mobile Menu Drawer */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden"
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 left-0 w-[85%] max-w-sm bg-[#070d1d] border-r border-white/5 z-[70] md:hidden flex flex-col p-8"
              >
                <div className="flex items-center justify-between mb-12">
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 p-2 rounded-xl"><Zap className="text-white w-5 h-5 fill-white" /></div>
                    <span className="font-black text-2xl tracking-tighter text-white">Bework</span>
                  </div>
                  <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-500 hover:text-white">
                    <LogOut className="w-6 h-6 rotate-90" />
                  </button>
                </div>

                <div className="space-y-3 mb-10">
                   <button 
                    onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600/10 border border-indigo-500/20 text-white' : 'text-slate-400 hover:bg-white/5'}`}
                   >
                     <LayoutDashboard className="w-5 h-5" />
                     <span className="font-black text-[11px] uppercase tracking-widest">Dashboard</span>
                   </button>
                   <button 
                    onClick={() => { setActiveTab('governance'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === 'governance' ? 'bg-indigo-600/10 border border-indigo-500/20 text-white' : 'text-slate-400 hover:bg-white/5'}`}
                   >
                     <Shield className="w-5 h-5" />
                     <span className="font-black text-[11px] uppercase tracking-widest">Governance</span>
                   </button>
                   <button 
                    onClick={() => { setActiveTab('protocol'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === 'protocol' ? 'bg-indigo-600/10 border border-indigo-500/20 text-white' : 'text-slate-400 hover:bg-white/5'}`}
                   >
                     <Terminal className="w-5 h-5" />
                     <span className="font-black text-[11px] uppercase tracking-widest">Protocol</span>
                   </button>
                   <button 
                    onClick={() => { setActiveTab('chat'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === 'chat' ? 'bg-indigo-600/10 border border-indigo-500/20 text-white' : 'text-slate-400 hover:bg-white/5'}`}
                   >
                     <MessageSquare className="w-5 h-5" />
                     <span className="font-black text-[11px] uppercase tracking-widest">Chat AI</span>
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Synapse Cycles</span>
                    <button onClick={createNewSession} className="p-2 hover:bg-indigo-600/10 rounded-lg text-indigo-400 transition-colors"><Plus className="w-4 h-4" /></button>
                  </div>
                  {sessions.map(session => (
                    <button
                      key={session.id}
                      onClick={() => { setCurrentSessionId(session.id); setIsMobileMenuOpen(false); setActiveTab('chat'); }}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all border ${currentSessionId === session.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 border-transparent text-slate-400 hover:text-white'}`}
                    >
                      <MessageSquare className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-bold truncate tracking-tight">{session.title}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="px-6 py-12 md:px-24 lg:px-44">
            <AnimatePresence mode="wait">
              {activeTab === 'chat' ? (
                <motion.div
                  key="chat-view"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full flex flex-col"
                >
                  {!currentSession || (messages.length === 0 && !isLoading) ? (
                    <motion.div 
                      key="empty"
                      variants={container}
                      initial="hidden"
                      animate="show"
                      exit={{ opacity: 0, scale: 0.9, filter: "blur(20px)" }}
                      className="flex flex-col items-center justify-center min-h-[60vh] max-w-4xl mx-auto text-center"
                    >
                      <motion.div variants={item} className="relative mb-12 md:mb-16">
                        <motion.div 
                          animate={{ rotate: -360 }}
                          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-0 bg-gradient-to-tr from-indigo-500/40 to-violet-500/40 rounded-[4rem] blur-[80px]"
                        />
                        <motion.div 
                          whileHover={{ scale: 1.1, rotate: -5 }}
                          className="relative bg-white p-8 md:p-12 rounded-[2.5rem] md:rounded-[3.5rem] shadow-[0_40px_100px_rgba(99,102,241,0.3)] border border-white"
                        >
                          <Zap className="w-16 h-16 md:w-28 md:h-28 text-indigo-600 fill-indigo-600 stroke-[1.5px]" />
                        </motion.div>
                      </motion.div>

                      <motion.h1 
                        variants={item}
                        className="text-4xl md:text-8xl font-black text-white mb-6 md:mb-10 tracking-tighter leading-[0.95]"
                      >
                        Forge your <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent italic pr-2">advantage.</span>
                      </motion.h1>

                      <motion.p 
                        variants={item}
                        className="text-slate-400 mb-12 md:mb-20 text-lg md:text-2xl font-semibold leading-relaxed max-w-2xl mx-auto opacity-70"
                      >
                        Bework is your high-bandwidth neural link for strategic growth, operational excellence, and technical mastery.
                      </motion.p>
                      
                      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 w-full max-w-3xl px-6">
                        {QUICK_SUGGESTIONS.map((suggestion, idx) => (
                          <motion.button
                            key={suggestion}
                            whileHover={{ scale: 1.05, borderColor: "rgba(99,102,241,0.5)", backgroundColor: "rgba(255,255,255,0.08)" }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleSubmit(undefined, suggestion)}
                            className="group flex items-center justify-between px-8 py-6 md:px-10 md:py-8 bg-white/[0.04] border border-white/5 rounded-[2rem] md:rounded-[2.75rem] text-left transition-all duration-500 backdrop-blur-3xl shadow-2xl shadow-indigo-500/5"
                          >
                            <span className="text-xs md:text-sm font-black text-slate-200 tracking-tight leading-tight">{suggestion}</span>
                            <div className="p-3 md:p-4 bg-slate-900 rounded-xl md:rounded-2xl group-hover:scale-110 group-hover:bg-indigo-600 transition-all duration-500">
                              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-indigo-400 group-hover:text-white" />
                            </div>
                          </motion.button>
                        ))}
                      </motion.div>
                    </motion.div>
                  ) : (
                    <div className="max-w-5xl mx-auto space-y-20 w-full">
                      <AnimatePresence initial={false}>
                        {messages.map((m, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 30, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ type: "spring", stiffness: 200, damping: 20 }}
                            className={`flex gap-10 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                          >
                            <motion.div 
                              initial={{ opacity: 0, scale: 0 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={`w-14 h-14 rounded-3xl flex items-center justify-center shrink-0 mt-2 shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-white/10 ${
                                m.role === 'user' 
                                  ? 'bg-gradient-to-tr from-slate-700 via-slate-800 to-slate-950 text-white' 
                                  : 'bg-indigo-600 text-white'
                              }`}
                            >
                              {m.role === 'user' ? <User className="w-7 h-7" /> : <Zap className="w-7 h-7 fill-white" />}
                            </motion.div>
                            <div className={`max-w-[82%] relative group ${
                              m.role === 'user' 
                                ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-[3rem] rounded-tr-none px-10 py-8 shadow-[0_30px_70px_rgba(79,70,229,0.35)] font-bold border border-white/10' 
                                : 'glass-panel text-slate-200 rounded-[3rem] rounded-tl-none px-10 py-8 font-semibold border-indigo-500/15 shadow-2xl'
                            }`}>
                              <div className={`markdown-body text-[16px] leading-[1.8] ${m.role === 'user' ? 'selection:bg-white/30' : ''}`}>
                                <ReactMarkdown>{m.parts[0].text}</ReactMarkdown>
                              </div>
                              
                              {/* Decorative quote mark for bot only */}
                              {m.role === 'model' && (
                                 <div className="absolute -left-4 -top-4 opacity-10">
                                   <Bot className="w-12 h-12 text-white" />
                                 </div>
                              )}
                            </div>
                          </motion.div>
                        ))}
                        
                        {(isLoading || currentResponse) && (
                          <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex gap-10"
                          >
                            <div className="w-14 h-14 rounded-3xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-2 shadow-2xl border border-white/10 overflow-hidden relative">
                              <Zap className="w-7 h-7 fill-white relative z-10" />
                              <motion.div 
                                animate={{ y: [-40, 40] }} 
                                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                                className="absolute inset-0 bg-white/20 blur-xl"
                              />
                            </div>
                            <div className="glass-panel text-slate-100 rounded-[3rem] rounded-tl-none px-10 py-8 shadow-2xl max-w-[82%] min-w-[180px] border-indigo-500/15">
                              {currentResponse ? (
                                <div className="markdown-body text-[16px] leading-[1.8]">
                                  <ReactMarkdown>{currentResponse}</ReactMarkdown>
                                </div>
                              ) : (
                                <div className="flex items-center gap-4 py-5">
                                  <div className="flex gap-2">
                                    <motion.div animate={{ height: [12, 32, 12] }} transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }} className="w-2 bg-indigo-600 rounded-full" />
                                    <motion.div animate={{ height: [12, 48, 12] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2, ease: "easeInOut" }} className="w-2 bg-indigo-400 rounded-full" />
                                    <motion.div animate={{ height: [12, 32, 12] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4, ease: "easeInOut" }} className="w-2 bg-indigo-200 rounded-full" />
                                  </div>
                                  <span className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.3em] ml-4 animate-pulse">Processing...</span>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </motion.div>
              ) : activeTab === 'dashboard' ? (
                <DashboardView key="dashboard-view" />
              ) : activeTab === 'governance' ? (
                <GovernanceView key="governance-view" />
              ) : (
                <ProtocolView key="protocol-view" />
              )}
            </AnimatePresence>
          </div>
        </div>

          {/* Input Area (Only for Chat) */}
          {activeTab === 'chat' && (
            <div className="p-6 md:p-18 bg-gradient-to-t from-[#020617] via-[#020617]/90 to-transparent sticky bottom-0 w-full z-40">
              <div className="max-w-5xl mx-auto relative">
                <motion.form 
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  onSubmit={handleSubmit}
                  className="relative group"
                >
                  {/* Neon glow effect */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 rounded-[2.5rem] md:rounded-[3.5rem] blur-3xl opacity-10 group-focus-within:opacity-50 transition-all duration-700 animate-pulse"></div>
                  
                  <div className="relative flex items-center bg-[#070d1d] border-2 border-white/5 rounded-[2rem] md:rounded-[3rem] shadow-[0_40px_100px_rgba(0,0,0,0.6)] group-focus-within:border-indigo-500/40 transition-all backdrop-blur-4xl">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Brief Bework AI..."
                      className="w-full pl-8 md:pl-12 pr-24 md:pr-32 py-6 md:py-9 bg-transparent focus:outline-none text-white font-black text-lg md:text-xl placeholder:text-slate-700 tracking-tight"
                    />
                    <div className="absolute right-3 md:right-5 flex items-center gap-2 md:gap-3">
                      <button
                        disabled={isLoading || !input.trim()}
                        className="group flex items-center justify-center gap-2 md:gap-3 h-12 md:h-16 px-6 md:px-10 bg-white hover:bg-white text-slate-900 hover:text-indigo-600 disabled:bg-slate-800 disabled:text-slate-600 rounded-[1.25rem] md:rounded-[2rem] transition-all shadow-3xl active:scale-95 disabled:scale-100 font-black text-[10px] md:text-sm uppercase tracking-[0.2em] relative overflow-hidden"
                      >
                        <motion.div 
                          initial={false}
                          animate={isLoading ? { scale: [1, 1.1, 1] } : {}}
                          transition={{ repeat: Infinity }}
                          className="relative z-10 flex items-center gap-2"
                        >
                          {isLoading ? <Loader2 className="w-4 h-4 md:w-6 md:h-6 animate-spin" /> : <Send className="w-4 h-4 md:w-6 md:h-6 mr-0 md:mr-1 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />}
                          <span className="hidden sm:inline">{isLoading ? '' : 'Transmit'}</span>
                        </motion.div>
                      </button>
                    </div>
                  </div>
                </motion.form>
                <div className="flex flex-col md:flex-row md:items-center justify-between px-8 md:px-12 mt-6 md:mt-8 gap-4">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                      <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Strategic Protocol</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-violet-500 rounded-full"></div>
                      <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">End-Locked Security</span>
                    </div>
                  </div>
                  <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] opacity-40">Build 0x92f - persistent intelligence</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </LayoutGroup>
    </div>
  );
}

const DASHBOARD_DATA = [
  { name: '00:00', value: 400, usage: 240 },
  { name: '04:00', value: 300, usage: 139 },
  { name: '08:00', value: 900, usage: 980 },
  { name: '12:00', value: 1200, usage: 1100 },
  { name: '16:00', value: 1500, usage: 1400 },
  { name: '20:00', value: 800, usage: 600 },
];

function DashboardView() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-6xl mx-auto space-y-8 md:space-y-12 pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-4 italic pr-4 bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">Neural Analytics</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] md:text-xs">Real-time performance metrics</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="px-5 py-4 glass-panel rounded-2xl border-indigo-500/20">
            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Active Nodes</span>
            <span className="text-xl md:text-2xl font-black">1,402</span>
          </div>
          <div className="px-5 py-4 glass-panel rounded-2xl border-indigo-500/20">
            <span className="text-[9px] font-black text-green-400 uppercase tracking-widest block mb-1">Uptime</span>
            <span className="text-xl md:text-2xl font-black">99.99%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-2 glass-panel p-6 md:p-8 rounded-[2.5rem] md:rounded-[3rem] border-indigo-500/10 min-h-[350px] md:min-h-[400px]">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Activity className="text-indigo-400 w-5 h-5" />
              <span className="font-black text-xs md:text-sm uppercase tracking-widest">Neural Load Trend</span>
            </div>
          </div>
          <div className="h-[250px] md:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={DASHBOARD_DATA}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase' }}
                />
                <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-8">
          <div className="glass-panel p-8 rounded-[3rem] border-indigo-500/10">
            <div className="flex items-center gap-3 mb-6">
              <Cpu className="text-fuchsia-400 w-5 h-5" />
              <span className="font-black text-sm uppercase tracking-widest">Processor Core</span>
            </div>
            <div className="space-y-6">
              {['Core A-1', 'Core B-4', 'Core X-9'].map((core, i) => (
                <div key={core} className="space-y-2">
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <span>{core}</span>
                    <span className={i === 1 ? 'text-amber-400' : 'text-indigo-400'}>{80 - i * 15}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${80 - i * 15}%` }}
                      className={`h-full rounded-full ${i === 1 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="glass-panel p-8 rounded-[3.5rem] bg-indigo-600 shadow-2xl shadow-indigo-600/20 border-white/20">
             <div className="flex justify-between items-start mb-6">
               <Zap className="w-10 h-10 fill-white" />
               <ArrowUpRight className="w-6 h-6 opacity-50" />
             </div>
             <h3 className="text-2xl font-black mb-2">Upgrade Instance</h3>
             <p className="text-indigo-100 text-[11px] font-bold uppercase tracking-widest mb-6">Scale your infrastructure for 10x throughput</p>
             <button className="w-full py-4 bg-white text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Activate Scale</button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function GovernanceView() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-5xl mx-auto space-y-8 md:space-y-12 pb-20"
    >
      <div className="flex items-center gap-4 md:gap-6">
        <div className="p-4 md:p-5 bg-indigo-600/10 rounded-[1.75rem] md:rounded-[2rem] border border-indigo-500/20">
          <Shield className="w-8 h-8 md:w-10 md:h-10 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tighter leading-tight">System Governance</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[9px] md:text-xs mt-1 md:mt-2">Compliance & Security Control Center</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        <div className="glass-panel p-8 md:p-10 rounded-[2.5rem] md:rounded-[4rem] border-emerald-500/10">
          <div className="flex items-center justify-between mb-8 md:mb-10">
            <div className="flex items-center gap-3">
              <Lock className="text-emerald-400 w-5 h-5" />
              <span className="font-black text-xs md:text-sm uppercase tracking-widest">Active Policies</span>
            </div>
            <span className="px-3 md:px-4 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[9px] font-black uppercase tracking-widest">Hardened</span>
          </div>
          <div className="space-y-4 md:space-y-6">
            {[
              { label: 'E2E Encryption', status: 'Active' },
              { label: 'Neural Isolation', status: 'Strict' },
              { label: 'Automated Redacting', status: 'Active' },
              { label: 'Multi-Geo Sync', status: 'Global' },
            ].map(policy => (
              <div key={policy.label} className="flex items-center justify-between p-4 md:p-5 bg-white/[0.03] rounded-[1.5rem] md:rounded-3xl border border-white/5">
                <span className="text-xs md:text-sm font-bold text-slate-300">{policy.label}</span>
                <span className="text-[8px] md:text-[10px] font-black text-emerald-400 uppercase tracking-widest px-2 md:px-3 py-1 bg-emerald-400/5 rounded-lg">{policy.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-8 md:p-10 rounded-[2.5rem] md:rounded-[4rem] border-indigo-500/10">
          <div className="flex items-center gap-3 mb-8 md:mb-10">
            <Clock className="text-indigo-400 w-5 h-5" />
            <span className="font-black text-xs md:text-sm uppercase tracking-widest">Audit Repository</span>
          </div>
          <div className="space-y-4 md:space-y-5">
            {[
              { time: '08:42:11', event: 'New agent provisioned', type: 'ADMIN' },
              { time: '09:12:05', event: 'Policy override attempt', type: 'SECURITY' },
              { time: '11:55:59', event: 'Global sync completed', type: 'SYSTEM' },
              { time: '14:20:30', event: 'Neural link refreshed', type: 'USER' },
            ].map(log => (
              <div key={log.time} className="flex items-center gap-4 group cursor-default">
                <span className="text-[9px] font-mono text-slate-600 shrink-0">{log.time}</span>
                <span className="text-[11px] md:text-xs font-bold text-slate-400 group-hover:text-white transition-colors truncate">{log.event}</span>
                <span className="ml-auto text-[8px] font-black text-indigo-500/50 uppercase tracking-widest">{log.type}</span>
              </div>
            ))}
            <button className="w-full mt-6 py-4 border border-white/5 hover:bg-white/5 rounded-xl md:rounded-2xl text-[9px] font-black uppercase tracking-widest text-slate-500 transition-colors">Export Ledger</button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ProtocolView() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto space-y-8 md:space-y-12 pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="p-4 md:p-5 bg-fuchsia-600/10 rounded-[1.75rem] md:rounded-[2rem] border border-fuchsia-500/20">
            <Terminal className="w-8 h-8 md:w-10 md:h-10 text-fuchsia-400" />
          </div>
          <div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter italic leading-tight">Technical Protocol</h2>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-[9px] md:text-xs mt-1 md:mt-2">Neural Link v11.4 Specification</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 py-3 bg-white/5 rounded-2xl border border-white/10 w-fit">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(99,102,241,1)]"></div>
          <span className="text-[9px] font-black uppercase tracking-[0.3em]">Protocol Bound</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="md:col-span-2 space-y-6 md:space-y-8">
           <div className="glass-panel p-1 rounded-[2.5rem] md:rounded-[3.5rem] border border-white/5">
              <div className="bg-[#070d1d] rounded-[2.25rem] md:rounded-[3.25rem] p-6 md:p-10">
                 <div className="flex items-center gap-4 mb-6 md:mb-8">
                   <div className="p-3 bg-indigo-500/10 rounded-2xl"><Database className="w-5 h-5 md:w-6 md:h-6 text-indigo-400" /></div>
                   <span className="font-black text-base md:text-lg tracking-tight">API Interface Matrix</span>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                   {['Neural Streaming', 'Context Fetch', 'Batch Process', 'Vector Sync'].map(endpoint => (
                     <div key={endpoint} className="p-5 md:p-6 rounded-2xl md:rounded-3xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all group cursor-pointer">
                        <div className="flex justify-between items-center mb-3 md:mb-4">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-indigo-400">{endpoint}</span>
                          <span className="text-[8px] font-mono text-emerald-400">200 OK</span>
                        </div>
                        <div className="text-[9px] font-mono text-slate-600 truncate">/api/v1/neural/{endpoint.toLowerCase().replace(' ', '-')}</div>
                     </div>
                   ))}
                 </div>
              </div>
           </div>
           
           <div className="glass-panel p-8 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] border-fuchsia-500/10">
              <div className="flex justify-between items-center mb-8">
                <span className="font-black text-[11px] md:text-sm uppercase tracking-widest">Neural Link Logs</span>
                <span className="text-[9px] font-black text-slate-600 animate-pulse uppercase tracking-widest">Live Updates</span>
              </div>
              <div className="font-mono text-[10px] md:text-xs space-y-3 max-h-[180px] md:max-h-[200px] overflow-y-auto scrollbar-hide">
                <p className="text-indigo-500/70">{">"} Protocol handshake initiated...</p>
                <p className="text-slate-400">{">"} Requesting vector embedding update from cluster node 0xf...</p>
                <p className="text-emerald-500/70">{">"} Handshake verified. Strategic channel encrypted.</p>
                <p className="text-slate-400">{">"} Streaming contextual assets for current session...</p>
                <p className="text-amber-500/70">{">"} Warning: Latency spike detected in EU-West-4 zone.</p>
                <p className="text-slate-400">{">"} Re-routing neural traffic through secondary mesh...</p>
              </div>
           </div>
        </div>

        <div className="glass-panel p-8 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] border-indigo-500/10 h-fit md:sticky md:top-40">
           <div className="flex items-center gap-3 mb-8">
             <LayoutDashboard className="w-5 h-5 text-indigo-400" />
             <span className="font-black text-xs md:text-sm uppercase tracking-widest">Active Assets</span>
           </div>
           <div className="space-y-6">
              {[
                { name: 'Knowledge Graph', size: '1.2 TB', health: '98%' },
                { name: 'Model Weights', size: '254 GB', health: '100%' },
                { name: 'System Cache', size: '12 GB', health: '94%' },
              ].map(asset => (
                <div key={asset.name} className="group">
                  <div className="flex justify-between mb-2">
                    <span className="text-[10px] md:text-[11px] font-black text-white">{asset.name}</span>
                    <span className="text-[9px] md:text-[10px] font-black text-emerald-400">{asset.health}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-[9px] font-bold text-slate-500">{asset.size}</span>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5,6,7,8].map(i => (
                        <div key={i} className={`w-1 md:w-1.5 h-2 md:h-3 rounded-full ${i <= (parseInt(asset.health)/12.5) ? 'bg-indigo-500' : 'bg-slate-800'}`}></div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
           </div>
           <button className="w-full mt-10 py-5 bg-gradient-to-tr from-fuchsia-600 to-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:scale-[1.02] transition-transform">Purge Cache</button>
        </div>
      </div>
    </motion.div>
  );
}
