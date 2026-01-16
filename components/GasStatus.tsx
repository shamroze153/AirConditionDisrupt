
import React, { useState, useMemo } from 'react';
import { StatsResponse } from '../types';
import { logGasTransaction } from '../services/api';
import { GAS_TYPES } from '../constants';

interface Props {
  stats: StatsResponse | null;
  onRefresh?: () => void;
}

const GasStatus: React.FC<Props> = ({ stats, onRefresh }) => {
  const [clickCount, setClickCount] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [loadAmount, setLoadAmount] = useState<number>(0);
  const [selectedType, setSelectedType] = useState(GAS_TYPES[0].name);
  const [isSyncing, setIsSyncing] = useState(false);

  // Derive STOCK directly from the server stats (Sum of ledger entries)
  const gasStocks = useMemo(() => {
    return stats?.hvac?.gasStocks || {};
  }, [stats]);

  const handleTrigger = () => {
    const next = clickCount + 1;
    if (next >= 5) {
      setShowAdmin(true);
      setClickCount(0);
    } else {
      setClickCount(next);
    }
  };

  const handleRefill = async () => {
    if (loadAmount <= 0) return;
    setIsSyncing(true);

    // Logs the Refill to the Gas_Ledger sheet
    await logGasTransaction({
      timestamp: new Date().toLocaleString(),
      action: 'REFILL',
      gasType: selectedType,
      amount: loadAmount,
      tech: 'Admin',
      refTicket: 'STOCK_RELOAD'
    });

    setIsSyncing(false);
    setShowAdmin(false);
    setLoadAmount(0);
    onRefresh?.();
  };

  return (
    <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden group">
      <div onClick={handleTrigger} className="grid grid-cols-5 gap-6 cursor-pointer">
        {GAS_TYPES.map((g: any, i: number) => {
          const currentQty = gasStocks[g.name] || 0;
          const pct = Math.min((currentQty / 150) * 100, 100); 
          const colorClass = g.type === 'ac' ? 'from-rose-500 to-rose-600' : 'from-blue-500 to-blue-600';
          
          return (
            <div key={i} className="flex flex-col items-center">
              <div className="w-full h-32 bg-slate-100 rounded-t-[3rem] rounded-b-3xl relative overflow-hidden flex items-end border-[3px] border-slate-200/50 shadow-inner hover:scale-110 transition-transform duration-700">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-4 h-3 bg-slate-400 rounded-sm z-10"></div>
                <div className={`w-full bg-gradient-to-t ${colorClass} transition-all duration-1500 ease-out relative`} style={{ height: `${pct}%` }}>
                  <div className="absolute top-0 left-0 w-[200%] h-6 bg-white/10 -translate-y-1/2 animate-[wave_4s_infinite_linear] rounded-[45%]"></div>
                </div>
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white mix-blend-overlay uppercase tracking-widest text-center px-2">{g.name}</span>
              </div>
              <div className="mt-4 text-center">
                 <p className="text-[12px] font-black text-slate-800 leading-none">{Math.round(currentQty)}<span className="text-[8px] ml-0.5 opacity-40">KG</span></p>
                 <div className={`w-1.5 h-1.5 rounded-full mx-auto mt-2 ${currentQty < 20 ? 'bg-red-500 animate-ping' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'}`}></div>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes wave {
          from { transform: translateX(-50%) translateY(-50%) rotate(0deg); }
          to { transform: translateX(-50%) translateY(-50%) rotate(360deg); }
        }
      `}</style>

      {showAdmin && (
        <div className="fixed inset-0 bg-slate-900/95 z-[110] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3.5rem] p-10 shadow-2xl border border-white/20">
            <div className="flex justify-between items-center mb-10">
              <div><h3 className="text-2xl font-black text-slate-900 leading-none">Stock Reload</h3><p className="text-[11px] font-bold text-slate-400 uppercase mt-3 tracking-widest">Unified Gas Ledger Sync</p></div>
              <button onClick={() => setShowAdmin(false)} className="w-12 h-12 bg-slate-50 rounded-full text-slate-300 border border-slate-100"><i className="fas fa-times"></i></button>
            </div>
            <div className="space-y-6">
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 ml-1">Gas Type</label>
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="w-full bg-transparent font-black text-sm outline-none">{GAS_TYPES.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}</select>
              </div>
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 ml-1">Reload KG</label>
                <input type="number" value={loadAmount} onChange={(e) => setLoadAmount(parseFloat(e.target.value))} className="w-full bg-transparent font-black text-2xl outline-none" placeholder="0.0" />
              </div>
              <button onClick={handleRefill} disabled={isSyncing || loadAmount <= 0} className="w-full bg-slate-900 text-white py-6 rounded-[2.5rem] font-black shadow-2xl transition-all mt-8 uppercase tracking-[0.3em] text-[10px]">{isSyncing ? 'Syncing...' : 'Confirm Stock Refill'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GasStatus;
