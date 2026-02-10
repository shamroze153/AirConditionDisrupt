import React, { useState, useMemo, useEffect } from 'react';
import { Asset, Ticket, StatsResponse, CategoryKey, Tool, PerformanceLogEntry } from '../types.ts';
import { CATEGORY_TECHS, DEFAULT_TOOLS, GAS_TYPES, TECHNICIANS, ELECTRICAL_TECHNICIANS, ELECTRICAL_MODULE_DATA } from '../constants.ts';
import { submitDemand, postAction, fetchTools, updateTool, addTool, deleteTool, updateAssetStatus, updatePoints, logTakeover } from '../services/api.ts';

interface Props {
  category: CategoryKey;
  attendance: Record<string, boolean>;
  toggleAttendance: (tech: string) => void;
  tickets: Ticket[];
  assets: Asset[];
  onOpenChecklist: (zoneIdx: number, tech: string) => void;
  showToast: (msg: string) => void;
  onRefresh: () => void;
  stats: StatsResponse | null;
}

const TechView: React.FC<Props> = ({ category, attendance, toggleAttendance, tickets, assets, onOpenChecklist, showToast, onRefresh, stats }) => {
  const [view, setView] = useState<'profiles' | 'hub' | 'demands' | 'tools'>('profiles');
  const [selectedTech, setSelectedTech] = useState<string | null>(null);
  const [multiSelectedTechs, setMultiSelectedTechs] = useState<string[]>([]);
  const [demandText, setDemandText] = useState('');
  const [demandTech, setDemandTech] = useState('');
  const [isSubmittingDemand, setIsSubmittingDemand] = useState(false);
  const [isSyncingSLA, setIsSyncingSLA] = useState(false);
  
  const [takeoverModal, setTakeoverModal] = useState<{ zoneIdx: number, originalTech: string } | null>(null);
  const [actingTechSelection, setActingTechSelection] = useState<string>('');

  const activeTechList = CATEGORY_TECHS[category] || [];
  
  const presentTechsOfTrade = useMemo(() => {
    return activeTechList.filter(name => !!attendance[name]);
  }, [activeTechList, attendance]);

  const allAvailableTechs = useMemo(() => {
    return [...(CATEGORY_TECHS.ac || []), ...(CATEGORY_TECHS.electrical || []), ...(CATEGORY_TECHS.handyman || [])];
  }, []);

  const [resolveTicket, setResolveTicket] = useState<Ticket | null>(null);
  const [solvingTechs, setSolvingTechs] = useState<string[]>([]);
  const [resolveType, setResolveType] = useState<'Minor' | 'Major'>('Minor');
  const [resolveRemarks, setResolveRemarks] = useState('');
  const [gasUsedYesNo, setGasUsedYesNo] = useState<'Yes' | 'No'>('No');
  const [gasAmount, setGasAmount] = useState<string>('0');
  const [selectedGasType, setSelectedGasType] = useState<string>(GAS_TYPES[0]?.name || '');
  const [isResolving, setIsResolving] = useState(false);

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueFormData, setIssueFormData] = useState({
    campus: '',
    floor: '',
    details: '',
    selectedTags: [] as string[],
    complaintType: 'Proactive' as 'Proactive' | 'Reactive',
    immediateResolve: false
  });
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

  const [serverTools, setServerTools] = useState<Tool[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [toolSearch, setToolSearch] = useState('');

  const [showToolModal, setShowToolModal] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [toolFormData, setToolFormData] = useState<Partial<Tool>>({ name: '', qty: 1, technician: '' });
  const [isSavingTool, setIsSavingTool] = useState(false);

  // CORE: Balanced Distribution Logic (+/-1 Rule)
  const getBalancedZoneAssets = (allAssets: Asset[], zIdx: number, numZones: number) => {
    const operationalACs = allAssets
      .filter(a => String(a.category).toLowerCase() === 'ac' && ['ACTIVE', 'MAINTENANCE'].includes(String(a.status).trim().toUpperCase()))
      .sort((a, b) => Number(a.id) - Number(b.id));
    
    if (operationalACs.length === 0) return [];
    
    const technicianName = activeTechList[zIdx];
    const sheetAssigned = operationalACs.filter(a => a.assignedTech === technicianName);
    
    if (sheetAssigned.length === 0) {
      const baseSize = Math.floor(operationalACs.length / numZones);
      const remainder = operationalACs.length % numZones;
      let start = 0;
      for (let i = 0; i < zIdx; i++) {
        start += (i < remainder ? baseSize + 1 : baseSize);
      }
      const end = start + (zIdx < remainder ? baseSize + 1 : baseSize);
      return operationalACs.slice(start, end);
    }
    
    return sheetAssigned;
  };

  /**
   * SLA INTEGRITY ENGINE (Technician Profile Level)
   * Enforces rules for AC and Electrical domains.
   */
  const complianceData = useMemo(() => {
    if (!selectedTech) return null;

    const todayTags = (stats?.hvac?.daily || []).map(t => String(t).toUpperCase());
    const monthlyTags = (stats?.hvac?.monthly || []).map(t => String(t).toUpperCase());
    
    let dailyMisses: string[] = [];
    let monthlyMisses: string[] = [];
    let slaPenaltyPoints = 0;
    let isBreached = false;

    if (category === 'ac') {
      const zIdx = activeTechList.indexOf(selectedTech);
      if (zIdx !== -1) {
        const zoneAssets = getBalancedZoneAssets(assets, zIdx, 4);
        dailyMisses = zoneAssets
          .filter(a => !todayTags.includes(String(a.tag).toUpperCase()))
          .map(a => a.tag);
        monthlyMisses = zoneAssets
          .filter(a => !monthlyTags.includes(String(a.tag).toUpperCase()))
          .map(a => a.tag);
        
        if (dailyMisses.length > 0) {
          isBreached = true;
          slaPenaltyPoints = 10;
        }
      }
    } else if (category === 'electrical') {
      const campuses = ['140H', '141D', '141C'];
      const dailyTasks = ELECTRICAL_MODULE_DATA.commonItems.filter(i => i.frequency === 'Daily');
      const expectedTotal = dailyTasks.length * campuses.length;
      
      const doneElectricalToday = todayTags.filter(t => {
        return dailyTasks.some(dt => t.startsWith(dt.id.toUpperCase()));
      }).length;

      if (doneElectricalToday < expectedTotal) {
        isBreached = true;
        slaPenaltyPoints = 10;
        dailyMisses = [`${expectedTotal - doneElectricalToday} Collective Tasks Pending`];
      }
    }

    const slaLogs = (stats?.performanceLogs || []).filter(l => 
      l.tech === selectedTech && 
      String(l.reason).includes('SLA BREACH') &&
      String(l.category).toUpperCase() === category.toUpperCase()
    );

    return {
      dailyMisses,
      monthlyMisses,
      isBreached,
      pendingPenalty: slaPenaltyPoints,
      totalBreachEvents: slaLogs.length,
      totalSlaDeducted: Math.abs(slaLogs.reduce((a, b) => a + (b.points < 0 ? b.points : 0), 0))
    };
  }, [selectedTech, stats, assets, category, activeTechList]);

  const zoneSummaries = useMemo(() => {
    if (category !== 'ac') return [];
    
    return [0, 1, 2, 3].map(idx => {
      const zoneAssets = getBalancedZoneAssets(assets, idx, 4);
      const totalActive = zoneAssets.length || 0;
      if (totalActive === 0) return { totalActive: 0, daily: 'Pending', monthly: 'Pending', quarterly: 'Pending' };

      const checkFreq = (doneTags: string[]) => {
        const normDone = doneTags.map(t => String(t || '').trim().toUpperCase());
        const count = zoneAssets.filter(a => normDone.includes(String(a.tag).trim().toUpperCase())).length;
        if (count === 0) return 'Pending';
        if (count >= totalActive) return 'Done';
        return 'In Progress';
      };

      return {
        totalActive,
        daily: checkFreq(stats?.hvac?.daily || []),
        monthly: checkFreq(stats?.hvac?.monthly || []),
        quarterly: checkFreq(stats?.hvac?.quarterly || [])
      };
    });
  }, [category, assets, stats, activeTechList]);

  const loadTools = async () => {
    setIsLoadingTools(true);
    try {
      const data = await fetchTools(category);
      setServerTools(data.length > 0 ? data : (DEFAULT_TOOLS[category] || []).map(t => ({ ...t, category: category.toUpperCase() })));
    } catch (e) {
      setServerTools((DEFAULT_TOOLS[category] || []).map(t => ({ ...t, category: category.toUpperCase() })));
    } finally {
      setIsLoadingTools(false);
    }
  };

  useEffect(() => {
    if (view === 'tools') loadTools();
  }, [view, category]);

  const techProfileData = useMemo(() => {
    if (!selectedTech) return { active: [], resolved: [], merit: 0, demerit: 0, compliance: { d: 0, m: 0, q: 0, zone: 0 } };
    const all = (tickets || []).filter(t => t.assignedTo?.trim().toLowerCase() === selectedTech.trim().toLowerCase());
    const techLogs = (stats?.performanceLogs || []).filter(l => l.tech === selectedTech && String(l.category || '').toUpperCase() === category.toUpperCase());
    const merit = techLogs.filter(l => l.points > 0).reduce((a, b) => a + b.points, 0);
    const demerit = Math.abs(techLogs.filter(l => l.points < 0).reduce((a, b) => a + b.points, 0));
    
    let zoneCompliance = { d: 0, m: 0, q: 0, zone: 0 };
    if (category === 'ac') {
      const idx = activeTechList.indexOf(selectedTech);
      if (idx !== -1) {
        zoneCompliance.zone = idx + 1;
        const techAssets = getBalancedZoneAssets(assets, idx, 4);
        const assetCount = techAssets.length || 1;
        const calc = (done: string[]) => Math.round((techAssets.filter(a => done.includes(a.tag)).length / assetCount) * 100);
        zoneCompliance.d = calc(stats?.hvac?.daily || []);
        zoneCompliance.m = calc(stats?.hvac?.monthly || []);
        zoneCompliance.q = calc(stats?.hvac?.quarterly || []);
      }
    }

    return {
      active: all.filter(t => !['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status)),
      resolved: all.filter(t => ['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status)),
      merit,
      demerit,
      compliance: zoneCompliance
    };
  }, [tickets, selectedTech, stats, category, activeTechList, assets]);

  const handleEnforceSLA = async () => {
    if (!selectedTech || !complianceData || !complianceData.isBreached || isSyncingSLA) return;
    const pin = prompt("AUTHORIZED ACCESS REQUIRED\nEnter Registry Command Hub PIN:");
    if (pin !== '5566') { showToast("Access Denied"); return; }
    setIsSyncingSLA(true);
    try {
      const reason = category === 'ac' 
        ? `SLA BREACH: Incomplete Daily Zone Checklist. Missed Tags: ${complianceData.dailyMisses.join(', ')}`
        : `SLA BREACH: Incomplete Daily Electrical Synergy Protocol. 10 Points Deducted from all members.`;
      await updatePoints(category, selectedTech, -10, reason);
      showToast("SLA Penalty Synchronized to Performance Log");
      onRefresh();
    } catch (e) { showToast("Registry Sync Error"); } finally { setIsSyncingSLA(false); }
  };

  const handleTakeover = async () => {
    if (!takeoverModal || !actingTechSelection) return;
    try {
      // Award coverage points (+5 merit) as configured
      await updatePoints(category, actingTechSelection, 5, `TAKEOVER COVERAGE: Covering Sector ${takeoverModal.zoneIdx + 1} for ${takeoverModal.originalTech}`);
      await logTakeover(category, takeoverModal.originalTech, actingTechSelection);
      
      onOpenChecklist(takeoverModal.zoneIdx, actingTechSelection);
      setTakeoverModal(null);
      setActingTechSelection('');
      showToast(`Takeover Authorized: ${actingTechSelection} (+5 pts merit)`);
      onRefresh();
    } catch (e) {
      showToast("Takeover Sync Error");
    }
  };

  const handleResolve = async () => {
    if (!resolveTicket || solvingTechs.length === 0) return;
    setIsResolving(true);
    const solversStr = solvingTechs.join(' & ');
    const now = new Date();
    const launchDate = new Date(resolveTicket.date);
    const agingHours = (now.getTime() - launchDate.getTime()) / (1000 * 3600);
    const slaThreshold = resolveType === 'Minor' ? 24 : 168; 
    
    try {
      if (agingHours > slaThreshold) {
        const penalty = -10; 
        showToast(`SLA BREACH: RESOLVED IN ${Math.round(agingHours)} HOURS. Deducting points...`);
        for (const tech of solvingTechs) {
          await updatePoints(category, tech, penalty, `SLA BREACH: ${resolveType} Ticket resolved in ${Math.round(agingHours)} hrs (SLA: ${slaThreshold} hrs)`);
        }
      }
      const fd = new FormData();
      fd.append('action', 'resolve_ticket');
      fd.append('category', category.toUpperCase());
      fd.append('rowIndex', String(resolveTicket.rowIndex));
      fd.append('assetTag', resolveTicket.assetTag);
      fd.append('status', 'Resolved – Pending Admin Review');
      fd.append('resolvedBy', `${solversStr} • ${now.toLocaleString()}`);
      fd.append('workType', resolveType);
      fd.append('remarks', resolveRemarks);
      fd.append('gasUsed', String(gasUsedYesNo === 'Yes' ? gasAmount : 0));
      fd.append('gasType', gasUsedYesNo === 'Yes' ? selectedGasType : '');
      await postAction(fd);
      onRefresh(); 
      setResolveTicket(null);
      setSolvingTechs([]);
      setResolveRemarks('');
      setGasAmount('0');
      showToast("Resolution Synchronized Successfully");
    } catch (e) { 
      showToast("Registry Synchronization Failure"); 
    } finally { 
      setIsResolving(false); 
    }
  };

  const toggleMultiSelect = (tech: string) => {
    setMultiSelectedTechs(prev => prev.includes(tech) ? prev.filter(t => t !== tech) : [...prev, tech]);
    setSelectedTech(tech); 
  };

  const toggleSolvingTech = (tech: string) => {
    setSolvingTechs(prev => prev.includes(tech) ? prev.filter(t => t !== tech) : [...prev, tech]);
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6 animate-fadeIn pb-32">
      <div className="flex bg-white p-1.5 rounded-2xl shadow-xl border border-slate-100 gap-1.5 sticky top-4 z-50 glass-panel overflow-x-auto hide-scroll">
        {[
          { id: 'profiles', label: 'Field Hub', icon: 'id-card' },
          { id: 'hub', label: category === 'ac' ? 'Sector Hub' : 'Operations Hub', icon: 'map-marked-alt' },
          { id: 'demands', label: 'Supplies', icon: 'truck-loading' },
          { id: 'tools', label: 'Tools', icon: 'toolbox' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id as any)} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 min-w-[110px] rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === tab.id ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>
            <i className={`fas fa-${tab.icon} ${view === tab.id ? 'text-indigo-400' : 'opacity-40'}`}></i>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {view === 'profiles' && (
        <div className="space-y-6">
          <div className="flex gap-3 overflow-x-auto pb-4 hide-scroll">
            {activeTechList.map(t => (
              <button 
                key={t} 
                onClick={() => toggleMultiSelect(t)} 
                className={`group flex items-center gap-4 p-4 rounded-3xl border-2 transition-all min-w-[180px] md:min-w-[220px] ${multiSelectedTechs.includes(t) ? (selectedTech === t ? 'bg-slate-950 border-slate-950 shadow-2xl scale-105' : 'bg-slate-800 border-slate-800 shadow-xl') : 'bg-white border-slate-100 opacity-60 shadow-sm'}`}
              >
                 <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl italic ${multiSelectedTechs.includes(t) ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300'}`}>
                   {t?.[0] || '?'}
                 </div>
                 <div className="text-left">
                   <p className={`text-[10px] font-black uppercase italic ${multiSelectedTechs.includes(t) ? 'text-white' : 'text-slate-900'}`}>{t}</p>
                   <p className={`text-[7px] font-bold uppercase mt-1 italic ${multiSelectedTechs.includes(t) ? 'text-white/40' : 'text-slate-300'}`}>
                     {attendance[t] ? '● Online' : '○ Offline'}
                   </p>
                 </div>
              </button>
            ))}
          </div>

          {selectedTech && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-slideUp">
               <div className="lg:col-span-4 space-y-6">
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl relative overflow-hidden">
                    <div className="text-center mb-8">
                       <div className="w-24 h-24 bg-slate-950 text-white rounded-[2rem] flex items-center justify-center text-4xl font-black italic shadow-2xl mx-auto mb-6">
                          {selectedTech?.[0] || '?'}
                       </div>
                       <h3 className="text-2xl font-black text-slate-900 uppercase italic leading-none mb-2">{selectedTech}</h3>
                       <p className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.4em] italic">{category.toUpperCase()} SPECIALIST</p>
                    </div>

                    {complianceData && (
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-6 space-y-4">
                         <div className="flex justify-between items-center">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">SLA Integrity Monitor</span>
                            <div className={`px-2 py-0.5 rounded-full text-[6px] font-black uppercase ${complianceData.isBreached ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-emerald-100 text-emerald-600'}`}>
                               {complianceData.isBreached ? 'Breach Detected' : 'Operational'}
                            </div>
                         </div>
                         <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 text-center">
                               <p className="text-[7px] font-black text-slate-300 uppercase mb-1">Breach Count</p>
                               <p className="text-xl font-black italic text-slate-900">{complianceData.totalBreachEvents}</p>
                            </div>
                            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 text-center">
                               <p className="text-[7px] font-black text-slate-300 uppercase mb-1">SLA Demerits</p>
                               <p className="text-xl font-black italic text-rose-600">-{complianceData.totalSlaDeducted}</p>
                            </div>
                         </div>
                         {complianceData.isBreached && (
                           <div className="pt-2 animate-fadeIn">
                              <p className="text-[7px] font-black text-rose-400 uppercase mb-2 italic">Current Pending Checklist ({category.toUpperCase()}):</p>
                              <div className="flex flex-wrap gap-1.5">
                                 {complianceData.dailyMisses.map(tag => (
                                   <span key={tag} className="bg-rose-50 text-rose-600 text-[6px] font-black px-1.5 py-0.5 rounded border border-rose-100">{tag}</span>
                                 ))}
                              </div>
                              <button onClick={handleEnforceSLA} disabled={isSyncingSLA} className="w-full mt-4 bg-rose-600 text-white py-3 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all italic flex items-center justify-center gap-2">
                                 <i className={`fas fa-${isSyncingSLA ? 'circle-notch animate-spin' : 'shield-alt'}`}></i>
                                 {isSyncingSLA ? 'Synchronizing...' : 'Log SLA Penalty (-10)'}
                              </button>
                           </div>
                         )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                       <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 text-center">
                          <p className="text-[8px] font-black text-emerald-400 uppercase italic mb-2">Merit</p>
                          <p className="text-3xl font-black text-emerald-600 italic leading-none">+{techProfileData.merit}</p>
                       </div>
                       <div className="bg-rose-50 p-5 rounded-2xl border border-rose-100 text-center">
                          <p className="text-[8px] font-black text-rose-400 uppercase italic mb-2">Demerit</p>
                          <p className="text-3xl font-black text-rose-600 italic leading-none">-{techProfileData.demerit}</p>
                       </div>
                    </div>
                    <div className="mt-8 pt-8 border-t border-slate-50 flex justify-between items-center">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Presence Hub</span>
                        <button onClick={() => toggleAttendance(selectedTech)} className={`w-12 h-6 rounded-full transition-all relative ${attendance[selectedTech] ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                           <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${attendance[selectedTech] ? 'left-7' : 'left-1'}`}></div>
                        </button>
                    </div>
                 </div>
               </div>

               <div className="lg:col-span-8 space-y-6">
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl">
                     <div className="flex items-center justify-between mb-8 border-b border-slate-50 pb-6">
                        <h4 className="text-sm font-black text-slate-950 uppercase italic tracking-widest">Live Pipeline</h4>
                        <span className="bg-indigo-50 text-indigo-600 text-[8px] font-black px-3 py-1 rounded-full uppercase italic">{techProfileData.active.length} Tickets</span>
                     </div>
                     <div className="space-y-4 max-h-[400px] overflow-y-auto hide-scroll">
                        {techProfileData.active.length > 0 ? techProfileData.active.map((t, i) => (
                           <div key={i} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 group">
                               <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-3">
                                     <span className="text-[7px] font-black text-white bg-slate-950 px-2 py-0.5 rounded italic uppercase">{t.assetTag}</span>
                                     <span className="text-[7px] font-bold text-slate-300 uppercase italic">{new Date(t.date).toLocaleDateString()}</span>
                                  </div>
                                  <h5 className="text-[13px] font-black text-slate-900 italic uppercase group-hover:text-indigo-600 transition-colors">"{t.details}"</h5>
                                  <p className="text-[8px] font-bold text-slate-400 uppercase italic">{t.location}</p>
                               </div>
                               <button onClick={() => { setResolveTicket(t); setSolvingTechs([selectedTech!]); }} className="w-full md:w-auto bg-slate-950 text-white px-8 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest italic shadow-xl hover:scale-105 active:scale-95 transition-all">Solve Protocol</button>
                           </div>
                        )) : (
                           <div className="py-20 text-center opacity-10 flex flex-col items-center">
                              <i className="fas fa-check-circle text-6xl mb-4 text-indigo-600"></i>
                              <p className="text-xs font-black uppercase italic tracking-widest">Registry Fully Cleared</p>
                           </div>
                        )}
                     </div>
                  </div>
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl">
                    <h4 className="text-sm font-black text-slate-950 uppercase italic tracking-widest mb-8 italic">Verified Performance Stream</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {techProfileData.resolved.slice(0, 6).map((t, i) => (
                         <div key={i} className="p-4 rounded-2xl bg-emerald-50/30 border border-emerald-100 flex justify-between items-center group">
                            <div className="flex-1 min-w-0">
                               <p className="text-[9px] font-black text-slate-900 italic truncate uppercase leading-none">"{t.details}"</p>
                               <p className="text-[7px] font-bold text-emerald-600 uppercase mt-2 italic">Verified Sync</p>
                            </div>
                            <div className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center text-[10px] shadow-lg ml-4 group-hover:rotate-12 transition-transform">
                               <i className="fas fa-certificate"></i>
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>
               </div>
            </div>
          )}
        </div>
      )}

      {view === 'hub' && (
        <div className="animate-fadeIn">
          <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 blur-[100px] pointer-events-none"></div>
             <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900 italic mb-8 leading-none relative z-10">
               {category === 'ac' ? 'Sector Deployment Control' : 'Operations Synergy Protocol'}
             </h3>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative z-10">
                {activeTechList.map((tech, i) => {
                  const summary = zoneSummaries[i];
                  const isAbsent = !attendance[tech];
                  return (
                    <div key={i} className="relative group">
                      <button 
                        onClick={() => !isAbsent && onOpenChecklist(i, tech)} 
                        disabled={isAbsent}
                        className={`w-full bg-slate-50 p-6 md:p-8 rounded-[2.5rem] border border-slate-100 hover:bg-white hover:shadow-2xl transition-all flex items-center justify-between text-left relative overflow-hidden ${isAbsent ? 'opacity-40 grayscale cursor-default' : ''}`}
                      >
                        <div className="flex items-center gap-4 md:gap-6 relative z-10">
                          <div className={`w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-2xl font-black shadow-inner border border-slate-50 transition-all ${!isAbsent ? 'group-hover:bg-slate-900 group-hover:text-white' : ''}`}>
                            {category.toUpperCase()[0]}{i+1}
                          </div>
                          <div>
                            <div className="flex items-center gap-3">
                              <p className="text-lg font-black text-slate-900 uppercase italic leading-none">{tech}</p>
                              {category === 'ac' && summary && (
                                <span className="bg-slate-900 text-white text-[7px] font-black px-2 py-0.5 rounded italic uppercase tracking-widest">{summary.totalActive} ACs</span>
                              )}
                            </div>
                            <p className="text-[9px] font-bold text-slate-300 uppercase mt-2 italic">Sector {i+1} {isAbsent ? 'Registry Locked' : 'Active Duty'}</p>
                          </div>
                        </div>
                        {!isAbsent && <i className="fas fa-chevron-right text-slate-200 group-hover:text-indigo-500 text-xl relative z-10"></i>}
                      </button>

                      {isAbsent && (
                        <div 
                          onClick={() => setTakeoverModal({ zoneIdx: i, originalTech: tech })}
                          className="absolute inset-0 bg-slate-950/80 backdrop-blur-md rounded-[2.5rem] z-20 flex flex-col items-center justify-center text-center p-6 cursor-pointer border-2 border-amber-500/20 hover:bg-slate-950/90 hover:border-amber-500/40 transition-all shadow-2xl"
                        >
                           <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mb-4 animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                              <i className="fas fa-lock text-amber-500 text-2xl"></i>
                           </div>
                           <p className="text-white text-[10px] font-black uppercase tracking-[0.2em] mb-1 italic">Secure Lock: {tech} Absent</p>
                           <p className="text-amber-400 text-[8px] font-black uppercase tracking-widest italic animate-bounce mt-2">TAP TO TAKEOVER</p>
                        </div>
                      )}
                    </div>
                  );
                })}
             </div>
          </div>
        </div>
      )}

      {takeoverModal && (
        <div className="fixed inset-0 bg-slate-950/98 z-[700] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-3xl border border-white/5 overflow-hidden">
              <div className="text-center mb-10">
                 <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
                    <i className="fas fa-user-friends text-3xl"></i>
                 </div>
                 <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Sector Coverage</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase mt-4 tracking-widest italic leading-relaxed">
                    Sector {takeoverModal.zoneIdx + 1} requires authorized coverage for <span className="text-rose-500">{takeoverModal.originalTech}</span>.
                 </p>
              </div>

              <div className="space-y-8">
                 <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all shadow-inner">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-2 italic tracking-widest">Active Specialist</label>
                    <select value={actingTechSelection} onChange={e => setActingTechSelection(e.target.value)} className="w-full bg-transparent font-black text-[14px] outline-none italic uppercase text-slate-950 cursor-pointer">
                       <option value="">-- SELECT YOUR NAME --</option>
                       {presentTechsOfTrade.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                 </div>
                 <div className="flex gap-4">
                    <button onClick={() => { setTakeoverModal(null); setActingTechSelection(''); }} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 italic">Discard</button>
                    <button onClick={handleTakeover} disabled={!actingTechSelection} className="flex-[2] bg-slate-950 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest italic shadow-2xl active:scale-95 transition-all disabled:opacity-20 flex items-center justify-center gap-3">
                       <i className="fas fa-shield-alt text-teal-400"></i>
                       <span>Authorize Sync</span>
                    </button>
                 </div>
                 <p className="text-[7px] text-center text-slate-300 font-bold uppercase italic tracking-widest">Note: +5 Coverage Merit will be awarded.</p>
              </div>
           </div>
        </div>
      )}

      {/* REMAINDER OF COMPONENT LOGIC (Tools, Demands, Ticket Resolution) */}
      {view === 'demands' && (
        <div className="animate-fadeIn max-w-xl mx-auto">
           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl space-y-8">
              <div className="text-center">
                 <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-6 text-2xl shadow-inner"><i className="fas fa-truck-loading"></i></div>
                 <h3 className="text-3xl font-black text-slate-900 italic uppercase leading-none">Supply Protocol</h3>
              </div>
              <div className="space-y-6">
                 <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100">
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Requesting Force</label>
                    <select value={demandTech} onChange={e => setDemandTech(e.target.value)} className="w-full bg-transparent font-black text-[12px] outline-none uppercase italic">
                       {activeTechList.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                 </div>
                 <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100">
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Items Required</label>
                    <textarea value={demandText} onChange={e => setDemandText(e.target.value)} rows={4} placeholder="List required components..." className="w-full bg-transparent font-bold text-base outline-none uppercase italic resize-none" />
                 </div>
                 <button onClick={() => { if(!demandText || !demandTech) return; setIsSubmittingDemand(true); submitDemand(category, demandTech, demandText).then(() => { showToast("Request Dispatched"); setDemandText(''); setIsSubmittingDemand(false); }).catch(() => { setIsSubmittingDemand(false); showToast("Sync Error"); }); }} disabled={isSubmittingDemand || !demandText.trim()} className="w-full bg-slate-950 text-white py-7 rounded-[2rem] font-black uppercase text-[11px] tracking-widest shadow-2xl active:scale-95 italic transition-all">
                    {isSubmittingDemand ? 'Syncing...' : 'Authorize Request'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {resolveTicket && (
        <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-3xl relative overflow-hidden max-h-[90vh] overflow-y-auto hide-scroll">
             <div className="flex justify-between items-center mb-8">
               <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Resolution Hub</h3>
               <button onClick={() => setResolveTicket(null)} className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-300 flex items-center justify-center hover:text-rose-500 transition-all active:scale-90"><i className="fas fa-times text-xl"></i></button>
             </div>
             <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-4 ml-1 italic">Specialist Attribution</label>
                  <div className="grid grid-cols-2 gap-3">
                     {allAvailableTechs.map(tech => (
                       <button key={tech} onClick={() => toggleSolvingTech(tech)} className={`p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${solvingTechs.includes(tech) ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-md' : 'border-white bg-white text-slate-400'}`}>
                          <span className="text-[9px] font-bold uppercase">{tech}</span>
                       </button>
                     ))}
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Task Classification</label>
                  <div className="flex gap-2">
                    {['Minor', 'Major'].map(type => (
                      <button key={type} onClick={() => setResolveType(type as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all italic ${resolveType === type ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 border border-slate-100'}`}>{type}</button>
                    ))}
                  </div>
                </div>
                {category === 'ac' && (
                  <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 space-y-4">
                    <label className="block text-[8px] font-black text-slate-400 uppercase italic ml-1">Refrigerant Utilized?</label>
                    <div className="flex gap-2">
                      {['Yes', 'No'].map(choice => (
                        <button key={choice} onClick={() => setGasUsedYesNo(choice as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all italic ${gasUsedYesNo === choice ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>{choice}</button>
                      ))}
                    </div>
                    {gasUsedYesNo === 'Yes' && (
                      <div className="flex gap-3 animate-slideDown">
                        <select value={selectedGasType} onChange={e => setSelectedGasType(e.target.value)} className="flex-1 bg-white border border-slate-200 p-3 rounded-xl text-[11px] font-black italic uppercase outline-none">
                           {(GAS_TYPES as any).map((g: any) => <option key={g.name} value={g.name}>{g.name}</option>)}
                        </select>
                        <input type="number" step="0.1" value={gasAmount} onChange={e => setGasAmount(e.target.value)} className="w-24 bg-white border border-slate-200 p-3 rounded-xl text-[13px] font-black italic outline-none" placeholder="KG" />
                      </div>
                    )}
                  </div>
                )}
                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 shadow-inner">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Resolution Brief</label>
                  <textarea value={resolveRemarks} onChange={e => setResolveRemarks(e.target.value)} rows={3} placeholder="Narrate actions taken..." className="w-full bg-transparent font-bold text-[11px] outline-none italic uppercase resize-none leading-relaxed" />
                </div>
                <button onClick={handleResolve} disabled={isResolving || !resolveRemarks.trim() || solvingTechs.length === 0} className="w-full bg-slate-950 text-white py-6 rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.4em] shadow-2xl active:scale-[0.98] transition-all disabled:opacity-30 italic flex items-center justify-center gap-4">
                  {isResolving ? <i className="fas fa-circle-notch animate-spin text-teal-400"></i> : <i className="fas fa-check-double text-teal-400"></i>}
                  <span>{isResolving ? 'Synchronizing...' : 'Finalize Task'}</span>
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TechView;