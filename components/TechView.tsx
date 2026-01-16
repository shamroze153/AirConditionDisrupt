
import React, { useState, useMemo } from 'react';
import { Asset, Ticket, StatsResponse } from '../types.ts';
import { TECHNICIANS, TOOLS_LIST, GAS_TYPES } from '../constants.ts';
import { submitDemand, postAction } from '../services/api.ts';
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

    showToast("Syncing Hub...");
    await postAction(fd);
    
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
    showToast("Resolved Successfully");
  };

  return (
    <div className="max-w-[1500px] mx-auto p-4 lg:p-10 space-y-10 animate-fadeIn">
      <div className="flex bg-white p-2 rounded-2xl shadow-xl border border-slate-100 gap-2 sticky top-4 z-50 glass-panel">
        {['hub', 'profiles', 'demands', 'tools'].map(v => (
          <button key={v} onClick={() => setView(v as any)} className={`flex-1 py-3.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${view === v ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>
            {v === 'hub' ? 'Field Zones' : v === 'profiles' ? 'Force Hub' : v === 'demands' ? 'Pipeline' : 'Tool Chest'}
          </button>
        ))}
      </div>

      {view === 'hub' && (
        <div className="space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <section className="lg:col-span-3 bg-white p-8 rounded-[2.5rem] premium-card border border-slate-100 h-fit">
              <h3 className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em] mb-10 italic">Deployment</h3>
              <div className="space-y-6">
                {TECHNICIANS.map(t => (
                  <button key={t} onClick={() => toggleAttendance(t)} className={`w-full flex items-center gap-4 group transition-all ${attendance[t] ? 'opacity-100' : 'opacity-30 grayscale'}`}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-inner transition-transform group-hover:scale-105 ${attendance[t] ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-300'}`}>{t[0]}</div>
                    <div className="text-left"><p className="text-[11px] font-black text-slate-900 uppercase italic leading-none">{t}</p><p className="text-[8px] text-slate-400 font-bold uppercase mt-1 tracking-widest italic">{attendance[t] ? 'On-Field' : 'Off-Duty'}</p></div>
                  </button>
                ))}
              </div>
            </section>
            <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-6 h-fit">
               {zoneStats.map((z, i) => (
                 <button key={i} onClick={() => onOpenChecklist(i, z.tech)} className="bg-white p-8 rounded-[2.5rem] premium-card border border-slate-100 flex items-center justify-between hover:shadow-xl transition-all group overflow-hidden relative">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[60px] pointer-events-none"></div>
                   <div className="flex items-center gap-6 relative z-10">
                     <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl font-extrabold text-indigo-600 shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-all">{['A','B','C','D'][i]}</div>
                     <div className="text-left"><p className="text-sm font-black text-slate-900 uppercase tracking-widest italic">{z.tech}</p><p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2 italic">Zone {['A','B','C','D'][i]} • {z.count} Units</p></div>
                   </div>
                   <div className="text-right relative z-10"><p className="text-2xl font-black text-slate-900 italic tracking-tighter">{z.pct}%</p><div className="w-16 h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden border border-slate-100 shadow-inner"><div className={`h-full bg-emerald-500 transition-all duration-1000 shadow-[0_0_8px_#10b981]`} style={{ width: `${z.pct}%` }}></div></div></div>
                 </button>
               ))}
            </div>
          </div>
          <section className="bg-white p-8 rounded-[3rem] premium-card border border-slate-100">
             <div className="flex justify-between items-center mb-6"><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 italic">Force Merit Board</h3><div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-xs"><i className="fas fa-medal"></i></div></div>
             <LeaderboardItem performanceLogs={stats?.performanceLogs || []} limit={4} onRefresh={onRefresh} compact={false} />
          </section>
        </div>
      )}

      {view === 'profiles' && (
        <section className="bg-slate-950 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden min-h-[60vh]">
           <div className="flex justify-between items-center mb-10 relative z-10">
              <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-400 italic">Specialist Profiles</h3>
              <div className="flex gap-2.5">
                 {TECHNICIANS.map(t => (<button key={t} onClick={() => setSelectedTech(t)} className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-base transition-all ${selectedTech === t ? 'bg-white text-slate-950 scale-110 shadow-xl' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}>{t[0]}</button>))}
              </div>
           </div>
           {selectedTech ? (
             <div className="space-y-6 animate-slideDown relative z-10">
                <div className="flex items-center gap-6 mb-10"><div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center text-4xl font-black">{selectedTech[0]}</div><div><h4 className="text-3xl font-black italic tracking-tighter uppercase">{selectedTech}</h4><p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mt-1 italic">Force Operative</p></div></div>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/30 mb-6 italic">Active Assignments</p>
                {currentTechTasks.length === 0 ? (
                  <div className="py-20 text-center opacity-20 flex flex-col items-center"><i className="fas fa-check-double text-6xl mb-8"></i><p className="text-[10px] font-black uppercase tracking-[0.4em]">All Systems Nominal</p></div>
                ) : (
                  currentTechTasks.map((t, idx) => (
                    <div key={idx} className="bg-white/5 p-8 rounded-[2rem] border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center hover:bg-white/10 transition-all gap-8">
                       <div className="flex-1"><p className="text-xl font-bold text-white leading-tight mb-4 italic tracking-tight">"{t.details}"</p><div className="flex gap-3"><span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-4 py-1.5 rounded-full border border-indigo-500/20">{t.assetTag}</span><span className="text-[8px] font-black text-white/30 uppercase tracking-widest bg-white/5 px-4 py-1.5 rounded-full border border-white/5 italic">{t.location}</span></div></div>
                       <button onClick={() => setResolveTicket(t)} className="bg-white text-slate-950 px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all hover:bg-indigo-50">Resolve</button>
                    </div>
                  ))
                )}
             </div>
           ) : (
             <div className="py-24 text-center opacity-20 relative z-10"><i className="fas fa-id-badge text-7xl mb-8"></i><p className="text-sm font-black uppercase tracking-[0.5em]">Select Specialist Hub</p></div>
           )}
        </section>
      )}

      {view === 'demands' && (
        <section className="bg-white p-10 lg:p-14 rounded-[3.5rem] premium-card border border-slate-100 min-h-[70vh] flex flex-col shadow-xl">
          <h3 className="text-3xl font-extrabold uppercase italic tracking-tighter mb-10 text-slate-900 italic">Demand Pipeline</h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10 flex-1">
            <div className="space-y-8">
               <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all shadow-inner"><label className="block text-[9px] font-black text-slate-400 uppercase mb-4 tracking-[0.3em] ml-2 italic">Individual</label><select value={selectedTech || ''} onChange={e => setSelectedTech(e.target.value)} className="w-full bg-transparent font-extrabold text-2xl outline-none italic tracking-tighter"><option value="" disabled>Select Force...</option>{TECHNICIANS.map(t => (<option key={t} value={t}>{t}</option>))}</select></div>
               <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all shadow-inner"><label className="block text-[9px] font-black text-slate-400 uppercase mb-4 tracking-[0.3em] ml-2 italic">Allocation Details</label><textarea value={demandText} onChange={e => setDemandText(e.target.value)} rows={4} className="w-full bg-transparent font-bold text-xl outline-none resize-none placeholder:text-slate-200 italic" placeholder="Specify requirements..." /></div>
               <button onClick={async () => {
                    setIsSubmittingDemand(true);
                    await submitDemand(selectedTech || 'Field Staff', demandText);
                    showToast("Demand Committed");
                    setDemandText('');
                    setIsSubmittingDemand(false);
                 }} disabled={isSubmittingDemand || !demandText || !selectedTech} className="w-full bg-slate-900 text-white py-8 rounded-[3rem] font-black uppercase tracking-[0.4em] text-sm shadow-2xl active:scale-95 transition-all disabled:opacity-30 italic">{isSubmittingDemand ? 'Syncing...' : 'Commit Pipeline Demand'}</button>
            </div>
            <div className="bg-slate-950 p-10 rounded-[3rem] text-white flex flex-col items-center justify-center text-center relative overflow-hidden"><i className="fas fa-truck-ramp-box text-[80px] mb-10 text-indigo-500 opacity-20"></i><h4 className="text-2xl font-extrabold uppercase italic mb-6 tracking-tighter">Supply Chain Protocol</h4><p className="text-white/40 text-sm leading-relaxed font-medium italic">All material allocations are logged in the registry for audit.</p></div>
          </div>
        </section>
      )}

      {view === 'tools' && (
        <section className="bg-white p-10 rounded-[3.5rem] premium-card border border-slate-100 min-h-[70vh] flex flex-col shadow-xl">
          <div className="flex justify-between items-center mb-10"><h3 className="text-3xl font-extrabold uppercase italic tracking-tighter text-slate-900 italic">Operational Tool Chest</h3><div className="w-14 h-14 bg-slate-50 rounded-xl flex items-center justify-center text-slate-200 shadow-inner border border-slate-100"><i className="fas fa-toolbox text-2xl"></i></div></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             {TOOLS_LIST.map((tool, i) => (
               <div key={i} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col justify-center items-center hover:bg-white hover:shadow-xl transition-all group shadow-sm">
                  <span className="text-sm font-black text-slate-900 uppercase tracking-tighter italic text-center mb-4">{tool.name}</span>
                  <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-xl font-black shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">{tool.qty}</div>
                  <p className="text-[8px] font-black text-slate-300 uppercase mt-4 tracking-[0.4em] italic">Stock</p>
               </div>
             ))}
          </div>
        </section>
      )}

      {resolveTicket && (
        <div className="fixed inset-0 bg-slate-950/95 z-[300] flex items-center justify-center p-4 backdrop-blur-2xl animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-white/5 relative overflow-hidden">
             <div className="flex justify-between items-center mb-8"><div><h3 className="text-2xl font-extrabold uppercase italic tracking-tighter leading-none text-slate-900">Task Resolution</h3><p className="text-[8px] font-bold text-slate-400 uppercase mt-2 italic tracking-widest">Workflow: {resolveTicket.assetTag}</p></div><button onClick={() => setResolveTicket(null)} className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors"><i className="fas fa-times text-lg"></i></button></div>
             <div className="space-y-6">
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                   <button onClick={() => setResolveType('Minor')} className={`flex-1 py-2.5 rounded-lg text-[8px] font-black transition-all ${resolveType === 'Minor' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>Minor</button>
                   <button onClick={() => setResolveType('Major')} className={`flex-1 py-2.5 rounded-lg text-[8px] font-black transition-all ${resolveType === 'Major' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>Major</button>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                   <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 tracking-widest italic">Gas Consumption (KG)</label>
                   <div className="flex items-center gap-3">
                      <select value={gasType} onChange={e => setGasType(e.target.value)} className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-black outline-none italic">{GAS_TYPES.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}</select>
                      <input type="number" step="0.1" value={gasUsed} onChange={e => setGasUsed(parseFloat(e.target.value))} className="flex-1 bg-transparent font-extrabold text-2xl outline-none italic tracking-tighter" placeholder="0.0" />
                   </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all"><label className="block text-[8px] font-black text-slate-400 uppercase mb-3 tracking-widest italic">Remarks</label><textarea value={resolveRemarks} onChange={e => setResolveRemarks(e.target.value)} rows={2} className="w-full bg-transparent font-bold text-base outline-none resize-none placeholder:text-slate-200 italic" placeholder="Details of work..." /></div>
                <button onClick={handleResolve} disabled={isResolving || !resolveRemarks} className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black uppercase text-[10px] tracking-[0.4em] shadow-2xl active:scale-95 transition-all disabled:opacity-30 italic">{isResolving ? 'Syncing...' : 'Confirm Resolution'}</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TechView;
