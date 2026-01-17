
import React, { useState, useMemo } from 'react';
import { Asset, Ticket, StatsResponse } from '../types.ts';
import { TECHNICIANS, TOOLS_LIST, GAS_TYPES } from '../constants.ts';
import { submitDemand, postAction, updatePoints } from '../services/api.ts';
import LeaderboardItem from './LeaderboardItem.tsx';

interface Props {
  attendance: Record<string, boolean>;
  toggleAttendance: (tech: string) => void;
  tickets: Ticket[];
  assets: Asset[];
  onOpenChecklist: (zoneIdx: number, tech: string) => void;
  showToast: (msg: string) => void;
  onRefresh: () => void;
  stats: StatsResponse | null;
}

const TechView: React.FC<Props> = ({ attendance, toggleAttendance, tickets, assets, onOpenChecklist, showToast, onRefresh, stats }) => {
  const [view, setView] = useState<'hub' | 'demands' | 'tools' | 'profiles'>('hub');
  const [selectedTech, setSelectedTech] = useState<string | null>(null);
  const [demandText, setDemandText] = useState('');
  const [isSubmittingDemand, setIsSubmittingDemand] = useState(false);

  // Tools Logic
  const [localTools, setLocalTools] = useState(() => {
    const saved = localStorage.getItem('disrupt_tools');
    return saved ? JSON.parse(saved) : TOOLS_LIST;
  });
  const [toolClickCount, setToolClickCount] = useState(0);
  const [showToolAdmin, setShowToolAdmin] = useState(false);
  const [editingToolIndex, setEditingToolIndex] = useState<number | null>(null);
  const [newTool, setNewTool] = useState({ name: '', qty: 0 });

  // Zone Locking Logic
  const [takeoverModal, setTakeoverModal] = useState<{zoneIdx: number, originalTech: string} | null>(null);
  const [takeoverName, setTakeoverName] = useState(TECHNICIANS[0]);

  // Resolution Modal State
  const [resolveTicket, setResolveTicket] = useState<Ticket | null>(null);
  const [resolveType, setResolveType] = useState<'Minor' | 'Major'>('Minor');
  const [gasUsed, setGasUsed] = useState(0);
  const [gasType, setGasType] = useState(GAS_TYPES[0].name);
  const [resolveRemarks, setResolveRemarks] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const zoneStats = useMemo(() => {
    return [0, 1, 2, 3].map(idx => {
      const zoneAssets = assets.filter(a => {
        const id = Number(a.id);
        if (idx === 0) return id >= 1 && id <= 40;
        if (idx === 1) return id >= 41 && id <= 82;
        if (idx === 2) return id >= 83 && id <= 121;
        if (idx === 3) return id >= 122 && id <= 161;
        return false;
      });
      const completed = stats?.hvac?.inspection || [];
      const pct = zoneAssets.length ? Math.round((zoneAssets.filter(a => completed.includes(a.tag)).length / zoneAssets.length) * 100) : 0;
      return { pct, tech: TECHNICIANS[idx], count: zoneAssets.length };
    });
  }, [assets, stats]);

  const currentTechTasks = useMemo(() => {
    if (!selectedTech) return [];
    return tickets.filter(t => t.assignedTo === selectedTech && !['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status));
  }, [tickets, selectedTech]);

  const handleToolHeaderClick = () => {
    const next = toolClickCount + 1;
    if (next >= 5) {
      setShowToolAdmin(true);
      setToolClickCount(0);
    } else {
      setToolClickCount(next);
    }
  };

  const saveTools = (updated: any) => {
    setLocalTools(updated);
    localStorage.setItem('disrupt_tools', JSON.stringify(updated));
  };

  const handleUpdateTool = () => {
    if (editingToolIndex === null) return;
    const updated = [...localTools];
    updated[editingToolIndex] = newTool;
    saveTools(updated);
    setEditingToolIndex(null);
    setNewTool({ name: '', qty: 0 });
    showToast("Registry Updated");
  };

  const handleAddTool = () => {
    if (!newTool.name) return;
    const updated = [...localTools, newTool];
    saveTools(updated);
    setEditingToolIndex(null);
    setNewTool({ name: '', qty: 0 });
    showToast("New Inventory Logged");
  };

  const handleRemoveTool = (idx: number) => {
    if (window.confirm("Delete this tool record?")) {
      const updated = localTools.filter((_: any, i: number) => i !== idx);
      saveTools(updated);
      setEditingToolIndex(null);
      showToast("Tool Removed");
    }
  };

  const handleZoneClick = (idx: number, tech: string) => {
    if (!attendance[tech]) {
      setTakeoverModal({ zoneIdx: idx, originalTech: tech });
    } else {
      onOpenChecklist(idx, tech);
    }
  };

  const handleTakeover = () => {
    if (takeoverModal) {
      // Tech who is present takes over
      onOpenChecklist(takeoverModal.zoneIdx, takeoverName);
      setTakeoverModal(null);
    }
  };

  const handleResolve = async () => {
    if (!resolveTicket) return;
    setIsResolving(true);
    const fd = new FormData();
    fd.append('action', 'resolve_ticket');
    fd.append('rowIndex', String(resolveTicket.rowIndex));
    fd.append('assetTag', resolveTicket.assetTag);
    fd.append('status', 'Resolved by Technician');
    fd.append('resolvedBy', resolveTicket.assignedTo);
    fd.append('workType', resolveType);
    fd.append('remarks', resolveRemarks);
    fd.append('gasUsed', String(gasUsed));
    fd.append('gasType', gasType);

    showToast("Syncing Database...");
    await postAction(fd);
    
    // Merit System: +2 points for resolution
    await updatePoints(resolveTicket.assignedTo, 2, `Resolved Breakdown: ${resolveTicket.assetTag}`);
    
    if (gasUsed > 0) {
      const gfd = new FormData();
      gfd.append('action', 'log_gas_tx');
      gfd.append('type', 'USAGE');
      gfd.append('gasType', gasType);
      gfd.append('amount', String(-Math.abs(gasUsed)));
      gfd.append('tech', resolveTicket.assignedTo);
      gfd.append('refTicket', resolveTicket.assetTag);
      await postAction(gfd);
    }

    onRefresh();
    setResolveTicket(null);
    setResolveRemarks('');
    setGasUsed(0);
    setIsResolving(false);
    showToast("Resolution Confirmed");
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 lg:p-6 space-y-6 animate-fadeIn">
      {/* NAVIGATION */}
      <div className="flex bg-white p-1 rounded-xl shadow-lg border border-slate-100 gap-1 sticky top-4 z-50 glass-panel">
        {['hub', 'profiles', 'demands', 'tools'].map(v => (
          <button key={v} onClick={() => setView(v as any)} className={`flex-1 py-2.5 rounded-lg text-[8px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${view === v ? 'bg-slate-900 text-white shadow-md' : 'text-slate-300 hover:bg-slate-50'}`}>
            {v === 'hub' ? 'Field Zones' : v === 'profiles' ? 'Profile Hub' : v === 'demands' ? 'Materials' : 'Tool Chest'}
          </button>
        ))}
      </div>

      {view === 'hub' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* ENCAPSULATED ATTENDANCE */}
          <section className="lg:col-span-3 space-y-5">
            <div className="bg-white p-5 rounded-2xl premium-card border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2.5 mb-5 border-b border-slate-50 pb-3">
                <div className="w-6 h-6 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-[10px] shadow-inner"><i className="fas fa-signal"></i></div>
                <h3 className="text-[9px] font-black text-slate-900 uppercase tracking-widest italic leading-none">Force Status</h3>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {TECHNICIANS.map(t => (
                  <button key={t} onClick={() => toggleAttendance(t)} className={`p-3 rounded-xl flex flex-col items-center gap-2.5 transition-all border shadow-sm ${attendance[t] ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 opacity-20 grayscale'}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm ${attendance[t] ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-400'}`}>{t[0]}</div>
                    <span className="text-[8px] font-black uppercase text-slate-900 leading-none italic">{t}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ZONE GRID & LEADERS */}
          <section className="lg:col-span-9 space-y-5">
            <div className="bg-white p-5 rounded-2xl premium-card border border-slate-100">
               <div className="flex items-center justify-between mb-5 px-1">
                 <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 italic leading-none">Zone Deployment analysis</h3>
                 <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]"></div><span className="text-[8px] font-black text-emerald-600 uppercase italic">Force Live Sync</span></div>
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {zoneStats.map((z, i) => (
                    <button key={i} onClick={() => handleZoneClick(i, z.tech)} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex items-center justify-between hover:bg-white hover:shadow-xl transition-all group relative overflow-hidden active:scale-[0.98]">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-[40px] pointer-events-none"></div>
                      <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-xl font-black text-indigo-600 shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">
                          {['A','B','C','D'][i]}
                        </div>
                        <div className="text-left">
                          <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest italic">{z.tech}</p>
                          <p className="text-[7px] font-bold text-slate-300 uppercase mt-1 italic">Zone {['A','B','C','D'][i]} Registry ({z.count} units)</p>
                        </div>
                      </div>
                      <div className="text-right relative z-10">
                        <p className="text-xl font-black text-slate-900 italic tracking-tighter leading-none">{z.pct}%</p>
                        <div className="w-12 h-1 bg-slate-200/50 rounded-full mt-2 overflow-hidden shadow-inner">
                           <div className={`h-full bg-emerald-500 transition-all duration-1000 shadow-[0_0_8px_#10b981]`} style={{ width: `${z.pct}%` }}></div>
                        </div>
                      </div>
                    </button>
                  ))}
               </div>
            </div>

            <div className="bg-white p-5 rounded-2xl premium-card border border-slate-100">
               <div className="flex justify-between items-center mb-5 border-b border-slate-50 pb-3">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 italic leading-none">Excellence Scoreboard</h3>
                  <div className="w-7 h-7 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-[11px] shadow-sm"><i className="fas fa-crown"></i></div>
               </div>
               <LeaderboardItem performanceLogs={stats?.performanceLogs || []} limit={4} onRefresh={onRefresh} compact={false} />
            </div>
          </section>
        </div>
      )}

      {/* ZONE TAKEOVER MODAL */}
      {takeoverModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[300] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-2xl p-8 shadow-2xl border border-white/5 text-center">
            <i className="fas fa-lock text-rose-500 text-3xl mb-4"></i>
            <h3 className="text-xl font-black uppercase text-slate-900 mb-2 italic tracking-tighter">Zone Locked</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-6 italic tracking-widest">Technician {takeoverModal.originalTech} is Absent. Who is taking over Zone {['A','B','C','D'][takeoverModal.zoneIdx]}?</p>
            <select value={takeoverName} onChange={e => setTakeoverName(e.target.value)} className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl font-black text-xs uppercase mb-6 outline-none italic">
              {TECHNICIANS.filter(t => attendance[t]).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setTakeoverModal(null)} className="py-3 text-[9px] font-black uppercase text-slate-300 italic">Cancel</button>
              <button onClick={handleTakeover} className="bg-slate-900 text-white py-3 rounded-xl font-black uppercase text-[9px] italic tracking-widest shadow-xl">Assign Takeover</button>
            </div>
          </div>
        </div>
      )}
      {/* (Rest of TechView remains the same...) */}
      {view === 'profiles' && (
        <section className="bg-white p-8 rounded-2xl premium-card border border-slate-100 min-h-[50vh] relative overflow-hidden">
           <div className="flex justify-between items-center mb-8 relative z-10">
              <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-400 italic">Specialist Hub</h3>
              <div className="flex gap-2">
                 {TECHNICIANS.map(t => (
                   <button key={t} onClick={() => setSelectedTech(t)} className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs transition-all ${selectedTech === t ? 'bg-slate-900 text-white scale-110 shadow-lg' : 'bg-slate-50 text-slate-200 hover:bg-slate-100'}`}>{t[0]}</button>
                 ))}
              </div>
           </div>

           {selectedTech ? (
             <div className="space-y-5 animate-slideDown relative z-10">
                <div className="flex items-center gap-5 mb-8">
                   <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl font-black text-slate-200 shadow-inner">{selectedTech[0]}</div>
                   <div>
                      <h4 className="text-2xl font-black italic tracking-tighter uppercase text-slate-900 leading-none">{selectedTech}</h4>
                      <p className="text-indigo-400 text-[8px] font-black uppercase mt-1 italic tracking-widest">Field Force Operative</p>
                   </div>
                </div>
                
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-300 mb-2 italic">Active Force Disruptions</p>
                {currentTechTasks.length === 0 ? (
                  <div className="py-20 text-center opacity-10 flex flex-col items-center"><i className="fas fa-check-double text-5xl mb-6 text-slate-400"></i><p className="text-[10px] font-black uppercase tracking-[0.3em]">All Systems Operational</p></div>
                ) : (
                  currentTechTasks.map((t, idx) => (
                    <div key={idx} className="bg-slate-50/50 p-5 rounded-xl border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center hover:bg-white hover:shadow-xl transition-all gap-5">
                       <div className="flex-1">
                          <p className="text-sm font-black text-slate-900 leading-tight mb-2.5 italic tracking-tight">"{t.details}"</p>
                          <div className="flex gap-2.5">
                             <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">{t.assetTag}</span>
                             <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full border border-slate-100 italic">{t.location}</span>
                          </div>
                       </div>
                       <button onClick={() => setResolveTicket(t)} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-[9px] uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all">Resolve Task</button>
                    </div>
                  ))
                )}
             </div>
           ) : (
             <div className="py-24 text-center opacity-10 relative z-10"><i className="fas fa-id-badge text-7xl mb-6 text-slate-100"></i><p className="text-xs font-black uppercase tracking-[0.5em]">Select Specialist Profile</p></div>
           )}
        </section>
      )}

      {view === 'demands' && (
        <section className="bg-white p-8 rounded-2xl premium-card border border-slate-100 min-h-[50vh] flex flex-col shadow-xl">
          <h3 className="text-2xl font-extrabold uppercase italic tracking-tighter mb-8 text-slate-900 italic">Material Demand Pipeline</h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 flex-1">
            <div className="space-y-5">
               <div className="bg-slate-50 p-5 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all shadow-inner">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 tracking-[0.3em] ml-1 italic">Authorized Individual</label>
                  <select value={selectedTech || ''} onChange={(e) => setSelectedTech(e.target.value)} className="w-full bg-transparent font-black text-xl outline-none cursor-pointer italic tracking-tighter uppercase">
                     <option value="" disabled>Select Force...</option>
                     {TECHNICIANS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
               </div>
               <div className="bg-slate-50 p-5 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all shadow-inner">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 tracking-[0.3em] ml-1 italic">Allocation Narrative</label>
                  <textarea 
                     value={demandText} 
                     onChange={(e) => setDemandText(e.target.value)} 
                     rows={3} 
                     className="w-full bg-transparent font-bold text-sm outline-none resize-none placeholder:text-slate-200 italic" 
                     placeholder="Specify requirements brief..."
                  />
               </div>
               <button 
                 onClick={async () => {
                    setIsSubmittingDemand(true);
                    await submitDemand(selectedTech || 'Field Staff', demandText);
                    showToast("Materials Committed");
                    setDemandText('');
                    setIsSubmittingDemand(false);
                 }} 
                 disabled={isSubmittingDemand || !demandText || !selectedTech}
                 className="w-full bg-slate-900 text-white py-6 rounded-xl font-black uppercase tracking-[0.4em] text-[10px] shadow-2xl active:scale-95 transition-all disabled:opacity-30 italic"
               >
                 {isSubmittingDemand ? 'Syncing Pipeline...' : 'Commit Inventory Request'}
               </button>
            </div>
            <div className="bg-slate-950 p-8 rounded-2xl text-white flex flex-col items-center justify-center text-center relative overflow-hidden">
                <i className="fas fa-truck-ramp-box text-[60px] mb-8 text-indigo-500 opacity-20"></i>
                <h4 className="text-xl font-extrabold uppercase italic mb-4 tracking-tighter">Supply Chain Protocol</h4>
                <p className="text-white/30 text-[10px] leading-relaxed italic max-w-xs px-6">All supply requests are synchronized in the demand registry for administrative verification.</p>
            </div>
          </div>
        </section>
      )}

      {view === 'tools' && (
        <section className="bg-white p-8 rounded-2xl premium-card border border-slate-100 min-h-[50vh] flex flex-col shadow-xl">
          <div className="flex justify-between items-center mb-8 border-b border-slate-50 pb-5">
             <div onClick={handleToolHeaderClick} className="cursor-pointer group">
                <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900 italic leading-none">Tool Chest Registry</h3>
                <p className="text-[8px] font-black text-slate-300 uppercase mt-2 tracking-widest italic group-hover:text-indigo-400 transition-colors">Operational Asset Control</p>
             </div>
             <div className="flex gap-2.5">
                {showToolAdmin && (
                   <button onClick={() => setEditingToolIndex(-1)} className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center text-sm shadow-lg animate-fadeIn active:scale-90 transition-all"><i className="fas fa-plus"></i></button>
                )}
                <div className="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center text-slate-200 shadow-inner border border-slate-100"><i className="fas fa-toolbox text-xl"></i></div>
             </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
             {localTools.map((tool: any, i: number) => (
               <div key={i} onClick={() => showToolAdmin && (setEditingToolIndex(i), setNewTool(tool))} className={`bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-center items-center hover:bg-white hover:shadow-xl transition-all group shadow-sm relative active:scale-[0.98] ${showToolAdmin ? 'cursor-pointer border-indigo-200' : ''}`}>
                  {showToolAdmin && <div className="absolute top-2 right-2 text-[8px] text-indigo-400 opacity-40"><i className="fas fa-pen-nib"></i></div>}
                  <span className="text-[11px] font-black text-slate-900 uppercase tracking-tighter italic text-center mb-4 leading-tight">{tool.name}</span>
                  <div className="w-11 h-11 bg-white text-slate-900 rounded-xl flex items-center justify-center text-base font-black shadow-inner border border-slate-100 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">{tool.qty}</div>
                  <p className="text-[7px] font-black text-slate-300 uppercase mt-3 tracking-[0.2em] italic">In Registry</p>
               </div>
             ))}
          </div>

          {/* TOOL ADMIN OVERLAY */}
          {editingToolIndex !== null && (
             <div className="fixed inset-0 bg-slate-950/98 z-[300] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
                <div className="bg-white w-full max-w-sm rounded-2xl p-8 shadow-2xl border border-white/5">
                   <h3 className="text-2xl font-black uppercase italic text-slate-900 mb-8 italic tracking-tighter leading-none">{editingToolIndex === -1 ? 'LOG NEW ASSET' : 'MODIFY REGISTRY'}</h3>
                   <div className="space-y-5">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 focus-within:border-indigo-400 transition-colors"><label className="block text-[8px] font-black text-slate-400 uppercase mb-2.5 italic tracking-widest">ASSET LABEL</label><input type="text" value={newTool.name} onChange={e => setNewTool({...newTool, name: e.target.value})} className="w-full bg-transparent font-black text-sm outline-none italic uppercase" placeholder="Input tool name..." /></div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 focus-within:border-indigo-400 transition-colors"><label className="block text-[8px] font-black text-slate-400 uppercase mb-2.5 italic tracking-widest">VOLUME IN STOCK</label><input type="number" value={newTool.qty} onChange={e => setNewTool({...newTool, qty: parseInt(e.target.value)})} className="w-full bg-transparent font-black text-3xl outline-none italic tracking-tighter" /></div>
                      <div className="grid grid-cols-1 gap-3 mt-8">
                         <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setEditingToolIndex(null)} className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest hover:text-rose-500 transition-colors italic">Cancel</button>
                            <button onClick={editingToolIndex === -1 ? handleAddTool : handleUpdateTool} className="bg-slate-900 text-white py-4 rounded-xl font-black uppercase text-[10px] shadow-2xl tracking-[0.2em] italic active:scale-95 transition-all">Update Vault</button>
                         </div>
                         {editingToolIndex !== -1 && (
                            <button onClick={() => handleRemoveTool(editingToolIndex)} className="w-full border-2 border-rose-100 text-rose-600 py-3 rounded-xl font-black uppercase text-[8px] tracking-widest italic hover:bg-rose-50 transition-colors">Delete Entry</button>
                         )}
                      </div>
                   </div>
                </div>
             </div>
          )}
        </section>
      )}

      {/* RESOLUTION MODAL */}
      {resolveTicket && (
        <div className="fixed inset-0 bg-slate-950/95 z-[300] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-2xl p-8 shadow-2xl border border-white/5 relative overflow-hidden">
             <div className="flex justify-between items-center mb-8">
                <div>
                   <h3 className="text-2xl font-extrabold uppercase italic tracking-tighter leading-none text-slate-900">Task Resolution</h3>
                   <p className="text-[8px] font-bold text-slate-400 uppercase mt-2 italic tracking-widest">Workflow Closing: {resolveTicket.assetTag}</p>
                </div>
                <button onClick={() => setResolveTicket(null)} className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors active:scale-90"><i className="fas fa-times text-base"></i></button>
             </div>

             <div className="space-y-6">
                <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                   <button onClick={() => setResolveType('Minor')} className={`flex-1 py-3 rounded-lg text-[9px] font-black transition-all uppercase tracking-widest ${resolveType === 'Minor' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>Minor Repair</button>
                   <button onClick={() => setResolveType('Major')} className={`flex-1 py-3 rounded-lg text-[9px] font-black transition-all uppercase tracking-widest ${resolveType === 'Major' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>Major Overhaul</button>
                </div>

                <div className="bg-slate-50 p-5 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                   <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 tracking-widest italic">Gas Consumption (KG)</label>
                   <div className="flex items-center gap-4">
                      <select value={gasType} onChange={(e) => setGasType(e.target.value)} className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-black outline-none italic uppercase">
                         {GAS_TYPES.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                      </select>
                      <input type="number" step="0.1" value={gasUsed} onChange={(e) => setGasUsed(parseFloat(e.target.value))} className="flex-1 bg-transparent font-black text-4xl outline-none italic tracking-tighter" placeholder="0.0" />
                   </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                   <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 tracking-widest italic">Resolution Remarks</label>
                   <textarea value={resolveRemarks} onChange={(e) => setResolveRemarks(e.target.value)} rows={2} className="w-full bg-transparent font-bold text-sm outline-none resize-none placeholder:text-slate-200 italic" placeholder="Brief narrative of the fix..." />
                </div>

                <button 
                   onClick={handleResolve} 
                   disabled={isResolving || !resolveRemarks}
                   className="w-full bg-slate-900 text-white py-6 rounded-xl font-black uppercase text-[10px] tracking-[0.3em] shadow-2xl active:scale-95 transition-all disabled:opacity-30 italic"
                >
                   {isResolving ? 'Syncing...' : 'Confirm System Integrity'}
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TechView;
