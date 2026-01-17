
import React from 'react';
import { AppTab } from '../types';

const MenuView: React.FC<{ onBack: () => void, onSelectView: (tab: AppTab) => void }> = ({ onBack, onSelectView }) => (
  <div className="h-full bg-slate-50 p-6 lg:p-16 flex flex-col justify-center items-center overflow-y-auto hide-scroll">
    <div className="w-full max-w-2xl space-y-6 lg:space-y-10">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[7px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-1">Systems Access</p>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tighter leading-none italic">COMMAND<br/>REGISTRY</h2>
        </div>
        <button onClick={onBack} className="w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center text-slate-300 hover:text-indigo-600 transition-all border border-slate-100 active:scale-90">
          <i className="fas fa-arrow-left text-sm"></i>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { tab: AppTab.DASHBOARD, title: 'Dashboard', desc: 'Analytics', icon: 'chart-pie', color: 'indigo' },
          { tab: AppTab.OPS, title: 'Ops Center', desc: 'Operations', icon: 'tasks', color: 'rose' },
          { tab: AppTab.TECH, title: 'Tech Hub', desc: 'Field Works', icon: 'user-astronaut', color: 'emerald' }
        ].map((item, idx) => (
          <button 
            key={idx} 
            onClick={() => onSelectView(item.tab)} 
            className="bg-white p-5 rounded-2xl premium-card border border-slate-100 group text-left space-y-5"
          >
            <div className={`w-10 h-10 bg-${item.color}-50 text-${item.color}-600 rounded-xl flex items-center justify-center text-lg shadow-inner group-hover:bg-${item.color}-600 group-hover:text-white transition-all duration-400`}>
              <i className={`fas fa-${item.icon}`}></i>
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight italic">{item.title}</h3>
              <p className="text-[7px] text-slate-300 font-black uppercase tracking-[0.1em] mt-1 italic">{item.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default MenuView;
