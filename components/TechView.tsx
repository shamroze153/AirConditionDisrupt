import React, { useState, useMemo, useEffect } from 'react';
import { Asset, Ticket, StatsResponse, CategoryKey, Tool } from '../types.ts';
import { CATEGORY_TECHS, DEFAULT_TOOLS, GAS_TYPES } from '../constants.ts';
import { submitDemand, postAction, updatePoints, fetchTools, updateTool } from '../services/api.ts';

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
  
  const activeTechList = CATEGORY_TECHS[category] || [];

  // Multi-Tech Resolution State
  const [resolveTicket, setResolveTicket] = useState<Ticket | null>(null);
  const [solvingTechs, setSolvingTechs] = useState<string[]>([]);
  const [resolveType, setResolveType] = useState<'Minor' | 'Major'>('Minor');
  const [resolveRemarks, setResolveRemarks] = useState('');
  const [gasUsedYesNo, setGasUsedYesNo] = useState<'Yes' | 'No'>('No');
  const [gasUsed, setGasUsed] = useState<string>('0');
  const [selectedGasType, setSelectedGasType] = useState<string>(GAS_TYPES[0].name);
  const [isResolving, setIsResolving] = useState(false);

  // Tools Admin Logic
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [serverTools, setServerTools] = useState<Tool[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [toolSearch, setToolSearch] = useState('');

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
    if (!selectedTech) return { active: [], resolved: [], merit: 0, demerit: 0 };
    const all = tickets.filter(t => t.assignedTo?.trim().toLowerCase() === selectedTech.trim().toLowerCase());
    const techLogs = (stats?.performanceLogs || []).filter(l => l.tech === selectedTech && String(l.category || '').toUpperCase() === category.toUpperCase());
    const merit = techLogs.filter(l => l.points > 0).reduce((a, b) => a + b.points, 0);
    const demerit = Math.abs(techLogs.filter(l => l.points < 0).reduce((a, b) => a + b.points, 0));
    
    return {
      active: all.filter(t => !['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status)),
      resolved: all.filter(t => ['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status)),
      merit,
      demerit
    };
  }, [tickets, selectedTech, stats, category]);

  useEffect(() => {
    if (activeTechList.length > 0 && !selectedTech) {
      setSelectedTech(activeTechList[0]);
      setMultiSelectedTechs([activeTechList[0]]);
    }
    if (!demandTech && activeTechList.length > 0) setDemandTech(activeTechList[0]);
  }, [activeTechList, selectedTech]);

  const handleAdminToggle = () => isAdminUnlocked ? setIsAdminUnlocked(false) : setShowPinModal(true);
  
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '5566') {
      setIsAdminUnlocked(true);
      setShowPinModal(false);
      setPinInput('');
      showToast("Admin Access Unlocked");
    } else {
      showToast("Access Denied");
      setPinInput('');
    }
  };

  const handleResolve = async () => {
    if (!resolveTicket || solvingTechs.length === 0) return;
    setIsResolving(true);
    
    const solversStr = solvingTechs.join(' & ');
    const fd = new FormData();
    fd.append('action', 'resolve_ticket');
    fd.append('category', category.toUpperCase());
    fd.append('rowIndex', String(resolveTicket.rowIndex));
    fd.append('assetTag', resolveTicket.assetTag);
    fd.append('status', 'Resolved by Technician');
    fd.append('resolvedBy', `${solversStr} • ${new Date().toLocaleString()}`);
    fd.append('workType', resolveType);
    fd.append('remarks', resolveRemarks);
    fd.append('gasUsed', String(gasUsedYesNo === 'Yes' ? gasUsed : 0));
    fd.append('gasType', gasUsedYesNo === 'Yes' ? selectedGasType : '');
    
    try {
      await postAction(fd);
      for (const tech of solvingTechs) {
        await updatePoints(category, tech, 2, "Ticket Resolution Bonus");
      }
      onRefresh();
      setResolveTicket(null);
      setSolvingTechs([]);
      setResolveRemarks('');
      showToast("Issue Solved (+2 Merit Distributed)");
    } catch (e) { showToast("Sync Failure"); }
    finally { setIsResolving(false); }
  };

  const handleUpdateToolQty = async (toolName: string, delta: number) => {
    if (!isAdminUnlocked) return;
    const tool = serverTools.find(t => t.name === toolName);
    if (!tool) return;
    const newQty = Math.max(0, tool.qty + delta);
    try {
      await updateTool(category, toolName, { ...tool, qty: newQty });
      showToast(`${toolName} updated to ${newQty}`);
      loadTools();
    } catch (e) { showToast("Tool Update Failure"); }
  };

  const handleSubmitDemand = async () => {
    if (!demandText || !demandTech) return;
    setIsSubmittingDemand(true);
    try {
      await submitDemand(category, demandTech, demandText);
      showToast("Material Demand Submitted");
      setDemandText('');
    } catch (e) { showToast("Submission Failure"); }
    finally { setIsSubmittingDemand(false); }
  };

  const toggleMultiSelect = (tech: string) => {
    setMultiSelectedTechs(prev => 
      prev.includes(tech) ? prev.filter(t => t !== tech) : [...prev, tech]
    );
    setSelectedTech(tech); 
  };

  const toggleSolvingTech = (tech: string) => {
    setSolvingTechs(prev =>
      prev.includes(tech) ? prev.filter(t => t !== tech) : [...prev, tech]
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6 animate-fadeIn pb-32">
      {/* Navigation Switcher */}
      <div className="flex bg-white p-1.5 rounded-2xl shadow-xl border border-slate-100 gap-1.5 sticky top-4 z-50 glass-panel overflow-x-auto hide-scroll">
        {[
          { id: 'profiles', label: 'Profile Hub', icon: 'id-card' },
          { id: 'hub', label: 'Operations', icon: 'map-marked-alt' },
          { id: 'demands', label: 'Materials', icon: 'truck-loading' },
          { id: 'tools', label: 'Tools', icon: 'toolbox' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id as any)} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 min-w-[110px] rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === tab.id ? 'bg-slate-900 text-white shadow-lg scale-[1.02]' : 'text-slate-400 hover:bg-slate-50'}`}>
            <i className={`fas fa-${tab.icon} ${view === tab.id ? 'text-indigo-400' : 'opacity-40'}`}></i>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {view === 'profiles' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Technician Selector Strip */}
          <div className="flex gap-3 overflow-x-auto pb-4 hide-scroll px-1">
             {activeTechList.map(t => (
               <button 
                 key={t} 
                 onClick={() => toggleMultiSelect(t)} 
                 className={`group flex items-center gap-4 p-4 rounded-3xl border-2 transition-all min-w-[180px] md:min-w-[220px] ${multiSelectedTechs.includes(t) ? (selectedTech === t ? 'bg-slate-950 border-slate-950 shadow-2xl scale-105' : 'bg-slate-800 border-slate-800 shadow-xl scale-100') : 'bg-white border-slate-100 opacity-60 hover:opacity-100 hover:border-slate-200 shadow-sm'}`}
               >
                  <div className="relative">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl italic shadow-inner ${multiSelectedTechs.includes(t) ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300 group-hover:bg-slate-100'}`}>
                      {t[0]}
                    </div>
                    {multiSelectedTechs.includes(t) && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center border-2 border-white animate-fadeIn">
                        <i className="fas fa-check text-white text-[8px]"></i>
                      </div>
                    )}
                  </div>
                  <div className="text-left">
                    <p className={`text-[10px] font-black uppercase tracking-widest italic leading-none ${multiSelectedTechs.includes(t) ? 'text-white' : 'text-slate-900'}`}>{t}</p>
                    <p className={`text-[7px] font-bold uppercase mt-1.5 italic ${multiSelectedTechs.includes(t) ? 'text-white/40' : 'text-slate-300'}`}>
                      {attendance[t] ? '● Online' : '○ Offline'}
                    </p>
                  </div>
               </button>
             ))}
          </div>

          {selectedTech ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-slideUp">
               {/* Left: Performance Card */}
               <div className="lg:col-span-4 space-y-6">
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[50px]"></div>
                    <div className="text-center mb-8 relative z-10">
                       <div className="w-24 h-24 bg-slate-950 text-white rounded-[2rem] flex items-center justify-center text-4xl font-black italic shadow-2xl mx-auto mb-6 relative overflow-hidden">
                          <div className="absolute inset-0 bg-indigo-600/20 blur-xl"></div>
                          <span className="relative">{selectedTech[0]}</span>
                       </div>
                       <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none mb-2">{selectedTech}</h3>
                       <p className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.4em] italic">{category.toUpperCase()} SPECIALIST OPERATIVE</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 relative z-10">
                       <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 text-center">
                          <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-2 italic">Total Merit</p>
                          <p className="text-3xl font-black text-emerald-600 italic leading-none">+{techProfileData.merit}</p>
                       </div>
                       <div className="bg-rose-50 p-5 rounded-2xl border border-rose-100 text-center">
                          <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-2 italic">Demerits</p>
                          <p className="text-3xl font-black text-rose-600 italic leading-none">-{techProfileData.demerit}</p>
                       </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-slate-50 relative z-10">
                       <div className="flex justify-between items-center mb-4">
                          <span className="text-[9px] font-black text-slate-400 uppercase italic tracking-widest">Attendance Status</span>
                          <button 
                            onClick={() => toggleAttendance(selectedTech)} 
                            className={`w-12 h-6 rounded-full transition-all relative ${attendance[selectedTech] ? 'bg-emerald-500' : 'bg-slate-200'}`}
                          >
                             <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${attendance[selectedTech] ? 'left-7' : 'left-1'}`}></div>
                          </button>
                       </div>
                    </div>
                 </div>
               </div>

               {/* Right: Work Order Hub */}
               <div className="lg:col-span-8 space-y-6">
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl">
                     <div className="flex items-center justify-between mb-8 border-b border-slate-50 pb-6">
                        <div className="flex items-center gap-4">
                          <i className="fas fa-tasks text-indigo-500 text-lg"></i>
                          <h4 className="text-sm font-black text-slate-950 uppercase italic tracking-widest">Deployment Pipeline</h4>
                        </div>
                        <span className="bg-indigo-50 text-indigo-600 text-[8px] font-black px-3 py-1 rounded-full uppercase italic tracking-widest">
                           {techProfileData.active.length} Active Records
                        </span>
                     </div>

                     <div className="space-y-4 max-h-[500px] overflow-y-auto hide-scroll pr-2">
                        {techProfileData.active.length > 0 ? techProfileData.active.map((t, i) => (
                           <div key={i} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all">
                              <div className="absolute left-0 top-0 h-full w-1 bg-indigo-500"></div>
                              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                 <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-3">
                                       <span className="text-[7px] font-black uppercase text-white bg-slate-950 px-2 py-0.5 rounded tracking-widest italic">{t.assetTag}</span>
                                       <span className="text-[7px] font-bold text-slate-300 uppercase italic">{new Date(t.date).toLocaleDateString()}</span>
                                    </div>
                                    <h5 className="text-[13px] font-black text-slate-900 leading-tight italic">"{t.details}"</h5>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic">{t.location}</p>
                                 </div>
                                 <button 
                                   onClick={() => { setResolveTicket(t); setSolvingTechs([selectedTech]); }} 
                                   className="w-full md:w-auto bg-slate-950 text-white px-8 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest italic hover:scale-105 active:scale-95 transition-all shadow-xl"
                                 >
                                    Solve Issue
                                 </button>
                              </div>
                           </div>
                        )) : (
                           <div className="py-20 text-center opacity-10 flex flex-col items-center">
                              <i className="fas fa-check-circle text-6xl mb-4"></i>
                              <p className="text-xs font-black uppercase tracking-[0.4em] italic">No Active Deployments</p>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
          ) : null}
        </div>
      )}

      {view === 'hub' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
           <div className="lg:col-span-12">
             <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-xl">
               <div className="flex items-center justify-between mb-8 px-1">
                 <h3 className="text-xs md:text-sm font-black uppercase tracking-[0.2em] text-slate-900 italic leading-none">Deployment Checklists</h3>
                 <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-lg"></div><span className="text-[8px] font-black text-emerald-600 uppercase italic">Live Synchronizer</span></div>
               </div>
               <div className={`grid grid-cols-1 ${category === 'handyman' ? 'sm:grid-cols-1' : 'sm:grid-cols-2'} gap-4 md:gap-6`}>
                  {activeTechList.map((tech, i) => (
                    <button key={i} onClick={() => onOpenChecklist(i, tech)} className="bg-slate-50/50 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-slate-100 flex flex-col hover:bg-white hover:shadow-2xl transition-all group active:scale-[0.98] text-left relative overflow-hidden">
                      <div className="flex items-center justify-between mb-8 w-full">
                        <div className="flex items-center gap-5 relative z-10">
                          <div className={`w-12 h-12 md:w-16 md:h-16 bg-white rounded-2xl flex items-center justify-center text-xl md:text-2xl font-black text-slate-900 shadow-inner group-hover:bg-slate-900 group-hover:text-white transition-all`}>
                            {category.toUpperCase()[0]}{i+1}
                          </div>
                          <div>
                            <p className="text-sm md:text-lg font-black text-slate-900 uppercase tracking-widest italic">{tech}</p>
                            <p className="text-[7px] md:text-[9px] font-bold text-slate-300 uppercase mt-1.5 italic">Sector {i+1} Deployment</p>
                          </div>
                        </div>
                        <i className="fas fa-chevron-right text-slate-200 group-hover:text-indigo-500 transition-all text-xl"></i>
                      </div>
                    </button>
                  ))}
               </div>
             </div>
           </div>
        </div>
      )}

      {view === 'demands' && (
        <div className="animate-fadeIn space-y-8">
           <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-slate-100 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[80px]"></div>
              <div className="max-w-xl mx-auto space-y-8">
                 <div className="text-center">
                    <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner text-2xl">
                       <i className="fas fa-truck-loading"></i>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 italic tracking-tighter uppercase leading-none">Material Demand Protocol</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-4 tracking-[0.3em] italic">Supply Chain Synchronization</p>
                 </div>

                 <div className="space-y-6">
                    <div className="bg-slate-50 p-6 rounded-[1.5rem] border-2 border-slate-100 focus-within:border-amber-500 transition-all">
                       <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-2 tracking-widest italic">Requesting Specialist</label>
                       <select value={demandTech} onChange={e => setDemandTech(e.target.value)} className="w-full bg-transparent font-black text-[12px] outline-none italic uppercase text-slate-950">
                          {activeTechList.map(t => <option key={t} value={t}>{t}</option>)}
                       </select>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 focus-within:border-amber-500 transition-all">
                       <label className="block text-[8px] font-black text-slate-400 uppercase mb-4 ml-2 tracking-widest italic">Itemized Requirements</label>
                       <textarea value={demandText} onChange={e => setDemandText(e.target.value)} rows={4} placeholder="Detail required components, quantities, and justification..." className="w-full bg-transparent font-bold text-base outline-none italic uppercase resize-none placeholder:text-slate-200 leading-relaxed" />
                    </div>
                    <button onClick={handleSubmitDemand} disabled={isSubmittingDemand || !demandText.trim()} className="w-full bg-slate-950 text-white py-8 rounded-[2rem] font-black uppercase text-[11px] tracking-[0.4em] shadow-2xl active:scale-95 transition-all disabled:opacity-30 italic flex items-center justify-center gap-4">
                       {isSubmittingDemand ? <i className="fas fa-circle-notch animate-spin text-amber-400"></i> : <i className="fas fa-paper-plane text-amber-400"></i>}
                       <span>{isSubmittingDemand ? 'Synchronizing...' : 'Authorize Material Request'}</span>
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {view === 'tools' && (
        <div className="animate-fadeIn space-y-6">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 italic leading-none">Tool Inventory Registry</h3>
                <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 tracking-widest italic">Asset Verification & Maintenance</p>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                 <div className="relative flex-1 md:w-64">
                   <input type="text" placeholder="Search Tools..." value={toolSearch} onChange={e => setToolSearch(e.target.value)} className="w-full bg-white border border-slate-100 px-10 py-3 rounded-xl text-[10px] font-bold outline-none focus:border-indigo-500 shadow-sm" />
                   <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-[10px]"></i>
                 </div>
                 <button onClick={handleAdminToggle} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isAdminUnlocked ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-300 border border-slate-100 hover:text-indigo-600'}`}>
                    <i className={`fas fa-${isAdminUnlocked ? 'lock-open' : 'lock'} text-xs`}></i>
                 </button>
              </div>
           </div>
           {isLoadingTools ? (
             <div className="py-32 flex flex-col items-center justify-center opacity-10"><i className="fas fa-circle-notch animate-spin text-6xl mb-4"></i><p className="text-xs font-black uppercase tracking-widest italic">Fetching Tool Registry...</p></div>
           ) : (
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {serverTools.filter(t => !toolSearch || t.name.toLowerCase().includes(toolSearch.toLowerCase())).map((tool, i) => (
                  <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                     <div className="flex justify-between items-start mb-6">
                        <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all text-sm"><i className="fas fa-wrench"></i></div>
                        <div className="text-right">
                           <p className="text-[8px] font-black text-slate-300 uppercase italic leading-none mb-1">Stock Vol</p>
                           <p className="text-2xl font-black text-slate-950 italic tracking-tighter">{tool.qty}</p>
                        </div>
                     </div>
                     <h4 className="text-[12px] font-black text-slate-900 uppercase italic tracking-tight leading-tight mb-6">"{tool.name}"</h4>
                     {isAdminUnlocked && (
                       <div className="flex gap-2 pt-4 border-t border-slate-50">
                          <button onClick={() => handleUpdateToolQty(tool.name, -1)} className="flex-1 bg-slate-50 text-slate-400 py-3 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95"><i className="fas fa-minus text-[10px]"></i></button>
                          <button onClick={() => handleUpdateToolQty(tool.name, 1)} className="flex-1 bg-slate-50 text-slate-400 py-3 rounded-xl hover:bg-emerald-50 hover:text-emerald-600 transition-all active:scale-95"><i className="fas fa-plus text-[10px]"></i></button>
                       </div>
                     )}
                  </div>
                ))}
             </div>
           )}
        </div>
      )}

      {/* UNIVERSAL RESOLUTION MODAL */}
      {resolveTicket && (
        <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-3xl border border-white/5 relative overflow-hidden max-h-[90vh] overflow-y-auto hide-scroll">
             <div className="flex justify-between items-center mb-8">
               <div>
                 <h3 className="text-2xl font-black text-slate-950 leading-none italic uppercase tracking-tighter">Issue Resolution</h3>
                 <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Asset Reference: {resolveTicket.assetTag}</p>
               </div>
               <button onClick={() => setResolveTicket(null)} className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-300 flex items-center justify-center active:scale-90 hover:text-rose-500 transition-all"><i className="fas fa-times text-xl"></i></button>
             </div>
             
             <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-4 ml-1 tracking-widest italic">Who solved this issue?</label>
                  <div className="grid grid-cols-2 gap-3">
                     {activeTechList.map(tech => (
                       <button key={tech} onClick={() => toggleSolvingTech(tech)} className={`p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${solvingTechs.includes(tech) ? 'border-indigo-600 bg-indigo-50 text-indigo-950' : 'border-white bg-white text-slate-400'}`}>
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${solvingTechs.includes(tech) ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>{tech[0]}</div>
                          <span className="text-[9px] font-bold uppercase tracking-tight">{tech}</span>
                       </button>
                     ))}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest italic">Issue Classification</label>
                  <div className="flex gap-2">
                    {['Minor', 'Major'].map(type => (
                      <button key={type} onClick={() => setResolveType(type as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all italic tracking-widest ${resolveType === type ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}>{type}</button>
                    ))}
                  </div>
                </div>

                {category === 'ac' && (
                  <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest italic">Refrigerant Usage?</label>
                    <div className="flex gap-2">
                      {['Yes', 'No'].map(choice => (
                        <button key={choice} onClick={() => setGasUsedYesNo(choice as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all italic ${gasUsedYesNo === choice ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400'}`}>{choice}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest italic">Resolution Remarks</label>
                  <textarea value={resolveRemarks} onChange={e => setResolveRemarks(e.target.value)} rows={3} placeholder="Detail actions performed..." className="w-full bg-transparent font-bold text-[11px] outline-none italic uppercase resize-none placeholder:text-slate-200 leading-relaxed" />
                </div>

                <button onClick={handleResolve} disabled={isResolving || !resolveRemarks.trim() || solvingTechs.length === 0} className="w-full bg-slate-950 text-white py-6 rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.4em] shadow-2xl active:scale-95 transition-all disabled:opacity-30 italic flex items-center justify-center gap-4">
                  {isResolving ? <i className="fas fa-circle-notch animate-spin text-teal-400"></i> : <i className="fas fa-check-double text-teal-400"></i>}
                  <span>{isResolving ? 'Synchronizing Protocol...' : 'Finalize Resolution'}</span>
                </button>
             </div>
          </div>
        </div>
      )}

      {/* PIN AUTH MODAL FOR ADMIN TOOLS */}
      {showPinModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-10 shadow-3xl border border-white/5">
             <div className="text-center mb-8"><div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner"><i className="fas fa-shield-alt text-3xl"></i></div><h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Admin Login</h3><p className="text-[10px] font-bold text-slate-400 uppercase mt-3 tracking-widest italic">Enter 4-Digit Hub Code</p></div>
             <form onSubmit={handlePinSubmit} className="space-y-8">
                <input type="password" autoFocus maxLength={4} value={pinInput} onChange={(e) => setPinInput(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] py-5 text-center text-3xl font-black tracking-[0.6em] focus:border-teal-600 outline-none transition-all shadow-inner" placeholder="••••" />
                <div className="flex gap-4"><button type="button" onClick={() => setShowPinModal(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 italic">Exit</button><button type="submit" className="flex-1 bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest italic shadow-2xl">Confirm</button></div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TechView;