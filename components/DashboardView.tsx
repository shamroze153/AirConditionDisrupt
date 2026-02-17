
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Asset, Ticket, StatsResponse, FMCategory } from '../types.ts';
import GasStatus from './GasStatus.tsx';
import LeaderboardItem from './LeaderboardItem.tsx';
import { updateAssetStatus, getReport, resetLeaderboard, logInsight } from '../services/api.ts';
import { ELECTRICAL_MODULE_DATA } from '../constants.ts';

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
  const map: Record<string, string> = { '1': 'Open', '2': 'In Progress', '3': 'On Hold', '4': 'Pending', '5': 'Completed' };
  return map[s] || status;
};

const DashboardView: React.FC<Props> = ({ category, assets, tickets, stats, onRefresh, onViewTech }) => {
  const [isInsightsOpen, setIsInsightsOpen] = useState(true);
  const [openAlertCat, setOpenAlertCat] = useState<string | null>(null);
  const [historyType, setHistoryType] = useState<'complaint' | 'checklist'>('checklist');
  
  const [dateRange, setDateRange] = useState({ 
    start: new Date(new Date().setDate(new Date().getDate() - 14)).toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });

  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  
  // Refactored: Store only the active label to prevent blinking/stale data in modal
  const [activeGroupLabel, setActiveGroupLabel] = useState<string | null>(null);
  
  const [processingInsight, setProcessingInsight] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [shufflingTag, setShufflingTag] = useState<string | null>(null);

  const parseHubDate = useCallback((dateStr: any) => { if (!dateStr) return null; const d = new Date(dateStr); return isNaN(d.getTime()) ? null : d; }, []);

  // 🔄 LIVE SYNC LOGIC: Force status based on active work orders
  const synchronizedAssets = useMemo(() => {
    return assets.map(a => {
      if (category.id !== 'ac') return a;

      const activeStatuses = ['Open', 'In Progress', 'Pending', 'On Hold', 'Pending Assignment'];
      const hasActiveTicket = tickets.some(t => 
        String(t.assetTag || '').trim().toUpperCase() === String(a.tag || '').trim().toUpperCase() &&
        activeStatuses.includes(t.status)
      );

      let derivedStatus = a.status;
      if (hasActiveTicket) {
        derivedStatus = 'Maintenance';
      } else if (a.status === 'Maintenance') {
        derivedStatus = 'Active';
      }
      return { ...a, status: derivedStatus };
    });
  }, [assets, tickets, category.id]);

  const assetGroups = useMemo(() => {
    const groups = { 
      Active: [] as Asset[], 
      Maintenance: [] as Asset[], 
      Spare: [] as Asset[], 
      'Waiting for Disposal': [] as Asset[], 
      Disposed: [] as Asset[], 
      installedTotal: 0 
    };
    synchronizedAssets.forEach(a => { 
      const s = String(a.status || 'Active'); 
      if (groups[s as keyof typeof groups] !== undefined) (groups[s as keyof typeof groups] as Asset[]).push(a); 
    });
    groups.installedTotal = groups.Active.length + groups.Maintenance.length;
    return groups;
  }, [synchronizedAssets]);

  // Derived detail view data based on activeGroupLabel
  const activeDetailData = useMemo(() => {
    if (!activeGroupLabel) return null;
    const label = activeGroupLabel as keyof typeof assetGroups;
    if (label === 'installedTotal') return null;
    
    const colorMap: Record<string, string> = {
      'Active': 'emerald',
      'Maintenance': 'amber',
      'Spare': 'slate',
      'Waiting for Disposal': 'rose',
      'Disposed': 'gray'
    };

    return {
      title: activeGroupLabel,
      data: assetGroups[label] as Asset[] || [],
      color: colorMap[activeGroupLabel] || 'indigo'
    };
  }, [activeGroupLabel, assetGroups]);

  const operationalAssetMap = useMemo(() => { 
    const map = new Set<string>(); 
    synchronizedAssets.forEach(a => { 
      const s = String(a.status || '').toUpperCase(); 
      if (s === 'ACTIVE' || s === 'MAINTENANCE') map.add(String(a.tag).trim().toUpperCase()); 
    }); 
    return map; 
  }, [synchronizedAssets]);

  const insights = useMemo(() => {
    const handled = (stats?.acknowledgedInsights || []) as {tag: string, type: string}[];
    const lifeAlerts = synchronizedAssets.filter(a => !handled.some(h => h.tag === a.tag && h.type.includes('Life')) && a.year && (new Date().getFullYear() - Number(a.year)) >= 5);
    const faultCounts: Record<string, number> = {};
    tickets.forEach(t => { if(t.assetTag) faultCounts[t.assetTag] = (faultCounts[t.assetTag] || 0) + 1 });
    const recurring = Object.keys(faultCounts).filter(tag => faultCounts[tag] >= 3).map(tag => synchronizedAssets.find(a => a.tag === tag)).filter((a): a is Asset => !!a && !handled.some(h => h.tag === a.tag && h.type.includes('Recurring')));
    return { lifeAlerts, recurring };
  }, [synchronizedAssets, tickets, stats]);

  const fetchHistory = useCallback(async () => { 
    setIsFetchingHistory(true); 
    try { 
      const data = await getReport(category.id, historyType as 'complaint' | 'checklist', dateRange.start, dateRange.end); 
      setHistoryData(data || []); 
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsFetchingHistory(false); 
    } 
  }, [category.id, historyType, dateRange.start, dateRange.end]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const archiveSummary = useMemo(() => { if (historyType !== 'complaint') return {}; const groups: Record<string, { entries: any[] }> = {}; historyData.forEach(item => { const ts = item[0] || item.Timestamp || item.date; const d = parseHubDate(ts); if (!d) return; const dateKey = d.toLocaleDateString('en-CA'); if (!groups[dateKey]) groups[dateKey] = { entries: [] }; groups[dateKey].entries.push(item); }); return groups; }, [historyData, historyType, parseHubDate]);

  const checklistAnalysis = useMemo(() => {
    if (historyType !== 'checklist') return { completeDays: [], missedDays: [] };
    
    const operationalAssets = synchronizedAssets.filter(a => { 
      const s = String(a.status || '').trim().toUpperCase(); 
      return s === 'ACTIVE' || s === 'MAINTENANCE'; 
    }).sort((a, b) => Number(a.id) - Number(b.id));

    const groups: Record<string, { entries: any[], doneUniqueTags: Set<string>, frequency: string }> = {};
    
    historyData.forEach(item => { 
      const d = parseHubDate(item[0] || item.Timestamp); 
      if (!d) return; 
      const dateKey = d.toLocaleDateString('en-CA'); 
      const itemFreq = String(item[8] || 'Daily').trim(); 
      
      if (!groups[dateKey]) groups[dateKey] = { entries: [], doneUniqueTags: new Set(), frequency: itemFreq }; 
      
      groups[dateKey].entries.push(item); 
      const rawTag = String(item[2] || item.AssetTag || '').trim().toUpperCase(); 
      
      if (rawTag) {
        if (category.id === 'electrical' || operationalAssetMap.has(rawTag)) {
          groups[dateKey].doneUniqueTags.add(rawTag); 
        }
      }
    });

    const completeDays: any[] = []; 
    const missedDays: any[] = [];
    
    Object.entries(groups).forEach(([date, meta]) => {
      let totalReq = operationalAssets.length; 
      let missedAssetsList: any[] = [];
      
      if (category.id === 'electrical') {
        const freq = meta.frequency || 'Daily'; 
        const itemsInFreq = ELECTRICAL_MODULE_DATA.commonItems.filter(i => i.frequency === freq); 
        totalReq = itemsInFreq.length * 3;
        
        ['140H', '141D', '141C'].forEach(campus => { 
          itemsInFreq.forEach(task => { 
            const expectedTag = `${task.id}_${campus}`.toUpperCase(); 
            if (!meta.doneUniqueTags.has(expectedTag)) {
              missedAssetsList.push({ tag: expectedTag, room: `Campus ${campus}`, detail: task.label }); 
            }
          }); 
        });
      } else { 
        missedAssetsList = operationalAssets
          .filter(a => !meta.doneUniqueTags.has(String(a.tag).trim().toUpperCase()))
          .map(a => ({ tag: a.tag, room: a.room })); 
      }
      
      const entriesToShow = category.id === 'electrical' 
        ? meta.entries 
        : meta.entries.filter((e: any) => operationalAssetMap.has(String(e[2]).toUpperCase()));

      const res = { 
        date, 
        entries: entriesToShow, 
        doneCount: meta.doneUniqueTags.size, 
        totalRequired: totalReq, 
        missedAssets: missedAssetsList 
      };

      if (res.doneCount >= totalReq && totalReq > 0) {
        completeDays.push(res); 
      } else {
        missedDays.push(res); 
      }
    });

    return { 
      completeDays: completeDays.sort((a,b) => b.date.localeCompare(a.date)), 
      missedDays: missedDays.sort((a,b) => b.date.localeCompare(a.date)) 
    };
  }, [historyData, synchronizedAssets, historyType, category.id, operationalAssetMap, parseHubDate]);

  const handleShuffle = async (tag: string, newStatus: string) => { setShufflingTag(tag); await updateAssetStatus(category.id, tag, newStatus); setShufflingTag(null); onRefresh(); };
  const handleAcknowledge = async (asset: Asset, cat: string) => { setProcessingInsight(asset.tag); try { await logInsight(category.id, asset.tag, cat, `Acknowledged by Hub Command`); onRefresh(); } catch (e) { console.error(e); } finally { setProcessingInsight(null); } };

  const handleExportCSV = () => {
    if (!historyData.length) return;
    const headers = historyType === 'checklist'
      ? ['Timestamp', 'Technician', 'AssetTag', 'Task', 'Status', 'Remarks', 'Reference', 'Category', 'Frequency']
      : ['Timestamp', 'Category', 'Location', 'AssetTag', 'Details', 'AssignedTo', 'Status', 'ResolvedBy', 'WorkType', 'Remarks', 'GasUsed', 'GasType', 'ComplaintType', 'StarRating', 'PointsAwarded', 'AdminReviewDate', 'ResolutionTimestamp'];

    const csvContent = [
      headers.join(','),
      ...historyData.map(row => row.map((cell: any) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Analyzer_Ledger_${dateRange.start}_${dateRange.end}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 space-y-6">
      <section className="bg-white rounded-xl premium-card border border-slate-100 overflow-hidden">
        <button onClick={() => setIsInsightsOpen(!isInsightsOpen)} className="w-full px-4 py-3 flex justify-between items-center hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2"><span className={`w-1.5 h-1.5 bg-${category.color}-600 rounded-full animate-ping`}></span><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 italic">{category.name} Live Monitor</h3></div>
          <i className={`fas fa-chevron-${isInsightsOpen ? 'up' : 'down'} text-slate-400 text-[10px]`}></i>
        </button>
        {isInsightsOpen && (
          <div className="px-4 pb-4 space-y-3 animate-slideDown">
            {[ { id: 'fault', label: 'Recurring Faults', data: insights.recurring, color: 'rose', icon: 'exclamation-triangle' }, { id: 'life', label: 'EoL Alerts', data: insights.lifeAlerts, color: 'amber', icon: 'hourglass-end' } ].map(insight => (
              <div key={insight.id} className={`border border-${insight.color}-100 rounded-lg overflow-hidden`}>
                <button onClick={() => setOpenAlertCat(openAlertCat === insight.id ? null : insight.id)} className={`w-full flex items-center justify-between p-3 bg-${insight.color}-50/30 hover:bg-${insight.color}-50 transition-colors`}><div className="flex items-center gap-2"><i className={`fas fa-${insight.icon} text-${insight.color}-600 text-[10px]`}></i><p className={`text-[8px] font-black text-${insight.color}-600 uppercase tracking-widest italic`}>{insight.label} ({insight.data.length})</p></div><i className={`fas fa-chevron-${openAlertCat === insight.id ? 'up' : 'down'} text-${insight.color}-300 text-[8px]`}></i></button>
                {openAlertCat === insight.id && <div className="p-2 space-y-1.5 bg-white animate-slideDown">{insight.data.map(a => (<div key={a.tag} className="flex justify-between items-center p-2 rounded-md border border-slate-50 shadow-sm"><div className="flex-1 text-[9px] font-black text-slate-800 italic">{a.tag} • {a.room}</div><button disabled={processingInsight === (a as Asset).tag} onClick={() => handleAcknowledge(a as Asset, insight.label)} className={`bg-${insight.color}-100 text-${insight.color}-600 px-3 py-1 rounded text-[8px] font-black uppercase hover:bg-${insight.color}-600 hover:text-white transition-all`}>ACK</button></div>))}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg flex flex-col justify-between h-28 relative overflow-hidden group border border-white/5"><div className={`absolute top-0 right-0 w-20 h-20 bg-${category.color}-500/10 blur-[30px] group-hover:bg-${category.color}-500/20 transition-all`}></div><div><p className={`text-[8px] font-black uppercase tracking-[0.4em] text-${category.color}-400 mb-1`}>Total Operational</p><h2 className="text-3xl font-extrabold tracking-tighter italic">{assetGroups.installedTotal}</h2></div></div>
        {[ {label: 'Active', list: assetGroups.Active, color: 'emerald', icon: 'shield-check'}, {label: 'Maintenance', list: assetGroups.Maintenance, color: 'amber', icon: 'wrench'}, {label: 'Spare', list: assetGroups.Spare, color: 'slate', icon: 'box-archive'}, {label: 'Waiting for Disposal', list: assetGroups['Waiting for Disposal'], color: 'rose', icon: 'trash-can'}, {label: 'Disposed', list: assetGroups.Disposed, color: 'gray', icon: 'ban'} ].map(g => (
          <button key={g.label} onClick={() => setActiveGroupLabel(g.label)} className="bg-white p-3 rounded-xl border border-slate-100 premium-card text-left flex items-center justify-between group">
            <div><span className={`text-[8px] font-black uppercase tracking-widest text-${g.color}-600 bg-${g.color}-50 px-1.5 py-0.5 rounded mb-1 inline-block truncate max-w-[80px]`}>{g.label}</span><p className="text-xl font-black text-slate-900">{g.list.length}</p></div>
            <div className={`w-9 h-9 bg-slate-50 text-slate-200 rounded-lg flex items-center justify-center text-lg group-hover:bg-${g.color}-600 group-hover:text-white transition-all`}><i className={`fas fa-${g.icon}`}></i></div>
          </button>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {category.id === 'ac' && (
          <div className="lg:col-span-4 h-full">
            <div className="bg-slate-900 p-5 rounded-xl shadow-xl h-full border border-white/5 relative overflow-hidden">
              <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-5 italic">Fluid Registry</h3>
              <GasStatus stats={stats} onRefresh={onRefresh} category={category.id} />
            </div>
          </div>
        )}
        <div className={category.id === 'ac' ? 'lg:col-span-8' : 'lg:col-span-12'}>
          <div className="bg-white p-5 rounded-xl premium-card border border-slate-100 flex flex-col min-h-[440px]">
            <div className="flex flex-col gap-6 mb-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-black italic text-slate-900 uppercase">Analyzer Ledger</h3>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg">
                    {['checklist', 'complaint'].map(t => (
                      <button key={t} onClick={() => { setHistoryType(t as any); setExpandedDate(null); }} className={`px-3 py-1.5 rounded-md text-[8px] font-black uppercase transition-all ${historyType === t ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                    <label className="text-[7px] font-black text-slate-400 uppercase italic">From:</label>
                    <input 
                      type="date" 
                      value={dateRange.start} 
                      onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                      className="bg-transparent text-[9px] font-black outline-none italic uppercase"
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                    <label className="text-[7px] font-black text-slate-400 uppercase italic">To:</label>
                    <input 
                      type="date" 
                      value={dateRange.end} 
                      onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                      className="bg-transparent text-[9px] font-black outline-none italic uppercase"
                    />
                  </div>
                  <button 
                    onClick={handleExportCSV}
                    disabled={historyData.length === 0}
                    className="bg-slate-950 text-white px-5 py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest italic flex items-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-30"
                  >
                    <i className="fas fa-file-csv text-indigo-400"></i>
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto hide-scroll pr-1">
              {isFetchingHistory ? (
                <div className="flex flex-col items-center justify-center h-40 opacity-20"><i className="fas fa-circle-notch animate-spin text-xl"></i></div>
              ) : historyType === 'complaint' ? (
                Object.entries(archiveSummary).sort((a,b) => b[0].localeCompare(a[0])).map(([date, meta]: [string, any]) => (
                  <div key={date}>
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
                    <div key={day.date}>
                      <button onClick={() => setExpandedDate(expandedDate === day.date ? null : day.date)} className="w-full flex justify-between items-center p-3 rounded-lg border bg-emerald-50/20 border-emerald-100">
                        <span className="text-[10px] font-bold text-emerald-900 italic">{day.date}</span>
                        <span className="text-[7px] font-black uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full">DONE ({day.doneCount}/{day.totalRequired})</span>
                      </button>
                      {expandedDate === day.date && (
                         <div className="mt-1.5 p-3 bg-emerald-50/50 rounded-lg animate-slideDown">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {day.entries.map((e: any, idx: number) => (
                                <div key={idx} className="bg-white p-2 rounded-xl border border-emerald-100 shadow-sm">
                                  <p className="text-[9px] font-black text-indigo-600 italic truncate">{e[2]}</p>
                                  <p className="text-[7px] font-bold text-slate-400 truncate uppercase mt-1">VERIFIED BY {e[1]}</p>
                                </div>
                              ))}
                            </div>
                         </div>
                      )}
                    </div>
                  ))}
                  {checklistAnalysis.missedDays.map(day => (
                    <div key={day.date}>
                      <button onClick={() => setExpandedDate(expandedDate === day.date ? null : day.date)} className="w-full flex justify-between items-center p-3 rounded-lg border bg-rose-50/20 border-rose-100">
                        <span className="text-[10px] font-bold text-rose-900 italic">{day.date}</span>
                        <span className="text-[7px] font-black uppercase bg-rose-600 text-white px-2 py-0.5 rounded-full">MISSED ({day.totalRequired - day.doneCount})</span>
                      </button>
                      {expandedDate === day.date && (
                        <div className="mt-1.5 p-3 bg-rose-50/50 rounded-lg animate-slideDown space-y-3">
                           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                             {day.missedAssets.slice(0, 30).map((a: any, idx: number) => (
                               <div key={idx} className="bg-white p-2 rounded-xl border border-rose-100 shadow-sm">
                                 <p className="text-[9px] font-black text-rose-600 italic truncate">{a.tag}</p>
                                 <p className="text-[7px] font-bold text-slate-400 truncate uppercase mt-1">{a.room}</p>
                               </div>
                             ))}
                             {day.missedAssets.length > 30 && <p className="text-[7px] text-slate-400 font-black italic">+{day.missedAssets.length - 30} more...</p>}
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

      <section className="bg-white p-5 rounded-xl premium-card border border-slate-100">
         <LeaderboardItem category={category.id} performanceLogs={stats?.performanceLogs || []} limit={4} onRefresh={onRefresh} compact={false} />
      </section>

      {/* REFACTORED MODAL: Stable content derived from label */}
      {activeDetailData && (
        <div className="fixed inset-0 bg-slate-950/90 z-[200] p-4 backdrop-blur-md flex items-center justify-center">
          <div className="bg-white w-full max-w-5xl rounded-xl h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-white/10 animate-slideUp">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-extrabold uppercase italic tracking-tighter text-slate-900">{activeDetailData.title} Registry</h3>
              <div className="flex items-center gap-2">
                 <input type="text" placeholder="Filter..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-32 lg:w-48 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-bold outline-none" />
                 <button onClick={() => { setActiveGroupLabel(null); setSearchQuery(''); }} className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 active:scale-90"><i className="fas fa-times"></i></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 hide-scroll bg-slate-50/30">
              {activeDetailData.data.filter(a => !searchQuery || a.tag.toLowerCase().includes(searchQuery.toLowerCase()) || a.room.toLowerCase().includes(searchQuery.toLowerCase())).map((item, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl premium-card border border-slate-100 flex flex-col justify-between group">
                  <div>
                    <span className="bg-slate-900 text-white text-[8px] font-black px-2.5 py-1 rounded-full uppercase mb-2 inline-block">{item.tag}</span>
                    <h4 className="text-xs font-black text-slate-900 leading-tight mb-2 italic">"{item.room}"</h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase italic"><i className="fas fa-map-marker-alt text-indigo-400"></i> {item.location}</p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-50">
                    <select 
                      disabled={shufflingTag === String(item.tag)}
                      onChange={async (e) => await handleShuffle(String(item.tag), e.target.value)} 
                      value={item.status} 
                      className="w-full bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded text-[9px] font-black outline-none"
                    >
                      {['Active', 'Maintenance', 'Spare', 'Waiting for Disposal', 'Disposed'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              {activeDetailData.data.length === 0 && (
                <div className="col-span-full py-20 text-center opacity-20">
                  <i className="fas fa-folder-open text-5xl mb-4"></i>
                  <p className="text-xs font-black uppercase italic">No items found in this category</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardView;
