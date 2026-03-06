
import React, { useMemo, useState } from 'react';
import { GlobalStatsResponse, Ticket } from '../types';
import GlobalTechPerformance from './GlobalTechPerformance';

interface Props {
  stats: GlobalStatsResponse | null;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

const GlobalDashboardView: React.FC<Props> = ({ stats }) => {
  const [complaintDrill, setComplaintDrill] = useState<'Launched' | 'Resolved' | 'WIP' | null>(null);
  const [omDrill, setOMDrill] = useState<{ type: 'Strategy' | 'SLA' | 'Overdue', monthIdx: number, subType?: string } | null>(null);
  const [seatingDrill, setSeatingDrill] = useState<string | null>(null);
  const [techDrill, setTechDrill] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number, y: number, title: string, main: string, sub: string, visible: boolean }>({ x: 0, y: 0, title: '', main: '', sub: '', visible: false });

  const CURRENT_YEAR = new Date().getFullYear();

  const parseHubDate = (dateStr: any) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };

  const isSlaBreached = (t: Ticket) => {
    const launched = parseHubDate(t.date);
    if (!launched) return false;
    const threshold = t.workType === 'Major' ? 168 : 24;
    const resolveTs = parseHubDate(t.resolutionTimestamp) || parseHubDate(t.adminReviewDate);
    if (!resolveTs) return false;
    const diffHrs = (resolveTs.getTime() - launched.getTime()) / (1000 * 3600);
    return diffHrs > threshold;
  };

  const getDaysOpen = (dateStr: any) => {
    const d = parseHubDate(dateStr);
    if (!d) return 0;
    return Math.floor((new Date().getTime() - d.getTime()) / (1000 * 3600 * 24));
  };

  const tickets = useMemo(() => {
    if (!stats?.allTickets || !Array.isArray(stats.allTickets)) return [];
    return stats.allTickets.filter(t => {
      const d = parseHubDate(t.date);
      return d && d.getFullYear() === CURRENT_YEAR;
    });
  }, [stats, CURRENT_YEAR]);

  const yearlyPerformance = useMemo(() => {
    const months = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(CURRENT_YEAR, i, 1);
      const mKey = d.toLocaleString('default', { month: 'short' });
      
      const monthly = tickets.filter(t => parseHubDate(t.date)?.getMonth() === i);
      const proactive = monthly.filter(t => t.complaintType === 'Proactive').length;
      const reactive = monthly.length - proactive;
      const resolved = monthly.filter(t => {
        const s = String(t.status || '').toLowerCase();
        const resBy = String(t.resolvedBy || '').trim();
        return s.includes('resolved') || s.includes('completed') || resBy !== '';
      });
      const breached = resolved.filter(t => isSlaBreached(t)).length;
      const overdue = monthly.filter(t => {
        const raised = parseHubDate(t.date);
        const s = String(t.status || '').toLowerCase();
        const isFinished = s.includes('resolved') || s.includes('completed');
        if (!raised || isFinished) return false;
        return (new Date().getTime() - raised.getTime()) / (1000 * 3600 * 24) > 7;
      }).length;

      months.push({
        month: mKey,
        monthIdx: i,
        total: monthly.length,
        proactive,
        reactive,
        resolved: resolved.length,
        withinSla: resolved.length - breached,
        breached,
        overdue,
        slaPct: resolved.length ? Math.round(((resolved.length - breached) / resolved.length) * 100) : 100
      });
    }
    return months;
  }, [tickets, CURRENT_YEAR]);

  const seatingStats = useMemo(() => {
    const seating = stats?.seatingData || [];
    const counts = { Occupied: 0, Temp: 0, Vacant: 0, OOO: 0 };
    seating.forEach(s => {
      const st = String(s.status || '').trim().toLowerCase();
      if (st === 'occupied') counts.Occupied++;
      else if (st.includes('temp') || st.includes('progress')) counts.Temp++;
      else if (st === 'vacant') counts.Vacant++;
      else counts.OOO++;
    });
    const total = Math.max(counts.Occupied + counts.Temp + counts.Vacant + counts.OOO, 1);
    return { ...counts, total };
  }, [stats]);

  const handleHover = (e: React.MouseEvent, title: string, main: string, sub: string) => {
    setTooltip({ x: e.clientX, y: e.clientY, title, main, sub, visible: true });
  };

  const handleOMToggle = (type: 'Strategy' | 'SLA' | 'Overdue', monthIdx: number, subType?: string) => {
    const isSame = (omDrill?.type === type && omDrill?.monthIdx === monthIdx && omDrill?.subType === subType);
    setOMDrill(isSame ? null : { type, monthIdx, subType });
    setComplaintDrill(null);
    setTechDrill(null);
    setSeatingDrill(null);
  };

  const detailTickets = useMemo(() => {
    if (complaintDrill) {
      return tickets.filter(t => {
        const s = String(t.status || '').toLowerCase();
        if (complaintDrill === 'Resolved') return s.includes('resolved') || s.includes('completed');
        if (complaintDrill === 'WIP') return !s.includes('resolved') && !s.includes('completed');
        return true;
      });
    }
    if (omDrill) {
      return tickets.filter(t => {
        const d = parseHubDate(t.date);
        const dateMatch = d && d.getMonth() === omDrill.monthIdx;
        if (!dateMatch) return false;
        if (omDrill.type === 'Strategy') return omDrill.subType === 'Proactive' ? t.complaintType === 'Proactive' : t.complaintType !== 'Proactive';
        if (omDrill.type === 'SLA') {
          const s = String(t.status || '').toLowerCase();
          const isFinished = s.includes('resolved') || s.includes('completed');
          if (!isFinished) return false;
          return omDrill.subType === 'Met' ? !isSlaBreached(t) : isSlaBreached(t);
        }
        if (omDrill.type === 'Overdue') {
          const s = String(t.status || '').toLowerCase();
          const isFinished = s.includes('resolved') || s.includes('completed');
          if (isFinished) return false;
          return (new Date().getTime() - d.getTime()) / (1000 * 3600 * 24) > 7;
        }
        return true;
      });
    }
    if (techDrill) {
      return tickets.filter(t => {
        const namePart = String(t.resolvedBy || t.assignedTo || '').split('•')[0].toLowerCase();
        return namePart.includes(techDrill.toLowerCase());
      });
    }
    return [];
  }, [tickets, complaintDrill, omDrill, techDrill]);

  const detailSeats = useMemo(() => {
    if (!seatingDrill) return [];
    return (stats?.seatingData || []).filter(s => {
      const st = String(s.status || '').toLowerCase();
      if (seatingDrill === 'Temp') return st.includes('temp') || st.includes('progress');
      if (seatingDrill === 'OOO') return !['occupied', 'vacant'].includes(st) && !st.includes('temp');
      return st === seatingDrill.toLowerCase();
    });
  }, [stats, seatingDrill]);

  const techLogsSorted = useMemo(() => {
    const logs = (stats?.allPerformanceLogs || []).reduce((acc: any[], curr) => {
      const existing = acc.find(t => t.name === curr.tech);
      if (existing) {
        if (curr.points > 0) existing.merit += curr.points;
        else existing.demerit += Math.abs(curr.points);
        existing.total = existing.merit - existing.demerit;
      } else acc.push({ name: curr.tech, merit: curr.points > 0 ? curr.points : 0, demerit: curr.points < 0 ? Math.abs(curr.points) : 0, total: curr.points });
      return acc;
    }, []);
    return logs.sort((a,b) => b.total - a.total).slice(0, 9);
  }, [stats]);

  const DrillDownRegistry = ({ type }: { type: 'tickets' | 'seating' }) => (
    <div className="mt-8 bg-slate-950 rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl animate-slideDown">
      <div className="p-6 border-b border-white/5 flex justify-between items-center">
        <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em] italic">Drill-Down Registry View</h4>
        <button onClick={() => { setComplaintDrill(null); setOMDrill(null); setTechDrill(null); setSeatingDrill(null); }} className="text-white/20 hover:text-white transition-colors"><i className="fas fa-times"></i></button>
      </div>
      <div className="overflow-x-auto max-h-[500px] hide-scroll">
        <table className="w-full text-left text-white border-collapse min-w-[900px]">
          <thead className="sticky top-0 bg-slate-900 z-10 border-b border-white/5">
            <tr>
              {type === 'seating' ? (
                ['Seat ID', 'Location', 'Floor', 'Status'].map(h => <th key={h} className="py-5 px-6 text-[9px] font-black uppercase tracking-widest text-white/40 italic">{h}</th>)
              ) : (
                ['WO ID', 'Asset Tag', 'Location', 'Narrative', 'Date', 'Age', 'Status', 'Technician'].map(h => <th key={h} className="py-5 px-6 text-[9px] font-black uppercase tracking-widest text-white/40 italic">{h}</th>)
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {type === 'seating' ? detailSeats.map((item, i) => (
              <tr key={i} className="hover:bg-white/5 transition-colors">
                <td className="py-4 px-6 font-black italic text-[12px] text-indigo-400">{item.seatCode}</td>
                <td className="py-4 px-6 text-[10px] text-slate-400 italic font-bold uppercase">{item.campusCode} - {item.roomTag}</td>
                <td className="py-4 px-6 text-[11px] font-black uppercase">{item.floorTag}</td>
                <td className="py-4 px-6">
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full italic uppercase ${String(item.status || '').toLowerCase() === 'vacant' ? 'bg-emerald-50/20 text-emerald-400' : 'bg-orange-50/20 text-orange-400'}`}>{item.status}</span>
                </td>
              </tr>
            )) : detailTickets.map((item, i) => (
              <tr key={i} className="hover:bg-white/5 transition-colors">
                <td className="py-4 px-6 font-black italic text-[11px] text-indigo-400">#{item.rowIndex}</td>
                <td className="py-4 px-6 font-black italic text-[11px] text-indigo-400">{item.assetTag || 'N/A'}</td>
                <td className="py-4 px-6 text-[10px] text-slate-400 italic font-bold uppercase truncate max-w-[150px]">{item.location}</td>
                <td className="py-4 px-6 text-[11px] font-medium truncate max-w-xs italic">"{item.details}"</td>
                <td className="py-4 px-6 text-[10px] text-slate-500 font-bold">{new Date(item.date).toLocaleDateString()}</td>
                <td className="py-4 px-6 font-black uppercase text-[10px] text-indigo-300">{getDaysOpen(item.date)} Days</td>
                <td className="py-4 px-6">
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full italic uppercase ${String(item.status || '').toLowerCase().includes('resolved') || String(item.status || '').toLowerCase().includes('completed') ? 'bg-emerald-50/20 text-emerald-400' : 'bg-rose-50/20 text-rose-400'}`}>{item.status}</span>
                </td>
                <td className="py-4 px-6 font-black uppercase text-[10px]">
                  <div className="flex flex-col">
                    <span>{String(item.resolvedBy || item.assignedTo || 'Unassigned').split('•')[0].trim()}</span>
                    {(item.resolvedDate || String(item.resolvedBy || '').includes('•')) && (
                      <span className="text-[7px] text-slate-500 font-bold lowercase italic">
                        {item.resolvedDate ? `${item.resolvedDate} ${item.resolvedTime}` : String(item.resolvedBy || '').split('•')[1]?.trim()}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-10 space-y-16 animate-fadeIn max-w-[1600px] mx-auto pb-40 relative min-h-screen">
      
      {/* SECTION 1: COMPLAINT ANALYTICS */}
      <section className="space-y-6">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900">Complaint Analytics</h2>
          <div className="h-px flex-1 bg-slate-200"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { id: 'Launched', label: 'Launched Complaints', val: tickets.length, color: 'indigo', icon: 'file-invoice' },
            { id: 'Resolved', label: 'Resolved (Final)', val: tickets.filter(t => {
              const s = String(t.status || '').toLowerCase();
              const resBy = String(t.resolvedBy || '').trim();
              return s.includes('resolved') || s.includes('completed') || resBy !== '';
            }).length, color: 'emerald', icon: 'check-double' },
            { id: 'WIP', label: 'Work In Progress (WIP)', val: tickets.filter(t => {
              const s = String(t.status || '').toLowerCase();
              const resBy = String(t.resolvedBy || '').trim();
              return !s.includes('resolved') && !s.includes('completed') && resBy === '';
            }).length, color: 'amber', icon: 'clock' }
          ].map(kpi => (
            <button key={kpi.id} onClick={() => { setComplaintDrill(complaintDrill === kpi.id ? null : kpi.id as any); setOMDrill(null); setTechDrill(null); setSeatingDrill(null); }} className={`bg-white p-8 rounded-[2.5rem] border transition-all text-left relative group shadow-sm hover:shadow-xl ${complaintDrill === kpi.id ? 'ring-2 ring-indigo-600' : 'border-slate-100'}`}>
              <div className="flex justify-between items-start mb-6">
                <p className={`text-[10px] font-black uppercase tracking-widest italic ${complaintDrill === kpi.id ? 'text-indigo-600' : 'text-slate-400'}`}>{kpi.label}</p>
                <div className={`w-12 h-12 bg-${kpi.color}-50 text-${kpi.color}-600 rounded-2xl flex items-center justify-center text-xl group-hover:bg-${kpi.color}-600 group-hover:text-white transition-all`}><i className={`fas fa-${kpi.icon}`}></i></div>
              </div>
              <h3 className="text-5xl font-black italic tracking-tighter text-slate-900">{kpi.val}</h3>
            </button>
          ))}
        </div>
        {complaintDrill && <DrillDownRegistry type="tickets" />}
      </section>

      {/* SECTION 2: OPERATION & MAINTENANCE */}
      <section className="space-y-8">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900">Operation & Maintenance</h2>
          <div className="h-px flex-1 bg-slate-200"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col h-[440px] overflow-hidden">
              <h4 className="text-[11px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-1">Maintenance Strategy Mix</h4>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic mb-10">Blue: Proactive • Black: Reactive</p>
              <div className="flex-1 flex items-end justify-between gap-2 px-1">
                 {yearlyPerformance.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-3 h-full justify-end group">
                       <div className="relative w-full flex flex-col h-full gap-0.5 rounded-t-lg overflow-hidden bg-slate-50" style={{ height: `${Math.max((d.total / Math.max(...yearlyPerformance.map(x => x.total), 1)) * 100, 5)}%` }}>
                          <button 
                            onMouseEnter={(e) => handleHover(e, "Reactive Strategy", `${d.reactive} of ${d.total}`, `${d.reactive} reactive work orders raised in ${d.month}, out of ${d.total} total.`)}
                            onMouseLeave={() => setTooltip(p => ({ ...p, visible: false }))}
                            onClick={() => handleOMToggle('Strategy', d.monthIdx, 'Reactive')} 
                            className="w-full bg-black hover:opacity-80 transition-all border-none p-0 cursor-pointer" style={{ height: `${(d.reactive / (d.total || 1)) * 100}%` }}></button>
                          <button 
                            onMouseEnter={(e) => handleHover(e, "Proactive Strategy", `${d.proactive} of ${d.total}`, `${d.proactive} proactive work orders raised in ${d.month}, out of ${d.total} total.`)}
                            onMouseLeave={() => setTooltip(p => ({ ...p, visible: false }))}
                            onClick={() => handleOMToggle('Strategy', d.monthIdx, 'Proactive')} 
                            className="w-full bg-indigo-600 hover:opacity-80 transition-all border-none p-0 cursor-pointer" style={{ height: `${(d.proactive / (d.total || 1)) * 100}%` }}></button>
                       </div>
                       <span className="text-[8px] font-black uppercase text-slate-300">{d.month}</span>
                    </div>
                 ))}
              </div>
           </div>

           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col h-[440px] overflow-hidden">
              <h4 className="text-[11px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-1">Work Order Aging & SLA</h4>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic mb-10">Green: Met • Red: Breached</p>
              <div className="flex-1 flex items-end justify-between gap-2 px-1">
                 {yearlyPerformance.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-3 h-full justify-end group">
                       <div className="relative w-full flex flex-col h-full gap-0.5 rounded-t-lg overflow-hidden bg-slate-50" style={{ height: `${Math.max((d.resolved / Math.max(...yearlyPerformance.map(x => x.resolved), 1)) * 100, 5)}%` }}>
                          <button 
                            onMouseEnter={(e) => handleHover(e, "SLA Breached", `${d.breached} of ${d.resolved}`, `${d.breached} work orders breached SLA in ${d.month}, out of ${d.resolved} resolved total.`)}
                            onMouseLeave={() => setTooltip(p => ({ ...p, visible: false }))}
                            onClick={() => handleOMToggle('SLA', d.monthIdx, 'Breached')} 
                            className="w-full bg-rose-500 hover:opacity-80 transition-all border-none p-0 cursor-pointer" style={{ height: `${(d.breached / (d.resolved || 1)) * 100}%` }}></button>
                          <button 
                            onMouseEnter={(e) => handleHover(e, "SLA Met", `${d.withinSla} of ${d.resolved}`, `${d.withinSla} work orders met SLA in ${d.month}, out of ${d.resolved} resolved total.`)}
                            onMouseLeave={() => setTooltip(p => ({ ...p, visible: false }))}
                            onClick={() => handleOMToggle('SLA', d.monthIdx, 'Met')} 
                            className="w-full bg-emerald-500 hover:opacity-80 transition-all border-none p-0 cursor-pointer" style={{ height: `${(d.withinSla / (d.resolved || 1)) * 100}%` }}></button>
                       </div>
                       <span className="text-[8px] font-black uppercase text-slate-300">{d.month}</span>
                    </div>
                 ))}
              </div>
           </div>

           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col h-[440px] overflow-hidden">
              <h4 className="text-[11px] font-black text-slate-950 uppercase italic tracking-[0.2em] mb-1">% Overdue Work Orders</h4>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic mb-10">Critical Integrity (&gt;7 Days)</p>
              <div className="flex-1 flex items-end justify-between gap-2 px-1">
                 {yearlyPerformance.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-3 h-full justify-end group">
                       <button 
                          onMouseEnter={(e) => handleHover(e, "Critical Overdue", `${d.overdue} of ${d.total}`, `${d.overdue} critical age work orders (>7 days) in ${d.month}, out of ${d.total} active total.`)}
                          onMouseLeave={() => setTooltip(p => ({ ...p, visible: false }))}
                          onClick={() => handleOMToggle('Overdue', d.monthIdx)} 
                          className={`w-full rounded-t-lg transition-all border-none p-0 cursor-pointer ${d.overdue > 0 ? 'bg-rose-600' : 'bg-slate-50'}`} style={{ height: `${Math.max((d.overdue / Math.max(...yearlyPerformance.map(x => x.overdue), 1)) * 100, 5)}%` }}></button>
                       <span className="text-[8px] font-black uppercase text-slate-300">{d.month}</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>
        {omDrill && <DrillDownRegistry type="tickets" />}
      </section>

      {/* SECTION 3: SEATING OCCUPANCY */}
      <section className="space-y-8 animate-slideUp">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900">Seating Occupancy</h2>
          <div className="h-px flex-1 bg-slate-200"></div>
        </div>
        <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-xl flex flex-col lg:flex-row items-center gap-16 relative overflow-hidden h-auto min-h-[500px]">
           <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/5 blur-[100px] pointer-events-none"></div>
           <div className="relative">
              <svg width="340" height="340" viewBox="0 0 200 200" className="transform rotate-[-90deg] overflow-visible">
                {(() => {
                  const segments = [
                    { label: 'Occupied', key: 'Occupied', val: seatingStats.Occupied, color: '#f97316' },
                    { label: 'Temp Occup', key: 'Temp', val: seatingStats.Temp, color: '#a855f7' },
                    { label: 'Vacant', key: 'Vacant', val: seatingStats.Vacant, color: '#14b8a6' },
                    { label: 'OOO', key: 'OOO', val: seatingStats.OOO, color: '#94a3b8' }
                  ];
                  const circum = 2 * Math.PI * 70;
                  let currOffset = 0;
                  return segments.map((s) => {
                    if (s.val <= 0) return null;
                    const dash = (s.val / seatingStats.total) * circum;
                    const strokeOffset = -currOffset;
                    currOffset += dash;
                    return (
                      <circle key={s.key} cx="100" cy="100" r="70" fill="transparent" stroke={s.color} strokeWidth="44" strokeDasharray={`${dash} ${circum}`} strokeDashoffset={strokeOffset} className="cursor-pointer transition-all hover:stroke-width-[50px]" onClick={() => { setSeatingDrill(seatingDrill === s.key ? null : s.key); setComplaintDrill(null); setOMDrill(null); setTechDrill(null); }} />
                    );
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-6xl font-black text-slate-950 italic tracking-tighter leading-none">{seatingStats.total}</span>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-3 italic">Total Units</p>
              </div>
           </div>
           <div className="flex-1 w-full grid grid-cols-2 gap-4">
              {[
                { label: 'Occupied', val: seatingStats.Occupied, color: 'bg-orange-500', key: 'Occupied' },
                { label: 'Temp Occup', val: seatingStats.Temp, color: 'bg-purple-500', key: 'Temp' },
                { label: 'Vacant', val: seatingStats.Vacant, color: 'bg-teal-500', key: 'Vacant' },
                { label: 'OOO / Maint', val: seatingStats.OOO, color: 'bg-slate-400', key: 'OOO' }
              ].map(s => (
                <button key={s.key} onClick={() => { setSeatingDrill(seatingDrill === s.key ? null : s.key); setComplaintDrill(null); setOMDrill(null); setTechDrill(null); }} className={`p-6 rounded-[2rem] border transition-all text-left ${seatingDrill === s.key ? 'bg-slate-900 text-white' : 'bg-slate-50 border-slate-100 hover:bg-white'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${s.color}`}></div>
                    <span className={`text-[9px] font-black uppercase italic ${seatingDrill === s.key ? 'text-white' : 'text-slate-950'}`}>{s.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black italic">{s.val}</span>
                    <span className="text-[10px] opacity-40 font-bold italic">{Math.round((s.val / seatingStats.total) * 100)}%</span>
                  </div>
                </button>
              ))}
           </div>
        </div>
        {seatingDrill && <DrillDownRegistry type="seating" />}
      </section>

      {/* SECTION 4: EXCELLENCE HUB */}
      <section className="space-y-8">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900">Excellence Hub</h2>
          <div className="h-px flex-1 bg-slate-200"></div>
        </div>
        <div className="bg-slate-950 p-12 rounded-[4rem] shadow-3xl border border-white/5 relative overflow-hidden">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
              {techLogsSorted.map((s, i) => (
                <button key={s.name} onClick={() => { setTechDrill(techDrill === s.name ? null : s.name); setComplaintDrill(null); setOMDrill(null); setSeatingDrill(null); }} className={`border p-6 rounded-[2.5rem] flex items-center justify-between transition-all group ${techDrill === s.name ? 'bg-white/20 border-white/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-white/5 border border-white/5 text-slate-500 italic shadow-inner">{i + 1}</div>
                      <div className="text-left">
                         <h4 className="font-black uppercase text-[12px] tracking-wider text-white italic leading-none">{s.name}</h4>
                         <div className="flex gap-2 mt-2">
                            <span className="text-[7px] font-black text-emerald-400">+{s.merit} M</span>
                            <span className="text-[7px] font-black text-rose-400">-{s.demerit} D</span>
                         </div>
                      </div>
                   </div>
                   <div className="text-right">
                      <span className="text-3xl font-black text-white italic tracking-tighter leading-none">{s.total}</span>
                   </div>
                </button>
              ))}
           </div>
        </div>
        {techDrill && <DrillDownRegistry type="tickets" />}
      </section>

      {/* SECTION 5: TECHNICIAN PERFORMANCE & OCCUPANCY */}
      <section className="space-y-8">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900">Technician Performance & Occupancy</h2>
          <div className="h-px flex-1 bg-slate-200"></div>
        </div>
        <GlobalTechPerformance stats={stats} />
      </section>

      {/* Tooltip implementation remains fixed and non-conditional for React 19 stability */}
      <div 
        className={`fixed z-[9999] pointer-events-none transition-opacity duration-200 ${tooltip.visible ? 'opacity-100' : 'opacity-0'}`} 
        style={{ 
          left: `${tooltip.x + 15}px`, 
          top: `${tooltip.y - 10}px`,
          transform: 'translate3d(0, 0, 0)'
        }}
      >
         <div className="bg-slate-900/95 backdrop-blur-md border border-white/10 p-3 rounded-xl shadow-2xl text-center">
            <p className="text-[9px] font-black text-indigo-400 uppercase mb-1">{tooltip.title}</p>
            <p className="text-xl font-black text-white">{tooltip.main}</p>
            <p className="text-[8px] text-white/70 italic mt-2 max-w-[180px]">{tooltip.sub}</p>
         </div>
      </div>
    </div>
  );
};

export default GlobalDashboardView;
