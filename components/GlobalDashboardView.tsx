import React, { useMemo, useState } from 'react';
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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

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

  // KPI Metrics with Specified Terminologies
  const kpiMetrics = useMemo(() => {
    const total = tickets.length; // Complaints Launched
    const evaluated = tickets.filter(t => t.status === 'Completed').length; // Complaints Evaluated
    const resolved = tickets.filter(t => 
      ['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review'].includes(t.status)
    ).length; // Complaints Resolved
    const wip = tickets.filter(t => 
      !['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status)
    ).length; // Work In Progress

    return { total, evaluated, resolved, wip };
  }, [tickets]);

  // Yearly Performance Analytics
  const yearlyPerformance = useMemo(() => {
    return YEAR_MONTHS.map(m => {
      const monthly = tickets.filter(t => parseHubDate(t.date)?.getMonth() === m.monthIdx);
      const proactive = monthly.filter(t => t.complaintType === 'Proactive').length;
      const reactive = monthly.filter(t => t.complaintType === 'Reactive' || !t.complaintType).length;
      
      const resolved = monthly.filter(t => ['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Completed'].includes(t.status));
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

  // Seating Capacity Stats Simplified to 3 categories + Total
  const seatingStats = useMemo(() => {
    const totalCount = seating.length || 1;
    const occupied = seating.filter(s => s.status === 'Occupied').length;
    const vacant = seating.filter(s => s.status === 'Vacant').length;
    const temp = seating.filter(s => s.status === 'Temp Occup' || s.status?.toLowerCase().includes('progress')).length;
    const ooo = seating.filter(s => s.status === 'OOO' || s.status?.toLowerCase().includes('maintenance')).length;

    const getPct = (val: number) => Math.round((val / totalCount) * 100);
    
    return {
      total: seating.length,
      segments: [
        { id: 'occ', label: 'Occupied', count: occupied, pct: getPct(occupied), color: '#f97316', icon: 'user-check' },
        { id: 'tmp', label: 'Temporarily Occupied', count: temp, pct: getPct(temp), color: '#a855f7', icon: 'clock' },
        { id: 'vac', label: 'Vacant', count: vacant + ooo, pct: getPct(vacant + ooo), color: '#14b8a6', icon: 'door-open' }
      ]
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
    <div className="min-h-screen bg-slate-50 p-4 md:p-10 space-y-12 md:space-y-16 animate-fadeIn max-w-[1600px] mx-auto pb-32 text-slate-900">
      
      {/* 1. TOP KPI STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
        {[
          { label: 'Complaints Launched', val: kpiMetrics.total, icon: 'file-invoice', color: 'indigo', theme: 'dark' },
          { label: 'Work In Progress', val: kpiMetrics.wip, icon: 'clock', color: 'amber', theme: 'light' },
          { label: 'Complaints Resolved', val: kpiMetrics.resolved, icon: 'clipboard-check', color: 'blue', theme: 'light' },
          { label: 'Complaints Evaluated', val: kpiMetrics.evaluated, icon: 'check-double', color: 'emerald', theme: 'dark' }
        ].map((kpi, i) => (
          <div 
            key={i} 
            className={`${kpi.theme === 'dark' ? 'bg-slate-900 text-white border-white/5' : 'bg-white text-slate-900 border-slate-100'} border p-6 md:p-8 rounded-[2.5rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group`}
          >
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-${kpi.color}-500/10 to-transparent blur-2xl group-hover:scale-150 transition-transform`}></div>
            <div className="flex justify-between items-start mb-6">
              <p className={`text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] italic leading-none ${kpi.theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                {kpi.label}
              </p>
              <div className={`w-10 h-10 md:w-14 md:h-14 ${kpi.theme === 'dark' ? 'bg-slate-800' : 'bg-slate-50'} border border-white/10 text-${kpi.color}-500 rounded-2xl flex items-center justify-center text-sm md:text-2xl shadow-2xl group-hover:bg-${kpi.color}-500 group-hover:text-white transition-all`}>
                <i className={`fas fa-${kpi.icon}`}></i>
              </div>
            </div>
            <h3 className="text-4xl md:text-5xl font-black italic tracking-tighter leading-none drop-shadow-sm">{kpi.val}</h3>
            <div className={`mt-6 h-1 w-full ${kpi.theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100'} rounded-full overflow-hidden`}>
              <div className={`h-full bg-${kpi.color}-500 w-full animate-pulse shadow-[0_0_10px_${kpi.color}]`}></div>
            </div>
          </div>
        ))}
      </div>

      {/* 2. OPERATION & MAINTENANCE SECTION */}
      <section className="space-y-8 animate-slideUp">
        <div className="flex items-center gap-6">
           <h2 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-900 flex-shrink-0">Operational Pulse</h2>
           <div className="h-px flex-1 bg-slate-200"></div>
           <div className="flex gap-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping delay-100"></div>
           </div>
        </div>

        <div className="bg-slate-900 p-6 md:p-10 rounded-[3.5rem] shadow-3xl border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.05),transparent_70%)]"></div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-10 relative z-10">
            {/* CHART 1: STRATEGY MIX */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/5 p-6 md:p-8 rounded-[2.5rem] flex flex-col min-h-[400px] group transition-all hover:bg-white/10">
              <div className="mb-10">
                <h4 className="text-[12px] font-black text-indigo-400 uppercase italic tracking-[0.2em] mb-1">Maintenance Strategy</h4>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest italic">Preventive vs Reactive Distribution</p>
              </div>
              <div className="flex-1 flex items-end justify-between gap-2 px-1">
                {yearlyPerformance.map((d, i) => {
                  const total = (d.proactive + d.reactive) || 1;
                  const proPct = (d.proactive / total) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-4 group/bar h-full justify-end">
                      <div className="relative w-full flex flex-col-reverse items-end justify-start h-full gap-0.5 rounded-t-xl overflow-hidden shadow-inner bg-slate-800/50">
                        <div className="w-full bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all duration-500 group-hover/bar:brightness-125" style={{ height: `${proPct}%` }}></div>
                        <div className="w-full bg-slate-700/50 transition-all duration-500" style={{ height: `${100 - proPct}%` }}></div>
                      </div>
                      <span className="text-[8px] font-black text-slate-500 uppercase italic group-hover/bar:text-indigo-400">{d.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CHART 2: WORK ORDER AGING */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/5 p-6 md:p-8 rounded-[2.5rem] flex flex-col min-h-[400px] group transition-all hover:bg-white/10">
              <div className="mb-10">
                <h4 className="text-[12px] font-black text-emerald-400 uppercase italic tracking-[0.2em] mb-1">Work Order Aging</h4>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest italic">Average Resolution Latency (Days)</p>
              </div>
              <div className="flex-1 flex items-end justify-between gap-2 px-1">
                {yearlyPerformance.map((d, i) => {
                  const max = Math.max(...yearlyPerformance.map(x => x.avgResolution), 5);
                  const height = (d.avgResolution / max) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-4 group/over h-full justify-end">
                      <div className="relative w-full flex justify-center items-end h-full">
                         <div className="w-full bg-gradient-to-t from-emerald-600/20 to-emerald-400/40 border-t-2 border-emerald-500/50 rounded-t-xl transition-all duration-500 group-hover/over:from-emerald-500 group-hover/over:to-emerald-400" style={{ height: `${Math.max(height, 8)}%` }}></div>
                         {d.avgResolution > 0 && (
                           <div className="absolute -top-10 bg-slate-950 border border-emerald-500/30 text-emerald-400 text-[8px] font-black px-2 py-1 rounded-lg opacity-0 group-hover/over:opacity-100 transition-all scale-75 group-hover/over:scale-100 shadow-2xl">
                              {d.avgResolution}d
                           </div>
                         )}
                      </div>
                      <span className="text-[8px] font-black text-slate-500 uppercase italic group-hover/over:text-emerald-400">{d.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CHART 3: CRITICAL OVERDUE */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/5 p-6 md:p-8 rounded-[2.5rem] flex flex-col min-h-[400px] group transition-all hover:bg-white/10">
              <div className="mb-10">
                <h4 className="text-[12px] font-black text-rose-400 uppercase italic tracking-[0.2em] mb-1">Critical SLA Breach</h4>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest italic">Overdue Work Order Intensity</p>
              </div>
              <div className="flex-1 flex items-end justify-between gap-2 px-1">
                {yearlyPerformance.map((d, i) => {
                  const max = Math.max(...yearlyPerformance.map(x => x.overdueCount), 1);
                  const height = (d.overdueCount / max) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-4 group/over h-full justify-end">
                      <div className="relative w-full flex justify-center items-end h-full">
                         <div className={`w-full rounded-t-xl transition-all shadow-lg ${d.overdueCount > 0 ? 'bg-gradient-to-t from-rose-600 to-rose-400 border-t-2 border-rose-300' : 'bg-slate-800 border border-white/5'}`} style={{ height: `${Math.max(height, 8)}%` }}></div>
                      </div>
                      <span className="text-[8px] font-black text-slate-500 uppercase italic group-hover/over:text-rose-400">{d.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SEATING OCCUPANCY SECTION - Redesigned Visual */}
      <section className="space-y-8">
        <div className="flex items-center gap-6">
           <h2 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-900 flex-shrink-0">Seating Occupancy</h2>
           <div className="h-px flex-1 bg-slate-200"></div>
        </div>

        <div className="bg-white p-8 md:p-14 rounded-[4rem] shadow-2xl border border-slate-100 relative overflow-hidden group">
           <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-teal-500/5 blur-[150px] transition-all group-hover:bg-teal-500/10 pointer-events-none"></div>
           
           <div className="relative z-10 flex flex-col lg:flex-row items-center justify-center gap-12 md:gap-24">
             {/* DONUT VISUAL - Focused & Compact */}
             <div className="relative w-72 h-72 md:w-[420px] md:h-[420px] flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90 drop-shadow-2xl">
                  {/* Outer track */}
                  <circle cx="50" cy="50" r="42" fill="transparent" stroke="#f8fafc" strokeWidth="12" />
                  
                  {seatingStats.segments.reduce((acc, seg) => {
                    const startOffset = acc.offset;
                    const dash = (seg.pct / 100) * 263.8; // 2 * PI * R (42)
                    const isHovered = activeCategory === seg.id;
                    
                    acc.elements.push(
                      <circle 
                        key={seg.id}
                        cx="50" cy="50" r="42" 
                        fill="transparent" 
                        stroke={seg.color} 
                        strokeWidth={isHovered ? "15" : "13"} 
                        strokeDasharray={`${dash} 263.8`} 
                        strokeDashoffset={-startOffset} 
                        strokeLinecap="round" 
                        className="transition-all duration-700 ease-out cursor-pointer hover:stroke-opacity-90"
                        onClick={() => setActiveCategory(activeCategory === seg.id ? null : seg.id)}
                        title={`${seg.label}: ${seg.count} Units`}
                      />
                    );

                    // Labels directly on chart segments
                    if (seg.pct > 8) {
                      const angle = (startOffset + dash / 2) / 263.8 * 360;
                      const rad = (angle * Math.PI) / 180;
                      const tx = 50 + 42 * Math.cos(rad);
                      const ty = 50 + 42 * Math.sin(rad);
                      
                      acc.elements.push(
                        <text 
                          key={`${seg.id}-label`}
                          x={tx} y={ty} 
                          textAnchor="middle" 
                          transform={`rotate(90 ${tx} ${ty})`}
                          className="fill-white font-black text-[3px] select-none pointer-events-none italic" 
                          dy=".35em"
                        >
                          {seg.pct}%
                        </text>
                      );
                    }

                    acc.offset += dash;
                    return acc;
                  }, { elements: [] as any[], offset: 0 }).elements}
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                   <div className="flex items-baseline gap-1">
                      <span className="text-7xl md:text-9xl font-black italic text-slate-950 tracking-tighter leading-none">{seatingStats.total}</span>
                   </div>
                   <span className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest mt-2 italic">Global Units</span>
                   
                   {activeCategory && (
                     <div className="mt-4 bg-slate-950 text-white px-5 py-2 rounded-2xl shadow-2xl border border-white/10 animate-fadeIn transition-all">
                        <p className="text-[7px] font-black text-teal-400 uppercase tracking-widest mb-1 italic">
                          {seatingStats.segments.find(s => s.id === activeCategory)?.label}
                        </p>
                        <p className="text-xl font-black italic leading-none">
                          {seatingStats.segments.find(s => s.id === activeCategory)?.count} <span className="text-[9px] opacity-40">SEATS</span>
                        </p>
                     </div>
                   )}
                </div>
             </div>

             {/* SIMPLIFIED LEGEND - Professional Management View */}
             <div className="flex-1 max-w-lg space-y-12">
                <div className="border-b border-slate-100 pb-8 text-center lg:text-left">
                   <h3 className="text-3xl md:text-4xl font-black text-slate-900 uppercase italic tracking-tighter leading-none mb-3">Facility Utilization</h3>
                   <p className="text-[11px] font-black text-teal-600 uppercase tracking-[0.4em] italic">Active Station Registry Distribution</p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:gap-5">
                   {seatingStats.segments.map(seg => (
                     <button 
                       key={seg.id}
                       onClick={() => setActiveCategory(activeCategory === seg.id ? null : seg.id)}
                       className={`flex items-center justify-between p-6 md:p-7 rounded-[2.5rem] border-2 transition-all group ${activeCategory === seg.id ? 'bg-slate-950 border-slate-950 shadow-2xl scale-[1.03]' : 'bg-slate-50 border-slate-100 hover:border-teal-100'}`}
                     >
                        <div className="flex items-center gap-6">
                           <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform group-hover:rotate-6`} style={{ backgroundColor: seg.color }}>
                              <i className={`fas fa-${seg.icon} text-lg md:text-xl`}></i>
                           </div>
                           <div className="text-left">
                              <p className={`text-[10px] font-black uppercase italic ${activeCategory === seg.id ? 'text-teal-400' : 'text-slate-400'}`}>{seg.label}</p>
                              <p className={`text-xl md:text-2xl font-black italic tracking-tighter mt-1 ${activeCategory === seg.id ? 'text-white' : 'text-slate-900'}`}>{seg.count} <span className="text-[10px] opacity-40 uppercase">Units</span></p>
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="flex items-baseline gap-1">
                              <span className={`text-3xl md:text-4xl font-black italic ${activeCategory === seg.id ? 'text-white' : 'text-slate-950'}`}>{seg.pct}</span>
                              <span className={`text-[12px] font-black italic ${activeCategory === seg.id ? 'text-teal-400' : 'text-slate-300'}`}>%</span>
                           </div>
                           <div className="h-1 w-12 bg-slate-200 mt-2 rounded-full overflow-hidden ml-auto">
                              <div className="h-full transition-all duration-1000" style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}></div>
                           </div>
                        </div>
                     </button>
                   ))}
                </div>

                <div className="pt-8 border-t border-slate-50 flex items-center justify-between px-4 opacity-50">
                   <div className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Hub Synchronized</span>
                   </div>
                   <p className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">Click segment for precise telemetry</p>
                </div>
             </div>
           </div>
        </div>
      </section>

      {/* 4. LEADERBOARD SECTION */}
      <section className="space-y-8">
        <div className="flex items-center gap-6">
           <h2 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-slate-900 flex-shrink-0">Elite Performance</h2>
           <div className="h-px flex-1 bg-slate-200"></div>
        </div>

        <div className="bg-slate-900 border border-white/5 p-8 md:p-14 rounded-[4rem] shadow-3xl relative overflow-hidden group">
           <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.03),transparent_70%)]"></div>
           
           <div className="flex flex-col md:flex-row justify-between items-center mb-16 relative z-10 px-4 gap-8">
              <div className="text-center md:text-left">
                <h4 className="text-2xl md:text-4xl font-black text-white uppercase italic tracking-[0.2em] mb-3 leading-none">Technician Excellence</h4>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest italic leading-none">Synchronized Merit Registry & Force Efficiency</p>
              </div>
              <div className="w-16 h-16 md:w-28 md:h-28 bg-slate-800 border border-white/10 text-amber-500 rounded-[2.5rem] flex items-center justify-center shadow-2xl group-hover:scale-110 group-hover:rotate-12 transition-all">
                <i className="fas fa-award text-3xl md:text-6xl animate-pulse"></i>
              </div>
           </div>

           <div className="grid grid-cols-1 gap-6 md:gap-8 relative z-10">
              {leaderboard.map((item, idx) => {
                const rankStyles = [
                  'from-amber-400/20 via-amber-600/5 to-transparent border-amber-500/20',
                  'from-slate-300/20 via-slate-500/5 to-transparent border-slate-400/20',
                  'from-orange-600/20 via-orange-800/5 to-transparent border-orange-700/20',
                  'from-slate-800 via-slate-800/50 to-transparent border-white/5',
                  'from-slate-800 via-slate-800/50 to-transparent border-white/5'
                ];
                return (
                  <div 
                    key={idx} 
                    className={`flex items-center justify-between p-6 md:p-10 bg-gradient-to-r ${rankStyles[idx]} rounded-[3rem] border backdrop-blur-md group/row hover:translate-x-2 hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)] transition-all duration-500`}
                  >
                     <div className="flex items-center gap-8 md:gap-14">
                        <div className="w-16 h-16 md:w-24 md:h-24 bg-slate-800 border border-white/5 rounded-3xl shadow-inner flex items-center justify-center font-black text-2xl md:text-5xl italic text-white/40 group-hover/row:text-white transition-all group-hover/row:rotate-3 group-hover/row:scale-110">
                           {idx + 1}
                        </div>
                        <div>
                           <p className="text-xl md:text-3xl font-black text-white uppercase italic tracking-widest group-hover/row:translate-x-1 transition-transform">{item.tech}</p>
                           <div className="flex gap-6 mt-4">
                              <div className="flex items-center gap-2.5">
                                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]"></div>
                                 <span className="text-[10px] md:text-xs font-black text-emerald-500 uppercase italic">+{item.merit} Merit</span>
                              </div>
                              <div className="flex items-center gap-2.5">
                                 <div className="w-2 h-2 bg-rose-500 rounded-full shadow-[0_0_10px_#f43f5e]"></div>
                                 <span className="text-[10px] md:text-xs font-black text-rose-500 uppercase italic">-{item.demerit} Demerit</span>
                              </div>
                           </div>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-4xl md:text-8xl font-black text-white italic tracking-tighter leading-none drop-shadow-2xl group-hover/row:scale-110 transition-transform">{item.score}</p>
                        <p className="text-[11px] md:text-sm font-black text-slate-500 uppercase tracking-[0.4em] mt-3 leading-none italic group-hover/row:text-amber-400 transition-colors">Performance Score</p>
                     </div>
                  </div>
                );
              })}
           </div>
        </div>
      </section>

      {/* FOOTER STRIP */}
      <div className="pt-20 border-t border-slate-200 flex flex-col items-center gap-10 opacity-60 hover:opacity-100 transition-opacity">
         <p className="text-[11px] md:text-sm font-black text-slate-400 uppercase tracking-[0.8em] italic text-center leading-relaxed">
           Executive Operations Suite &bull; Global Analytics Framework &bull; Release 24.5.1
         </p>
         <div className="flex gap-20 items-center">
            <div className="flex items-center gap-4 group cursor-pointer">
               <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_20px_#10b981] group-hover:scale-150 transition-transform"></div>
               <span className="text-[10px] md:text-xs font-black uppercase italic tracking-[0.4em] text-slate-500 group-hover:text-emerald-600 transition-colors">Core Secure</span>
            </div>
            <div className="flex items-center gap-4 group cursor-pointer">
               <div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse delay-150 shadow-[0_0_20px_#6366f1] group-hover:scale-150 transition-transform"></div>
               <span className="text-[10px] md:text-xs font-black uppercase italic tracking-[0.4em] text-slate-500 group-hover:text-indigo-600 transition-colors">Hub Synchronized</span>
            </div>
         </div>
      </div>
    </div>
  );
};

export default GlobalDashboardView;