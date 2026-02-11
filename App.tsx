import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Asset, Ticket, AppTab, StatsResponse, FMCategory, CategoryKey, GlobalStatsResponse } from './types.ts';
import { fetchAssets, fetchStats, fetchGlobalStats } from './services/api.ts';
import { FM_CATEGORIES, TECHNICIANS, ELECTRICAL_TECHNICIANS } from './constants.ts';
import LandingView from './components/LandingView.tsx';
import CategoryHubView from './components/CategoryHubView.tsx';
import DashboardView from './components/DashboardView.tsx';
import OpsView from './components/OpsView.tsx';
import TechView from './components/TechView.tsx';
import ChecklistView from './components/ChecklistView.tsx';
import GlobalDashboardView from './components/GlobalDashboardView.tsx';
import NotificationToast from './components/NotificationToast.tsx';
import SeatingView from './components/SeatingView.tsx';

const App: React.FC = () => {
  const [screen, setScreen] = useState<'landing' | 'category-hub' | 'app' | 'checklist' | 'global-dashboard'>('landing');
  const [currentCategory, setCurrentCategory] = useState<FMCategory>(FM_CATEGORIES[0]);
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.DASHBOARD);

  // CACHE HYDRATION with lazy initial state
  const [assets, setAssets] = useState<Asset[]>(() => {
    try {
      const cached = localStorage.getItem('fm_cache_assets');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    try {
      const cached = localStorage.getItem('fm_cache_tickets');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [stats, setStats] = useState<StatsResponse | null>(() => {
    try {
      const cached = localStorage.getItem('fm_cache_stats');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [globalStats, setGlobalStats] = useState<GlobalStatsResponse | null>(() => {
    try {
      const cached = localStorage.getItem('fm_cache_global_stats');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [connError, setConnError] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [newTicketPulse, setNewTicketPulse] = useState(false);

  const [acAttendance, setAcAttendance] = useState<Record<string, boolean>>(() => {
    const stored = localStorage.getItem('fm_ac_attendance');
    const initial: Record<string, boolean> = {};
    TECHNICIANS.forEach(t => initial[t] = true);
    return stored ? JSON.parse(stored) : initial;
  });

  const [elecAttendance, setElecAttendance] = useState<Record<string, boolean>>(() => {
    const stored = localStorage.getItem('fm_elec_attendance');
    const initial: Record<string, boolean> = {};
    ELECTRICAL_TECHNICIANS.forEach(t => initial[t] = true);
    return stored ? JSON.parse(stored) : initial;
  });

  const attendance = currentCategory.id === 'electrical' ? elecAttendance : acAttendance;
  const prevTicketCount = useRef<number>(tickets.length);
  const beepAudio = useRef<HTMLAudioElement | null>(null);
  const lastFetchTime = useRef<number>(0);

  const [activeZone, setActiveZone] = useState<number>(0);
  const [activeTech, setActiveTech] = useState<string>('');

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  useEffect(() => {
    beepAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
  }, []);

  const refreshData = useCallback(async (isSilent = false) => {
    // Throttling: prevent redundant heavy fetches if called too fast (within 2s)
    if (!isSilent && Date.now() - lastFetchTime.current < 2000) return;
    
    // Efficiency: skip fetch if tab is hidden to save battery/data
    if (document.visibilityState === 'hidden' && isSilent) return;

    try {
      const hasInitialData = screen === 'landing' || screen === 'category-hub' ? !!globalStats : (!!assets.length && !!stats);
      if (!isSilent && !hasInitialData) setIsLoading(true);

      lastFetchTime.current = Date.now();

      if (screen === 'landing' || screen === 'category-hub' || screen === 'global-dashboard' || currentCategory.id === 'seating') {
        const globalData = await fetchGlobalStats();
        if (globalData) {
          setGlobalStats(globalData);
          localStorage.setItem('fm_cache_global_stats', JSON.stringify(globalData));
        }
      } else {
        const [assetList, statData] = await Promise.all([
          fetchAssets(currentCategory.id),
          fetchStats(currentCategory.id)
        ]);
        
        const seenTags = new Set<string>();
        const sanitizedAssets = (assetList || []).filter(a => {
          const tag = String(a.tag || '').trim().toUpperCase();
          const room = String(a.room || '').trim();
          if (!tag || tag === 'N/A' || !room || seenTags.has(tag)) return false;
          seenTags.add(tag);
          return true;
        });

        const rawTickets = statData.complaints || [];
        let processedAssets = [...sanitizedAssets];

        if (currentCategory.id === 'ac') {
          const maintenanceTags = new Set(
            rawTickets
              .filter(t => !['resolved', 'completed'].some(s => String(t.status || '').toLowerCase().includes(s)))
              .map(t => String(t.assetTag).trim().toUpperCase())
          );

          processedAssets = processedAssets.map(a => {
            if (!['Active', 'Maintenance'].includes(a.status)) return a;
            const isMaint = maintenanceTags.has(String(a.tag).trim().toUpperCase());
            return { ...a, status: isMaint ? 'Maintenance' : 'Active' };
          });
        }

        if (rawTickets.length > prevTicketCount.current && prevTicketCount.current > 0) {
          if (audioEnabled) { beepAudio.current?.play().catch(() => {}); }
          showToast("New Ticket Logged");
          setNewTicketPulse(true);
          setTimeout(() => setNewTicketPulse(false), 5000);
        }
        prevTicketCount.current = rawTickets.length;

        setAssets(processedAssets);
        setTickets(rawTickets);
        setStats(statData);

        // Batch localStorage updates
        localStorage.setItem('fm_cache_assets', JSON.stringify(processedAssets));
        localStorage.setItem('fm_cache_tickets', JSON.stringify(rawTickets));
        localStorage.setItem('fm_cache_stats', JSON.stringify(statData));
      }
      setConnError(false);
    } catch (error) {
      setConnError(true);
      if (!isSilent) showToast("Connection Error");
    } finally {
      setIsLoading(false);
    }
  }, [audioEnabled, currentCategory, screen, assets.length, stats, globalStats, showToast]);

  useEffect(() => {
    refreshData(true);
    // Increase poll interval to 30s to "load less" while maintaining awareness
    const interval = setInterval(() => refreshData(true), 30000); 
    return () => clearInterval(interval);
  }, [screen, refreshData, currentCategory.id]);

  const toggleAttendance = (tech: string) => {
    const isElec = currentCategory.id === 'electrical';
    const next = isElec 
      ? { ...elecAttendance, [tech]: !elecAttendance[tech] }
      : { ...acAttendance, [tech]: !acAttendance[tech] };
    
    if (isElec) {
      setElecAttendance(next);
      localStorage.setItem('fm_elec_attendance', JSON.stringify(next));
    } else {
      setAcAttendance(next);
      localStorage.setItem('fm_ac_attendance', JSON.stringify(next));
    }
  };

  const handleStartApp = () => { setAudioEnabled(true); setScreen('category-hub'); };
  const handleSelectCategory = (category: FMCategory) => { setCurrentCategory(category); setActiveTab(AppTab.DASHBOARD); setScreen('app'); };
  const handleOpenChecklist = (zoneIdx: number, tech: string) => { setActiveZone(zoneIdx); setActiveTech(tech); setScreen('checklist'); };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-50 relative overflow-hidden font-inter text-[11px]">
      {toastMsg && <NotificationToast message={toastMsg} />}
      
      {isLoading && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] glass-panel px-4 py-1.5 rounded-full shadow-lg border border-indigo-50 flex items-center gap-2 animate-fadeIn">
           <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
           <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Syncing Hub...</span>
        </div>
      )}

      {connError && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] bg-rose-50 px-4 py-1.5 rounded-full shadow-lg border border-rose-100 flex items-center gap-2 animate-fadeIn">
           <div className="w-1.5 h-1.5 bg-rose-500 rounded-full"></div>
           <span className="text-[7px] font-black text-rose-500 uppercase tracking-widest">Link Interrupted</span>
        </div>
      )}

      {screen === 'landing' && <LandingView onProceed={handleStartApp} />}
      
      {screen === 'category-hub' && (
        <CategoryHubView 
          onBack={() => setScreen('landing')} 
          onSelectCategory={handleSelectCategory} 
          onOpenGlobal={() => setScreen('global-dashboard')}
          tickets={globalStats?.allTickets || []}
          acAttendance={acAttendance}
          elecAttendance={elecAttendance}
        />
      )}
      
      {screen === 'app' && (
        <div className="h-full flex flex-col animate-fadeIn">
          <Header 
            title={currentCategory.id === 'seating' ? "Seating Control" : `${currentCategory.name}`} 
            onBack={() => setScreen('category-hub')} 
            color={currentCategory.color}
          />
          
          {currentCategory.id !== 'seating' && (
            <div className="bg-white px-4 md:px-6 py-2 border-b border-slate-100 sticky top-[60px] md:top-[68px] z-40 shadow-sm">
              <div className="max-w-[1400px] mx-auto flex bg-slate-50 p-1 rounded-xl gap-1">
                {[
                  { tab: AppTab.DASHBOARD, icon: 'chart-pie', label: 'Dashboard' },
                  { tab: AppTab.OPS, icon: 'tasks', label: 'Operations' },
                  { tab: AppTab.TECH, icon: 'user-astronaut', label: 'Tech Era' }
                ].map(nav => (
                  <button 
                    key={nav.tab}
                    onClick={() => setActiveTab(nav.tab)}
                    className={`flex-1 py-2 md:py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all ${activeTab === nav.tab ? 'bg-slate-900 text-white shadow-lg scale-[1.02]' : 'text-slate-400 hover:bg-slate-100'}`}
                  >
                    <i className={`fas fa-${nav.icon} text-[9px] md:text-[10px]`}></i>
                    <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest">{nav.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto hide-scroll pb-20">
            {currentCategory.id === 'seating' ? (
              <SeatingView stats={globalStats} onRefresh={() => refreshData(false)} />
            ) : (
              <>
                {activeTab === AppTab.DASHBOARD && (
                  <DashboardView 
                    category={currentCategory}
                    assets={assets} 
                    tickets={tickets} 
                    stats={stats} 
                    onRefresh={() => refreshData(false)} 
                    onViewTech={() => setActiveTab(AppTab.TECH)} 
                  />
                )}
                {activeTab === AppTab.OPS && (
                  <OpsView 
                    category={currentCategory.id}
                    assets={assets} 
                    tickets={tickets} 
                    attendance={attendance} 
                    onRefresh={() => refreshData(false)} 
                    showToast={showToast} 
                  />
                )}
                {activeTab === AppTab.TECH && (
                  <TechView 
                    category={currentCategory.id}
                    attendance={attendance} 
                    toggleAttendance={toggleAttendance} 
                    tickets={tickets} 
                    assets={assets} 
                    onOpenChecklist={handleOpenChecklist} 
                    showToast={showToast} 
                    onRefresh={() => refreshData(false)} 
                    stats={stats} 
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {screen === 'checklist' && (
        <ChecklistView 
          category={currentCategory.id}
          zoneIdx={activeZone} 
          techName={activeTech} 
          assets={assets} 
          stats={stats} 
          onBack={() => setScreen('app')} 
          showToast={showToast} 
          refreshData={() => refreshData(true)} 
        />
      )}

      {screen === 'global-dashboard' && (
        <div className="h-full flex flex-col animate-fadeIn">
          <Header title="Global Ops Dashboard" onBack={() => setScreen('category-hub')} color="slate" />
          <div className="flex-1 overflow-y-auto hide-scroll pb-10">
            <GlobalDashboardView stats={globalStats} onRefresh={() => refreshData(false)} showToast={showToast} />
          </div>
        </div>
      )}
    </div>
  );
};

const Header: React.FC<{ title: string; onBack: () => void; color?: string }> = ({ title, onBack, color = 'indigo' }) => (
  <div className="bg-white/95 backdrop-blur-md px-4 md:px-6 py-3 md:py-4 flex justify-between items-center shadow-sm z-50 sticky top-0 border-b border-slate-50 h-[60px] md:h-[68px]">
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="w-8 h-8 md:w-9 md:h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 active:scale-90 shadow-inner border border-slate-100">
        <i className="fas fa-chevron-left text-[10px] md:text-xs"></i>
      </button>
      <div>
        <p className={`text-[5px] md:text-[6px] font-black text-${color}-500 uppercase tracking-[0.4em] mb-0.5 italic`}>FM CONTROL HUB</p>
        <h2 className="text-[11px] md:text-sm font-black text-slate-900 leading-none uppercase italic tracking-tight">{title}</h2>
      </div>
    </div>
    <div className="flex items-center gap-3">
       <div className="hidden md:block text-right">
          <p className="text-[6px] font-bold text-slate-300 uppercase tracking-widest italic">Hub Status</p>
          <p className="text-[7px] font-black text-emerald-500 uppercase italic">Online</p>
       </div>
       <div className="w-7 h-7 md:w-8 md:h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center shadow-lg">
          <i className="fas fa-satellite-dish text-[10px] animate-pulse"></i>
       </div>
    </div>
  </div>
);

export default App;