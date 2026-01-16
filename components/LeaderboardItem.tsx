
import React, { useState, useMemo } from 'react';
import { PerformanceLogEntry } from '../types';
import { TECHNICIANS, MERIT_REASONS, DEMERIT_REASONS } from '../constants';
import { postAction } from '../services/api';

interface Props {
  performanceLogs: PerformanceLogEntry[];
  limit: number;
  onRefresh?: () => void;
  showToast?: (msg: string) => void;
  compact?: boolean;
}

const LeaderboardItem: React.FC<Props> = ({ performanceLogs, limit, onRefresh, showToast, compact }) => {
  const [clickCount, setClickCount] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminType, setAdminType] = useState<'merit' | 'demerit'>('merit');
  const [targetTech, setTargetTech] = useState(TECHNICIANS[0]);
  const [reason, setReason] = useState(MERIT_REASONS[0].label);
  const [points, setPoints] = useState(MERIT_REASONS[0].points);
  const [customReason, setCustomReason] = useState('');

  // CORRECT LOGIC: Merit = sum(positives), Demerit = abs(sum(negatives)), Total = Merit - Demerit
  const scores = useMemo(() => {
    return TECHNICIANS.map(tech => {
      const techEntries = performanceLogs.filter(log => log.tech === tech);
      const merit = techEntries.filter(l => l.points > 0).reduce((acc, curr) => acc + curr.points, 0);
      const demerit = Math.abs(techEntries.filter(l => l.points < 0).reduce((acc, curr) => acc + curr.points, 0));
      const total = merit - demerit;
      return { name: tech, merit, demerit, total };
    }).sort((a, b) => b.total - a.total);
  }, [performanceLogs]);

  const handleAdminClick = (tech?: string) => {
    if (tech) setTargetTech(tech);
    const newCount = clickCount + 1;
    if (newCount >= 5) {
      setShowAdmin(true);
      setClickCount(0);
    } else {
      setClickCount(newCount);
    }
  };

  const handleApplyPoints = async () => {
    const finalReason = reason === 'Others' ? customReason : reason;
    const finalPoints = adminType === 'demerit' ? -Math.abs(points) : Math.abs(points);
    
    const fd = new FormData();
    fd.append('action', 'update_points');
    fd.append('technician', targetTech);
    fd.append('points', String(finalPoints));
    fd.append('reason', finalReason);

    showToast?.("Syncing Leaderboard...");
    await postAction(fd);

    showToast?.("Score Adjusted Successfully");
    setShowAdmin(false);
    setCustomReason('');
    onRefresh?.();
  };

  const handleReasonChange = (val: string) => {
    setReason(val);
    if (val !== 'Others') {
      const list = adminType === 'merit' ? MERIT_REASONS : DEMERIT_REASONS;
      const found = list.find(r => r.label === val);
      if (found) setPoints(Math.abs(found.points));
    }
  };

  return (
    <div className={`space-y-3 ${compact ? 'max-h-32 overflow-hidden' : ''}`}>
      {scores.slice(0, limit).map((s, i) => {
        const medals = ["🥇", "🥈", "🥉", "🏅"];
        const rankColors = ["text-yellow-400", "text-slate-300", "text-amber-600", "text-indigo-400"];
        
        return (
          <div 
            key={i} 
            onClick={() => handleAdminClick(s.name)}
            className={`p-4 rounded-[1.8rem] flex items-center justify-between border transition-all cursor-pointer group active:scale-[0.98] ${compact ? 'bg-slate-50 border-slate-100 hover:bg-white' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-[1rem] flex items-center justify-center text-xl shadow-inner group-hover:scale-110 transition-transform ${compact ? 'bg-white text-indigo-600' : 'bg-white/10'} ${rankColors[i]}`}>
                {medals[i] || "🏅"}
              </div>
              <div>
                <h4 className={`font-black uppercase text-[10px] tracking-widest leading-none ${compact ? 'text-slate-900' : 'text-white'}`}>{s.name}</h4>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[7px] font-black text-emerald-500 uppercase">+{s.merit} Merit</span>
                  <span className="text-[7px] font-black text-rose-500 uppercase">-{s.demerit} Demerit</span>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <span className={`text-xl font-black leading-none block ${compact ? 'text-slate-900' : 'text-white'}`}>{s.total}</span>
              <span className={`text-[7px] font-black uppercase tracking-widest mt-1 block opacity-30 ${compact ? 'text-slate-400' : 'text-white'}`}>TOTAL</span>
            </div>
          </div>
        );
      })}

      {showAdmin && (
        <div className="fixed inset-0 bg-slate-900/95 z-[200] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl border border-white/10">
              <div className="flex justify-between items-center mb-8">
                 <div>
                   <h3 className="text-2xl font-black text-slate-900 leading-none">Point Override</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest">Adjust Ranking Hub</p>
                 </div>
                 <button onClick={() => setShowAdmin(false)} className="w-12 h-12 bg-slate-50 rounded-full text-slate-400 hover:text-rose-500 border border-slate-100 transition-colors shadow-inner"><i className="fas fa-times text-xl"></i></button>
              </div>

              <div className="space-y-5">
                 <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                    <button onClick={() => { setAdminType('merit'); handleReasonChange(MERIT_REASONS[0].label); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all ${adminType === 'merit' ? 'bg-white shadow-md text-emerald-600' : 'text-slate-400'}`}>MERIT (+)</button>
                    <button onClick={() => { setAdminType('demerit'); handleReasonChange(DEMERIT_REASONS[0].label); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all ${adminType === 'demerit' ? 'bg-white shadow-md text-rose-600' : 'text-slate-400'}`}>DEMERIT (-)</button>
                 </div>

                 <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Target Tech</label>
                      <select value={targetTech} onChange={(e) => setTargetTech(e.target.value)} className="w-full bg-transparent font-black text-sm outline-none cursor-pointer">
                         {TECHNICIANS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Reasoning</label>
                      <select value={reason} onChange={(e) => handleReasonChange(e.target.value)} className="w-full bg-transparent font-black text-sm outline-none cursor-pointer">
                         {(adminType === 'merit' ? MERIT_REASONS : DEMERIT_REASONS).map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
                         <option value="Others">Manual Reason Entry</option>
                      </select>
                    </div>

                    {reason === 'Others' && (
                      <input 
                        type="text" 
                        placeholder="Manual Reason..."
                        value={customReason}
                        onChange={(e) => setCustomReason(e.target.value)}
                        className="w-full bg-white p-4 rounded-2xl border-2 border-indigo-500 font-black text-sm outline-none"
                      />
                    )}

                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Points Value (Abs)</label>
                      <input type="number" value={points} onChange={(e) => setPoints(Math.abs(Number(e.target.value)))} className={`w-full bg-transparent font-black text-3xl outline-none ${adminType === 'merit' ? 'text-emerald-600' : 'text-rose-600'}`} />
                    </div>
                 </div>

                 <button onClick={handleApplyPoints} className={`w-full py-6 rounded-[2rem] font-black uppercase text-xs shadow-2xl active:scale-95 transition-all mt-6 tracking-[0.2em] text-white ${adminType === 'merit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                    Confirm Adjustment
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default LeaderboardItem;
