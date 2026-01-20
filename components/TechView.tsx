
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, Ticket, StatsResponse, CategoryKey, Tool } from '../types.ts';
import { CATEGORY_TECHS, DEFAULT_TOOLS, GAS_TYPES } from '../constants.ts';
import { submitDemand, postAction, updatePoints, fetchTools, addTool, updateTool, deleteTool } from '../services/api.ts';

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
  const [view, setView] = useState<'hub' | 'demands' | 'tools' | 'profiles'>('hub');
  const [selectedTech, setSelectedTech] = useState<string | null>(null);
  const [demandText, setDemandText] = useState('');
  const [demandTech, setDemandTech] = useState('');
  const [isSubmittingDemand, setIsSubmittingDemand] = useState(false);
  
  const activeTechList = CATEGORY_TECHS[category] || [];

  // Tools Admin Logic
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');

  const [serverTools, setServerTools] = useState<Tool[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);

  const loadTools = async () => {
    setIsLoadingTools(true);
    try {
      const data = await fetchTools(category);
      setServerTools(data.length > 0 ? data : (DEFAULT_TOOLS[category] || []).map(t => ({ ...t, category: category.toUpperCase() })));
    } catch (e) {
      console.error(e);
      setServerTools((DEFAULT_TOOLS[category] || []).map(t => ({ ...t, category: category.toUpperCase() })));
    } finally {
      setIsLoadingTools(false);
    }
  };

  useEffect(() => {
    if (view === 'tools') loadTools();
  }, [view, category]);

  const techProfileData = useMemo(() => {
    if (!selectedTech) return { active: [], resolved: [] };
    const all = tickets.filter(t => 
      t.assignedTo?.trim().toLowerCase() === selectedTech.trim().toLowerCase()
    );
    return {
      active: all.filter(t => !['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status)),
      resolved: all.filter(t => ['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status))
    };
  }, [tickets, selectedTech]);

  const [resolveTicket, setResolveTicket] = useState<Ticket | null>(null);
  const [resolveType, setResolveType] = useState<'Minor' | 'Major'>('Minor');
  const [resolveRemarks, setResolveRemarks] = useState('');
  const [gasUsedYesNo, setGasUsedYesNo] = useState<'Yes' | 'No'>('No');
  const [gasUsed, setGasUsed] = useState<string>('0');
  const [selectedGasType, setSelectedGasType] = useState<string>(GAS_TYPES[0].name);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    if (activeTechList.length > 0 && !demandTech) setDemandTech(activeTechList[0]);
    if (category === 'handyman' && activeTechList.length === 1 && !selectedTech) setSelectedTech(activeTechList[0]);
  }, [activeTechList, demandTech, category, selectedTech]);

  const zoneStats = useMemo(() => {
    const sectors = category === 'handyman' ? 1 : 4;
    return Array.from({ length: sectors }).map((_, idx) => {
      const tech = activeTechList[idx] || 'N/A';
      const sectorAssets = assets.filter(a => {
        const id = Number(a.id);
        if (category === 'ac') {
          if (idx === 0) return id >= 1 && id <= 40;
          if (idx === 1) return id >= 41 && id <= 82;
          if (idx === 2) return id >= 83 && id <= 121;
          if (idx === 3) return id >= 122 && id <= 161;
        }
        return true;
      });

      const doneDaily = stats?.hvac?.daily || [];
      const doneMonthly = stats?.hvac?.monthly || [];
      const doneQuarterly = stats?.hvac?.quarterly || [];

      const calcPct = (list: string[]) => sectorAssets.length ? Math.round((sectorAssets.filter(a => list.includes(a.tag)).length / sectorAssets.length) * 100) : 0;
      
      return { 
        dailyPct: calcPct(doneDaily),
        monthlyPct: calcPct(doneMonthly),
        quarterlyPct: calcPct(doneQuarterly),
        tech, 
        count: sectorAssets.length 
      };
    });
  }, [assets, stats, category, activeTechList]);

  const handleAdminToggle = () => {
    if (isAdminUnlocked) setIsAdminUnlocked(false);
    else setShowPinModal(true);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '5566') {
      setIsAdminUnlocked(true);
      setShowPinModal(false);
      setPinInput('');
      showToast("ADMIN ACCESS GRANTED");
    } else {
      showToast("ACCESS DENIED: Invalid PIN");
      setPinInput('');
    }
  };

  const handleUpdateToolQty = async (index: number, newQty: number) => {
    if (!isAdminUnlocked) return;
    const tool = serverTools[index];
    try {
      await updateTool(category, tool.name, { ...tool, qty: newQty });
      const next = [...serverTools];
      next[index].qty = newQty;
      setServerTools(next);
      showToast("Inventory Updated");
    } catch (e) { showToast("Sync Failed"); }
  };

  const handleRenameTool = async (index: number, newName: string) => {
    if (!isAdminUnlocked) return;
    const tool = serverTools[index];
    try {
      await updateTool(category, tool.name, { ...tool, name: newName });
      const next = [...serverTools];
      next[index].name = newName;
      setServerTools(next);
    } catch (e) { showToast("Sync Failed"); }
  };

  const handleAddToolEntry = async () => {
    if (!isAdminUnlocked) return;
    const newTool: Tool = { category: category.toUpperCase(), name: "New Equipment", qty: 0 };
    try {
      await addTool(category, newTool);
      loadTools();
      showToast("Registry Entry Appended");
    } catch (e) { showToast("Sync Failed"); }
  };

  const handleDeleteToolEntry = async (index: number) => {
    if (!isAdminUnlocked) return;
    const tool = serverTools[index];
    if (!window.confirm(`CRITICAL: Purge ${tool.name} from ${category.toUpperCase()} registry?`)) return;
    try {
      await deleteTool(category, tool.name);
      const next = serverTools.filter((_, i) => i !== index);
      setServerTools(next);
      showToast("Registry Entry Purged");
    } catch (e) { showToast("Sync Failed"); }
  };

  const handleDemandSubmit = async () => {
    if (!demandText || !demandTech) return;
    setIsSubmittingDemand(true);
    showToast("Transmitting Demand...");
    try {
      await submitDemand(category, demandTech, demandText);
      showToast("Demand Registered Successfully");
      setDemandText('');
    } catch (e) {
      showToast("Transmission Failure");
    } finally {
      setIsSubmittingDemand(false);
    }
  };

  const handleResolve = async () => {
    if (!resolveTicket || !selectedTech) return;
    if (!resolveRemarks.trim()) {
      showToast("REMARKS REQUIRED: Detail the action taken.");
      return;
    }
    setIsResolving(true);
    
    const finalGasAmount = (category === 'ac' && gasUsedYesNo === 'Yes') ? Math.abs(parseFloat(gasUsed) || 0) : 0;
    
    const fd = new FormData();
    fd.append('action', 'resolve_ticket');
    fd.append('category', category.toUpperCase());
    fd.append('rowIndex', String(resolveTicket.rowIndex));
    fd.append('assetTag', resolveTicket.assetTag);
    fd.append('status', 'Resolved by Technician');
    fd.append('resolvedBy', `${selectedTech} • ${new Date().toLocaleString()}`);
    fd.append('workType', resolveType);
    fd.append('remarks', resolveRemarks);
    fd.append('gasUsed', String(finalGasAmount));
    fd.append('gasType', (category === 'ac' && gasUsedYesNo === 'Yes') ? selectedGasType : '');
    
    showToast("Syncing Resolution Protocol...");
    try {
      await postAction(fd);
      await updatePoints(category, selectedTech, 2, "Automatic Work Order Resolution Bonus");
      onRefresh();
      setResolveTicket(null);
      setResolveRemarks('');
      setGasUsed('0');
      setGasUsedYesNo('No');
      showToast("Resolution Synchronized (+2 Merit)");
    } catch (e) {
      showToast("Sync Failure");
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 lg:p-6 space-y-6 animate-fadeIn pb-32">
      <div className="flex bg-white p-1.5 rounded-2xl shadow-xl border border-slate-100 gap-1.5 sticky top-4 z-50 glass-panel">
        {[
          { id: 'hub', label: 'Operations', icon: 'map-marked-alt' },
          { id: 'profiles', label: 'Attendance', icon: 'id-card' },
          { id: 'demands', label: 'Materials', icon: 'truck-loading' },
          { id: 'tools', label: 'Tools', icon: 'toolbox' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id as any)} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${view === tab.id ? 'bg-slate-900 text-white shadow-2xl scale-[1.02]' : 'text-slate-400 hover:bg-slate-50'}`}>
            <i className={`fas fa-${tab.icon} ${view === tab.id ? 'text-indigo-400' : 'opacity-40'}`}></i>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {view === 'hub' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <section className="lg:col-span-3 space-y-5">
            <div className="bg-white p-5 rounded-2xl premium-card border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2.5 mb-5 border-b border-slate-50 pb-3">
                <div className="w-6 h-6 bg-slate-50 text-slate-400 rounded-lg flex items-center justify-center text-[10px] shadow-inner"><i className="fas fa-signal"></i></div>
                <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest italic leading-none">Attendance</h3>
              </div>
              <div className={`grid ${activeTechList.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2.5`}>
                {activeTechList.map(t => (
                  <button key={t} onClick={() => toggleAttendance(t)} className={`p-3 rounded-xl flex flex-col items-center gap-2.5 transition-all border shadow-sm ${attendance[t] ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 opacity-20 grayscale'}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm shadow-inner ${attendance[t] ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-400'}`}>{t[0]}</div>
                    <span className="text-[8px] font-black uppercase text-slate-900 leading-none italic">{t}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="lg:col-span-9 space-y-5">
            <div className="bg-white p-5 rounded-2xl premium-card border border-slate-100">
               <div className="flex items-center justify-between mb-5 px-1">
                 <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 italic leading-none">Checklist</h3>
                 <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]"></div><span className="text-[8px] font-black text-emerald-600 uppercase italic">Live Sync</span></div>
               </div>
               <div className={`grid grid-cols-1 ${category === 'handyman' ? 'sm:grid-cols-1' : 'sm:grid-cols-2'} gap-4`}>
                  {zoneStats.map((z, i) => (
                    <button key={i} onClick={() => onOpenChecklist(i, z.tech)} className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 flex flex-col hover:bg-white hover:shadow-xl transition-all group active:scale-[0.98] text-left">
                      <div className="flex items-center justify-between mb-6 w-full">
                        <div className="flex items-center gap-4 relative z-10">
                          <div className={`w-12 h-12 bg-white rounded-xl flex items-center justify-center text-xl font-black text-slate-900 shadow-inner group-hover:bg-slate-900 group-hover:text-white transition-all`}>
                            {category.toUpperCase()[0]}{i+1}
                          </div>
                          <div>
                            <p className="text-[12px] font-black text-slate-900 uppercase tracking-widest italic">{z.tech}</p>
                            <p className="text-[7px] font-bold text-slate-300 uppercase mt-1 italic">Sector {i+1} Deployment</p>
                          </div>
                        </div>
                        <i className="fas fa-chevron-right text-slate-200 group-hover:text-indigo-500 transition-colors"></i>
                      </div>

                      <div className="grid grid-cols-3 gap-3 w-full border-t border-slate-100 pt-5">
                         {[
                           { label: 'Daily', val: z.dailyPct, color: 'emerald' },
                           { label: 'Monthly', val: z.monthlyPct, color: 'indigo' },
                           { label: 'Quarterly', val: z.quarterlyPct, color: 'rose' }
                         ].map(stat => (
                           <div key={stat.label} className="space-y-2">
                             <div className="flex justify-between items-baseline px-1">
                               <span className="text-[7px] font-black text-slate-400 uppercase italic">{stat.label}</span>
                               <span className={`text-[9px] font-black text-${stat.color}-600 italic`}>{stat.val}%</span>
                             </div>
                             <div className="h-1 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                               <div className={`h-full bg-${stat.color}-500 transition-all duration-1000`} style={{ width: `${stat.val}%` }}></div>
                             </div>
                           </div>
                         ))}
                      </div>
                    </button>
                  ))}
               </div>
            </div>
          </section>
        </div>
      )}

      {view === 'demands' && (
        <section className="bg-white p-8 rounded-2xl premium-card border border-slate-100 min-h-[50vh] animate-fadeIn">
           <div className="flex justify-between items-center mb-8">
             <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 italic">Inventory Procurement Hub</h3>
             <p className="text-[8px] font-black uppercase text-indigo-500 italic bg-indigo-50 px-3 py-1 rounded-full">{category.toUpperCase()} REGISTRY</p>
           </div>
           
           <div className="max-w-xl mx-auto space-y-8">
              <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                <label className="block text-[8px] font-black text-slate-400 uppercase mb-4 tracking-widest italic ml-1">Requesting Specialist</label>
                <select value={demandTech} onChange={e => setDemandTech(e.target.value)} className="w-full bg-transparent font-black text-sm outline-none italic uppercase">
                  {activeTechList.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                <label className="block text-[8px] font-black text-slate-400 uppercase mb-4 tracking-widest italic ml-1">Anomalous Requirement Details</label>
                <textarea value={demandText} onChange={e => setDemandText(e.target.value)} rows={4} className="w-full bg-transparent font-bold text-sm outline-none resize-none italic" placeholder="Enter materials, parts or tools required..." />
              </div>

              <button 
                onClick={handleDemandSubmit} 
                disabled={isSubmittingDemand || !demandText}
                className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase text-[10px] tracking-[0.4em] shadow-2xl active:scale-95 transition-all disabled:opacity-30 italic"
              >
                {isSubmittingDemand ? 'Transmitting Protocol...' : 'Finalize Procurement Request'}
              </button>
           </div>
        </section>
      )}

      {view === 'tools' && (
        <section className="bg-white p-8 rounded-2xl premium-card border border-slate-100 min-h-[60vh] animate-fadeIn">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 italic">Operational Tool Registry</h3>
              <p className="text-[8px] font-black text-indigo-500 uppercase italic mt-2 tracking-widest">{category.toUpperCase()} INFRASTRUCTURE</p>
            </div>
            <button 
              onClick={handleAdminToggle} 
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm ${isAdminUnlocked ? 'bg-teal-600 text-white animate-pulse' : 'bg-slate-50 text-slate-300 hover:text-indigo-600'}`}
            >
               <i className={`fas fa-${isAdminUnlocked ? 'lock-open' : 'lock'} text-base`}></i>
            </button>
          </div>

          {isLoadingTools ? (
            <div className="flex items-center justify-center py-20 opacity-20"><i className="fas fa-circle-notch animate-spin text-4xl"></i></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {serverTools.map((tool, i) => (
                 <div key={i} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex items-center justify-between group hover:bg-white hover:shadow-xl transition-all">
                    <div className="flex-1">
                      {isAdminUnlocked ? (
                        <input 
                          type="text" 
                          value={tool.name} 
                          onBlur={(e) => handleRenameTool(i, e.target.value)}
                          onChange={(e) => {
                             const next = [...serverTools];
                             next[i].name = e.target.value;
                             setServerTools(next);
                          }}
                          className="bg-white border border-indigo-100 rounded px-2 py-1 text-[11px] font-black uppercase italic outline-none w-full"
                        />
                      ) : (
                        <p className="text-[11px] font-black text-slate-900 uppercase italic leading-none">{tool.name}</p>
                      )}
                      <p className="text-[7px] font-bold text-slate-300 uppercase mt-2 italic tracking-widest">Registry ID: {category[0].toUpperCase()}-T{i+1}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {isAdminUnlocked ? (
                        <div className="flex flex-col items-center gap-2">
                          <input 
                            type="number" 
                            value={tool.qty} 
                            onChange={(e) => handleUpdateToolQty(i, parseInt(e.target.value) || 0)}
                            className="bg-white border border-indigo-100 rounded w-12 text-center text-[11px] font-black italic outline-none"
                          />
                          <button onClick={() => handleDeleteToolEntry(i)} className="text-rose-400 hover:text-rose-600 transition-colors p-2 active:scale-90" title="Purge Record">
                            <i className="fas fa-trash-alt text-[10px]"></i>
                          </button>
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xs font-black italic shadow-2xl">
                          {tool.qty}
                        </div>
                      )}
                    </div>
                 </div>
               ))}
               {isAdminUnlocked && (
                 <button onClick={handleAddToolEntry} className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 hover:text-teal-600 hover:border-teal-200 transition-all active:scale-95">
                    <i className="fas fa-plus-circle text-2xl mb-2"></i>
                    <span className="text-[8px] font-black uppercase tracking-widest italic">Append New Tool</span>
                 </button>
               )}
            </div>
          )}
        </section>
      )}

      {view === 'profiles' && (
        <section className="bg-white p-8 rounded-2xl premium-card border border-slate-100 min-h-[50vh] relative animate-fadeIn">
           <div className="flex justify-between items-center mb-8">
              <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-400 italic">Specialist Force Registry</h3>
              <div className="flex gap-2">
                 {activeTechList.map(t => (
                   <button key={t} onClick={() => setSelectedTech(t)} className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs transition-all ${selectedTech === t ? 'bg-slate-900 text-white scale-110 shadow-lg' : 'bg-slate-50 text-slate-200 hover:bg-slate-100'}`}>{t[0]}</button>
                 ))}
              </div>
           </div>
           {selectedTech ? (
             <div className="space-y-8 animate-slideDown">
                <div className="flex items-center gap-6">
                   <div className="w-20 h-20 bg-slate-900 rounded-[1.5rem] flex items-center justify-center text-3xl font-black text-white shadow-2xl group relative overflow-hidden">
                      <div className="absolute inset-0 bg-indigo-500/20 blur-md"></div>
                      <span className="relative">{selectedTech[0]}</span>
                   </div>
                   <div>
                      <h4 className="text-3xl font-black italic tracking-tighter uppercase text-slate-900 leading-none mb-2">{selectedTech}</h4>
                      <p className="text-indigo-500 text-[9px] font-black uppercase tracking-[0.4em] italic">{category.toUpperCase()} SPECIALIST OPERATIVE</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-50">
                   <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                         <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
                         <h5 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Active Deployments ({techProfileData.active.length})</h5>
                      </div>
                      <div className="space-y-3">
                         {techProfileData.active.length > 0 ? techProfileData.active.map((t, i) => (
                           <div key={i} className="bg-slate-50 p-5 rounded-xl border border-slate-100 shadow-sm relative overflow-hidden group">
                              <div className="absolute left-0 top-0 h-full w-0.5 bg-indigo-500"></div>
                              <div className="flex justify-between items-start mb-3">
                                <p className="text-[11px] font-black text-slate-900 italic leading-tight flex-1">"{t.details}"</p>
                                <button onClick={() => setResolveTicket(t)} className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95 shadow-lg ml-3">Resolve</button>
                              </div>
                              <div className="flex items-center justify-between">
                                 <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest italic">{t.location} • {t.assetTag}</span>
                                 <span className="text-[7px] font-bold text-indigo-600 bg-indigo-50/50 px-2 py-0.5 rounded-full uppercase">{t.status}</span>
                              </div>
                           </div>
                         )) : <p className="text-[9px] font-bold text-slate-300 uppercase italic py-4">No Active Records Found</p>}
                      </div>
                   </div>

                   <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                         <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                         <h5 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Execution Archive ({techProfileData.resolved.length})</h5>
                      </div>
                      <div className="space-y-3">
                         {techProfileData.resolved.length > 0 ? techProfileData.resolved.map((t, i) => (
                           <div key={i} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm group opacity-70 hover:opacity-100 transition-opacity">
                              <p className="text-[11px] font-black text-slate-900 italic leading-tight mb-2">"{t.details}"</p>
                              <div className="flex items-center justify-between">
                                 <div className="flex flex-col">
                                    <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest italic">{new Date(t.date).toLocaleDateString()}</span>
                                    {t.workType && <span className="text-[6px] font-black text-indigo-400 uppercase mt-0.5">{t.workType} Priority</span>}
                                 </div>
                                 <span className="text-[7px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-widest italic">VERIFIED</span>
                              </div>
                           </div>
                         )) : <p className="text-[9px] font-bold text-slate-300 uppercase italic py-4">No Historical Records Found</p>}
                      </div>
                   </div>
                </div>
             </div>
           ) : <div className="py-24 text-center opacity-10 flex flex-col items-center"><i className="fas fa-fingerprint text-7xl mb-6 text-slate-100"></i><p className="text-xs font-black uppercase tracking-[0.5em]">Identity Verification Required</p></div>}
        </section>
      )}

      {resolveTicket && (
        <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-md rounded-[3rem] p-10 shadow-3xl border border-white/5 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-[40px]"></div>
             <div className="flex justify-between items-center mb-8 relative z-10">
               <div><h3 className="text-2xl font-black text-slate-950 leading-none italic uppercase tracking-tighter">Resolution Protocol</h3><p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Target Asset: {resolveTicket.assetTag}</p></div>
               <button onClick={() => setResolveTicket(null)} className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-300 flex items-center justify-center active:scale-90 hover:text-rose-500 transition-all"><i className="fas fa-times text-xl"></i></button>
             </div>
             <div className="space-y-6 relative z-10">
                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest italic">Issue Classification</label>
                  <div className="flex gap-2">
                    {['Minor', 'Major'].map(type => (
                      <button key={type} onClick={() => setResolveType(type as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all italic tracking-widest ${resolveType === type ? 'bg-slate-900 text-white shadow-lg scale-105' : 'bg-white text-slate-400 border border-slate-100'}`}>{type}</button>
                    ))}
                  </div>
                </div>
                {category === 'ac' && (
                  <>
                    <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest italic">Refrigerant Consumption?</label>
                      <div className="flex gap-2">
                        {['Yes', 'No'].map(choice => (
                          <button key={choice} onClick={() => setGasUsedYesNo(choice as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all italic tracking-widest ${gasUsedYesNo === choice ? 'bg-indigo-600 text-white shadow-lg scale-105' : 'bg-white text-slate-400 border border-slate-100'}`}>{choice}</button>
                        ))}
                      </div>
                    </div>
                    {gasUsedYesNo === 'Yes' && (
                      <div className="grid grid-cols-2 gap-4 animate-slideDown">
                        <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                           <label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 italic tracking-widest">Type of Gas</label>
                           <select value={selectedGasType} onChange={e => setSelectedGasType(e.target.value)} className="w-full bg-transparent font-black text-[10px] outline-none uppercase italic cursor-pointer">
                             {GAS_TYPES.filter(g => g.type === 'ac').map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                           </select>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                           <label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 italic tracking-widest">Quantity (KG)</label>
                           <input type="number" step="0.1" value={gasUsed} onChange={e => setGasUsed(e.target.value)} className="w-full bg-transparent font-black text-xl outline-none italic tracking-tighter" placeholder="0.0" />
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest italic">Resolution Remarks</label>
                  <textarea value={resolveRemarks} onChange={e => setResolveRemarks(e.target.value)} rows={3} placeholder="Detail the work performed..." className="w-full bg-transparent font-bold text-[11px] outline-none italic uppercase resize-none placeholder:text-slate-200 leading-relaxed" />
                </div>
                <button onClick={handleResolve} disabled={isResolving || !resolveRemarks.trim() || (category === 'ac' && gasUsedYesNo === 'Yes' && (!gasUsed || parseFloat(gasUsed) <= 0))} className="w-full bg-slate-950 text-white py-6 rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.4em] shadow-2xl active:scale-95 transition-all disabled:opacity-30 italic flex items-center justify-center gap-4 group">
                  {isResolving ? <i className="fas fa-circle-notch animate-spin text-teal-400"></i> : <i className="fas fa-check-double text-teal-400 group-hover:scale-125 transition-transform"></i>}
                  <span>{isResolving ? 'Executing Protocol...' : 'Finalize Resolution'}</span>
                </button>
             </div>
          </div>
        </div>
      )}

      {showPinModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-10 shadow-3xl border border-white/5">
             <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner"><i className="fas fa-shield-alt text-3xl"></i></div>
                <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Admin Login</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-3 tracking-widest italic">Enter 4-Digit Hub Code</p>
             </div>
             <form onSubmit={handlePinSubmit} className="space-y-8">
                <input type="password" autoFocus maxLength={4} value={pinInput} onChange={(e) => setPinInput(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] py-5 text-center text-3xl font-black tracking-[0.6em] focus:border-indigo-600 outline-none transition-all shadow-inner" placeholder="••••" />
                <div className="flex gap-4">
                  <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 italic">Exit</button>
                  <button type="submit" className="flex-1 bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest italic shadow-2xl">Confirm</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TechView;
