
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, Ticket, StatsResponse, CategoryKey, Tool } from '../types.ts';
import { CATEGORY_TECHS, DEFAULT_TOOLS, GAS_TYPES, ELECTRICAL_TECHNICIANS } from '../constants.ts';
import { submitDemand, postAction, updatePoints, fetchTools, updateTool, addTool, deleteTool } from '../services/api.ts';

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
  
  const allAvailableTechs = useMemo(() => {
    return [...CATEGORY_TECHS.ac, ...CATEGORY_TECHS.electrical, ...CATEGORY_TECHS.handyman];
  }, []);

  // Resolution State
  const [resolveTicket, setResolveTicket] = useState<Ticket | null>(null);
  const [solvingTechs, setSolvingTechs] = useState<string[]>([]);
  const [resolveType, setResolveType] = useState<'Minor' | 'Major'>('Minor');
  const [resolveRemarks, setResolveRemarks] = useState('');
  const [gasUsedYesNo, setGasUsedYesNo] = useState<'Yes' | 'No'>('No');
  const [gasAmount, setGasAmount] = useState<string>('0');
  const [selectedGasType, setSelectedGasType] = useState<string>(GAS_TYPES[0].name);
  const [isResolving, setIsResolving] = useState(false);

  // Tools Admin Logic
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [serverTools, setServerTools] = useState<Tool[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [toolSearch, setToolSearch] = useState('');

  // Tool CRUD State
  const [showToolModal, setShowToolModal] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [toolFormData, setToolFormData] = useState<Partial<Tool>>({ name: '', qty: 1, technician: '' });
  const [isSavingTool, setIsSavingTool] = useState(false);

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
      showToast("Admin Controls Enabled");
    } else {
      showToast("Unauthorized Access");
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
    fd.append('gasUsed', String(gasUsedYesNo === 'Yes' ? gasAmount : 0));
    fd.append('gasType', gasUsedYesNo === 'Yes' ? selectedGasType : '');
    
    try {
      await postAction(fd);
      for (const tech of solvingTechs) {
        await updatePoints(category, tech, 2, "Resolution Protocol Completed");
      }
      onRefresh();
      setResolveTicket(null);
      setSolvingTechs([]);
      setResolveRemarks('');
      setGasAmount('0');
      showToast("Protocol Synchronized (+2 Merit Force-wide)");
    } catch (e) { showToast("Network Sync Failure"); }
    finally { setIsResolving(false); }
  };

  const handleSaveTool = async () => {
    if (!toolFormData.name || toolFormData.qty === undefined) return;
    setIsSavingTool(true);
    showToast("Synchronizing Hub Registry...");
    try {
      const toolToSave: Tool = {
        name: toolFormData.name!,
        qty: Number(toolFormData.qty!),
        technician: toolFormData.technician || '',
        category: category.toUpperCase()
      };

      if (editingTool) {
        await updateTool(category, editingTool.name, toolToSave);
        showToast("Tool Entry Modified Successfully");
      } else {
        await addTool(category, toolToSave);
        showToast("New Tool Registered Successfully");
      }
      setShowToolModal(false);
      loadTools();
    } catch (e) {
      showToast("Inventory Sync Failure");
    } finally {
      setIsSavingTool(false);
    }
  };

  const handleDeleteTool = async (name: string) => {
    if (!window.confirm(`CRITICAL: Permanently remove ${name} from inventory?`)) return;
    showToast("Transmitting Deletion Request...");
    try {
      await deleteTool(category, name);
      showToast("Tool Registry Cleared");
      loadTools();
    } catch (e) {
      showToast("Deletion Request Rejected");
    }
  };

  const handleUpdateToolQty = async (toolName: string, delta: number) => {
    if (!isAdminUnlocked) return;
    const tool = serverTools.find(t => t.name === toolName);
    if (!tool) return;
    const newQty = Math.max(0, tool.qty + delta);
    try {
      await updateTool(category, toolName, { ...tool, qty: newQty });
      showToast(`${toolName} Volume Updated`);
      loadTools();
    } catch (e) { showToast("Volume Sync Error"); }
  };

  const handleSubmitDemand = async () => {
    if (!demandText || !demandTech) return;
    setIsSubmittingDemand(true);
    try {
      await submitDemand(category, demandTech, demandText);
      showToast("Material Authorization Dispatched");
      setDemandText('');
    } catch (e) { showToast("Supply Hub Timeout"); }
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

  const groupedTools = useMemo(() => {
    const filtered = serverTools.filter(t => !toolSearch || t.name.toLowerCase().includes(toolSearch.toLowerCase()));
    if (category !== 'electrical') return { 'General Inventory': filtered };
    const groups: Record<string, Tool[]> = {};
    filtered.forEach(t => {
      const bag = t.technician || 'Common Inventory';
      if (!groups[bag]) groups[bag] = [];
      groups[bag].push(t);
    });
    return groups;
  }, [category, serverTools, toolSearch]);

  const electricalBags = ["Ibraheem", "Naveed Ali", "Haris & Owais", "Common Inventory"];

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6 animate-fadeIn pb-32">
      <div className="flex bg-white p-1.5 rounded-2xl shadow-xl border border-slate-100 gap-1.5 sticky top-4 z-50 glass-panel overflow-x-auto hide-scroll">
        {[
          { id: 'profiles', label: 'Field Hub', icon: 'id-card' },
          { id: 'hub', label: 'Operations', icon: 'map-marked-alt' },
          { id: 'demands', label: 'Supplies', icon: 'truck-loading' },
          { id: 'tools', label: 'Tools', icon: 'toolbox' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id as any)} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 min-w-[110px] rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>
            <i className={`fas fa-${tab.icon} ${view === tab.id ? 'text-indigo-400' : 'opacity-40'}`}></i>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {view === 'profiles' && (
        <div className="space-y-6">
          <div className="flex gap-3 overflow-x-auto pb-4 hide-scroll px-1">
             {activeTechList.map(t => (
               <button 
                 key={t} 
                 onClick={() => toggleMultiSelect(t)} 
                 className={`group flex items-center gap-4 p-4 rounded-3xl border-2 transition-all min-w-[180px] md:min-w-[220px] ${multiSelectedTechs.includes(t) ? (selectedTech === t ? 'bg-slate-950 border-slate-950 shadow-2xl scale-105' : 'bg-slate-800 border-slate-800 shadow-xl') : 'bg-white border-slate-100 opacity-60 shadow-sm'}`}
               >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl italic ${multiSelectedTechs.includes(t) ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300'}`}>
                    {t[0]}
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
                          {selectedTech[0]}
                       </div>
                       <h3 className="text-2xl font-black text-slate-900 uppercase italic leading-none mb-2">{selectedTech}</h3>
                       <p className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.4em] italic">{category.toUpperCase()} SPECIALIST</p>
                    </div>
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
                    <div className="mt-8 pt-8 border-t border-slate-50">
                       <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Attendance Hub</span>
                          <button onClick={() => toggleAttendance(selectedTech)} className={`w-12 h-6 rounded-full transition-all relative ${attendance[selectedTech] ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                             <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${attendance[selectedTech] ? 'left-7' : 'left-1'}`}></div>
                          </button>
                       </div>
                    </div>
                 </div>
               </div>

               <div className="lg:col-span-8 space-y-6">
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl">
                     <div className="flex items-center justify-between mb-8 border-b border-slate-50 pb-6">
                        <h4 className="text-sm font-black text-slate-950 uppercase italic tracking-widest">Active Pipeline</h4>
                        <span className="bg-indigo-50 text-indigo-600 text-[8px] font-black px-3 py-1 rounded-full uppercase italic">{techProfileData.active.length} Records</span>
                     </div>
                     <div className="space-y-4 max-h-[500px] overflow-y-auto hide-scroll">
                        {techProfileData.active.length > 0 ? techProfileData.active.map((t, i) => (
                           <div key={i} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                               <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-3">
                                     <span className="text-[7px] font-black text-white bg-slate-950 px-2 py-0.5 rounded italic">{t.assetTag}</span>
                                     <span className="text-[7px] font-bold text-slate-300 uppercase italic">{new Date(t.date).toLocaleDateString()}</span>
                                  </div>
                                  <h5 className="text-[13px] font-black text-slate-900 italic">"{t.details}"</h5>
                                  <p className="text-[8px] font-bold text-slate-400 uppercase italic">{t.location}</p>
                               </div>
                               <button onClick={() => { setResolveTicket(t); setSolvingTechs([selectedTech]); }} className="w-full md:w-auto bg-slate-950 text-white px-8 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest italic shadow-xl">Solve Issue</button>
                           </div>
                        )) : (
                           <div className="py-20 text-center opacity-10 flex flex-col items-center">
                              <i className="fas fa-check-circle text-6xl mb-4"></i>
                              <p className="text-xs font-black uppercase italic tracking-widest">Clear Queue</p>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>
      )}

      {view === 'hub' && (
        <div className="animate-fadeIn">
          <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl">
             <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900 italic mb-8 leading-none">Deployment Protocol</h3>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {activeTechList.map((tech, i) => (
                  <button key={i} onClick={() => onOpenChecklist(i, tech)} className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 hover:bg-white hover:shadow-2xl transition-all group flex items-center justify-between text-left">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-2xl font-black shadow-inner group-hover:bg-slate-900 group-hover:text-white transition-all">
                        {category.toUpperCase()[0]}{i+1}
                      </div>
                      <div>
                        <p className="text-lg font-black text-slate-900 uppercase italic">{tech}</p>
                        <p className="text-[9px] font-bold text-slate-300 uppercase mt-1 italic">Sector {i+1} Operational</p>
                      </div>
                    </div>
                    <i className="fas fa-chevron-right text-slate-200 group-hover:text-indigo-500 text-xl"></i>
                  </button>
                ))}
             </div>
          </div>
        </div>
      )}

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
                 <button onClick={handleSubmitDemand} disabled={isSubmittingDemand || !demandText.trim()} className="w-full bg-slate-950 text-white py-7 rounded-[2rem] font-black uppercase text-[11px] tracking-widest shadow-2xl active:scale-95 italic transition-all">
                    {isSubmittingDemand ? 'Syncing...' : 'Authorize Request'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {view === 'tools' && (
        <div className="animate-fadeIn space-y-6">
           <div className="flex flex-wrap justify-between items-center px-2 gap-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 italic leading-none">Inventory Stream</h3>
                <p className="text-[7px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Asset Verification Ledger</p>
              </div>
              
              <div className="flex items-center gap-3">
                 <div className="relative">
                   <input 
                     type="text" 
                     placeholder="Filter inventory..." 
                     value={toolSearch} 
                     onChange={e => setToolSearch(e.target.value)} 
                     className="bg-white border border-slate-100 px-10 py-2.5 rounded-xl text-[9px] font-bold outline-none focus:border-indigo-500 shadow-sm w-48 md:w-64"
                   />
                   <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-[10px]"></i>
                 </div>
                 
                 {isAdminUnlocked && (
                   <button 
                     onClick={() => { setEditingTool(null); setToolFormData({ name: '', qty: 1, technician: '' }); setShowToolModal(true); }}
                     className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-[9px] font-black uppercase shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                   >
                     <i className="fas fa-plus"></i>
                     <span>Add Tool</span>
                   </button>
                 )}

                 <button onClick={handleAdminToggle} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isAdminUnlocked ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-300 border border-slate-100 hover:text-indigo-600'}`}>
                    <i className={`fas fa-${isAdminUnlocked ? 'lock-open' : 'lock'} text-xs`}></i>
                 </button>
              </div>
           </div>

           {isLoadingTools ? (
             <div className="py-32 flex flex-col items-center justify-center opacity-10"><i className="fas fa-circle-notch animate-spin text-5xl mb-4"></i><p className="text-[10px] font-black uppercase italic">Fetching Tool Registry...</p></div>
           ) : (
             <div className="space-y-10">
               {Object.entries(groupedTools).map(([group, tools]) => (
                 <div key={group} className="space-y-4">
                   <div className="flex items-center gap-3 ml-2">
                     <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                     <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 italic">{group}</h4>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {tools.map((tool, i) => (
                        <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all relative overflow-hidden group">
                           <div className="flex justify-between items-start mb-6">
                              <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all shadow-inner"><i className="fas fa-wrench"></i></div>
                              <div className="text-right">
                                 <p className="text-[8px] font-black text-slate-300 uppercase italic mb-1">Vol</p>
                                 <p className="text-2xl font-black text-slate-950 italic">{tool.qty}</p>
                              </div>
                           </div>
                           <h4 className="text-[12px] font-black text-slate-900 uppercase italic mb-6 leading-tight">"{tool.name}"</h4>
                           
                           {isAdminUnlocked && (
                             <div className="flex flex-col gap-3">
                               <div className="flex gap-2">
                                  <button onClick={() => handleUpdateToolQty(tool.name, -1)} className="flex-1 bg-slate-50 text-slate-400 py-2 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-all"><i className="fas fa-minus text-[8px]"></i></button>
                                  <button onClick={() => handleUpdateToolQty(tool.name, 1)} className="flex-1 bg-slate-50 text-slate-400 py-2 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 transition-all"><i className="fas fa-plus text-[8px]"></i></button>
                               </div>
                               <div className="flex gap-2">
                                  <button 
                                    onClick={() => { setEditingTool(tool); setToolFormData({ ...tool }); setShowToolModal(true); }}
                                    className="flex-1 bg-indigo-50 text-indigo-400 py-2 rounded-lg hover:bg-indigo-600 hover:text-white transition-all text-[8px] font-black uppercase"
                                  >
                                    <i className="fas fa-pencil-alt mr-1"></i> Edit
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteTool(tool.name)}
                                    className="flex-1 bg-rose-50 text-rose-300 py-2 rounded-lg hover:bg-rose-600 hover:text-white transition-all text-[8px] font-black uppercase"
                                  >
                                    <i className="fas fa-trash mr-1"></i> Del
                                  </button>
                               </div>
                             </div>
                           )}
                        </div>
                      ))}
                   </div>
                 </div>
               ))}
               {Object.keys(groupedTools).length === 0 && (
                 <div className="py-24 text-center opacity-10">
                   <i className="fas fa-search text-6xl mb-6"></i>
                   <p className="text-xs font-black uppercase tracking-[0.4em] italic">No Matching Tools Found</p>
                 </div>
               )}
             </div>
           )}
        </div>
      )}

      {/* TOOL MANAGEMENT MODAL */}
      {showToolModal && (
        <div className="fixed inset-0 bg-slate-950/98 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-3xl border border-white/5 overflow-hidden">
             <div className="flex justify-between items-center mb-10">
               <div>
                 <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">
                   {editingTool ? 'Modify Tool' : 'Register Tool'}
                 </h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase mt-3 tracking-widest italic">Authorized Entry</p>
               </div>
               <button onClick={() => setShowToolModal(false)} className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-300 hover:text-rose-500 transition-all"><i className="fas fa-times text-xl"></i></button>
             </div>
             
             <div className="space-y-6">
                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Tool Description</label>
                  <input 
                    type="text" 
                    value={toolFormData.name || ''} 
                    onChange={e => setToolFormData({...toolFormData, name: e.target.value})}
                    placeholder="e.g. Hammer Drill"
                    className="w-full bg-transparent font-black text-[11px] outline-none italic uppercase"
                  />
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Stock Volume</label>
                  <input 
                    type="number" 
                    value={toolFormData.qty || 0} 
                    onChange={e => setToolFormData({...toolFormData, qty: parseInt(e.target.value) || 0})}
                    className="w-full bg-transparent font-black text-xl outline-none italic"
                  />
                </div>

                {category === 'electrical' && (
                  <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Bag Assignment</label>
                    <select 
                      value={toolFormData.technician || ''} 
                      onChange={e => setToolFormData({...toolFormData, technician: e.target.value})}
                      className="w-full bg-transparent font-black text-[10px] outline-none italic uppercase cursor-pointer"
                    >
                      <option value="">Common Inventory</option>
                      {electricalBags.map(bag => <option key={bag} value={bag}>{bag}</option>)}
                    </select>
                  </div>
                )}

                <button 
                  onClick={handleSaveTool} 
                  disabled={isSavingTool || !toolFormData.name}
                  className="w-full bg-slate-950 text-white py-6 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] shadow-2xl active:scale-95 italic transition-all disabled:opacity-30"
                >
                  {isSavingTool ? 'Synchronizing...' : 'Finalize Registry'}
                </button>
             </div>
          </div>
        </div>
      )}

      {/* RESOLUTION MODAL */}
      {resolveTicket && (
        <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-3xl relative overflow-hidden max-h-[90vh] overflow-y-auto hide-scroll">
             <div className="flex justify-between items-center mb-8">
               <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Solve Issue</h3>
               <button onClick={() => setResolveTicket(null)} className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-300 flex items-center justify-center hover:text-rose-500 transition-all"><i className="fas fa-times text-xl"></i></button>
             </div>
             <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-4 ml-1 italic">Who solved this issue?</label>
                  <div className="grid grid-cols-2 gap-3">
                     {allAvailableTechs.map(tech => (
                       <button key={tech} onClick={() => toggleSolvingTech(tech)} className={`p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${solvingTechs.includes(tech) ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-md' : 'border-white bg-white text-slate-400'}`}>
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${solvingTechs.includes(tech) ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>{tech[0]}</div>
                          <span className="text-[9px] font-bold uppercase">{tech}</span>
                       </button>
                     ))}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Classification</label>
                  <div className="flex gap-2">
                    {['Minor', 'Major'].map(type => (
                      <button key={type} onClick={() => setResolveType(type as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all italic ${resolveType === type ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}>{type}</button>
                    ))}
                  </div>
                </div>

                {category === 'ac' && (
                  <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 space-y-4">
                    <label className="block text-[8px] font-black text-slate-400 uppercase italic ml-1">Refrigerant Usage?</label>
                    <div className="flex gap-2">
                      {['Yes', 'No'].map(choice => (
                        <button key={choice} onClick={() => setGasUsedYesNo(choice as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all italic ${gasUsedYesNo === choice ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-400'}`}>{choice}</button>
                      ))}
                    </div>
                    {gasUsedYesNo === 'Yes' && (
                      <div className="flex gap-3 animate-slideDown">
                        <select value={selectedGasType} onChange={e => setSelectedGasType(e.target.value)} className="flex-1 bg-white border border-slate-200 p-3 rounded-xl text-[11px] font-black italic uppercase outline-none">
                           {(GAS_TYPES as any[]).map((g: any) => <option key={g.name} value={g.name}>{g.name}</option>)}
                        </select>
                        <input type="number" step="0.1" value={gasAmount} onChange={e => setGasAmount(e.target.value)} className="w-24 bg-white border border-slate-200 p-3 rounded-xl text-[13px] font-black italic outline-none" placeholder="KG" />
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Resolution Narrative</label>
                  <textarea value={resolveRemarks} onChange={e => setResolveRemarks(e.target.value)} rows={3} placeholder="Detail actions..." className="w-full bg-transparent font-bold text-[11px] outline-none italic uppercase resize-none leading-relaxed" />
                </div>

                <button onClick={handleResolve} disabled={isResolving || !resolveRemarks.trim() || solvingTechs.length === 0} className="w-full bg-slate-950 text-white py-6 rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.4em] shadow-2xl active:scale-[0.98] transition-all disabled:opacity-30 italic flex items-center justify-center gap-4">
                  {isResolving ? <i className="fas fa-circle-notch animate-spin text-teal-400"></i> : <i className="fas fa-check-double text-teal-400"></i>}
                  <span>{isResolving ? 'Synchronizing...' : 'Finalize Solution'}</span>
                </button>
             </div>
          </div>
        </div>
      )}

      {/* ADMIN PIN MODAL */}
      {showPinModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[700] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-10 shadow-3xl border border-white/5 text-center space-y-8">
             <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner"><i className="fas fa-shield-alt text-3xl"></i></div>
             <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Admin Entry</h3>
             <form onSubmit={handlePinSubmit} className="space-y-8">
                <input type="password" autoFocus maxLength={4} value={pinInput} onChange={(e) => setPinInput(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 text-center text-3xl font-black tracking-[0.6em] outline-none shadow-inner" placeholder="••••" />
                <div className="flex gap-4"><button type="button" onClick={() => setShowPinModal(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 italic">Exit</button><button type="submit" className="flex-1 bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] italic shadow-2xl">Enter</button></div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TechView;
