
import React from 'react';
import { AppTab } from '../types';

const MenuView: React.FC<{ onBack: () => void, onSelectView: (tab: AppTab) => void }> = ({ onBack, onSelectView }) => (
  <div className="h-full bg-slate-50 p-10 lg:p-20 flex flex-col justify-center items-center">
    <div className="w-full max-w-4xl space-y-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-black text-indigo-600 uppercase tracking-[0.5em] mb-4">Control v8.0</p>
          <h2 className="text-6xl font-extrabold text-slate-900 tracking-tighter leading-none italic">SYSTEM<br/>ACCESS</h2>
        </div>
        <button onClick={onBack} className="w-16 h-16 bg-white rounded-[2rem] shadow-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all premium-card border border-slate-100">
          <i className="fas fa-arrow-left text-xl"></i>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { tab: AppTab.DASHBOARD, title: 'Dashboard', desc: 'Analytics Hub', icon: 'chart-pie', color: 'indigo' },
          { tab: AppTab.OPS, title: 'Ops Center', desc: 'Live Logistics', icon: 'tasks', color: 'rose' },
          { tab: AppTab.TECH, title: 'Tech Era', desc: 'Field Systems', icon: 'user-astronaut', color: 'emerald' }
        ].map((item, idx) => (
          <button 
            key={idx} 
            onClick={() => onSelectView(item.tab)} 
            className="bg-white p-10 rounded-[3rem] premium-card border border-slate-100 group text-left space-y-10"
          >
            <div className={`w-20 h-20 bg-${item.color}-50 text-${item.color}-600 rounded-[2.2rem] flex items-center justify-center text-4xl shadow-inner group-hover:bg-${item.color}-600 group-hover:text-white transition-all duration-500`}>
              <i className={`fas fa-${item.icon}`}></i>
            </div>
            <div>
              <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight italic">{item.title}</h3>
              <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.4em] mt-3">{item.desc}</p>
            </div>
            <div className="flex justify-end pt-4">
              <i className="fas fa-chevron-right text-slate-200 group-hover:text-indigo-500 transition-colors"></i>
            </div>
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default MenuView;
