
import React from 'react';
import { AppTab } from '../types';

const MenuView: React.FC<{ onBack: () => void, onSelectView: (tab: AppTab) => void }> = ({ onBack, onSelectView }) => (
  <div className="h-full bg-slate-50 p-8 flex flex-col">
    <button onClick={onBack} className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-400 mb-10">
      <i className="fas fa-arrow-left"></i>
    </button>
    <h2 className="text-4xl font-black text-slate-900 mb-8">AC<br/>Portal</h2>
    <div className="flex-1 space-y-4">
      <button onClick={() => onSelectView(AppTab.DASHBOARD)} className="bg-white w-full p-6 rounded-[1.5rem] shadow-sm flex items-center gap-5 border border-slate-100">
        <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl"><i className="fas fa-chart-pie"></i></div>
        <div className="text-left"><h3 className="text-xl font-black text-slate-900">Dashboard</h3><p className="text-xs text-slate-400 font-bold uppercase mt-1">Analytics & Assets</p></div>
      </button>
      <button onClick={() => onSelectView(AppTab.OPS)} className="bg-white w-full p-6 rounded-[1.5rem] shadow-sm flex items-center gap-5 border border-slate-100">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center text-3xl"><i className="fas fa-tasks"></i></div>
        <div className="text-left"><h3 className="text-xl font-black text-slate-900">Ops & Admin</h3><p className="text-xs text-slate-400 font-bold uppercase mt-1">Live Tickets</p></div>
      </button>
      <button onClick={() => onSelectView(AppTab.TECH)} className="bg-white w-full p-6 rounded-[1.5rem] shadow-sm flex items-center gap-5 border border-slate-100">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl"><i className="fas fa-user-astronaut"></i></div>
        <div className="text-left"><h3 className="text-xl font-black text-slate-900">Tech Era</h3><p className="text-xs text-slate-400 font-bold uppercase mt-1">Performance & Tools</p></div>
      </button>
    </div>
  </div>
);

export default MenuView;
