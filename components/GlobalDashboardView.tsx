import React, { useMemo } from 'react';
import { GlobalStatsResponse } from '../types.ts';
import { TECHNICIANS, ELECTRICAL_TECHNICIANS, GM_TECHNICIANS } from '../constants.ts';

interface Props {
  stats: GlobalStatsResponse | null;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

const GlobalDashboardView: React.FC<Props> = ({ stats }) => {
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

    return { total, resolved, pending };
  }, [tickets]);

  // Yearly Charts Logic
  const yearlyPerformance = useMemo(() => {
    return YEAR_MONTHS.map(m => {
      const monthly = tickets.filter(t => parseHubDate(t.date)?.getMonth() === m.monthIdx);
      const proactive = monthly.filter(t => t.complaintType === 'Proactive').length;
      const reactive = monthly.filter(t => t.complaintType === 'Reactive' || !t.complaintType).length;
      
      const resolved = monthly.filter(t => ['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status));
      const totalDays = resolved.reduce((acc, t) => {
        const raised = parseHubDate(t.date);
        const resMatch = t.resolvedBy?.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
        const completionDate = resMatch ? new Date(resMatch[0]) : new Date();
        return acc + (completionDate.getTime() - raised!.getTime()) / (1000 * 3600 * 24);
      }, 0);

      const overdue = monthly.filter(t => {
        const raised = parseHubDate(t.date);
        if (!raised) return false;
        const resMatch = t.resolvedBy?.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
        const completionDate = resMatch ? new Date(resMatch[0]) : new Date();
        return (completionDate.getTime() - raised.getTime()) / (1000 * 3600 * 24) > 7;
      }).length;

      return {
        month: m.key,
        proactive,
        reactive,
        avgResolution: resolved.length > 0 ? parseFloat((totalDays / resolved.length).toFixed(1)) : 0,
        overdueCount: overdue
      };
    });
  }, [tickets, YEAR_MONTHS]);

  const seatingStats = useMemo(() => {
    const total = seating.length || 1;
    const occupied = seating.filter(s => s.status === 'Occupied').length;
    const vacant = seating.filter(s => s.status === 'Vacant').length;
    const temp = seating.filter(s => s.status === 'Temp Occup' || s.status?.toLowerCase().includes('progress')).length;
    const ooo = seating.filter(s => s.status === 'OOO' || s.status?.toLowerCase().includes('maintenance')).length;

    const getPct = (val: number) => Math.round((val / total) * 100);
    return {
      total: seating.length,
      occupied: getPct(occupied),
      vacant: getPct(vacant),
      temp: getPct(temp),
      ooo: getPct(ooo),
      oCount: occupied,
      vCount: vacant,
      tCount: temp,
      mCount: ooo
    };
  }, [seating]);

  const leaderboard = useMemo(() => {
    const allTechs = [...TECHNICIANS, ...ELECTRICAL_TECHNICIANS, ...GM_TECHNICIANS];
    return allTechs.map(tech => {
      const techLogs = logs.filter(l => l.tech === tech && l.reason !== 'RESET_ALL');
      const merit = techLogs.filter(l => l.points > 0).reduce((a, b) => a + b.points, 0);
      const demerit = Math.abs(techLogs.filter(l => l.points < 0).reduce((a, b) => a + b.points, 0));
      return { tech, score: merit - demerit, merit, demerit };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [logs]);

  return (
    <div className="p-4 md:p-10 space-y-12 md:space-y-16 animate-fadeIn max-w-[1600px] mx-auto pb-32">
      
      {/* 1. TOP KPI STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-8">
        {[
          { label: 'Complaints Launched', val: kpiMetrics.total, icon: 'file-invoice', color: 'indigo' },
          { label: 'Complaints Resolved', val: kpiMetrics.resolved, icon: 'check-double', color: 'emerald' },
          { label: 'Work In Progress', val: kpiMetrics.pending, icon: 'clock', color: 'amber' }
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-6 md:p-10 rounded-[2rem] border border-slate-100 shadow-sm group hover:shadow-xl transition-all relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 md:mb-8">
              <p className="text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest italic leading-none">{kpi.label}</p>
              <div className={`w-10 h-10 md:w-14 md:h-14 bg-${kpi.color}-50 text-${kpi.color}-600 rounded-xl md:rounded-2xl flex items-center justify-center text-sm md:text-2xl group-hover:bg-${kpi.color}-600 group-hover:text-white transition-all shadow-inner`}>
                <i className={`fas fa-${kpi.icon}`}></i>
              </div>
            </div>
            <h3 className="text-3xl md:text-5xl font-black italic tracking-tighter text-slate-900 leading-none">{kpi.val}</h3>
          </div>
        ))}
      </div>

      {/* 2. OPERATION & MAINTENANCE SECTION */}
      <section className="space-y-8">
        <div className="flex items-center gap-6">
           <div className="h-px flex-1 bg-slate-200"></div>
           <h2 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter text-slate-900">Operation &amp; Maintenance</h2>
           <div className="h-px flex-1 bg-slate-200"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* CHART 1: STRATEGY MIX */}
          <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-lg relative overflow-hidden flex flex-col min-h-[400px]">
            <div className="mb-8">
              <h4 className="text-[11px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-1">Maintenance Strategy Mix</h4>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic">Preventive vs Reactive Ratio</p>
            </div>
            
            <div className="flex-1 flex items-end justify-between gap-1.5 md:gap-3 px-1">
              {yearlyPerformance.map((d, i) => {
                const total = (d.proactive + d.reactive) || 1;
                const maxInYear = Math.max(...yearlyPerformance.map(x => x.proactive + x.reactive), 1);
                const totalHeight = ((d.proactive + d.reactive) / maxInYear) * 100;
                const proPct = (d.proactive / total) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-3 group/bar h-full justify-end">
                    <div className="relative w-full flex flex-col-reverse items-end justify-start h-full gap-0.5 rounded-t-md overflow-hidden" style={{ height: `${Math.max(totalHeight, 8)}%` }}>
                      <div className="w-full bg-indigo-500 transition-all group-hover/bar:brightness-110" style={{ height: `${proPct}%` }} title={`Proactive: ${d.proactive}`}></div>
                      <div className="w-full bg-slate-200 transition-all group-hover/bar:brightness-110" style={{ height: `${100 - proPct}%` }} title={`Reactive: ${d.reactive}`}></div>
                    </div>
                    <span className="text-[7px] md:text-[9px] font-black text-slate-300 uppercase italic group-hover/bar:text-slate-950">{d.month}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex justify-center gap-4 border-t border-slate-50 pt-4">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                 <span className="text-[8px] font-black text-slate-400 uppercase italic">Proactive</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-slate-200 rounded-full"></div>
                 <span className="text-[8px] font-black text-slate-400 uppercase italic">Reactive</span>
              </div>
            </div>
          </div>

          {/* CHART 2: WORK ORDER AGING */}
          <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-lg relative overflow-hidden flex flex-col min-h-[400px]">
            <div className="mb-8">
              <h4 className="text-[11px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-1">Work Order Aging</h4>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic">Monthly Avg Resolution (Days)</p>
            </div>
            
            <div className="flex-1 flex items-end justify-between gap-1.5 md:gap-3 px-1">
              {yearlyPerformance.map((d, i) => {
                const max = Math.max(...yearlyPerformance.map(x => x.avgResolution), 5);
                const height = (d.avgResolution / max) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-3 group/over h-full justify-end">
                    <div className="relative w-full flex justify-center items-end h-full">
                       <div className="w-full bg-emerald-100 rounded-t-lg transition-all group-hover/over:bg-emerald-600 group-hover/over:shadow-lg" style={{ height: `${Math.max(height, 8)}%` }}></div>
                       {d.avgResolution > 0 && (
                         <div className="absolute -top-8 bg-slate-950 text-white text-[7px] font-black px-1.5 py-0.5 rounded shadow-2xl opacity-0 group-hover/over:opacity-100 transition-all">
                            {d.avgResolution}d
                         </div>
                       )}
                    </div>
                    <span className="text-[7px] md:text-[9px] font-black text-slate-300 uppercase italic group-hover/over:text-slate-950">{d.month}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CHART 3: % OVERDUE WORK ORDERS */}
          <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-lg relative overflow-hidden flex flex-col min-h-[400px]">
            <div className="mb-8">
              <h4 className="text-[11px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-1">% Overdue Work Orders</h4>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic">Critical SLA Breach Count (&gt; 7 Days)</p>
            </div>
            
            <div className="flex-1 flex items-end justify-between gap-1.5 md:gap-3 px-1">
              {yearlyPerformance.map((d, i) => {
                const max = Math.max(...yearlyPerformance.map(x => x.overdueCount), 1);
                const height = (d.overdueCount / max) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-3 group/over h-full justify-end">
                    <div className="relative w-full flex justify-center items-end h-full">
                       <div className={`w-full rounded-t-lg transition-all ${d.overdueCount > 0 ? 'bg-rose-500 shadow-lg' : 'bg-slate-50'}`} style={{ height: `${Math.max(height, 8)}%` }}></div>
                       {d.overdueCount > 0 && (
                         <div className="absolute -top-8 bg-slate-950 text-white text-[7px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover/over:opacity-100 transition-all">
                            {d.overdueCount}
                         </div>
                       )}
                    </div>
                    <span className="text-[7px] md:text-[9px] font-black text-slate-300 uppercase italic group-hover/over:text-slate-950">{d.month}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 3. SEATING & OCCUPANCY SECTION - ENHANCED WITH PERCENTAGES */}
      <section className="space-y-8">
        <div className="flex items-center gap-6">
           <div className="h-px flex-1 bg-slate-200"></div>
           <h2 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter text-slate-900">Seating &amp; Occupancy</h2>
           <div className="h-px flex-1 bg-slate-200"></div>
        </div>

        <div className="bg-slate-950 p-8 md:p-16 rounded-[3rem] shadow-2xl border border-white/5 relative overflow-hidden">
           <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-teal-500/10 blur-[120px]"></div>
           <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/5 blur-[120px]"></div>
           
           <div className="relative z-10 flex flex-col lg:flex-row items-center justify-around gap-12">
             <div className="text-center lg:text-left space-y-6">
                <div>
                   <h4 className="text-2xl md:text-4xl font-black text-white uppercase italic tracking-tighter leading-none mb-4">Seating Pulse Analytics</h4>
                   <p className="text-[10px] md:text-xs font-black text-teal-400/60 uppercase tracking-[0.4em] italic">Graphical Distribution & Percentage Flow</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 max-w-md">
                   {[
                     { label: 'Occupied', val: seatingStats.oCount, pct: seatingStats.occupied, color: 'bg-orange-500', txtColor: 'text-orange-400' },
                     { label: 'Vacant (Available)', val: seatingStats.vCount, pct: seatingStats.vacant, color: 'bg-teal-500', txtColor: 'text-teal-400' },
                     { label: 'Temp Progress', val: seatingStats.tCount, pct: seatingStats.temp, color: 'bg-purple-500', txtColor: 'text-purple-400' },
                     { label: 'Maintenance', val: seatingStats.mCount, pct: seatingStats.ooo, color: 'bg-slate-500', txtColor: 'text-slate-400' }
                   ].map(item => (
                     <div key={item.label} className="bg-white/5 p-4 md:p-6 rounded-2xl border border-white/5 backdrop-blur-md text-left">
                        <div className="flex items-center gap-3 mb-2">
                           <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                           <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{item.label}</span>
                        </div>
                        <div className="flex flex-col">
                           <div className="flex items-baseline gap-2">
                             <span className="text-2xl md:text-3xl font-black text-white italic tracking-tighter leading-none">{item.val}</span>
                             <span className="text-[9px] font-bold text-white/20 uppercase">Units</span>
                           </div>
                           <span className={`text-[12px] font-black ${item.txtColor} uppercase tracking-widest mt-1 italic`}>{item.pct}% Ratio</span>
                        </div>
                     </div>
                   ))}
                </div>
             </div>

             <div className="relative w-64 h-64 md:w-[450px] md:h-[450px] flex items-center justify-center">
               <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90 filter drop-shadow-[0_0_20px_rgba(20,184,166,0.2)]">
                 <circle cx="50" cy="50" r="42" fill="transparent" stroke="#0f172a" strokeWidth="12" />
                 {/* Available/Vacant Segment */}
                 <circle 
                   cx="50" cy="50" r="42" 
                   fill="transparent" 
                   stroke="#14b8a6" 
                   strokeWidth="12" 
                   strokeDasharray={`${seatingStats.vacant * 2.63} 263.8`}
                   strokeLinecap="round"
                   className="transition-all duration-1000 ease-out"
                 />
                 {/* Occupied Segment */}
                 <circle 
                   cx="50" cy="50" r="42" 
                   fill="transparent" 
                   stroke="#f97316" 
                   strokeWidth="12" 
                   strokeDasharray={`${seatingStats.occupied * 2.63} 263.8`}
                   strokeDashoffset={`-${seatingStats.vacant * 2.63}`}
                   strokeLinecap="round"
                   className="transition-all duration-1000 ease-out"
                 />
                 {/* Temp Segment */}
                 <circle 
                   cx="50" cy="50" r="42" 
                   fill="transparent" 
                   stroke="#a855f7" 
                   strokeWidth="12" 
                   strokeDasharray={`${seatingStats.temp * 2.63} 263.8`}
                   strokeDashoffset={`-${(seatingStats.vacant + seatingStats.occupied) * 2.63}`}
                   strokeLinecap="round"
                   className="transition-all duration-1000 ease-out"
                 />
               </svg>
               <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-5xl md:text-8xl font-black italic text-white tracking-tighter leading-none">{seatingStats.total}</span>
                  <div className="flex flex-col items-center gap-1 md:gap-2 mt-2 md:mt-4">
                     <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        <span className="text-[10px] md:text-sm font-black text-white uppercase italic tracking-widest">Occ: {seatingStats.occupied}%</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                        <span className="text-[10px] md:text-sm font-black text-white uppercase italic tracking-widest">Avail: {seatingStats.vacant}%</span>
                     </div>
                  </div>
               </div>
             </div>
           </div>
        </div>
      </section>

      {/* 4. LEADERBOARD - POSITIONED AT BOTTOM */}
      <section className="space-y-8">
        <div className="flex items-center gap-6">
           <div className="h-px flex-1 bg-slate-200"></div>
           <h2 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter text-slate-900">Technician Excellence</h2>
           <div className="h-px flex-1 bg-slate-200"></div>
        </div>

        <div className="bg-white p-6 md:p-12 rounded-[3rem] border border-slate-100 shadow-xl relative overflow-hidden">
           <div className="flex justify-between items-center mb-12">
              <div>
                <h4 className="text-lg md:text-xl font-black text-slate-950 uppercase italic tracking-[0.2em] mb-1">Global Efficiency Ranking</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Performance Analytics Cycle Active</p>
              </div>
              <div className="w-12 h-12 md:w-16 md:h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                <i className="fas fa-award text-xl md:text-3xl animate-bounce"></i>
              </div>
           </div>

           <div className="space-y-4 md:space-y-6">
              {leaderboard.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-5 md:p-8 bg-slate-50/50 rounded-3xl border border-slate-100 group hover:bg-white hover:shadow-xl transition-all">
                   <div className="flex items-center gap-6 md:gap-10">
                      <div className="w-12 h-12 md:w-16 md:h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center font-black text-lg md:text-2xl italic group-hover:bg-indigo-600 group-hover:text-white transition-all">
                         {idx + 1}
                      </div>
                      <div>
                         <p className="text-sm md:text-xl font-black text-slate-900 uppercase italic tracking-widest">{item.tech}</p>
                         <div className="flex gap-4 mt-1.5 md:mt-3">
                            <div className="flex items-center gap-2">
                               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                               <span className="text-[9px] md:text-[11px] font-black text-emerald-600 uppercase italic">+{item.merit} Merit</span>
                            </div>
                            <div className="flex items-center gap-2">
                               <div className="w-1.5 h-1.5 bg-rose-400 rounded-full"></div>
                               <span className="text-[9px] md:text-[11px] font-black text-rose-500 uppercase italic">-{item.demerit} Demerit</span>
                            </div>
                         </div>
                      </div>
                   </div>
                   <div className="text-right">
                      <p className="text-3xl md:text-5xl font-black text-slate-950 italic tracking-tighter leading-none">{item.score}</p>
                      <p className="text-[9px] md:text-[11px] font-black text-slate-300 uppercase tracking-widest mt-2 leading-none">Net Score</p>
                   </div>
                </div>
              ))}
           </div>
        </div>
      </section>

      {/* FOOTER STRIP */}
      <div className="pt-12 border-t border-slate-100 flex flex-col items-center gap-6 opacity-30">
         <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.5em] italic text-center leading-relaxed">
           Authorized Command Environment &bull; Disrupt Facilities Suite &bull; Yearly Analytics v18.0
         </p>
         <div className="flex gap-12 items-center">
            <div className="flex items-center gap-3">
               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]"></div>
               <span className="text-[8px] md:text-[10px] font-black uppercase italic tracking-widest">Network Secure</span>
            </div>
            <div className="flex items-center gap-3">
               <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse delay-75 shadow-[0_0_10px_#6366f1]"></div>
               <span className="text-[8px] md:text-[10px] font-black uppercase italic tracking-widest">Data Synced</span>
            </div>
         </div>
      </div>
    </div>
  );
};

export default GlobalDashboardView;