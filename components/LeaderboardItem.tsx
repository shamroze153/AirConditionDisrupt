
import React, { useState, useMemo } from 'react';
import { PerformanceLogEntry } from '../types.ts';
import { TECHNICIANS, MERIT_REASONS, DEMERIT_REASONS } from '../constants.ts';
import { postAction } from '../services/api.ts';

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
    if (newCount >= 5) { setShowAdmin(true); setClickCount(0); } 
    else { setClickCount(newCount); }
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
    <div className={`space-y-2.5 ${compact ? 'max-h-32 overflow-hidden' : ''}`}>
      {scores.slice(0, limit).map((s, i) => {
        const medals = ["🥇", "🥈", "🥉", "🏅"];
        const rankColors = ["text-yellow-400", "text-slate-300", "text-amber-600", "text-indigo-300"];
        return (
          <div key={i} onClick={() => handleAdminClick(s.name)} className={`p-3.5 rounded-2xl flex items-center justify-between border transition-all cursor-pointer group active:scale-[0.99] ${compact ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-50 hover:border-indigo-100 shadow-sm'}`}>
            <div className="flex items-center gap-3.5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-inner group-hover:scale-105 transition-transform bg-slate-50 ${rankColors[i] || 'text-slate-300'}`}>{medals[i] || "🏅"}</div>
              <div>
                <h4 className="font-black uppercase text-[10px] tracking-widest leading-none text-slate-900 italic">{s.name}</h4>
                <div className="flex items-center gap-2 mt-1.5"><span className="text-[7px] font-black text-emerald-500 uppercase">+{s.merit}</span><span className="text-[7px] font-black text-rose-500 uppercase">-{s.demerit}</span></div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-black leading-none block text-slate-900 tracking-tighter italic">{s.total}</span>
              <span className="text-[7px] font-black uppercase tracking-widest mt-1 block opacity-30 text-slate-400">POINTS</span>
            </div>
          </div>
        );
      })}

      {showAdmin && (
        <div className="fixed inset-0 bg-slate-950/95 z-[250] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
           <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6"><div><h3 className="text-2xl font-black text-slate-900 leading-none italic uppercase">Override</h3><p className="text-[8px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Manual Merit Control</p></div><button onClick={() => setShowAdmin(false)} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-300 hover:text-rose-500 active:scale-90"><i className="fas fa-times text-lg"></i></button></div>
              <div className="space-y-4">
                 <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button onClick={() => { setAdminType('merit'); handleReasonChange(MERIT_REASONS[0].label); }} className={`flex-1 py-2 rounded-lg text-[8px] font-black transition-all ${adminType === 'merit' ? 'bg-white shadow-md text-emerald-600' : 'text-slate-400'}`}>MERIT</button>
                    <button onClick={() => { setAdminType('demerit'); handleReasonChange(DEMERIT_REASONS[0].label); }} className={`flex-1 py-2 rounded-lg text-[8px] font-black transition-all ${adminType === 'demerit' ? 'bg-white shadow-md text-rose-600' : 'text-slate-400'}`}>DEMERIT</button>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100"><label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Target</label><select value={targetTech} onChange={e => setTargetTech(e.target.value)} className="w-full bg-transparent font-black text-xs outline-none">{TECHNICIANS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100"><label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Reason</label><select value={reason} onChange={e => handleReasonChange(e.target.value)} className="w-full bg-transparent font-black text-xs outline-none">{(adminType === 'merit' ? MERIT_REASONS : DEMERIT_REASONS).map(r => <option key={r.label} value={r.label}>{r.label}</option>)}<option value="Others">Manual Entry</option></select></div>
                 {reason === 'Others' && <input type="text" placeholder="Specify..." value={customReason} onChange={e => setCustomReason(e.target.value)} className="w-full bg-white p-3.5 rounded-xl border-2 border-indigo-500 font-black text-xs outline-none" />}
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100"><label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Points</label><input type="number" value={points} onChange={e => setPoints(Math.abs(Number(e.target.value)))} className={`w-full bg-transparent font-extrabold text-3xl outline-none ${adminType === 'merit' ? 'text-emerald-600' : 'text-rose-600'}`} /></div>
                 <button onClick={handleApplyPoints} className={`w-full py-5 rounded-2xl font-black uppercase text-[10px] shadow-2xl active:scale-95 transition-all mt-4 tracking-[0.2em] text-white ${adminType === 'merit' ? 'bg-emerald-600' : 'bg-rose-600'}`}>Confirm Adjustment</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default LeaderboardItem;
