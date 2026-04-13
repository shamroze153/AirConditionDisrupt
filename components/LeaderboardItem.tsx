
import React, { useState, useMemo } from 'react';
import { PerformanceLogEntry, CategoryKey } from '../types';
import { CATEGORY_TECHS, MERIT_REASONS, DEMERIT_REASONS } from '../constants';
import { postAction } from '../services/api';

interface Props {
  category: CategoryKey;
  performanceLogs: PerformanceLogEntry[];
  limit: number;
  onRefresh?: () => void;
  showToast?: (msg: string) => void;
  compact?: boolean;
}

const LeaderboardItem: React.FC<Props> = ({ category, performanceLogs, limit, onRefresh, showToast, compact }) => {
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  
  const [adminType, setAdminType] = useState<'merit' | 'demerit'>('merit');
  
  // FIX #2 & #3: Use dynamic tech list based on category (Technicians, Electricians, or GM)
  const techList = useMemo(() => CATEGORY_TECHS[category] || [], [category]);
  const [targetTech, setTargetTech] = useState(techList[0] || '');

  const [reason, setReason] = useState(MERIT_REASONS[0].label);
  const [points, setPoints] = useState(MERIT_REASONS[0].points);
  const [customReason, setCustomReason] = useState('');

  const scores = useMemo(() => {
    // FIX #4: Filter reset logs strictly by the selected category
    const resetLogs = performanceLogs.filter(l => 
      l.reason === 'RESET_ALL' && 
      String(l.category || '').toUpperCase() === category.toUpperCase()
    );
    
    const lastResetDate = resetLogs.length > 0 
      ? new Date(resetLogs[resetLogs.length - 1].Timestamp || 0).getTime() 
      : 0;

    return techList.map(tech => {
      const lowerTech = tech.toLowerCase();
      const techEntries = performanceLogs.filter(log => {
        const logDate = new Date(log.Timestamp || 0).getTime();
        // FIX #3: Strict category filtering for performance data stream
        const catMatch = String(log.category || '').toUpperCase() === category.toUpperCase();
        
        // Split multi-tech names and check if this tech is included
        const logNames = String(log.tech || '').split(/[&/,]|\band\b/i).map(s => s.trim().toLowerCase()).filter(Boolean);
        const isIncluded = logNames.includes(lowerTech);
        
        return isIncluded && logDate >= lastResetDate && log.reason !== 'RESET_ALL' && catMatch;
      });
      const merit = techEntries.filter(l => l.points > 0).reduce((acc, curr) => acc + curr.points, 0);
      const demerit = Math.abs(techEntries.filter(l => l.points < 0).reduce((acc, curr) => acc + curr.points, 0));
      const total = merit - demerit;
      return { name: tech, merit, demerit, total };
    }).sort((a, b) => b.total - a.total);
  }, [performanceLogs, techList, category]);

  const handleAdminAccess = (tech?: string) => {
    if (tech) setTargetTech(tech);
    if (isAdminUnlocked) {
      setShowAdmin(true);
    } else {
      setShowPinModal(true);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '5566') {
      setIsAdminUnlocked(true);
      setShowPinModal(false);
      setShowAdmin(true);
      setPinInput('');
      showToast?.("ADMIN ACCESS GRANTED");
    } else {
      showToast?.("ACCESS DENIED: Invalid PIN");
      setPinInput('');
    }
  };

  const handleApplyPoints = async () => {
    const finalReason = reason === 'Others' ? customReason : reason;
    const finalPoints = adminType === 'demerit' ? -Math.abs(points) : Math.abs(points);
    
    const fd = new FormData();
    fd.append('action', 'update_points');
    fd.append('category', category.toUpperCase()); // Fix category tagging
    fd.append('technician', targetTech);
    fd.append('points', String(finalPoints));
    fd.append('reason', finalReason);
    
    showToast?.(`Syncing Hub Score for ${targetTech}...`);
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
    <div className={`space-y-2.5 ${compact ? 'max-h-48 overflow-hidden' : ''}`}>
      <div className="flex justify-between items-center px-1 mb-2">
         <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">Performance Data Stream ({category.toUpperCase()})</span>
         <button 
           onClick={() => isAdminUnlocked ? setIsAdminUnlocked(false) : setShowPinModal(true)} 
           className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isAdminUnlocked ? 'bg-emerald-100 text-emerald-600 shadow-lg' : 'bg-slate-100 text-slate-300 hover:text-indigo-600 shadow-sm'}`}
           title={isAdminUnlocked ? "Lock Excellence Hub" : "Unlock Admin Controls"}
         >
            <i className={`fas fa-${isAdminUnlocked ? 'lock-open' : 'lock'} text-[10px]`}></i>
         </button>
      </div>

      {scores.slice(0, Math.max(limit, 4)).map((s, i) => {
        const medals = ["🥇", "🥈", "🥉", "🏅"];
        const rankColors = ["text-yellow-400", "text-slate-300", "text-amber-600", "text-indigo-300"];
        return (
          <div 
            key={i} 
            onClick={() => handleAdminAccess(s.name)} 
            className={`p-4 rounded-xl flex items-center justify-between border transition-all cursor-pointer group active:scale-[0.98] ${compact ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-50 hover:border-indigo-100 shadow-sm'}`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-inner group-hover:scale-105 transition-transform bg-slate-50 ${rankColors[i] || 'text-slate-300'}`}>{medals[i] || "🏅"}</div>
              <div>
                <h4 className="font-black uppercase text-[11px] tracking-widest leading-none text-slate-900 italic">{s.name}</h4>
                <div className="flex items-center gap-2.5 mt-2">
                  <span className="text-[8px] font-black text-emerald-500 uppercase">+{s.merit} Merit</span>
                  <span className="text-[8px] font-black text-rose-500 uppercase">-{s.demerit} Demerit</span>
                </div>
              </div>
            </div>
            <div className="text-right flex items-center gap-3">
              <div>
                <span className="text-2xl font-black leading-none block text-slate-900 tracking-tighter italic">{s.total}</span>
                <span className="text-[8px] font-black uppercase tracking-widest mt-1 block opacity-30 text-slate-400">SCORE</span>
              </div>
              {isAdminUnlocked && (
                <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center animate-pulse shadow-sm">
                  <i className="fas fa-plus-circle text-xs"></i>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* PIN AUTH MODAL (Unified) */}
      {showPinModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-10 shadow-3xl border border-white/5">
             <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                   <i className="fas fa-shield-alt text-3xl"></i>
                </div>
                <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Admin Login</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-3 tracking-widest italic">Enter 4-Digit Hub Code</p>
             </div>
             <form onSubmit={handlePinSubmit} className="space-y-8">
                <input 
                  type="password" 
                  autoFocus
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] py-5 text-center text-3xl font-black tracking-[0.6em] focus:border-indigo-600 outline-none transition-all shadow-inner"
                  placeholder="••••"
                />
                <div className="flex gap-4">
                  <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 italic">Exit</button>
                  <button type="submit" className="flex-1 bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest italic shadow-2xl">Confirm</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {showAdmin && (
        <div className="fixed inset-0 bg-slate-950/98 z-[300] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
           <div className="bg-white w-full max-w-md rounded-2xl p-8 shadow-2xl border border-white/5 relative overflow-hidden">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 leading-none italic uppercase tracking-tighter">Merit Control</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Authorized for: {targetTech}</p>
                </div>
                <button onClick={() => setShowAdmin(false)} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-300 hover:text-rose-500 active:scale-90 transition-colors"><i className="fas fa-times text-xl"></i></button>
              </div>

              <div className="space-y-6">
                 <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                    <button onClick={() => { setAdminType('merit'); handleReasonChange(MERIT_REASONS[0].label); }} className={`flex-1 py-2.5 rounded-lg text-[9px] font-black transition-all uppercase tracking-widest ${adminType === 'merit' ? 'bg-white shadow-md text-emerald-600' : 'text-slate-400'}`}>ALLOCATE MERIT</button>
                    <button onClick={() => { setAdminType('demerit'); handleReasonChange(DEMERIT_REASONS[0].label); }} className={`flex-1 py-2.5 rounded-lg text-[9px] font-black transition-all uppercase tracking-widest ${adminType === 'demerit' ? 'bg-white shadow-md text-rose-600' : 'text-slate-400'}`}>LOG DEMERIT</button>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Subject</label>
                      <select value={targetTech} onChange={e => setTargetTech(e.target.value)} className="w-full bg-transparent font-black text-[11px] outline-none uppercase italic">
                        {techList.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Policy Trigger</label>
                      <select value={reason} onChange={e => handleReasonChange(e.target.value)} className="w-full bg-transparent font-black text-[11px] outline-none uppercase italic">
                        {(adminType === 'merit' ? MERIT_REASONS : DEMERIT_REASONS).map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
                        <option value="Others">Manual Narrative</option>
                      </select>
                    </div>
                 </div>

                 {reason === 'Others' && (
                    <div className="bg-slate-50 p-4 rounded-xl border-2 border-indigo-100 animate-slideDown">
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Narrative Brief</label>
                      <input type="text" placeholder="Detail the activity..." value={customReason} onChange={e => setCustomReason(e.target.value)} className="w-full bg-transparent font-black text-[11px] outline-none italic" />
                    </div>
                 )}

                 <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex flex-col items-center">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 tracking-widest italic">Volume Allocation</label>
                    <div className="flex items-center gap-4">
                      <button onClick={() => setPoints(Math.max(1, points - 1))} className="w-10 h-10 bg-white rounded-full border border-slate-100 flex items-center justify-center text-slate-400 hover:text-indigo-600 active:scale-90 shadow-sm"><i className="fas fa-minus"></i></button>
                      <input type="number" value={points} onChange={e => setPoints(Math.abs(Number(e.target.value)))} className={`w-24 bg-transparent font-extrabold text-4xl outline-none text-center tracking-tighter italic ${adminType === 'merit' ? 'text-emerald-600' : 'text-rose-600'}`} />
                      <button onClick={() => setPoints(points + 1)} className="w-10 h-10 bg-white rounded-full border border-slate-100 flex items-center justify-center text-slate-400 hover:text-indigo-600 active:scale-90 shadow-sm"><i className="fas fa-plus"></i></button>
                    </div>
                 </div>

                 <button onClick={handleApplyPoints} className={`w-full py-6 rounded-xl font-black uppercase text-[10px] shadow-2xl active:scale-95 transition-all mt-4 tracking-[0.3em] text-white italic ${adminType === 'merit' ? 'bg-emerald-600' : 'bg-rose-600'}`}>EXECUTE POLICY UPDATE</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default LeaderboardItem;
