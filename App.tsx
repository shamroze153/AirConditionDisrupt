
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Asset, Ticket, AppTab, StatsResponse, ChecklistType } from './types.ts';
import { fetchAssets, fetchStats, postAction } from './services/api.ts';
import { TECHNICIANS } from './constants.ts';
import LandingView from './components/LandingView.tsx';
import MenuView from './components/MenuView.tsx';
import DashboardView from './components/DashboardView.tsx';
import OpsView from './components/OpsView.tsx';
import TechView from './components/TechView.tsx';
import ChecklistView from './components/ChecklistView.tsx';
import NotificationToast from './components/NotificationToast.tsx';

const App: React.FC = () => {
  const [screen, setScreen] = useState<'landing' | 'menu' | 'app' | 'checklist'>('landing');
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.DASHBOARD);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [connError, setConnError] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  
  // Rocket signaling state
  const [newTicketPulse, setNewTicketPulse] = useState(false);

  const [attendance, setAttendance] = useState<Record<string, boolean>>(() => {
    const stored = localStorage.getItem('fm_attendance');
    return stored ? JSON.parse(stored) : { Bilal: true, Asad: true, Taimoor: true, Saboor: true };
  });

  const prevTicketCount = useRef<number>(0);
  const beepAudio = useRef<HTMLAudioElement | null>(null);

  // Checklist State
  const [activeZone, setActiveZone] = useState<number>(0);
  const [activeTech, setActiveTech] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    beepAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
  }, []);

  const refreshData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const [assetList, statData] = await Promise.all([
        fetchAssets(),
        fetchStats(new Date().toISOString())
      ]);
      
      const newTickets = statData.complaints || [];
      
      if (newTickets.length > prevTicketCount.current && prevTicketCount.current > 0) {
        if (audioEnabled) {
          beepAudio.current?.play().catch(() => {});
        }
        showToast("🔔 New Live Activity Detected");
        // Trigger Rocket Signal
        setNewTicketPulse(true);
        setTimeout(() => setNewTicketPulse(false), 5000);
      }
      prevTicketCount.current = newTickets.length;

      setAssets(assetList);
      setTickets(newTickets);
      setStats(statData);
      setConnError(false);
    } catch (error) {
      console.error("Data refresh failed", error);
      setConnError(true);
      if (!isSilent) showToast("Cloud Connect Interrupted");
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [audioEnabled]);

  useEffect(() => {
    if (screen === 'app' || screen === 'checklist') {
      refreshData();
      const interval = setInterval(() => refreshData(true), 15000); 
      return () => clearInterval(interval);
    }
  }, [screen, refreshData]);

  const toggleAttendance = (tech: string) => {
    const newAtt = { ...attendance, [tech]: !attendance[tech] };
    setAttendance(newAtt);
    localStorage.setItem('fm_attendance', JSON.stringify(newAtt));
  };

  const handleStartApp = () => {
    setAudioEnabled(true); 
    setScreen('menu');
  };

  const handleEnterView = (tab: AppTab) => {
    setActiveTab(tab);
    setScreen('app');
  };

  const handleOpenChecklist = (zoneIdx: number, tech: string) => {
    setActiveZone(zoneIdx);
    setActiveTech(tech);
    setScreen('checklist');
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-50 relative overflow-hidden transition-all duration-500 font-inter">
      {toastMsg && <NotificationToast message={toastMsg} />}
      
      {isLoading && !connError && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] neo-blur px-6 py-2.5 rounded-full shadow-xl border border-indigo-100 flex items-center gap-3 animate-slideDown">
           <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping"></div>
           <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Sync Active...</span>
        </div>
      )}

      {/* Signaling overlay (rocket pulse) */}
      {newTicketPulse && (
        <div className="fixed top-12 right-12 z-[200] animate-bounce pointer-events-none">
           <div className="bg-slate-900 text-white p-4 rounded-3xl shadow-2xl border border-white/20 flex items-center gap-4">
              <i className="fas fa-rocket text-yellow-400"></i>
              <span className="text-[10px] font-black uppercase tracking-widest">New System Activity</span>
           </div>
        </div>
      )}

      {screen === 'landing' && <LandingView onProceed={handleStartApp} />}
      
      {screen === 'menu' && (
        <MenuView onBack={() => setScreen('landing')} onSelectView={handleEnterView} />
      )}
      
      {screen === 'app' && (
        <div className="h-full flex flex-col animate-fadeIn">
          <Header title={activeTab === AppTab.DASHBOARD ? "Dashboard" : activeTab === AppTab.OPS ? "Ops & Admin" : "Tech Era"} onBack={() => setScreen('menu')} />
          <div className="flex-1 overflow-y-auto hide-scroll pb-32">
            {activeTab === AppTab.DASHBOARD && <DashboardView assets={assets} tickets={tickets} stats={stats} onRefresh={refreshData} onViewTech={() => setActiveTab(AppTab.TECH)} />}
            {activeTab === AppTab.OPS && <OpsView assets={assets} tickets={tickets} attendance={attendance} onRefresh={refreshData} showToast={showToast} />}
            {activeTab === AppTab.TECH && <TechView attendance={attendance} toggleAttendance={toggleAttendance} tickets={tickets} assets={assets} onOpenChecklist={handleOpenChecklist} showToast={showToast} onRefresh={refreshData} stats={stats} />}
          </div>
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      )}

      {screen === 'checklist' && (
        <ChecklistView zoneIdx={activeZone} techName={activeTech} assets={assets} stats={stats} onBack={() => setScreen('app')} showToast={showToast} refreshData={refreshData} />
      )}
    </div>
  );
};

const Header: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
  <div className="bg-white/90 backdrop-blur-xl px-6 py-5 flex justify-between items-center shadow-sm z-50 sticky top-0 border-b border-slate-100">
    <div className="flex items-center gap-4">
      <button onClick={onBack} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 active:scale-90"><i className="fas fa-chevron-left text-sm"></i></button>
      <div><p className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.3em] mb-1">DISRUPT FM v8.0</p><h2 className="text-xl font-black text-slate-900 leading-none">{title}</h2></div>
    </div>
  </div>
);

const BottomNav: React.FC<{ activeTab: AppTab; onTabChange: (tab: AppTab) => void }> = ({ activeTab, onTabChange }) => (
  <div className="fixed bottom-0 left-0 w-full neo-blur pb-8 pt-4 px-8 shadow-[0_-15px_40px_rgba(0,0,0,0.06)] rounded-t-[2.5rem] z-50 border-t border-slate-100 flex justify-between items-center">
      <button onClick={() => onTabChange(AppTab.DASHBOARD)} className={`flex-1 flex flex-col items-center transition-all ${activeTab === AppTab.DASHBOARD ? 'opacity-100' : 'opacity-30'}`}><div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-1 ${activeTab === AppTab.DASHBOARD ? 'bg-slate-900 text-white shadow-2xl' : 'text-slate-400'}`}><i className="fas fa-chart-pie text-xl"></i></div><span className="text-[9px] font-black uppercase">Dash</span></button>
      <button onClick={() => onTabChange(AppTab.OPS)} className={`flex-1 flex flex-col items-center transition-all ${activeTab === AppTab.OPS ? 'opacity-100' : 'opacity-30'}`}><div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-1 ${activeTab === AppTab.OPS ? 'bg-slate-900 text-white shadow-2xl' : 'text-slate-400'}`}><i className="fas fa-tasks text-xl"></i></div><span className="text-[9px] font-black uppercase">Ops</span></button>
      <button onClick={() => onTabChange(AppTab.TECH)} className={`flex-1 flex flex-col items-center transition-all ${activeTab === AppTab.TECH ? 'opacity-100' : 'opacity-30'}`}><div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-1 ${activeTab === AppTab.TECH ? 'bg-slate-900 text-white shadow-2xl' : 'text-slate-400'}`}><i className="fas fa-user-astronaut text-xl"></i></div><span className="text-[9px] font-black uppercase">Tech</span></button>
  </div>
);

export default App;
