import React, { useState, useMemo } from 'react';
import { GlobalStatsResponse, Ticket, Seat, PerformanceLogEntry } from '../types.ts';
import { TECHNICIANS, ELECTRICAL_TECHNICIANS, GM_TECHNICIANS } from '../constants.ts';

interface Props {
  stats: GlobalStatsResponse | null;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

const GlobalDashboardView: React.FC<Props> = ({ stats, onRefresh, showToast }) => {
  const CURRENT_YEAR = new Date().getFullYear();
  const DATA_START_DATE = new Date(`${CURRENT_YEAR}-01-01T00:00:00`);

  // Data Normalization
  const tickets = useMemo(() => {
    return (stats?.allTickets || []).filter(t => {
      const d = new Date(t.date);
      return !isNaN(d.getTime()) && d >= DATA_START_DATE && d.getFullYear() === CURRENT_YEAR;
    });
  }, [stats, CURRENT_YEAR]);

  const logs = useMemo(() => {
    return (stats?.allPerformanceLogs || []).filter(l => {
      const d = new Date(l.Timestamp || 0);
      return !isNaN(d.getTime()) && d >= DATA_START_DATE && d.getFullYear() === CURRENT_YEAR;
    });
  }, [stats, CURRENT_YEAR]);

  const seating = useMemo(() => stats?.seatingData || [], [stats]);

  const YEAR_MONTHS = useMemo(() => {
    const months = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(CURRENT_YEAR, i, 1);
      months.push({ key: d.toLocaleString('default', { month: 'short' }), monthIdx: i });
    }
    return months;
  }, [CURRENT_YEAR]);

  const parseHubDate = (dateStr: any) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };

  // KPI Metrics
  const kpiMetrics = useMemo(() => {
    const total = tickets.length;
    const resolved = tickets.filter(t => ['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status)).length;
    const pending = total - resolved;
    
    // SLA Compliance: Resolution within 3 days
    const slaMet = tickets.filter(t => {
      const raised = parseHubDate(t.date);
      if (!raised || !t.status.includes('Resolved')) return false;
      const resMatch = t.resolvedBy?.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      const completionDate = resMatch ? new Date(resMatch[0]) : new Date();
      return (completionDate.getTime() - raised.getTime()) / (1000 * 3600 * 24) <= 3;
    }).length;

    const compliance = total > 0 ? Math.round((slaMet / total) * 100) : 100;
    const uptime = total > 0 ? parseFloat(((resolved / total) * 100).toFixed(1)) : 100;

    return { total, resolved, pending, compliance, uptime };
  }, [tickets]);

  // Chart 1: Work Order Aging (Avg Days to Resolve)
  const agingChartData = useMemo(() => {
    return YEAR_MONTHS.map(m => {
      const monthlyResolved = tickets.filter(t => 
        parseHubDate(t.date)?.getMonth() === m.monthIdx && 
        ['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status)
      );
      
      const totalDays = monthlyResolved.reduce((acc, t) => {
        const raised = parseHubDate(t.date);
        const resMatch = t.resolvedBy?.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
        const completionDate = resMatch ? new Date(resMatch[0]) : new Date();
        return acc + (completionDate.getTime() - raised!.getTime()) / (1000 * 3600 * 24);
      }, 0);

      const avg = monthlyResolved.length > 0 ? parseFloat((totalDays / monthlyResolved.length).toFixed(1)) : 0;
      return { month: m.key, avg };
    });
  }, [tickets, YEAR_MONTHS]);

  // Chart 2: % Overdue Work Orders (> 7 Days)
  const overdueChartData = useMemo(() => {
    return YEAR_MONTHS.map(m => {
      const monthly = tickets.filter(t => parseHubDate(t.date)?.getMonth() === m.monthIdx);
      const overdue = monthly.filter(t => {
        const raised = parseHubDate(t.date);
        if (!raised) return false;
        const resMatch = t.resolvedBy?.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
        const completionDate = resMatch ? new Date(resMatch[0]) : new Date();
        const diff = (completionDate.getTime() - raised.getTime()) / (1000 * 3600 * 24);
        return diff > 7;
      }).length;
      return { month: m.key, count: overdue };
    });
  }, [tickets, YEAR_MONTHS]);

  // Chart 3: Maintenance Mix (Proactive vs Reactive)
  const maintenanceMix = useMemo(() => {
    const proactive = tickets.filter(t => t.complaintType === 'Proactive').length;
    const reactive = tickets.filter(t => t.complaintType === 'Reactive' || !t.complaintType).length;
    const total = proactive + reactive || 1;
    return {
      proactive: Math.round((proactive / total) * 100),
      reactive: Math.round((reactive / total) * 100),
      pCount: proactive,
      rCount: reactive
    };
  }, [tickets]);

  // Chart 4: Seating Pulse (Donut)
  const seatingStats = useMemo(() => {
    const total = seating.length || 1;
    const occupied = seating.filter(s => s.status === 'Occupied').length;
    const vacant = seating.filter(s => s.status === 'Vacant').length;
    const temp = seating.filter(s => s.status === 'Temp Occup' || s.status?.toLowerCase().includes('progress')).length;
    const ooo = total - occupied - vacant - temp;

    const getPct = (val: number) => Math.round((val / total) * 100);
    return {
      total: seating.length,
      occupied: getPct(occupied),
      vacant: getPct(vacant),
      temp: getPct(temp),
      ooo: getPct(ooo),
      oCount: occupied,
      vCount: vacant
    };
  }, [seating]);

  // Global Leaderboard
  const leaderboard = useMemo(() => {
    const allTechs = [...TECHNICIANS, ...ELECTRICAL_TECHNICIANS, ...GM_TECHNICIANS];
    const performance = allTechs.map(tech => {
      const techLogs = logs.filter(l => l.tech === tech && l.reason !== 'RESET_ALL');
      const merit = techLogs.filter(l => l.points > 0).reduce((a, b) => a + b.points, 0);
      const demerit = Math.abs(techLogs.filter(l => l.points < 0).reduce((a, b) => a + b.points, 0));
      return { tech, score: merit - demerit, merit, demerit };
    });
    return performance.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [logs]);

  return (
    <div className="p-4 lg:p-10 space-y-10 animate-fadeIn max-w-[1600px] mx-auto pb-32">
      {/* 1. KPI STRIP */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Deployments', val: kpiMetrics.total, icon: 'rocket', color: 'indigo', sub: 'Year to Date' },
          { label: 'SLA Compliance', val: `${kpiMetrics.compliance}%`, icon: 'shield-check', color: 'emerald', sub: 'Resolution < 3d' },
          { label: 'Pending Response', val: kpiMetrics.pending, icon: 'clock', color: 'amber', sub: 'Active Queue' },
          { label: 'Global Uptime', val: `${kpiMetrics.uptime}%`, icon: 'globe', color: 'slate', sub: 'System Health' }
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm group hover:shadow-xl transition-all relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-24 h-24 bg-${kpi.color}-500/5 blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity`}></div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic mb-1">{kpi.label}</p>
                <p className="text-[7px] font-bold text-slate-300 uppercase tracking-widest italic">{kpi.sub}</p>
              </div>
              <div className={`w-12 h-12 bg-${kpi.color}-50 text-${kpi.color}-600 rounded-2xl flex items-center justify-center text-xl group-hover:bg-${kpi.color}-600 group-hover:text-white transition-all shadow-inner`}>
                <i className={`fas fa-${kpi.icon}`}></i>
              </div>
            </div>
            <h3 className="text-5xl font-black italic tracking-tighter text-slate-900 leading-none">{kpi.val}</h3>
          </div>
        ))}
      </div>

      {/* 2. MAIN CHART GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* CHART 1: AGING PROFILE */}
        <div className="lg:col-span-8 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl relative overflow-hidden group">
          <div className="flex justify-between items-center mb-12">
            <div>
              <h4 className="text-[12px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-2">Work Order Aging Analysis</h4>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic">Average Days to Resolution Stream</p>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                 <span className="text-[8px] font-black uppercase text-slate-400">Latency (Days)</span>
               </div>
            </div>
          </div>
          
          <div className="flex items-end justify-between h-64 gap-4 px-2">
            {agingChartData.map((d, i) => {
              const maxAvg = Math.max(...agingChartData.map(x => x.avg), 1);
              const height = (d.avg / maxAvg) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-4 group/bar">
                  <div className="relative w-full flex justify-center items-end h-full">
                    <div className="absolute inset-0 bg-slate-50/50 rounded-t-xl opacity-0 group-hover/bar:opacity-100 transition-opacity"></div>
                    <div className={`w-full bg-slate-100 rounded-t-xl transition-all group-hover/bar:bg-indigo-600 group-hover/bar:shadow-[0_0_20px_rgba(79,70,229,0.3)] ${d.avg > 0 ? 'bg-indigo-100' : ''}`} style={{ height: `${Math.max(height, 5)}%` }}></div>
                    {d.avg > 0 && (
                      <div className="absolute -top-10 bg-slate-950 text-white text-[9px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover/bar:opacity-100 transition-all scale-50 group-hover/bar:scale-100 origin-bottom shadow-2xl">
                        {d.avg}d
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] font-black text-slate-300 uppercase italic group-hover/bar:text-slate-950 transition-colors">{d.month}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* CHART 2: MAINTENANCE MIX */}
        <div className="lg:col-span-4 bg-slate-950 p-10 rounded-[3rem] shadow-2xl border border-white/5 relative overflow-hidden">
           <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px]"></div>
           <h4 className="text-[12px] font-black text-emerald-400 uppercase italic tracking-[0.2em] mb-12">Maintenance Strategy Mix</h4>
           
           <div className="space-y-12 relative z-10">
              <div className="space-y-4">
                 <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-black text-white uppercase italic tracking-widest">Proactive Checklist</span>
                    <span className="text-3xl font-black text-emerald-500 italic tracking-tighter">{maintenanceMix.proactive}%</span>
                 </div>
                 <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-1000 shadow-[0_0_15px_rgba(16,185,129,0.5)]" style={{ width: `${maintenanceMix.proactive}%` }}></div>
                 </div>
                 <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{maintenanceMix.pCount} Tasks Executed</p>
              </div>

              <div className="space-y-4">
                 <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-black text-white uppercase italic tracking-widest">Reactive Incidents</span>
                    <span className="text-3xl font-black text-rose-600 italic tracking-tighter">{maintenanceMix.reactive}%</span>
                 </div>
                 <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-600 transition-all duration-1000 shadow-[0_0_15px_rgba(225,29,72,0.5)]" style={{ width: `${maintenanceMix.reactive}%` }}></div>
                 </div>
                 <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{maintenanceMix.rCount} Faults Logged</p>
              </div>
           </div>

           <div className="mt-20 pt-8 border-t border-white/5 text-center">
              <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.5em] italic">Network Health Index: Optimal</p>
           </div>
        </div>

        {/* CHART 3: OVERDUE UNITS */}
        <div className="lg:col-span-5 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl relative overflow-hidden group">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h4 className="text-[12px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-2">
                % Overdue Work Orders (&gt; 7 Days)
              </h4>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic">Critical SLA Breach Analysis</p>
            </div>
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shadow-inner">
               <i className="fas fa-exclamation-circle text-xl animate-pulse"></i>
            </div>
          </div>
          
          <div className="flex items-end justify-between h-56 gap-2">
             {overdueChartData.map((d, i) => {
               const max = Math.max(...overdueChartData.map(x => x.count), 1);
               const height = (d.count / max) * 100;
               return (
                 <div key={i} className="flex-1 flex flex-col items-center gap-4 group/over">
                    <div className="relative w-full flex justify-center items-end h-full">
                       <div className={`w-full rounded-t-lg transition-all duration-700 ${d.count > 0 ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 'bg-slate-50'}`} style={{ height: `${Math.max(height, 5)}%` }}></div>
                       {d.count > 0 && (
                         <div className="absolute -top-10 bg-slate-950 text-white text-[9px] font-black px-3 py-1.5 rounded-lg opacity-0 group-hover/over:opacity-100 transition-all shadow-2xl">
                            {d.count} Units
                         </div>
                       )}
                    </div>
                    <span className="text-[8px] font-black text-slate-300 uppercase italic group-hover/over:text-slate-950">{d.month}</span>
                 </div>
               );
             })}
          </div>
        </div>

        {/* CHART 4: SEATING PULSE */}
        <div className="lg:col-span-3 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl flex flex-col items-center justify-center relative overflow-hidden">
          <h4 className="text-[10px] font-black text-slate-950 uppercase italic tracking-[0.3em] absolute top-10 text-center w-full">Seating Pulse</h4>
          
          <div className="relative w-48 h-48 flex items-center justify-center mt-6">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
               <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="12" />
               <circle 
                 cx="50" cy="50" r="40" 
                 fill="transparent" 
                 stroke="#f97316" 
                 strokeWidth="12" 
                 strokeDasharray={`${seatingStats.occupied * 2.51} 251.2`}
                 strokeLinecap="round"
                 className="transition-all duration-1000 ease-out"
               />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
               <span className="text-4xl font-black italic text-slate-950 tracking-tighter leading-none">{seatingStats.oCount}</span>
               <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-2">Active Seats</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-12 w-full">
             <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-[7px] font-black text-teal-600 uppercase mb-1">Vacant</p>
                <p className="text-xl font-black italic text-slate-900 tracking-tighter">{seatingStats.vacant}%</p>
             </div>
             <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-[7px] font-black text-indigo-600 uppercase mb-1">In Progress</p>
                <p className="text-xl font-black italic text-slate-900 tracking-tighter">{seatingStats.temp}%</p>
             </div>
          </div>
        </div>

        {/* 3. GLOBAL EXCELLENCE LEADERBOARD */}
        <div className="lg:col-span-4 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl relative overflow-hidden">
           <div className="flex justify-between items-center mb-10">
              <div>
                <h4 className="text-[12px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-2">Global Excellence</h4>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic">Cross-Departmental Ranking</p>
              </div>
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
                <i className="fas fa-crown text-sm"></i>
              </div>
           </div>

           <div className="space-y-4">
              {leaderboard.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-300 transition-all group">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center font-black text-sm group-hover:bg-indigo-600 group-hover:text-white transition-all italic">
                         {idx + 1}
                      </div>
                      <div>
                         <p className="text-[11px] font-black text-slate-900 uppercase italic tracking-widest">{item.tech}</p>
                         <div className="flex gap-2 mt-1">
                            <span className="text-[7px] font-bold text-emerald-500">+{item.merit}M</span>
                            <span className="text-[7px] font-bold text-rose-400">-{item.demerit}D</span>
                         </div>
                      </div>
                   </div>
                   <div className="text-right">
                      <p className="text-2xl font-black text-slate-950 italic tracking-tighter leading-none">{item.score}</p>
                      <p className="text-[7px] font-black text-slate-300 uppercase tracking-widest mt-1">Net Merit</p>
                   </div>
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* FOOTER STRIP */}
      <div className="pt-12 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 opacity-30">
         <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.6em] italic text-center md:text-left">
           Command View Authorized Entry • Cloud Synchronizer v12.0 • Disrupt FM Portal
         </p>
         <div className="flex gap-8 items-center">
            <span className="text-[8px] font-black uppercase italic tracking-widest">Latency: 0.12ms</span>
            <span className="text-[8px] font-black uppercase italic tracking-widest">Buffer: Stable</span>
            <div className="flex gap-2">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
               <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse delay-75"></div>
               <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse delay-150"></div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default GlobalDashboardView;