import React, { useState, useMemo } from 'react';
import { StatsResponse } from '../types.ts';
import { logGasTransaction } from '../services/api.ts';
import { GAS_TYPES } from '../constants.ts';

interface Props {
  stats: StatsResponse | null;
  onRefresh?: () => void;
  category?: string;
}

const GasStatus: React.FC<Props> = ({ stats, onRefresh, category = 'AC' }) => {
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);

  const [loadAmount, setLoadAmount] = useState<number>(0);
  const [selectedType, setSelectedType] = useState(GAS_TYPES[0].name);
  const [isSyncing, setIsSyncing] = useState(false);

  const gasStocks = useMemo(() => stats?.hvac?.gasStocks || {}, [stats]);

  const handleAdminToggle = () => {
    if (isAdminUnlocked) setIsAdminUnlocked(false);
    else setShowPinModal(true);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '5566') {
      setIsAdminUnlocked(true);
      setShowPinModal(false);
      setShowAdmin(true);
      setPinInput('');
    } else {
      alert("AUTHORIZATION FAILURE: Invalid PIN");
      setPinInput('');
    }
  };

  const handleRefill = async () => {
    if (loadAmount <= 0) return;
    setIsSyncing(true);
    try {
      await logGasTransaction({
        timestamp: new Date().toLocaleString(),
        action: 'REFILL',
        gasType: selectedType,
        amount: loadAmount,
        tech: 'Command Hub',
        refTicket: 'HUB_REFILL',
        category: category.toUpperCase()
      });
      setIsSyncing(false);
      setShowAdmin(false);
      setLoadAmount(0);
      onRefresh?.();
    } catch (e) {
      alert("Supply Chain Sync Failure");
      setIsSyncing(false);
    }
  };

  return (
    <div className="relative w-full">
      <div className="flex justify-between items-center mb-6 px-1">
         <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.4em] italic">Refrigerant Registry</span>
         <button 
           onClick={handleAdminToggle} 
           className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isAdminUnlocked ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]' : 'bg-white/5 text-white/20 border border-white/5 hover:text-white'}`}
         >
            <i className={`fas fa-${isAdminUnlocked ? 'lock-open' : 'lock'} text-[10px]`}></i>
         </button>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {GAS_TYPES.filter(g => g.type === 'ac').map((g: any, i: number) => {
          const currentQty = gasStocks[g.name] || 0;
          const pct = Math.min((currentQty / 150) * 100, 100); 
          const isLow = currentQty < 30;
          const colorClass = 'from-indigo-400 to-indigo-700';
          
          return (
            <div key={i} className="flex flex-col items-center">
              <div 
                onClick={() => isAdminUnlocked && (setSelectedType(g.name), setShowAdmin(true))}
                className={`w-full h-48 bg-white/5 rounded-t-[3rem] rounded-b-2xl relative overflow-hidden flex items-end border-2 border-white/10 shadow-2xl group transition-all ${isAdminUnlocked ? 'cursor-pointer hover:border-indigo-400/50 hover:scale-105 active:scale-95' : ''}`}
              >
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/10 rounded-t-md z-10 border border-white/5"></div>
                <div className={`w-full bg-gradient-to-t ${colorClass} transition-all duration-[2s] ease-out relative`} style={{ height: `${pct}%` }}>
                  <div className="absolute top-0 left-0 w-[300%] h-20 bg-white/20 -translate-y-1/2 animate-[wave_8s_infinite_linear] rounded-[45%]"></div>
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
                  <span className="text-[8px] font-black text-white/50 uppercase tracking-widest mb-1 italic">{g.name}</span>
                  <p className="text-xl font-black text-white tracking-tighter">{Math.round(currentQty)}<span className="text-[8px] ml-0.5 opacity-40">KG</span></p>
                </div>
                {isAdminUnlocked && (
                  <div className="absolute bottom-2 right-2 w-6 h-6 bg-white/10 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <i className="fas fa-plus text-[8px] text-white"></i>
                  </div>
                )}
              </div>
              <div className="mt-4"><div className={`w-1.5 h-1.5 rounded-full mx-auto ${isLow ? 'bg-rose-500 animate-pulse shadow-[0_0_8px_#f43f5e]' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'}`}></div></div>
            </div>
          );
        })}
      </div>

      <style>{`@keyframes wave { from { transform: translateX(-50%) translateY(-50%) rotate(0deg); } to { transform: translateX(-50%) translateY(-50%) rotate(360deg); } }`}</style>

      {showPinModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-10 shadow-3xl border border-white/5">
             <div className="text-center mb-8">
                <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
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
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] py-5 text-center text-3xl font-black tracking-[0.6em] focus:border-teal-600 outline-none transition-all shadow-inner"
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
        <div className="fixed inset-0 bg-slate-950/95 z-[250] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-12 shadow-2xl border border-white/5 slide-up overflow-hidden">
            <div className="flex justify-between items-center mb-10"><div><h3 className="text-3xl font-extrabold text-slate-900 uppercase italic tracking-tighter leading-none">Cylinder Refill</h3><p className="text-[10px] font-bold text-slate-400 uppercase mt-3 tracking-widest italic">Authorized Supply Override</p></div><button onClick={() => setShowAdmin(false)} className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-300 shadow-inner flex items-center justify-center"><i className="fas fa-times text-xl"></i></button></div>
            <div className="space-y-8">
              <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all"><label className="block text-[10px] font-black text-slate-400 uppercase mb-4 ml-2 tracking-widest italic">Gas Grade</label><select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="w-full bg-transparent font-black text-lg outline-none italic">{GAS_TYPES.filter(g => g.type === 'ac').map(g => <option key={g.name} value={g.name}>{g.name}</option>)}</select></div>
              <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all"><label className="block text-[10px] font-black text-slate-400 uppercase mb-4 ml-2 tracking-widest italic">Authorized Volume (KG)</label><input type="number" value={loadAmount} onChange={(e) => setLoadAmount(parseFloat(e.target.value))} className="w-full bg-transparent font-black text-5xl outline-none italic tracking-tighter" placeholder="0.0" /></div>
              <button onClick={handleRefill} disabled={isSyncing || loadAmount <= 0} className="w-full bg-slate-900 text-white py-8 rounded-2xl font-black shadow-2xl transition-all uppercase tracking-[0.5em] text-[12px] active:scale-95 disabled:opacity-30 italic">{isSyncing ? 'Syncing Supply Hub...' : 'Confirm Refill Load'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GasStatus;