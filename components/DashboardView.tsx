
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

  const assetGroups = useMemo(() => {
    const active = assets.filter(a => a.status === 'Active');
    const maint = assets.filter(a => a.status === 'Maintenance');
    const spare = assets.filter(a => a.status === 'Spare');
    const waiting = assets.filter(a => a.status === 'Waiting for Disposal');
    const disposed = assets.filter(a => a.status === 'Disposed');
    return { active, maint, spare, waiting, disposed, operationalTotal: active.length + maint.length };
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
    await updateAssetStatus(tag, newStatus);
    onRefresh();
  };

  const handleAcknowledge = async (asset: Asset, category: string) => {
    setProcessingInsight(asset.tag);
    const fd = new FormData();
    fd.append('action', 'log_insight');
    fd.append('assetTag', asset.tag);
    fd.append('category', category);
    fd.append('details', `Flagged: ${category}`);
    await postAction(fd);
    onRefresh();
    setProcessingInsight(null);
  };

  const handleExportCSV = () => {
    if (!historyData.length) return alert("No data");
    const headers = Object.keys(historyData[0] || {}).join(',');
    const rows = historyData.map(obj => Object.values(obj).join(',')).join('\n');
    const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DISRUPT_${historyType}_Report.csv`;
    a.click();
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
    <div className="max-w-[1600px] mx-auto p-4 lg:p-6 space-y-6 animate-fadeIn">
      <section className="bg-white rounded-2xl premium-card border border-slate-100 overflow-hidden">
        <button onClick={() => setIsInsightsOpen(!isInsightsOpen)} className="w-full px-6 py-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-3">
            <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-ping"></span>
            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-900">System Insights</h3>
          </div>
          <i className={`fas fa-chevron-${isInsightsOpen ? 'up' : 'down'} text-slate-400 text-[10px]`}></i>
        </button>
        {isInsightsOpen && (
          <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-4 animate-slideDown">
            {[ {label: 'AC Life Alerts', data: insights.lifeAlerts, color: 'amber'}, {label: 'Recurring Faults', data: insights.recurring, color: 'rose'} ].map(insight => (
              <div key={insight.label} className={`bg-${insight.color}-50/50 p-4 rounded-xl border border-${insight.color}-100`}>
                <p className={`text-[8px] font-black text-${insight.color}-600 uppercase tracking-widest mb-3`}>{insight.label}</p>
                <div className="space-y-2">
                  {insight.data.slice(0, 3).map(a => (
                    <div key={a.tag} className="flex justify-between items-center bg-white p-2.5 rounded-lg shadow-sm">
                      <div className="flex-1"><p className="text-[10px] font-black text-slate-800">{a.tag} • {a.room}</p></div>
                      <button disabled={processingInsight === a.tag} onClick={() => handleAcknowledge(a, insight.label)} className={`bg-${insight.color}-100 text-${insight.color}-600 px-3 py-1.5 rounded text-[8px] font-black uppercase tracking-widest hover:bg-${insight.color}-600 hover:text-white transition-all`}>
                        {processingInsight === a.tag ? 'Wait...' : 'Ack'}
                      </button>
                    </div>
                  ))}
                  {insight.data.length === 0 && <p className="text-[9px] text-slate-400 italic">No alerts</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex flex-col justify-between h-36 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 blur-[40px] group-hover:bg-indigo-500/20 transition-all"></div>
          <div><p className="text-[8px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-1">Fleet Operational</p><h2 className="text-4xl font-extrabold tracking-tighter italic">{assetGroups.operationalTotal}</h2></div>
          <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div><p className="text-[8px] font-bold uppercase text-white/40 tracking-widest">Active Units</p></div>
        </div>
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[ {label: 'Active', list: assetGroups.active, color: 'emerald', icon: 'shield-check'}, {label: 'Maint', list: assetGroups.maint, color: 'amber', icon: 'wrench'}, {label: 'Spare', list: assetGroups.spare, color: 'slate', icon: 'box-archive', opt: true}, {label: 'Waiting', list: assetGroups.waiting, color: 'rose', icon: 'trash-can', opt: true} ].map(g => (
            (!g.opt || showOthers) && <button key={g.label} onClick={() => setDetailView({title: g.label, data: g.list, color: g.color})} className="bg-white p-4 rounded-xl border border-slate-100 premium-card text-left flex items-center justify-between group">
              <div><span className={`text-[8px] font-black uppercase tracking-widest text-${g.color}-600 bg-${g.color}-50 px-2 py-0.5 rounded-md mb-1 inline-block`}>{g.label}</span><p className="text-xl font-black text-slate-900">{g.list.length}</p></div>
              <div className={`w-10 h-10 bg-slate-50 text-slate-300 rounded-lg flex items-center justify-center text-lg group-hover:bg-${g.color}-600 group-hover:text-white transition-all`}><i className={`fas fa-${g.icon}`}></i></div>
            </button>
          ))}
          <button onClick={() => setShowOthers(!showOthers)} className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200 text-slate-400 flex flex-col items-center justify-center hover:bg-slate-100 transition-all">
            <i className={`fas fa-${showOthers ? 'minus' : 'plus'} mb-1 text-[8px]`}></i>
            <span className="text-[8px] font-black uppercase tracking-widest">{showOthers ? 'Hide' : 'Others'}</span>
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 h-full">
          <div className="bg-slate-900 p-6 rounded-2xl shadow-2xl h-full border border-white/5 relative group overflow-hidden">
            <h3 className="text-[8px] font-black uppercase tracking-[0.5em] text-indigo-400 mb-6 italic">Material Ledger</h3>
            <GasStatus stats={stats} onRefresh={onRefresh} />
          </div>
        </div>
        <div className="lg:col-span-8">
          <div className="bg-white p-6 lg:p-8 rounded-2xl premium-card border border-slate-100 flex flex-col min-h-[450px]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-extrabold tracking-tight italic text-slate-900">Ops Ledger</h3>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  {['checklist', 'complaint'].map(t => (
                    <button key={t} onClick={() => setHistoryType(t as any)} className={`px-3 py-1.5 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${historyType === t ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>{t === 'checklist' ? 'Audit' : 'Force'}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-[9px] font-black outline-none focus:border-indigo-400" />
                <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-[9px] font-black outline-none focus:border-indigo-400" />
                <button onClick={fetchHistory} className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg"><i className="fas fa-sync-alt text-[10px]"></i></button>
                <button onClick={handleExportCSV} className="bg-slate-900 text-white px-3 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-xl whitespace-nowrap overflow-hidden">Export CSV</button>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto hide-scroll pr-1">
              {isFetchingHistory ? (
                <div className="flex flex-col items-center justify-center h-48 opacity-20"><i className="fas fa-circle-notch animate-spin text-2xl mb-2"></i><p className="font-black text-[8px] uppercase">Syncing...</p></div>
              ) : Object.entries(archiveSummary).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 opacity-5"><i className="fas fa-database text-4xl mb-4"></i><p className="font-black text-[10px] uppercase">No Records</p></div>
              ) : (
                Object.entries(archiveSummary).sort((a,b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()).map(([date, meta]: [string, any]) => (
                  <div key={date}>
                    <button onClick={() => setExpandedDate(expandedDate === date ? null : date)} className={`w-full flex justify-between items-center p-4 rounded-xl border transition-all ${meta.isComplete ? 'bg-emerald-50/20 border-emerald-100' : 'bg-rose-50/20 border-rose-100'}`}>
                      <div className="flex items-center gap-3"><div className={`w-1.5 h-1.5 rounded-full ${meta.isComplete ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 animate-pulse'}`}></div><span className="text-xs font-bold text-slate-800">{date}</span></div>
                      <div className="flex items-center gap-3"><span className={`text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${meta.isComplete ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white shadow-lg'}`}>{meta.isComplete ? 'Verified' : 'Incomplete'}</span><i className={`fas fa-chevron-${expandedDate === date ? 'up' : 'down'} text-[8px] opacity-20`}></i></div>
                    </button>
                    {expandedDate === date && (
                      <div className="mt-1.5 p-3 bg-slate-50 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-slideDown border border-slate-200/50">
                        {meta.entries.map((e: any, idx: number) => (
                          <div key={idx} className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-center"><span className="text-[8px] font-black text-indigo-600">{e.AssetTag || e[2]}</span><span className={`text-[6px] font-black px-1.5 py-0.5 rounded ${e.Status === 'OK' || e[4] === 'OK' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{e.Status || e[4]}</span></div>
                            <p className="text-[8px] font-bold text-slate-500 italic truncate mt-1">"{e.Remarks || e[5] || 'Pass'}"</p>
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

      <section className="bg-white p-6 lg:p-8 rounded-2xl premium-card border border-slate-100">
         <div className="flex justify-between items-center mb-6"><h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900">Merit Performance Scoreboard</h3><button onClick={onViewTech} className="text-[9px] font-black text-indigo-600 uppercase hover:underline">View Tech Hub</button></div>
         <LeaderboardItem performanceLogs={stats?.performanceLogs || []} limit={4} onRefresh={onRefresh} compact={false} />
      </section>

      {detailView && (
        <div className="fixed inset-0 bg-slate-950/90 z-[200] p-4 lg:p-12 backdrop-blur-xl flex items-center justify-center animate-fadeIn">
          <div className="bg-white w-full max-w-6xl rounded-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-white/10">
            <div className="p-6 lg:p-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
              <div><h3 className="text-2xl font-extrabold uppercase italic tracking-tighter text-slate-900">{detailView.title} Registry</h3><p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.4em]">Asset Management Suite</p></div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                 <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 sm:w-48 bg-white border border-slate-200 px-4 py-2 rounded-xl text-[10px] font-bold outline-none focus:border-indigo-500 transition-all" />
                 <button onClick={() => setDetailView(null)} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md text-slate-400 hover:text-indigo-600 transition-all"><i className="fas fa-times text-lg"></i></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 hide-scroll bg-slate-50/30">
              {filteredDetailData.map((item, idx) => (
                <div key={idx} className="bg-white p-6 rounded-2xl premium-card border border-slate-100 flex flex-col justify-between group relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4"><span className="bg-slate-900 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest">{item.tag}</span><span className="text-[7px] text-slate-300 font-bold uppercase">ID {item.id}</span></div>
                    <h4 className="text-base font-extrabold text-slate-900 leading-tight mb-3 italic">"{item.room}"</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1"><i className="fas fa-map-marker-alt text-indigo-400"></i> {item.location} • {item.campus}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><i className="fas fa-bolt text-indigo-400"></i> {item.brand} • {item.cap} Tons</p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 relative z-10">
                    <p className="text-[7px] font-black text-indigo-500 uppercase tracking-widest mb-2 italic">Category Shuffle</p>
                    <select onChange={e => handleShuffle(String(item.tag), e.target.value)} value={item.status} className="w-full bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg text-[9px] font-black uppercase outline-none">
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
