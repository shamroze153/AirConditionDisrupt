
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, Ticket, StatsResponse } from '../types.ts';
import GasStatus from './GasStatus.tsx';
import LeaderboardItem from './LeaderboardItem.tsx';
import { updateAssetStatus, getReport, postAction } from '../services/api.ts';

interface Props {
  assets: Asset[];
  tickets: Ticket[];
  stats: StatsResponse | null;
  onRefresh: () => void;
  onViewTech: () => void;
}

const DashboardView: React.FC<Props> = ({ assets, tickets, stats, onRefresh, onViewTech }) => {
  const [isInsightsOpen, setIsInsightsOpen] = useState(true);
  const [openAlertCat, setOpenAlertCat] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [historyType, setHistoryType] = useState<'complaint' | 'checklist'>('checklist');
  const [dateRange, setDateRange] = useState({ 
    start: new Date().toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<{title: string, data: Asset[], color: string} | null>(null);
  const [processingInsight, setProcessingInsight] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [shufflingTag, setShufflingTag] = useState<string | null>(null);

  const assetGroups = useMemo(() => {
    const active = assets.filter(a => a.status === 'Active');
    const maint = assets.filter(a => a.status === 'Maintenance');
    const spare = assets.filter(a => a.status === 'Spare');
    const waiting = assets.filter(a => a.status === 'Waiting for Disposal');
    const disposed = assets.filter(a => a.status === 'Disposed');
    // Total AC Count = Active + Maintenance + Spare + Waiting ONLY. Disposed NOT included.
    return { active, maint, spare, waiting, disposed, operationalTotal: active.length + maint.length + spare.length + waiting.length };
  }, [assets]);

  const insights = useMemo(() => {
    const lifeAlerts = assets.filter(a => a.year && (new Date().getFullYear() - Number(a.year)) >= 5);
    const faultCounts: Record<string, number> = {};
    tickets.forEach(t => { if(t.assetTag) faultCounts[t.assetTag] = (faultCounts[t.assetTag] || 0) + 1 });
    const recurring = Object.keys(faultCounts)
      .filter(tag => faultCounts[tag] >= 3)
      .map(tag => assets.find(a => a.tag === tag))
      .filter(Boolean) as Asset[];
    return { lifeAlerts, recurring };
  }, [assets, tickets]);

  const ledgerSummary = useMemo(() => {
    const data = historyData || [];
    const resolved = data.filter(d => (d.Status || d[6] || '').toLowerCase().includes('resolved')).length;
    const pending = data.filter(d => (d.Status || d[6] || '').toLowerCase().includes('open')).length;
    const wip = data.length - resolved - pending;
    return { resolved, pending, wip, total: data.length };
  }, [historyData]);

  const archiveSummary = useMemo(() => {
    const groups: Record<string, { entries: any[], isComplete: boolean }> = {};
    const operationalAssets = assets.filter(a => ['Active', 'Maintenance'].includes(a.status));
    historyData.forEach(item => {
      const ts = item.Timestamp || item[0];
      if (!ts) return;
      const date = new Date(ts).toLocaleDateString();
      if (!groups[date]) groups[date] = { entries: [], isComplete: false };
      groups[date].entries.push(item);
    });
    Object.keys(groups).forEach(date => {
      const uniqueTags = new Set(groups[date].entries.map((e: any) => e.AssetTag || e[2])).size;
      groups[date].isComplete = uniqueTags >= operationalAssets.length;
    });
    return groups;
  }, [historyData, assets]);

  const fetchHistory = async () => {
    setIsFetchingHistory(true);
    try {
      const data = await getReport(historyType, dateRange.start, dateRange.end);
      setHistoryData(data || []);
    } catch (e) { console.error(e); }
    finally { setIsFetchingHistory(false); }
  };

  useEffect(() => { fetchHistory(); }, [historyType, dateRange.start, dateRange.end]);

  const handleShuffle = async (tag: string, newStatus: string) => {
    setShufflingTag(tag);
    // Visual feedback delay
    setTimeout(async () => {
      await updateAssetStatus(tag, newStatus);
      setShufflingTag(null);
      onRefresh();
    }, 1000);
  };

  const handleAcknowledge = async (asset: Asset, category: string) => {
    setProcessingInsight(asset.tag);
    const fd = new FormData();
    fd.append('action', 'log_insight');
    fd.append('assetTag', asset.tag);
    fd.append('category', category);
    fd.append('details', `Acknowledged: ${category}`);
    fd.append('status', 'Acknowledged');
    await postAction(fd);
    onRefresh();
    setProcessingInsight(null);
  };

  const handleExportCSV = () => {
    if (!historyData.length) return alert("No data to export");
    const headers = historyData[0] ? Object.keys(historyData[0]).join(',') : 'Timestamp,Data';
    const rows = historyData.map(obj => Object.values(obj).join(',')).join('\n');
    const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Analyzer_Ledger_${historyType}_${dateRange.start}_to_${dateRange.end}.csv`;
    a.click();
  };

  const setFilter = (type: string) => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);

    if (type === 'today') {
      // already set
    } else if (type === 'tomorrow') {
      start.setDate(now.getDate() + 1);
      end.setDate(now.getDate() + 1);
    } else if (type === 'week') {
      start.setDate(now.getDate() - 7);
    }
    
    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    });
  };

  const filteredDetailData = useMemo(() => {
    if (!detailView) return [];
    if (!searchQuery) return detailView.data;
    const q = searchQuery.toLowerCase();
    return detailView.data.filter(a => 
      a.tag.toLowerCase().includes(q) || a.room.toLowerCase().includes(q)
    );
  }, [detailView, searchQuery]);

  return (
    <div className="max-w-[1600px] mx-auto p-4 space-y-6 animate-fadeIn">
      {/* SECTION 0: SYSTEM & INSIGHTS */}
      <section className="bg-white rounded-xl premium-card border border-slate-100 overflow-hidden">
        <button onClick={() => setIsInsightsOpen(!isInsightsOpen)} className="w-full px-4 py-3 flex justify-between items-center hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-ping"></span>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 italic">System & Insights</h3>
          </div>
          <i className={`fas fa-chevron-${isInsightsOpen ? 'up' : 'down'} text-slate-400 text-[10px]`}></i>
        </button>
        {isInsightsOpen && (
          <div className="px-4 pb-4 space-y-3 animate-slideDown">
            {[ 
              { id: 'fault', label: 'Recurring Fault Alerts', data: insights.recurring, color: 'rose', icon: 'exclamation-triangle' }, 
              { id: 'life', label: 'AC Life Cycle Alerts (>5yr)', data: insights.lifeAlerts, color: 'amber', icon: 'hourglass-end' } 
            ].map(insight => (
              <div key={insight.id} className={`border border-${insight.color}-100 rounded-lg overflow-hidden`}>
                <button 
                  onClick={() => setOpenAlertCat(openAlertCat === insight.id ? null : insight.id)}
                  className={`w-full flex items-center justify-between p-3 bg-${insight.color}-50/30 hover:bg-${insight.color}-50 transition-colors`}
                >
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
                        <button disabled={processingInsight === a.tag} onClick={() => handleAcknowledge(a, insight.label)} className={`bg-${insight.color}-100 text-${insight.color}-600 px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest hover:bg-${insight.color}-600 hover:text-white transition-all`}>
                          {processingInsight === a.tag ? '...' : 'ACK'}
                        </button>
                      </div>
                    ))}
                    {insight.data.length === 0 && <p className="text-[9px] text-slate-300 italic text-center py-2">No anomalies detected</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 1: MASTER ASSET HUB SUMMARY */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg flex flex-col justify-between h-28 relative overflow-hidden group border border-white/5">
          <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/10 blur-[30px] group-hover:bg-indigo-500/20 transition-all"></div>
          <div><p className="text-[8px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-1">Total Active Fleet</p><h2 className="text-3xl font-extrabold tracking-tighter italic">{assetGroups.operationalTotal}</h2></div>
          <div className="flex items-center gap-2"><div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div><p className="text-[8px] font-bold uppercase text-white/40 tracking-widest italic">Live Sync Enabled</p></div>
        </div>
        {[ 
          {label: 'Active', list: assetGroups.active, color: 'emerald', icon: 'shield-check'}, 
          {label: 'Maintenance', list: assetGroups.maint, color: 'amber', icon: 'wrench'}, 
          {label: 'Spare', list: assetGroups.spare, color: 'slate', icon: 'box-archive', opt: true}, 
          {label: 'Waiting', list: assetGroups.waiting, color: 'rose', icon: 'trash-can', opt: true} 
        ].map(g => (
          (!g.opt || showOthers) && <button key={g.label} onClick={() => setDetailView({title: g.label, data: g.list, color: g.color})} className="bg-white p-3 rounded-xl border border-slate-100 premium-card text-left flex items-center justify-between group">
            <div><span className={`text-[8px] font-black uppercase tracking-widest text-${g.color}-600 bg-${g.color}-50 px-1.5 py-0.5 rounded mb-1 inline-block`}>{g.label}</span><p className="text-xl font-black text-slate-900">{g.list.length}</p></div>
            <div className={`w-9 h-9 bg-slate-50 text-slate-200 rounded-lg flex items-center justify-center text-lg group-hover:bg-${g.color}-600 group-hover:text-white transition-all`}><i className={`fas fa-${g.icon}`}></i></div>
          </button>
        ))}
        <button onClick={() => setShowOthers(!showOthers)} className="bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200 text-slate-400 flex flex-col items-center justify-center hover:bg-white hover:border-indigo-100 transition-all">
          <i className={`fas fa-${showOthers ? 'minus' : 'plus'} mb-1 text-[8px]`}></i>
          <span className="text-[8px] font-black uppercase tracking-widest italic">{showOthers ? 'Hide' : 'Others'}</span>
        </button>
      </section>

      {/* SECTION 2 & 4: ANALYZER LEDGER & REFRIGERANT STATUS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 h-full">
          <div className="bg-slate-900 p-5 rounded-xl shadow-xl h-full border border-white/5 relative group overflow-hidden">
            <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-5 italic">Refrigerant Status</h3>
            <GasStatus stats={stats} onRefresh={onRefresh} />
          </div>
        </div>
        <div className="lg:col-span-8">
          <div className="bg-white p-5 rounded-xl premium-card border border-slate-100 flex flex-col min-h-[440px]">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-black tracking-tight italic text-slate-900 uppercase">Analyzer Ledger</h3>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg ml-2">
                    {[ {val: 'checklist', label: 'Checklist'}, {val: 'complaint', label: 'Complaints'} ].map(t => (
                      <button key={t.val} onClick={() => setHistoryType(t.val as any)} className={`px-3 py-1.5 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${historyType === t.val ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>{t.label}</button>
                    ))}
                  </div>
                </div>
                <button onClick={handleExportCSV} className="bg-slate-900 text-white px-3 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest italic shadow-lg active:scale-95 transition-all">Export CSV</button>
              </div>
              
              {/* LEDGER SUMMARY COUNTERS */}
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100 text-center"><p className="text-[10px] font-black text-emerald-600">{ledgerSummary.resolved}</p><p className="text-[6px] font-black text-emerald-400 uppercase">Resolved</p></div>
                <div className="bg-amber-50 p-2 rounded-lg border border-amber-100 text-center"><p className="text-[10px] font-black text-amber-600">{ledgerSummary.wip}</p><p className="text-[6px] font-black text-amber-400 uppercase">WIP</p></div>
                <div className="bg-rose-50 p-2 rounded-lg border border-rose-100 text-center"><p className="text-[10px] font-black text-rose-600">{ledgerSummary.pending}</p><p className="text-[6px] font-black text-rose-400 uppercase">Pending</p></div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100 gap-1">
                  {['today', 'tomorrow', 'week'].map(f => (
                    <button key={f} onClick={() => setFilter(f)} className="px-2 py-1 text-[7px] font-black uppercase tracking-tighter text-slate-400 hover:text-indigo-600 transition-colors">{f}</button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-100">
                  <span className="text-[7px] font-black text-slate-300 uppercase px-1">From</span>
                  <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="bg-transparent text-[8px] font-black outline-none italic" />
                  <span className="text-[7px] font-black text-slate-300 uppercase px-1">To</span>
                  <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="bg-transparent text-[8px] font-black outline-none italic" />
                  <button onClick={fetchHistory} className="bg-indigo-600 text-white p-1.5 rounded-md hover:bg-indigo-700 transition-colors shadow-lg ml-1"><i className="fas fa-search text-[8px]"></i></button>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto hide-scroll pr-1">
              {isFetchingHistory ? (
                <div className="flex flex-col items-center justify-center h-40 opacity-20"><i className="fas fa-circle-notch animate-spin text-xl mb-2"></i><p className="font-black text-[9px] uppercase tracking-widest">Syncing Hub...</p></div>
              ) : Object.entries(archiveSummary).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 opacity-5"><i className="fas fa-database text-3xl mb-3"></i><p className="font-black text-[10px] uppercase">No logs for this range</p></div>
              ) : (
                Object.entries(archiveSummary).sort((a,b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()).map(([date, meta]: [string, any]) => (
                  <div key={date} className="animate-slideDown">
                    <button onClick={() => setExpandedDate(expandedDate === date ? null : date)} className={`w-full flex justify-between items-center p-3 rounded-lg border transition-all ${meta.isComplete ? 'bg-emerald-50/20 border-emerald-100' : 'bg-rose-50/20 border-rose-100'}`}>
                      <div className="flex items-center gap-2.5"><div className={`w-1 h-1 rounded-full ${meta.isComplete ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 animate-pulse'}`}></div><span className="text-[10px] font-bold text-slate-800 italic">{date}</span></div>
                      <div className="flex items-center gap-2"><span className={`text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${meta.isComplete ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>{meta.isComplete ? '100% DONE' : 'INCOMPLETE'}</span><i className={`fas fa-chevron-${expandedDate === date ? 'up' : 'down'} text-[9px] opacity-20`}></i></div>
                    </button>
                    {expandedDate === date && (
                      <div className="mt-1.5 p-2 bg-slate-50 rounded-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-slideDown border border-slate-100">
                        {meta.entries.map((e: any, idx: number) => (
                          <div key={idx} className="bg-white p-2 rounded-md border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-center"><span className="text-[8px] font-black text-indigo-600">{e.AssetTag || e[2]}</span><span className={`text-[6px] font-black px-1.5 py-0.5 rounded ${e.Status === 'OK' || e[4] === 'OK' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{e.Status || e[4]}</span></div>
                            <p className="text-[8px] font-bold text-slate-400 italic truncate mt-1">"{e.Remarks || e[5] || 'Verified'}"</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 5: EXCELLENCE SCOREBOARD */}
      <section className="bg-white p-5 rounded-xl premium-card border border-slate-100">
         <div className="flex justify-between items-center mb-5"><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 italic">Excellence Hub</h3><button onClick={onViewTech} className="text-[8px] font-black text-indigo-600 uppercase underline decoration-indigo-200">Full Force Ranking</button></div>
         <LeaderboardItem performanceLogs={stats?.performanceLogs || []} limit={4} onRefresh={onRefresh} compact={false} />
      </section>

      {/* DETAIL OVERLAY (SECTION 1B: SHUFFLE) */}
      {detailView && (
        <div className="fixed inset-0 bg-slate-950/90 z-[200] p-4 backdrop-blur-md flex items-center justify-center animate-fadeIn">
          <div className="bg-white w-full max-w-5xl rounded-xl h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-white/10">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div><h3 className="text-xl font-extrabold uppercase italic tracking-tighter text-slate-900 leading-none">{detailView.title} Hub</h3><p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2 italic">Live Fleet Synchronizer</p></div>
              <div className="flex items-center gap-2">
                 <input type="text" placeholder="Filter Registry..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-32 lg:w-48 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-bold outline-none focus:border-indigo-500" />
                 <button onClick={() => setDetailView(null)} className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm text-slate-300 hover:text-rose-500 transition-colors active:scale-90"><i className="fas fa-times text-base"></i></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 hide-scroll bg-slate-50/30">
              {filteredDetailData.map((item, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl premium-card border border-slate-100 flex flex-col justify-between group relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2.5"><span className="bg-slate-900 text-white text-[8px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">{item.tag}</span><span className="text-[7px] text-slate-200 font-bold uppercase">ID {item.id}</span></div>
                    <h4 className="text-xs font-black text-slate-900 leading-tight mb-2.5 italic">"{item.room}"</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1 italic"><i className="fas fa-map-marker-alt text-indigo-400"></i> {item.location} • {item.campus}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase flex items-center gap-1.5 italic"><i className="fas fa-bolt text-indigo-400"></i> {item.brand} • {item.cap}T</p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-50 relative z-10">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[7px] font-black text-indigo-500 uppercase tracking-widest italic">Status Shuffle</p>
                      {shufflingTag === String(item.tag) ? (
                        <div className="flex items-center gap-1"><i className="fas fa-hourglass-half text-amber-500 animate-spin text-[8px]"></i><span className="text-[6px] text-amber-500 font-black uppercase">Shuffling...</span></div>
                      ) : (
                        <i className="fas fa-random text-indigo-200 text-[8px]"></i>
                      )}
                    </div>
                    <select 
                      disabled={shufflingTag === String(item.tag)}
                      onChange={async (e) => {
                        const newStatus = e.target.value;
                        await handleShuffle(String(item.tag), newStatus);
                      }} 
                      value={item.status} 
                      className="w-full bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded text-[9px] font-black uppercase outline-none focus:border-indigo-400 disabled:opacity-50"
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
