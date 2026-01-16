
import React, { useState, useMemo } from 'react';
import { Asset, Ticket, StatsResponse, GasTransaction, ChecklistType } from '../types';
import { TECHNICIANS, TOOLS_LIST, GAS_TYPES } from '../constants';
import { postAction, logGasTransaction, submitDemand } from '../services/api';
import LeaderboardItem from './LeaderboardItem';
import { GoogleGenAI } from "@google/genai";

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
  const [selectedTech, setSelectedTech] = useState<string | null>(null);
  const [view, setView] = useState<'hub' | 'materials' | 'tools' | 'ai'>('hub');
  const [resolveTicket, setResolveTicket] = useState<Ticket | null>(null);
  const [remarks, setRemarks] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // AI State
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [workType, setWorkType] = useState<'Minor' | 'Major'>('Minor');
  const [gasUsed, setGasUsed] = useState(false);
  const [gasAmount, setGasAmount] = useState<number>(0);
  const [selectedGasType, setSelectedGasType] = useState(GAS_TYPES[0].name);

  const [demandDetails, setDemandDetails] = useState('');
  const [isGasDemand, setIsGasDemand] = useState(false);
  const [demandGasType, setDemandGasType] = useState(GAS_TYPES[0].name);
  const [demandGasAmount, setDemandGasAmount] = useState(0);

  const [tools, setTools] = useState(() => {
    const stored = localStorage.getItem('fm_tools_inventory');
    return stored ? JSON.parse(stored) : TOOLS_LIST;
  });
  const [isAdminTools, setIsAdminTools] = useState(false);
  const [toolClickCount, setToolClickCount] = useState(0);

  const techTasks = useMemo(() => tickets.filter(t => t.assignedTo === selectedTech && !['Resolved', 'Resolved by Technician'].includes(t.status)), [tickets, selectedTech]);
  const gasStocks = useMemo(() => stats?.hvac?.gasStocks || {}, [stats]);

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
      const total = zoneAssets.length || 1;
      const getPct = (doneList: string[]) => Math.round((zoneAssets.filter(a => doneList.includes(a.tag)).length / total) * 100);
      return {
        daily: getPct(stats?.hvac?.inspection || []),
        monthly: getPct(stats?.hvac?.filters || []),
        quarterly: getPct(stats?.hvac?.quarterly || [])
      };
    });
  }, [assets, stats]);

  const handleAiAsk = async () => {
    if (!aiQuery) return;
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const context = `System: ${assets.length} Assets, ${stats?.hvac?.inspection?.length || 0} Checklists Done, Complaints: ${tickets.filter(t => t.status === 'Open').length}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Context: ${context}\n\nQuestion: ${aiQuery}`,
        config: { systemInstruction: "Help technician with status/checklist queries concisely." }
      });
      setAiResponse(response.text || "No response.");
    } catch (error) {
      setAiResponse("AI Connection Error.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!resolveTicket || !selectedTech) return;
    setIsProcessing(true);
    const fd = new FormData();
    fd.append('action', 'resolve_ticket');
    fd.append('rowIndex', String(resolveTicket.rowIndex));
    fd.append('assetTag', resolveTicket.assetTag);
    fd.append('status', 'Resolved');
    fd.append('resolvedBy', selectedTech);
    fd.append('remarks', remarks || `${workType} Repair completed`);
    fd.append('workType', workType);
    await postAction(fd);
    if (workType === 'Major' && gasUsed && gasAmount > 0) {
      await logGasTransaction({ timestamp: new Date().toLocaleString(), action: 'USAGE', gasType: selectedGasType, amount: -Math.abs(gasAmount), tech: selectedTech, refTicket: resolveTicket.assetTag });
    }
    setResolveTicket(null);
    setRemarks('');
    setIsProcessing(false);
    onRefresh();
  };

  if (resolveTicket) {
    return (
      <div className="p-6 space-y-6 animate-fadeIn pb-32">
        <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-xl space-y-8 slide-up">
           <div className="flex justify-between items-center"><h3 className="text-2xl font-black text-slate-900 uppercase">Resolution</h3><button onClick={() => setResolveTicket(null)} className="w-12 h-12 bg-slate-50 rounded-full text-slate-300"><i className="fas fa-times"></i></button></div>
           <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center justify-between">
              <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Asset</p><h4 className="font-black text-slate-900">{resolveTicket.assetTag}</h4></div>
              <div className="text-right"><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tech</p><h4 className="font-black text-indigo-600">{selectedTech}</h4></div>
           </div>
           <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Findings..." className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 outline-none font-bold text-sm h-32 focus:border-indigo-600 transition-all" />
           <button onClick={handleResolve} disabled={isProcessing} className="w-full bg-slate-900 text-white py-8 rounded-[3rem] font-black uppercase tracking-[0.4em] text-xs shadow-2xl active:scale-95 transition-all">{isProcessing ? 'Syncing...' : 'Commit Job'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 pb-32 animate-fadeIn overflow-y-auto h-full hide-scroll">
      <div className="flex bg-white p-2 rounded-full shadow-lg border border-slate-100 mb-6 gap-2 premium-card">
         {['hub', 'materials', 'tools', 'ai'].map(v => (
           <button key={v} onClick={() => setView(v as any)} className={`flex-1 py-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${view === v ? 'bg-slate-900 text-white shadow-2xl' : 'text-slate-400 hover:bg-slate-50'}`}>{v === 'hub' ? 'Field Hub' : v === 'materials' ? 'Demands' : v === 'tools' ? 'Tools' : 'AI Help'}</button>
         ))}
      </div>

      {view === 'hub' && (
        <>
          <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 slide-up">
            <h3 className="font-black text-slate-900 text-[10px] uppercase tracking-[0.4em] mb-8">Attendance</h3>
            <div className="grid grid-cols-4 gap-4">
              {TECHNICIANS.map(t => (
                <button key={t} onClick={() => toggleAttendance(t)} className={`p-4 rounded-[2.2rem] border-2 text-center transition-all ${attendance[t] ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-white opacity-40 grayscale'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md ${attendance[t] ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'} font-black text-xl`}>{t[0]}</div>
                  <p className="text-[9px] font-black uppercase tracking-widest">{t}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-sm slide-up" style={{ animationDelay: '0.1s' }}>
             <h3 className="font-black text-slate-900 text-[10px] uppercase tracking-[0.4em] mb-8">Zones</h3>
             <div className="grid grid-cols-1 gap-5">
                {['A', 'B', 'C', 'D'].map((z, i) => (
                  <button key={z} onClick={() => onOpenChecklist(i, TECHNICIANS[i])} className="bg-slate-50/80 p-6 rounded-[2.5rem] border border-slate-100 hover:bg-white hover:shadow-2xl transition-all group flex items-center justify-between relative overflow-hidden">
                    <div className="flex items-center gap-6 relative z-10">
                      <div className="w-16 h-16 bg-white rounded-[1.8rem] flex items-center justify-center text-4xl font-black text-indigo-600 shadow-xl group-hover:rotate-12 transition-transform">{z}</div>
                      <div className="text-left">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Zone {z} • {TECHNICIANS[i]}</p>
                        <div className="flex gap-4">
                           <div className="flex flex-col"><span className="text-[8px] font-black text-slate-400 uppercase">Daily</span><span className="text-xs font-black text-slate-900">{zoneStats[i].daily}%</span></div>
                           <div className="flex flex-col"><span className="text-[8px] font-black text-slate-400 uppercase">Monthly</span><span className="text-xs font-black text-slate-900">{zoneStats[i].monthly}%</span></div>
                        </div>
                      </div>
                    </div>
                    <div className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-2xl relative z-10"><i className="fas fa-chevron-right"></i></div>
                  </button>
                ))}
             </div>
          </section>

          <section className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-sm slide-up" style={{ animationDelay: '0.3s' }}>
             <h3 className="font-black text-slate-900 text-[10px] uppercase tracking-[0.4em] mb-8">Tasking</h3>
             <div className="flex gap-4 overflow-x-auto hide-scroll pb-4">
                {TECHNICIANS.map(t => {
                   const count = tickets.filter(tk => tk.assignedTo === t && !['Resolved', 'Resolved by Technician'].includes(tk.status)).length;
                   return (
                     <button key={t} onClick={() => setSelectedTech(t)} className={`flex-shrink-0 p-6 rounded-[2.5rem] min-w-[110px] flex flex-col items-center gap-3 transition-all relative ${selectedTech === t ? 'bg-slate-900 text-white shadow-2xl scale-110' : 'bg-slate-50 text-slate-400'}`}>
                       <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center font-black text-2xl shadow-inner ${selectedTech === t ? 'bg-white/10' : 'bg-white'}`}>{t[0]}</div>
                       <span className="text-[10px] font-black uppercase tracking-widest">{t}</span>
                       {count > 0 && <div className="absolute -top-1 -right-1 w-7 h-7 bg-rose-500 border-2 border-white rounded-full text-[10px] font-black flex items-center justify-center text-white animate-pulse">{count}</div>}
                     </button>
                   );
                })}
             </div>
             {selectedTech && (
               <div className="mt-8 space-y-4 animate-slideUp">
                  {techTasks.length === 0 ? (
                    <div className="text-center py-12 opacity-30"><i className="fas fa-check-double text-5xl mb-4"></i><p className="text-[10px] font-black uppercase tracking-widest">Efficiency 100%</p></div>
                  ) : (
                    techTasks.map((t, idx) => (
                      <div key={idx} className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 flex justify-between items-center group">
                         <div className="flex-1 mr-4">
                            <p className="text-sm font-black text-slate-800 leading-tight mb-2">{t.details}</p>
                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{t.assetTag} • {t.location}</span>
                         </div>
                         <button onClick={() => setResolveTicket(t)} className="bg-slate-900 text-white text-[10px] font-black px-6 py-4 rounded-2xl uppercase tracking-widest shadow-xl active:scale-95 transition-all">Resolve</button>
                      </div>
                    ))
                  )}
               </div>
             )}
          </section>
        </>
      )}

      {view === 'ai' && (
        <div className="bg-white p-10 rounded-[4rem] border border-slate-100 shadow-sm animate-fadeIn slide-up flex flex-col h-[70vh]">
          <div className="flex justify-between items-center mb-10">
            <div><h3 className="text-3xl font-black text-slate-900 uppercase">AI Help</h3><p className="text-[10px] font-bold text-slate-400 uppercase mt-2">Ask about Status</p></div>
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-3xl shadow-inner"><i className="fas fa-robot"></i></div>
          </div>
          <div className="flex-1 bg-slate-50 rounded-[3rem] p-8 overflow-y-auto mb-6 hide-scroll border border-slate-100">
            {aiResponse ? (
              <p className="text-sm font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">{aiResponse}</p>
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
                <i className="fas fa-comment-dots text-5xl mb-4"></i>
                <p className="text-xs font-black uppercase tracking-[0.3em]">Query System Data</p>
              </div>
            )}
            {isAiLoading && <div className="text-indigo-500 font-black text-[10px] uppercase mt-4 animate-pulse">Analyzing...</div>}
          </div>
          <div className="relative">
            <input type="text" value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAiAsk()} placeholder="Ask anything..." className="w-full bg-white p-6 pr-16 rounded-[2rem] border-2 border-slate-100 outline-none font-bold text-sm focus:border-indigo-500 transition-all shadow-xl" />
            <button onClick={handleAiAsk} disabled={isAiLoading || !aiQuery} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-indigo-600 text-white rounded-xl shadow-lg active:scale-90 transition-all disabled:opacity-30"><i className="fas fa-paper-plane"></i></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TechView;
