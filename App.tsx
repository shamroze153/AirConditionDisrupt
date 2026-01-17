
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
  
  const [newTicketPulse, setNewTicketPulse] = useState(false);

  const [attendance, setAttendance] = useState<Record<string, boolean>>(() => {
    const stored = localStorage.getItem('fm_attendance');
    return stored ? JSON.parse(stored) : { Bilal: true, Asad: true, Taimoor: true, Saboor: true };
  });

  const prevTicketCount = useRef<number>(0);
  const beepAudio = useRef<HTMLAudioElement | null>(null);

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
        showToast("System Activity Detected");
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
      if (!isSilent) showToast("Cloud Connect Lost");
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [audioEnabled]);

  useEffect(() => {
    if (screen === 'app' || screen === 'checklist') {
      refreshData();
      // Auto-refresh every 10 seconds as requested for 'fully live' sync
      const interval = setInterval(() => refreshData(true), 10000); 
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
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[100] glass-panel px-4 py-1.5 rounded-full shadow-lg border border-indigo-50 flex items-center gap-2 animate-fadeIn">
           <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
           <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Syncing Hub...</span>
        </div>
      )}

      {newTicketPulse && (
        <div className="fixed top-8 right-8 z-[200] animate-bounce pointer-events-none">
           <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-3">
              <i className="fas fa-rocket text-yellow-400 text-xs"></i>
              <span className="text-[7px] font-black uppercase tracking-widest">Live Activity</span>
           </div>
        </div>
      )}

      {screen === 'landing' && <LandingView onProceed={handleStartApp} />}
      
      {screen === 'menu' && (
        <MenuView onBack={() => setScreen('landing')} onSelectView={handleEnterView} />
      )}
      
      {screen === 'app' && (
        <div className="h-full flex flex-col animate-fadeIn">
          <Header title={activeTab === AppTab.DASHBOARD ? "Dashboard" : activeTab === AppTab.OPS ? "Operations" : "Tech Era"} onBack={() => setScreen('menu')} />
          <div className="flex-1 overflow-y-auto hide-scroll pb-24">
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
  <div className="bg-white/95 backdrop-blur-md px-6 py-4 flex justify-between items-center shadow-sm z-50 sticky top-0 border-b border-slate-50">
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 active:scale-90"><i className="fas fa-chevron-left text-xs"></i></button>
      <div><p className="text-[6px] font-black text-indigo-500 uppercase tracking-[0.4em] mb-0.5 italic">DISRUPT FM HUB</p><h2 className="text-sm font-black text-slate-900 leading-none uppercase italic">{title}</h2></div>
    </div>
  </div>
);

const BottomNav: React.FC<{ activeTab: AppTab; onTabChange: (tab: AppTab) => void }> = ({ activeTab, onTabChange }) => (
  <div className="fixed bottom-0 left-0 w-full neo-blur pb-6 pt-3 px-6 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] rounded-t-[2rem] z-50 border-t border-slate-50 flex justify-around items-center glass-panel">
      <button onClick={() => onTabChange(AppTab.DASHBOARD)} className={`flex flex-col items-center transition-all ${activeTab === AppTab.DASHBOARD ? 'opacity-100' : 'opacity-20'}`}><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1 ${activeTab === AppTab.DASHBOARD ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400'}`}><i className="fas fa-chart-pie text-base"></i></div><span className="text-[7px] font-black uppercase">Dash</span></button>
      <button onClick={() => onTabChange(AppTab.OPS)} className={`flex flex-col items-center transition-all ${activeTab === AppTab.OPS ? 'opacity-100' : 'opacity-20'}`}><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1 ${activeTab === AppTab.OPS ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400'}`}><i className="fas fa-tasks text-base"></i></div><span className="text-[7px] font-black uppercase">Ops</span></button>
      <button onClick={() => onTabChange(AppTab.TECH)} className={`flex flex-col items-center transition-all ${activeTab === AppTab.TECH ? 'opacity-100' : 'opacity-20'}`}><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1 ${activeTab === AppTab.TECH ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400'}`}><i className="fas fa-user-astronaut text-base"></i></div><span className="text-[7px] font-black uppercase">Tech</span></button>
  </div>
);

export default App;
