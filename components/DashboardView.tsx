import React, { useState, useMemo, useEffect } from 'react';
import { Asset, Ticket, StatsResponse, FMCategory } from '../types.ts';
import GasStatus from './GasStatus.tsx';
import LeaderboardItem from './LeaderboardItem.tsx';
import { updateAssetStatus, getReport, resetLeaderboard, logInsight } from '../services/api.ts';

interface Props {
  category: FMCategory;
  assets: Asset[];
  tickets: Ticket[];
  stats: StatsResponse | null; 
  onRefresh: () => void;
  onViewTech: () => void;
}

const resolveStatusLabel = (status: any) => {
  const s = String(status || '').trim();
  const map: Record<string, string> = {
    '1': 'Open',
    '2': 'In Progress',
    '3': 'On Hold',
    '4': 'Pending',
    '5': 'Completed'
  };
  return map[s] || status;
};

const DashboardView: React.FC<Props> = ({ category, assets, tickets, stats, onRefresh, onViewTech }) => {
  const [isInsightsOpen, setIsInsightsOpen] = useState(true);
  const [openAlertCat, setOpenAlertCat] = useState<string | null>(null);
  const [historyType, setHistoryType] = useState<'complaint' | 'checklist'>('checklist');
  const [dateRange, setDateRange] = useState<{start: string, end: string}>({ 
    start: new Date(new Date().setDate(new Date().getDate() - 14)).toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<{title: string, data: Asset[], color: string} | null>(null);
  const [processingInsight, setProcessingInsight] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [shufflingTag, setShufflingTag] = useState<string | null>(null);
  const [resetClicks, setResetClicks] = useState(0);
  const [proofImage, setProofImage] = useState<string | null>(null);

  const parseHubDate = (dateStr: any) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };

  const assetGroups = useMemo(() => {
    const active = assets.filter(a => a.status === 'Active');
    const maint = assets.filter(a => a.status === 'Maintenance');
    const spare = assets.filter(a => a.status === 'Spare');
    const waiting = assets.filter(a => a.status === 'Waiting for Disposal');
    const disposed = assets.filter(a => a.status === 'Disposed');
    return { active, maint, spare, waiting, disposed, installedTotal: active.length + maint.length + spare.length + waiting.length };
  }, [assets]);

  const insights = useMemo(() => {
    const handled = (stats?.acknowledgedInsights || []) as {tag: string, type: string}[];
    
    const lifeAlerts = assets.filter(a => {
      const isHandled = handled.some(h => h.tag === a.tag && h.type.includes('Life'));
      return !isHandled && a.year && (new Date().getFullYear() - Number(a.year)) >= 5;
    });

    const faultCounts: Record<string, number> = {};
    tickets.forEach(t => { 
      if(t.assetTag) faultCounts[t.assetTag] = (faultCounts[t.assetTag] || 0) + 1 
    });

    const recurring = Object.keys(faultCounts)
      .filter(tag => faultCounts[tag] >= 3)
      .map(tag => assets.find(a => a.tag === tag))
      .filter(Boolean)
      .filter(a => {
        const isHandled = handled.some(h => h.tag === (a as Asset).tag && h.type.includes('Recurring'));
        return !isHandled;
      }) as Asset[];

    return { lifeAlerts, recurring };
  }, [assets, tickets, stats]);

  const archiveSummary = useMemo(() => {
    if (historyType !== 'complaint') return {};
    const groups: Record<string, { entries: any[] }> = {};
    historyData.forEach(item => {
      const ts = item[0] || item.Timestamp || item.date;
      const d = parseHubDate(ts);
      if (!d) return;
      const dateKey = d.toLocaleDateString('en-CA');
      if (!groups[dateKey]) groups[dateKey] = { entries: [] };
      groups[dateKey].entries.push(item);
    });
    return groups;
  }, [historyData, historyType]);

  const checklistAnalysis = useMemo(() => {
    if (historyType !== 'checklist') return { completeDays: [], missedDays: [] };
    
    const operationalAssets = assets.filter(a => {
      const s = String(a.status || '').trim().toUpperCase();
      return s === 'ACTIVE' || s === 'MAINTENANCE';
    });
    
    const groups: Record<string, { entries: any[], doneUniqueIDs: Set<string> }> = {};
    
    historyData.forEach(item => {
      const ts = item[0] || item.Timestamp;
      const d = parseHubDate(ts);
      if (!d) return;
      const dateKey = d.toLocaleDateString('en-CA');
      if (!groups[dateKey]) groups[dateKey] = { entries: [], doneUniqueIDs: new Set() };
      (groups[dateKey].entries as any).push(item as any);
      const rawTag = String(item[2] || item.AssetTag || '').trim().toUpperCase();
      if (category.id === 'electrical') groups[dateKey].doneUniqueIDs.add(rawTag.split('_')[0]);
      else groups[dateKey].doneUniqueIDs.add(rawTag);
    });

    const completeDays: any[] = [];
    const missedDays: any[] = [];
    Object.entries(groups).forEach(([date, meta]) => {
      let totalReq = operationalAssets.length;
      if (category.id === 'electrical') totalReq = 10; 
      const doneCount = category.id === 'electrical' 
        ? meta.doneUniqueIDs.size 
        : operationalAssets.filter(a => meta.doneUniqueIDs.has(String(a.tag).trim().toUpperCase())).length;
      const isComplete = doneCount >= totalReq;
      const missedAssets = category.id === 'electrical' ? [] : operationalAssets.filter(a => !meta.doneUniqueIDs.has(String(a.tag).trim().toUpperCase()));
      const result = { date, entries: meta.entries, doneCount, totalRequired: totalReq, missedAssets };
      if (isComplete) completeDays.push(result); else missedDays.push(result);
    });
    return { completeDays: completeDays.sort((a,b) => b.date.localeCompare(a.date)), missedDays: missedDays.sort((a,b) => b.date.localeCompare(a.date)) };
  }, [historyData, assets, historyType, category.id]);

  const fetchHistory = async () => {
    setIsFetchingHistory(true);
    try {
      const data = await getReport(category.id, historyType as 'complaint' | 'checklist', dateRange.start, dateRange.end);
      setHistoryData(data || []);
    } catch (e) { console.error(e); }
    finally { setIsFetchingHistory(false); }
  };

  useEffect(() => { fetchHistory(); }, [category.id, historyType, dateRange.start, dateRange.end]);

  const handleShuffle = async (tag: string, newStatus: string) => {
    setShufflingTag(tag);
    setTimeout(async () => {
      await updateAssetStatus(category.id, tag, newStatus);
      setShufflingTag(null);
      onRefresh();
    }, 1000);
  };

  const handleResetTrigger = async () => {
    const next = resetClicks + 1;
    if (next >= 5) {
      if (window.confirm(`Reset ${category.name} Leaderboard?`)) {
        await resetLeaderboard(category.id);
        onRefresh();
      }
      setResetClicks(0);
    } else {
      setResetClicks(next);
      setTimeout(() => setResetClicks(0), 2000);
    }
  };

  const handleAcknowledge = async (asset: Asset, cat: string) => {
    setProcessingInsight(asset.tag);
    try {
      await logInsight(category.id, asset.tag, cat, `Acknowledged by Hub Command`);
      onRefresh();
    } catch (e) { console.error("Ack Error:", e); } 
    finally { setProcessingInsight(null); }
  };

  const handleExportCSV = () => {
    if (!historyData || historyData.length === 0) return;
    const headers = historyType === 'complaint' ? "Timestamp,Category,Location,Asset,Details,Assigned,Status,Remarks\n" : "Timestamp,Technician,Asset,Task,Status,Remarks,Proof\n";
    const rows = historyData.map(e => {
      const row = typeof e === 'object' && e !== null ? Object.values(e) : [];
      return row.join(',');
    }).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${category.id}_${historyType}_export.csv`; a.click();
  };

  const setFilter = (type: string) => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    if (type === 'yesterday') { start.setDate(now.getDate() - 1); end.setDate(now.getDate() - 1); } 
    else if (type === 'prev-week') { start.setDate(now.getDate() - 14); end.setDate(now.getDate() - 7); }
    setDateRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 space-y-6 animate-fadeIn">
      {/* INSIGHTS */}
      <section className="bg-white rounded-xl premium-card border border-slate-100 overflow-hidden">
        <button onClick={() => setIsInsightsOpen(!isInsightsOpen)} className="w-full px-4 py-3 flex justify-between items-center hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 bg-${category.color}-600 rounded-full animate-ping`}></span>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 italic">{category.name} Insights</h3>
          </div>
          <i className={`fas fa-chevron-${isInsightsOpen ? 'up' : 'down'} text-slate-400 text-[10px]`}></i>
        </button>
        {isInsightsOpen && (
          <div className="px-4 pb-4 space-y-3 animate-slideDown">
            {[ 
              { id: 'fault', label: 'Recurring Issue Alerts', data: insights.recurring, color: 'rose', icon: 'exclamation-triangle' }, 
              { id: 'life', label: 'Life Cycle Warnings', data: insights.lifeAlerts, color: 'amber', icon: 'hourglass-end' } 
            ].map(insight => (
              <div key={insight.id} className={`border border-${insight.color}-100 rounded-lg overflow-hidden`}>
                <button onClick={() => setOpenAlertCat(openAlertCat === insight.id ? null : insight.id)} className={`w-full flex items-center justify-between p-3 bg-${insight.color}-50/30 hover:bg-${insight.color}-50 transition-colors`}>
                  <div className="flex items-center gap-2">
                    <i className={`fas fa-${insight.icon} text-${insight.color}-600 text-[10px]`}></i>
                    <p className={`text-[8px] font-black text-${insight.color}-600 uppercase tracking-widest italic`}>{insight.label} ({insight.data.length})</p>
                  </div>
                  <i className={`fas fa-chevron-${openAlertCat === insight.id ? 'up' : 'down'} text-${insight.color}-300 text-[8px]`}></i>
                </button>
                {openAlertCat === insight.id && (
                  <div className="p-2 space-y-1.5 bg-white animate-slideDown">
                    {insight.data.map(a => (
                      <div key={a.tag} className="flex justify-between items-center p-2 rounded-md border border-slate-50 shadow-sm">
                        <div className="flex-1"><p className="text-[9px] font-black text-slate-800 italic">{a.tag} • {a.room}</p></div>
                        <button disabled={processingInsight === (a as Asset).tag} onClick={() => handleAcknowledge(a as Asset, insight.label)} className={`bg-${insight.color}-100 text-${insight.color}-600 px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest hover:bg-${insight.color}-600 hover:text-white transition-all`}>ACK</button>
                      </div>
                    ))}
                    {insight.data.length === 0 && <p className="text-[9px] text-slate-300 italic text-center py-2">No active alerts</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* KPI GRID */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg flex flex-col justify-between h-28 relative overflow-hidden group border border-white/5">
          <div className={`absolute top-0 right-0 w-20 h-20 bg-${category.color}-500/10 blur-[30px] group-hover:bg-${category.color}-500/20 transition-all`}></div>
          <div><p className={`text-[8px] font-black uppercase tracking-[0.4em] text-${category.color}-400 mb-1`}>Total Assets</p><h2 className="text-3xl font-extrabold tracking-tighter italic">{assetGroups.installedTotal}</h2></div>
          <div className="flex items-center gap-2"><div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div><p className="text-[8px] font-bold uppercase text-white/40 tracking-widest italic">Live Sync</p></div>
        </div>
        {[ 
          {label: 'Active', list: assetGroups.active, color: 'emerald', icon: 'shield-check'}, 
          {label: 'Maintenance', list: assetGroups.maint, color: 'amber', icon: 'wrench'}, 
          {label: 'Spare', list: assetGroups.spare, color: 'slate', icon: 'box-archive'}, 
          {label: 'Waiting', list: assetGroups.waiting, color: 'rose', icon: 'trash-can'},
          {label: 'Disposed', list: assetGroups.disposed, color: 'gray', icon: 'ban'} 
        ].map(g => (
          <button key={g.label} onClick={() => setDetailView({title: g.label, data: g.list, color: g.color})} className="bg-white p-3 rounded-xl border border-slate-100 premium-card text-left flex items-center justify-between group">
            <div><span className={`text-[8px] font-black uppercase tracking-widest text-${g.color}-600 bg-${g.color}-50 px-1.5 py-0.5 rounded mb-1 inline-block`}>{g.label}</span><p className="text-xl font-black text-slate-900">{g.list.length}</p></div>
            <div className={`w-9 h-9 bg-slate-50 text-slate-200 rounded-lg flex items-center justify-center text-lg group-hover:bg-${g.color}-600 group-hover:text-white transition-all`}><i className={`fas fa-${g.icon}`}></i></div>
          </button>
        ))}
      </section>

      {/* ANALYZER LEDGER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {category.id === 'ac' && (
          <div className="lg:col-span-4 h-full">
            <div className="bg-slate-900 p-5 rounded-xl shadow-xl h-full border border-white/5 relative group overflow-hidden">
              <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-5 italic">Refrigerant Status</h3>
              <GasStatus stats={stats} onRefresh={onRefresh} category={category.id} />
            </div>
          </div>
        )}
        <div className={category.id === 'ac' ? 'lg:col-span-8' : 'lg:col-span-12'}>
          <div className="bg-white p-5 rounded-xl premium-card border border-slate-100 flex flex-col min-h-[440px]">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-black tracking-tight italic text-slate-900 uppercase">Analyzer Ledger</h3>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg ml-2">
                    {[ 
                      {val: 'checklist', label: 'Checklist'}, 
                      {val: 'complaint', label: 'Complaints'} 
                    ].map(t => (
                      <button 
                        key={t.val} 
                        onClick={() => { setHistoryType(t.val as any); setExpandedDate(null); setHistoryData([]); }} 
                        className={`px-3 py-1.5 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${historyType === t.val ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleExportCSV} className="bg-slate-900 text-white px-3 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest italic shadow-lg active:scale-95 transition-all">Export CSV</button>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100 gap-1">
                  {[{id: 'today', label: 'Today'}, {id: 'yesterday', label: 'Yesterday'}, {id: 'prev-week', label: 'Previous Week'}].map(f => (
                    <button key={f.id} onClick={() => setFilter(f.id)} className="px-2 py-1 text-[7px] font-black uppercase tracking-tighter text-slate-400 hover:text-indigo-600 transition-colors">{f.label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-100">
                  <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ start: e.target.value, end: prev.end }))} className="bg-transparent text-[8px] font-black outline-none italic" />
                  <span className="text-[7px] font-black text-slate-300 uppercase px-1">To</span>
                  <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ start: prev.start, end: e.target.value }))} className="bg-transparent text-[8px] font-black outline-none italic" />
                  <button onClick={fetchHistory} className="bg-indigo-600 text-white p-1.5 rounded-md hover:bg-indigo-700 transition-colors shadow-lg ml-1"><i className="fas fa-search text-[8px]"></i></button>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto hide-scroll pr-1">
              {isFetchingHistory ? (
                <div className="flex flex-col items-center justify-center h-40 opacity-20"><i className="fas fa-circle-notch animate-spin text-xl mb-2"></i><p className="font-black text-[9px] uppercase tracking-widest">Syncing Hub...</p></div>
              ) : historyType === 'complaint' ? (
                Object.entries(archiveSummary).sort((a,b) => b[0].localeCompare(a[0])).map(([date, meta]: [string, any]) => (
                  <div key={date} className="animate-slideDown">
                    <button onClick={() => setExpandedDate(expandedDate === date ? null : date)} className="w-full flex justify-between items-center p-3 rounded-lg border bg-slate-50/20 border-slate-100">
                      <span className="text-[10px] font-bold text-slate-800 italic">{date}</span>
                      <div className="flex items-center gap-2"><span className="text-[7px] font-black uppercase text-slate-400">{meta.entries.length} LOGS</span><i className="fas fa-chevron-down text-[9px] opacity-20"></i></div>
                    </button>
                    {expandedDate === date && (
                      <div className="mt-1.5 p-2 bg-slate-50 rounded-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-slideDown">
                        {meta.entries.map((e: any, idx: number) => (
                          <div key={idx} className="bg-white p-2 rounded-md border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[8px] font-black text-indigo-600">{e[3] || e.AssetTag}</span>
                              <span className={`text-[6px] font-black px-1.5 py-0.5 rounded ${String(e[6]).includes('Resolved') || String(e[6]).includes('Completed') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{resolveStatusLabel(e[6])}</span>
                            </div>
                            <p className="text-[8px] font-bold text-slate-400 italic truncate mt-1">"{e[4]}"</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <>
                  {checklistAnalysis.completeDays.map(day => (
                    <div key={day.date} className="animate-slideDown">
                      <button onClick={() => setExpandedDate(expandedDate === day.date ? null : day.date)} className="w-full flex justify-between items-center p-3 rounded-lg border bg-emerald-50/20 border-emerald-100">
                        <div className="flex items-center gap-2.5"><div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div><span className="text-[10px] font-bold text-emerald-900 italic">{day.date}</span></div>
                        <div className="flex items-center gap-2"><span className="text-[7px] font-black uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full">100% COMPLETE</span><i className="fas fa-chevron-down text-[9px] opacity-20"></i></div>
                      </button>
                      {expandedDate === day.date && (
                        <div className="mt-1.5 p-2 bg-emerald-50/50 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-2 animate-slideDown">
                          {day.entries.map((e: any, idx: number) => (
                            <div key={idx} className="bg-white p-2 rounded-md border border-emerald-100 flex flex-col gap-2">
                              <p className="text-[8px] font-black text-emerald-600">{e[2]}</p>
                              {e[6] && e[6].length > 5 && <button onClick={() => setProofImage(e[6])} className="bg-indigo-50 text-indigo-600 text-[6px] font-black uppercase py-1 rounded hover:bg-indigo-600 hover:text-white transition-all">View Proof</button>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {checklistAnalysis.missedDays.map(day => (
                    <div key={day.date} className="animate-slideDown">
                      <button onClick={() => setExpandedDate(expandedDate === day.date ? null : day.date)} className="w-full flex justify-between items-center p-3 rounded-lg border bg-rose-50/20 border-rose-100">
                        <div className="flex items-center gap-2.5"><div className="w-1 h-1 rounded-full bg-rose-500 animate-pulse"></div><span className="text-[10px] font-bold text-rose-900 italic">{day.date}</span></div>
                        <div className="flex items-center gap-2"><span className="text-[7px] font-black uppercase bg-rose-600 text-white px-2 py-0.5 rounded-full">MISSED ({day.totalRequired - day.doneCount})</span><i className="fas fa-chevron-down text-[9px] opacity-20"></i></div>
                      </button>
                      {expandedDate === day.date && (
                        <div className="mt-1.5 p-3 bg-rose-50/50 rounded-lg animate-slideDown space-y-3">
                           <div>
                             <p className="text-[7px] font-black text-rose-600 uppercase mb-2 tracking-widest italic">Missed Task Identifiers</p>
                             <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                               {day.missedAssets.map((a: Asset) => (
                                 <div key={a.tag} className="bg-white p-2.5 rounded-xl border border-rose-100 text-left shadow-sm">
                                   <p className="text-[9px] font-black text-rose-600 italic leading-none mb-1">{a.tag}</p>
                                   <p className="text-[7px] font-bold text-slate-400 truncate uppercase">{a.room}</p>
                                 </div>
                               ))}
                             </div>
                           </div>
                           <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {day.entries.map((e: any, idx: number) => (
                                <div key={idx} className="bg-white p-2 rounded-md border border-slate-100 flex flex-col gap-2">
                                  <p className="text-[8px] font-black text-emerald-600">{e[2]}</p>
                                  {e[6] && e[6].length > 5 && <button onClick={() => setProofImage(e[6])} className="bg-indigo-50 text-indigo-600 text-[6px] font-black uppercase py-1 rounded hover:bg-indigo-600 hover:text-white transition-all">View Proof</button>}
                                </div>
                              ))}
                           </div>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* EXCELLENCE HUB */}
      <section className="bg-white p-5 rounded-xl premium-card border border-slate-100">
         <div className="flex justify-between items-center mb-5">
            <h3 onClick={handleResetTrigger} className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 italic cursor-pointer hover:text-indigo-600 transition-colors">Excellence Hub</h3>
            <button onClick={onViewTech} className="text-[8px] font-black text-indigo-600 uppercase underline decoration-indigo-200">Full Force Ranking</button>
         </div>
         <LeaderboardItem category={category.id} performanceLogs={stats?.performanceLogs || []} limit={4} onRefresh={onRefresh} compact={false} />
      </section>

      {/* PROOF IMAGE MODAL */}
      {proofImage && (
        <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-4 backdrop-blur-xl animate-fadeIn" onClick={() => setProofImage(null)}>
           <div className="bg-white p-2 rounded-3xl max-w-2xl w-full shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
              <img src={proofImage} alt="Proof" className="w-full h-auto rounded-2xl" />
              <button onClick={() => setProofImage(null)} className="absolute top-4 right-4 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center"><i className="fas fa-times"></i></button>
           </div>
        </div>
      )}

      {/* DETAIL OVERLAY */}
      {detailView && (
        <div className="fixed inset-0 bg-slate-950/90 z-[200] p-4 backdrop-blur-md flex items-center justify-center animate-fadeIn">
          <div className="bg-white w-full max-w-5xl rounded-xl h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-white/10">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div><h3 className="text-xl font-extrabold uppercase italic tracking-tighter text-slate-900 leading-none">{detailView.title} Registry</h3><p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2 italic">Global Fleet Synchronizer</p></div>
              <div className="flex items-center gap-2">
                 <input type="text" placeholder="Filter Registry..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-32 lg:w-48 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-bold outline-none focus:border-indigo-500" />
                 <button onClick={() => setDetailView(null)} className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm text-slate-300 hover:text-rose-500 transition-colors active:scale-90"><i className="fas fa-times text-base"></i></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 hide-scroll bg-slate-50/30">
              {assets.filter(a => a.status === detailView.title).filter(a => !searchQuery || a.tag.toLowerCase().includes(searchQuery.toLowerCase()) || a.room.toLowerCase().includes(searchQuery.toLowerCase())).map((item, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl premium-card border border-slate-100 flex flex-col justify-between group relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2.5"><span className="bg-slate-900 text-white text-[8px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">{item.tag}</span><span className="text-[7px] text-slate-200 font-bold uppercase">ID {item.id}</span></div>
                    <h4 className="text-xs font-black text-slate-900 leading-tight mb-2.5 italic">"{item.room}"</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1 italic"><i className="fas fa-map-marker-alt text-indigo-400"></i> {item.location} • {item.campus}</p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-50 relative z-10">
                    <select 
                      disabled={shufflingTag === String(item.tag)}
                      onChange={async (e) => await handleShuffle(String(item.tag), e.target.value)} 
                      value={item.status} 
                      className="w-full bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded text-[9px] font-black uppercase outline-none"
                    >
                      {['Active', 'Maintenance', 'Spare', 'Waiting for Disposal', 'Disposed'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardView;
