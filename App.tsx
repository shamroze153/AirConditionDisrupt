
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Asset, Ticket, AppTab, StatsResponse, FMCategory, GlobalStatsResponse } from './types';
import { fetchAssets, fetchStats, fetchGlobalStats } from './services/api';
import { FM_CATEGORIES, TECHNICIANS, ELECTRICAL_TECHNICIANS, GM_TECHNICIANS } from './constants';
import LandingView from './components/LandingView';
import CategoryHubView from './components/CategoryHubView';
import DashboardView from './components/DashboardView';
import OpsView from './components/OpsView';
import TechView from './components/TechView';
import ChecklistView from './components/ChecklistView';
import GlobalDashboardView from './components/GlobalDashboardView';
import TechPerformanceDashboard from './components/TechPerformanceDashboard';
import NotificationToast from './components/NotificationToast';
import SeatingView from './components/SeatingView';
import { ValetView } from './components/ValetView';
import { SoftFMView } from './components/SoftFMView';

const App: React.FC = () => {
  const [screen, setScreen] = useState<'landing' | 'category-hub' | 'app' | 'checklist' | 'global-dashboard' | 'soft-fm'>('landing');
  const [currentCategory, setCurrentCategory] = useState<FMCategory>(FM_CATEGORIES[0]);
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.DASHBOARD);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStatsResponse | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [connError, setConnError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);

  const [acAttendance, setAcAttendance] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    TECHNICIANS.forEach(t => initial[t] = true);
    return initial;
  });

  const [elecAttendance, setElecAttendance] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    ELECTRICAL_TECHNICIANS.forEach(t => initial[t] = true);
    return initial;
  });

  const [handymanAttendance, setHandymanAttendance] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    GM_TECHNICIANS.forEach(t => initial[t] = true);
    return initial;
  });

  const attendance = currentCategory?.id === 'electrical' 
    ? elecAttendance 
    : currentCategory?.id === 'handyman' 
      ? handymanAttendance 
      : acAttendance;
  
  const lastFetchTime = useRef<number>(0);
  const isFirstLoadRef = useRef(true);
  const [activeZone, setActiveZone] = useState<number>(0);
  const [activeTech, setActiveTech] = useState<string>('');

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const refreshData = useCallback(async (isSilent = false) => {
    if (!isSilent && Date.now() - lastFetchTime.current < 2000) return;
    if (document.visibilityState === 'hidden' && isSilent) return;

    try {
      if (!isSilent && isFirstLoadRef.current) setIsLoading(true);
      lastFetchTime.current = Date.now();

      if (screen === 'landing' || screen === 'category-hub' || screen === 'global-dashboard' || currentCategory.id === 'seating') {
        const globalData = await fetchGlobalStats();
        if (globalData && typeof globalData === 'object') {
          setGlobalStats(globalData);
          isFirstLoadRef.current = false;
        }
      } else {
        const [assetList, statData] = await Promise.all([
          fetchAssets(currentCategory.id),
          fetchStats(currentCategory.id)
        ]);
        
        if (assetList) setAssets(assetList);
        if (statData && typeof statData === 'object') {
          setTickets(statData.complaints || []);
          setStats(statData);
        }
        isFirstLoadRef.current = false;
      }
      setConnError(null);
    } catch (error: any) {
      setConnError(error.message || "Connection Interrupted");
      showToast("Sync Failure: Check Script Deployment");
    } finally {
      setIsLoading(false);
    }
  }, [currentCategory.id, screen]);

  useEffect(() => {
    refreshData(true);
    const interval = setInterval(() => refreshData(true), 30000); 
    return () => clearInterval(interval);
  }, [refreshData]);

  const toggleAttendance = (tech: string) => {
    if (currentCategory.id === 'electrical') {
      setElecAttendance(prev => ({ ...prev, [tech]: !prev[tech] }));
    } else if (currentCategory.id === 'handyman') {
      setHandymanAttendance(prev => ({ ...prev, [tech]: !prev[tech] }));
    } else {
      setAcAttendance(prev => ({ ...prev, [tech]: !prev[tech] }));
    }
  };

  const handleStartApp = () => { setAudioEnabled(true); setScreen('category-hub'); };
  const handleSelectCategory = (category: FMCategory) => { setCurrentCategory(category); setActiveTab(AppTab.DASHBOARD); setScreen('app'); isFirstLoadRef.current = true; };
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
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-rose-600 text-white px-6 py-3 rounded-2xl shadow-2xl border border-rose-500 flex items-center gap-4 animate-slideUp">
           <i className="fas fa-exclamation-triangle animate-pulse"></i>
           <div className="text-left">
             <p className="text-[8px] font-black uppercase tracking-widest opacity-70 leading-none mb-1">System Link Failure</p>
             <p className="text-[10px] font-bold italic">{connError}</p>
           </div>
           <button onClick={() => refreshData(false)} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all">Retry</button>
        </div>
      )}

      {screen === 'landing' && <LandingView onProceed={handleStartApp} />}
      
      {screen === 'category-hub' && (
        <CategoryHubView 
          onBack={() => setScreen('landing')} 
          onSelectCategory={handleSelectCategory} 
          onOpenGlobal={() => { setScreen('global-dashboard'); isFirstLoadRef.current = true; }}
          onOpenSoftFM={() => setScreen('soft-fm')}
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
          
          {currentCategory.id !== 'seating' && currentCategory.id !== 'valet' && (
            <div className="bg-white px-4 md:px-6 py-2 border-b border-slate-100 sticky top-[60px] md:top-[68px] z-40 shadow-sm">
              <div className="max-w-[1400px] mx-auto flex bg-slate-50 p-1 rounded-xl gap-1">
                {[
                  { tab: AppTab.DASHBOARD, icon: 'chart-pie', label: 'Dashboard' },
                  { tab: AppTab.OPS, icon: 'tasks', label: 'Operations' },
                  { tab: AppTab.TECH, icon: 'user-astronaut', label: 'Tech Era' },
                  { tab: AppTab.PERFORMANCE, icon: 'medal', label: 'Performance' }
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
            ) : currentCategory.id === 'valet' ? (
              <ValetView />
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
                {activeTab === AppTab.PERFORMANCE && (
                  <TechPerformanceDashboard 
                    category={currentCategory}
                    stats={stats}
                    onRefresh={() => refreshData(false)}
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
          <Header title="Hard FM Ops Data Disrupt" onBack={() => setScreen('category-hub')} color="slate" />
          <div className="flex-1 overflow-y-auto hide-scroll pb-10">
            <GlobalDashboardView stats={globalStats} onRefresh={() => refreshData(false)} showToast={showToast} />
          </div>
        </div>
      )}

      {screen === 'soft-fm' && (
        <div className="flex-1 h-full overflow-hidden">
          <SoftFMView onBack={() => setScreen('category-hub')} isAdmin={true} />
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
