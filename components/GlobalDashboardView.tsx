
import React, { useState, useMemo } from 'react';
import { GlobalStatsResponse, Ticket, Seat } from '../types.ts';
import { TECHNICIANS, ELECTRICAL_TECHNICIANS, GM_TECHNICIANS } from '../constants.ts';
import { resetLeaderboard } from '../services/api.ts';

interface Props {
  stats: GlobalStatsResponse | null;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

const GlobalDashboardView: React.FC<Props> = ({ stats, onRefresh, showToast }) => {
  const [resetClicks, setResetClicks] = useState(0);
  const [hoveredData, setHoveredData] = useState<any>(null);

  const CURRENT_YEAR = new Date().getFullYear();
  const DATA_START_DATE = new Date(`${CURRENT_YEAR}-01-01T00:00:00`);

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

  const kpiMetrics = useMemo(() => {
    const total = tickets.length;
    const resolved = tickets.filter(t => ['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status)).length;
    const uptimePct = total > 0 ? parseFloat(((resolved / total) * 100).toFixed(1)) : 100;
    return { total, resolved, pending: total - resolved, uptimePct };
  }, [tickets]);

  const agingData = useMemo(() => {
    return YEAR_MONTHS.map(m => {
      const monthly = tickets.filter(t => parseHubDate(t.date)?.getMonth() === m.monthIdx);
      const buckets = [
        { label: 'Minor (>24h)', count: 0, color: 'bg-indigo-500' },
        { label: 'Major (>7d)', count: 0, color: 'bg-rose-600' }
      ];
      monthly.forEach(t => {
        const raised = parseHubDate(t.date);
        if (!raised) return;
        const resMatch = t.resolvedBy?.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
        const completionDate = resMatch ? new Date(resMatch[0]) : new Date();
        const diffDays = (completionDate.getTime() - raised.getTime()) / (1000 * 3600 * 24);
        if (diffDays > 7) buckets[1].count++;
        else if (diffDays > 1) buckets[0].count++;
      });
      const max = Math.max(...buckets.map(b => b.count), 1);
      return { month: m.key, buckets: buckets.map(b => ({ ...b, pct: (b.count / max) * 100 })) };
    });
  }, [tickets, YEAR_MONTHS]);

  const overdueTrend = useMemo(() => {
    return YEAR_MONTHS.map(m => {
      const monthly = tickets.filter(t => parseHubDate(t.date)?.getMonth() === m.monthIdx);
      const overdue = monthly.filter(t => {
        const d = parseHubDate(t.date);
        if (!d) return false;
        const age = (new Date().getTime() - d.getTime()) / (1000 * 3600 * 24);
        return age >= 7 && !['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status);
      }).length;
      return { label: m.key, val: monthly.length > 0 ? Math.round((overdue / monthly.length) * 100) : 0 };
    });
  }, [tickets, YEAR_MONTHS]);

  const mixData = useMemo(() => {
    return YEAR_MONTHS.map(m => {
      const monthly = tickets.filter(t => parseHubDate(t.date)?.getMonth() === m.monthIdx);
      const proactive = monthly.filter(t => t.complaintType === 'Proactive' || (t.details || '').toUpperCase().includes('[CHECKLIST FAILURE]')).length;
      const reactive = monthly.length - proactive;
      const total = monthly.length || 1;
      return { label: m.key, pPct: (proactive / total) * 100, rPct: (reactive / total) * 100, pCount: proactive, rCount: reactive };
    });
  }, [tickets, YEAR_MONTHS]);

  const seatingStats = useMemo(() => {
    const counts = { 'Vacant': 0, 'Occupied': 0, 'Temp': 0, 'OOO': 0 };
    seating.forEach(s => {
      if (s.status === 'Vacant') counts.Vacant++;
      else if (s.status === 'Occupied') counts.Occupied++;
      else if (s.status === 'Temp Occup' || s.status?.toLowerCase().includes('progress')) counts.Temp++;
      else if (s.status === 'OOO' || s.status?.toLowerCase().includes('maintenance')) counts.OOO++;
    });
    return { ...counts, total: Math.max(1, counts.Vacant + counts.Occupied + counts.Temp + counts.OOO) };
  }, [seating]);

  const leaderboard = useMemo(() => {
    const all = [...new Set([...TECHNICIANS, ...ELECTRICAL_TECHNICIANS, ...GM_TECHNICIANS])];
    return all.map(t => ({ name: t, points: logs.filter(l => l.tech === t).reduce((a, c) => a + c.points, 0) }))
      .sort((a, b) => b.points - a.points).slice(0, 5);
  }, [logs]);

  return (
    <div className="max-w-[1600px] mx-auto p-4 lg:p-10 space-y-10 animate-fadeIn pb-40">
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-950 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl h-44 flex flex-col justify-center relative overflow-hidden transition-all hover:scale-[1.02]">
           <p className="text-[8px] font-black uppercase tracking-[0.4em] text-teal-400 mb-2 italic">Actual Facility Up Time</p>
           <h3 className="text-6xl font-black text-white italic tracking-tighter leading-none">{kpiMetrics.uptimePct}%</h3>
           <p className="text-[6px] text-white/30 font-bold uppercase tracking-widest mt-4 italic">{CURRENT_YEAR} Annual Cycle</p>
        </div>
        {[
          { l: 'Total Force Activity', v: kpiMetrics.total, i: 'layer-group' },
          { l: 'Active Deployment Backlog', v: kpiMetrics.pending, i: 'satellite-dish' },
          { l: 'Verified Technical Closures', v: kpiMetrics.resolved, i: 'shield-check' }
        ].map((b, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl h-44 flex flex-col justify-center transition-all hover:scale-[1.02] relative overflow-hidden">
            <p className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-400 mb-2 italic">{b.l}</p>
            <h3 className="text-5xl font-black text-slate-900 italic tracking-tighter leading-none">{b.v}</h3>
            <i className={`fas fa-${b.i} absolute -bottom-6 -right-6 text-8xl text-slate-50 opacity-50`}></i>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl relative h-[480px] group">
          <h4 className="text-[12px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-10">Work Order Aging</h4>
          <div className="h-64 flex items-end justify-between px-2 pb-6 border-b border-slate-100 overflow-x-auto hide-scroll">
            {agingData.map((d, i) => (
              <div key={i} className="flex flex-col items-center flex-1 min-w-[40px] mx-1 h-full justify-end relative">
                <div className="w-full bg-slate-50 rounded-t-lg overflow-hidden h-full flex flex-col justify-end border border-slate-100">
                  {d.buckets.map((b, idx) => (
                    <div key={idx} className={`w-full transition-all duration-700 ${b.color} hover:brightness-125 cursor-pointer`} style={{ height: `${b.pct / 2}%` }} onMouseEnter={() => setHoveredData({ m: d.month, l: b.label, c: b.count })} onMouseLeave={() => setHoveredData(null)}></div>
                  ))}
                </div>
                <span className="mt-6 text-[7px] font-black text-slate-400 uppercase italic tracking-widest">{d.month}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl relative h-[480px]">
          <h4 className="text-[12px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-10">% Overdue Work Orders (>7 Days)</h4>
          <div className="h-64 flex items-center justify-between px-10 relative border-l border-b border-slate-100/50">
            <svg className="absolute inset-0 w-full h-full p-10 overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d={overdueTrend.map((d, i) => `${i === 0 ? 'M' : 'L'} ${(i / (overdueTrend.length - 1)) * 100} ${100 - d.val}`).join(' ')} fill="none" stroke="#14b8a6" strokeWidth="2.5" strokeLinecap="round" className="transition-all duration-1000" />
            </svg>
            {overdueTrend.map((d, i) => (
              <div key={i} className="flex flex-col items-center flex-1 h-full justify-end relative">
                 <div className="absolute font-black text-[9px] text-teal-600" style={{ bottom: `${d.val}%`, transform: 'translateY(-15px)' }}>{d.val}%</div>
                 <span className="text-[7px] font-black text-slate-400 uppercase italic tracking-widest">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-xl overflow-hidden">
         <h4 className="text-[14px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-10">Maintenance Strategic Mix</h4>
         <div className="h-72 flex items-end justify-between px-10 pb-8 border-b border-slate-100">
            {mixData.map((d, i) => (
              <div key={i} className="flex flex-col items-center flex-1 mx-3 h-full justify-end group">
                 <div className="w-full max-w-[60px] flex flex-col justify-end h-full rounded-t-2xl overflow-hidden border border-slate-50">
                    <div className="bg-slate-900 transition-all hover:brightness-125" style={{ height: `${d.rPct}%` }} onMouseEnter={() => setHoveredData({m:d.label, l:'Reactive', c:d.rCount})} onMouseLeave={()=>setHoveredData(null)}></div>
                    <div className="bg-indigo-500 transition-all hover:brightness-125" style={{ height: `${d.pPct}%` }} onMouseEnter={() => setHoveredData({m:d.label, l:'Proactive', c:d.pCount})} onMouseLeave={()=>setHoveredData(null)}></div>
                 </div>
                 <span className="mt-8 text-[9px] font-black text-slate-400 uppercase italic tracking-widest">{d.label}</span>
              </div>
            ))}
         </div>
      </section>

      <section className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-2xl flex flex-col lg:flex-row items-center gap-16 relative overflow-hidden">
         <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/5 blur-[100px]"></div>
         <div className="flex-1 space-y-8 text-center lg:text-left">
            <h4 className="text-[18px] font-black text-slate-950 uppercase italic tracking-[0.3em] leading-none">Occupancy Command Hub</h4>
            <div className="grid grid-cols-2 gap-4">
               {[{l:'Occupied',v:seatingStats.Occupied,c:'bg-orange-500'},{l:'Vacant',v:seatingStats.Vacant,c:'bg-teal-500'},{l:'Temp',v:seatingStats.Temp,c:'bg-purple-500'},{l:'OOO',v:seatingStats.OOO,c:'bg-slate-400'}].map(s=>(
                 <div key={s.l} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-white transition-all">
                    <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${s.c}`}></div><span className="text-[9px] font-black text-slate-400 uppercase italic tracking-widest">{s.l}</span></div>
                    <span className="text-xl font-black text-slate-950 italic tracking-tighter">{s.v}</span>
                 </div>
               ))}
            </div>
         </div>
         <div className="relative group flex-shrink-0">
            <svg width="220" height="220" viewBox="0 0 120 120" className="transform rotate-[-90deg]">
               <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" strokeWidth="12" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
               <span className="text-5xl font-black text-slate-950 italic tracking-tighter leading-none">{seatingStats.total}</span>
               <span className="text-[9px] font-black text-slate-300 uppercase mt-3 italic tracking-widest">Units</span>
            </div>
         </div>
      </section>

      <section className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-2xl">
         <div className="flex justify-between items-center mb-12">
            <h4 className="text-[16px] font-black text-slate-950 uppercase italic tracking-[0.3em]">Specialist Force Ranking</h4>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {leaderboard.map((tech, i) => (
              <div key={i} className="bg-slate-50/50 p-8 rounded-[3rem] flex flex-col items-center text-center border border-slate-100 transition-all hover:bg-white hover:shadow-2xl group hover:-translate-y-2">
                 <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center font-black text-2xl shadow-inner group-hover:bg-slate-950 group-hover:text-white transition-all mb-6">{tech.name[0]}</div>
                 <p className="text-[13px] font-black text-slate-950 uppercase italic tracking-tight mb-2 leading-none">{tech.name}</p>
                 <div className="w-full pt-6 border-t border-slate-100">
                    <span className="text-4xl font-black text-slate-950 italic tracking-tighter leading-none">{tech.points}</span>
                    <p className="text-[8px] font-black text-slate-300 uppercase mt-2 italic tracking-widest">Merits</p>
                 </div>
              </div>
            ))}
         </div>
      </section>

      {hoveredData && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-950/90 text-white p-6 rounded-[2.5rem] shadow-3xl z-[1000] border border-white/10 flex items-center gap-6 animate-slideUp backdrop-blur-xl">
           <div className="w-3 h-3 bg-teal-400 rounded-full animate-pulse"></div>
           <div>
              <p className="text-[8px] font-black uppercase text-white/40 tracking-[0.4em] mb-1 italic">Telemetry Insight</p>
              <p className="text-[14px] font-black italic uppercase tracking-tight">{hoveredData.m} • {hoveredData.l}: <span className="text-teal-300 ml-2">{hoveredData.c} Data Points</span></p>
           </div>
        </div>
      )}
    </div>
  );
};

export default GlobalDashboardView;
