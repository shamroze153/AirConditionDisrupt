
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, Ticket, StatsResponse, ChecklistType } from '../types';
import GasStatus from './GasStatus';
import LeaderboardItem from './LeaderboardItem';
import { updateAssetStatus, getReport, manualOverrideHealth, logInsight, addAsset } from '../services/api';

interface Props {
  assets: Asset[];
  tickets: Ticket[];
  stats: StatsResponse | null;
  onRefresh: () => void;
  onViewTech: () => void;
}

const DashboardView: React.FC<Props> = ({ assets, tickets, stats, onRefresh, onViewTech }) => {
  const [checklistFilter, setChecklistFilter] = useState<ChecklistType>(ChecklistType.DAILY);
  const [reportStatus, setReportStatus] = useState<Record<string, 'Idle' | 'In Progress' | 'Downloaded'>>({
    complaint: 'Idle',
    checklist: 'Idle',
    history: 'Idle'
  });

  const [detailView, setDetailView] = useState<{title: string, data: any[], color?: string, type?: 'complaint' | 'asset' | 'history'} | null>(null);
  const [subSearch, setSubSearch] = useState('');
  const [shufflingTag, setShufflingTag] = useState<string | null>(null);
  const [shuffleStatus, setShuffleStatus] = useState<string>('Idle');

  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [newAsset, setNewAsset] = useState<Partial<Asset>>({ tag: '', room: '', location: '', campus: '', floor: '', brand: '', cap: '', year: new Date().getFullYear() });

  const [hiddenAcks, setHiddenAcks] = useState<Set<string>>(new Set());
  const [ackState, setAckState] = useState<Record<string, string>>({});

  // Export Modal State
  const [exportDialog, setExportDialog] = useState<{type: 'complaint' | 'checklist', open: boolean}>({ type: 'complaint', open: false });
  const todayStr = new Date().toISOString().split('T')[0];
  const [exportRange, setExportRange] = useState({ start: todayStr, end: todayStr });

  // Notification Collapse State
  const [isLifeCycleOpen, setIsLifeCycleOpen] = useState(false);
  const [isRecurringFaultOpen, setIsRecurringFaultOpen] = useState(false);

  const [compRange, setCompRange] = useState({ start: todayStr, end: todayStr });
  const [histRange, setHistRange] = useState({ start: todayStr, end: todayStr });
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  // Initial History Load
  useEffect(() => {
    fetchChecklistHistory();
  }, []);

  // CATEGORIZATION LOGIC (MOVE NOT COPY + EXCLUDE DISPOSED FROM MAIN TOTALS)
  const categories = useMemo(() => {
    const openTags = new Set(tickets.filter(t => !['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status)).map(t => t.assetTag));
    const active = assets.filter(a => String(a.status) === 'Active' && !openTags.has(a.tag));
    const maintenance = assets.filter(a => String(a.status) === 'Maintenance' || openTags.has(a.tag));
    const spare = assets.filter(a => String(a.status) === 'Spare');
    const waiting = assets.filter(a => String(a.status) === 'Waiting for Disposal');
    const disposed = assets.filter(a => String(a.status) === 'Disposed');
    
    return {
      active,
      maintenance,
      spare,
      waiting,
      disposed,
      // Total AC Logic: Exclude Disposed units
      totalCount: active.length + maintenance.length + spare.length + waiting.length,
      all: assets
    };
  }, [assets, tickets]);

  const insights = useMemo(() => {
    const oldAlerts = assets.filter(a => a.year && (currentYear - a.year) >= 5 && !hiddenAcks.has(`${a.tag}_old`));
    const counts: Record<string, number> = {};
    tickets.filter(t => new Date(t.date).getMonth() === currentMonth).forEach(t => counts[t.assetTag] = (counts[t.assetTag] || 0) + 1);
    const recurringAlerts = Object.keys(counts)
      .filter(tag => counts[tag] >= 4 && !hiddenAcks.has(`${tag}_recurring`))
      .map(tag => assets.find(a => a.tag === tag))
      .filter(Boolean) as Asset[];
    return { oldAlerts, recurringAlerts };
  }, [assets, tickets, hiddenAcks, currentYear, currentMonth]);

  const handleAcknowledge = async (asset: Asset, reason: string, ackKey: string) => {
    setAckState(prev => ({ ...prev, [ackKey]: 'Processing...' }));
    await logInsight(asset.tag, 'System Notification', `Ack: ${reason}`);
    setAckState(prev => ({ ...prev, [ackKey]: 'Syncing...' }));
    setTimeout(() => {
      setHiddenAcks(prev => new Set(prev).add(ackKey));
      onRefresh();
    }, 1500);
  };

  const rangeFilteredTickets = useMemo(() => {
    const s = new Date(compRange.start);
    const e = new Date(compRange.end);
    e.setHours(23, 59, 59, 999);
    return tickets.filter(t => {
      const d = new Date(t.date);
      return d >= s && d <= e;
    });
  }, [tickets, compRange]);

  const complaintBuckets = useMemo(() => {
    return {
      open: rangeFilteredTickets.filter(t => t.status === 'Open'),
      wip: rangeFilteredTickets.filter(t => ['In Progress', 'On Hold'].includes(t.status)),
      resolved: rangeFilteredTickets.filter(t => ['Resolved', 'Resolved by Technician'].includes(t.status))
    };
  }, [rangeFilteredTickets]);

  const handleExport = async () => {
    const type = exportDialog.type;
    const range = exportRange;
    setReportStatus(prev => ({ ...prev, [type]: 'In Progress' }));
    setExportDialog({ ...exportDialog, open: false });
    
    const data = await getReport(type, range.start, range.end);
    if (!data.length) {
      alert("No data for range: " + range.start + " to " + range.end);
      setReportStatus(prev => ({ ...prev, [type]: 'Idle' }));
      return;
    }
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => Object.values(obj).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const csv = headers + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DISRUPT_Report_${type}_${new Date().toLocaleDateString()}.csv`;
    a.click();
    setReportStatus(prev => ({ ...prev, [type]: 'Downloaded' }));
    setTimeout(() => setReportStatus(prev => ({ ...prev, [type]: 'Idle' })), 3000);
  };

  // Improved Date Parsing for Sheet Format (1/16/2026 13:18:55)
  const parseSheetDate = (dateStr: string) => {
    if (!dateStr) return new Date(NaN);
    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('/');
    if (dateParts.length === 3) {
      // Handles M/D/YYYY or D/M/YYYY safely
      const month = parseInt(dateParts[0]) - 1;
      const day = parseInt(dateParts[1]);
      const year = parseInt(dateParts[2]);
      if (parts[1]) {
        const timeParts = parts[1].split(':');
        return new Date(year, month, day, parseInt(timeParts[0]), parseInt(timeParts[1]), parseInt(timeParts[2]));
      }
      return new Date(year, month, day);
    }
    return new Date(dateStr);
  };

  const fetchChecklistHistory = async () => {
    setReportStatus(prev => ({ ...prev, history: 'In Progress' }));
    const data = await getReport('checklist', histRange.start, histRange.end);
    setHistoryData(data);
    setReportStatus(prev => ({ ...prev, history: 'Idle' }));
  };

  const activeMaintAssets = assets.filter(a => ['Active', 'Maintenance'].includes(a.status));
  const totalToVerify = activeMaintAssets.length || 1;
  
  const getProgress = (type: ChecklistType) => {
    if (!stats?.hvac) return 0;
    const list = type === ChecklistType.DAILY ? stats.hvac.inspection : 
                 type === ChecklistType.MONTHLY ? stats.hvac.filters : stats.hvac.quarterly;
    const done = list.filter(tag => activeMaintAssets.some(a => a.tag === tag)).length;
    return Math.round((done / totalToVerify) * 100);
  };

  const pct = getProgress(checklistFilter);

  // Group Archive by Date with Completion Summary
  const archiveSummary = useMemo(() => {
    const groups: Record<string, { entries: any[], isComplete: boolean }> = {};
    const totalCount = activeMaintAssets.length;

    historyData.forEach(item => {
      const d = parseSheetDate(item.Timestamp);
      if (isNaN(d.getTime())) return;
      const key = d.toLocaleDateString();
      if (!groups[key]) groups[key] = { entries: [], isComplete: false };
      
      // Filter unique assets per day to calculate completion
      const uniqueTags = new Set(groups[key].entries.map(e => e.AssetTag));
      groups[key].entries.push(item);
      
      // Mark as complete if all required assets are found
      if (uniqueTags.size >= totalCount) {
        groups[key].isComplete = true;
      }
    });

    const completeDates: string[] = [];
    const incompleteDates: string[] = [];

    Object.keys(groups).sort((a,b) => new Date(b).getTime() - new Date(a).getTime()).forEach(date => {
      if (groups[date].isComplete) completeDates.push(date);
      else incompleteDates.push(date);
    });

    return { groups, completeDates, incompleteDates };
  }, [historyData, activeMaintAssets]);

  const filteredViewData = useMemo(() => {
    if (!detailView) return [];
    if (!subSearch) return detailView.data;
    const s = subSearch.toLowerCase();
    return detailView.data.filter(item => 
      String(item.tag || item.AssetTag || item.tag || '').toLowerCase().includes(s) ||
      String(item.room || item.details || '').toLowerCase().includes(s)
    );
  }, [detailView, subSearch]);

  const handleShuffleAction = async (tag: string, newStatus: string) => {
    setShuffleStatus('Shuffling...');
    try {
      // Execute the move: Update the sheet
      await updateAssetStatus(tag, newStatus);
      setShuffleStatus('Shuffled Successfully.');
      
      // Relocate locally immediately for visual speed
      setTimeout(() => {
        setShufflingTag(null);
        setShuffleStatus('Idle');
        onRefresh();
      }, 1000);
    } catch (e) {
      setShuffleStatus('Error');
      setTimeout(() => setShuffleStatus('Idle'), 2000);
    }
  };

  return (
    <div className="p-6 space-y-8 pb-32 animate-fadeIn bg-slate-50/50">
      
      {/* 1. NOTIFICATIONS WIDGET */}
      <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 slide-up">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner"><i className="fas fa-bell animate-bounce"></i></div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Live Notifications</h3>
          </div>
          <span className="text-[10px] font-black text-indigo-400 bg-indigo-50 px-3 py-1 rounded-full">{insights.oldAlerts.length + insights.recurringAlerts.length} Alerts</span>
        </div>
        <div className="space-y-4">
          <div className="border border-slate-50 rounded-2xl overflow-hidden">
            <button onClick={() => setIsLifeCycleOpen(!isLifeCycleOpen)} className="w-full flex justify-between items-center p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors">
              <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                <i className="fas fa-history text-indigo-400"></i> AC Life Cycle
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-slate-400">{insights.oldAlerts.length}</span>
                <i className={`fas fa-chevron-${isLifeCycleOpen ? 'up' : 'down'} text-[10px] text-slate-300`}></i>
              </div>
            </button>
            {isLifeCycleOpen && (
              <div className="p-3 space-y-2 bg-white animate-slideDown">
                {insights.oldAlerts.map(a => (
                  <div key={a.tag} className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-50">
                    <div><h4 className="font-black text-slate-800 text-[10px]">{a.tag}</h4><p className="text-[8px] text-slate-400 font-bold uppercase mt-1">Installed {a.year}</p></div>
                    <button onClick={() => handleAcknowledge(a, 'Legacy Unit Review', `${a.tag}_old`)} className="bg-slate-900 text-white text-[8px] font-black px-4 py-2 rounded-lg">{ackState[`${a.tag}_old`] || 'Ack'}</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-slate-50 rounded-2xl overflow-hidden">
            <button onClick={() => setIsRecurringFaultOpen(!isRecurringFaultOpen)} className="w-full flex justify-between items-center p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors">
              <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                <i className="fas fa-exclamation-triangle text-rose-400"></i> Recurring Faults
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-slate-400">{insights.recurringAlerts.length}</span>
                <i className={`fas fa-chevron-${isRecurringFaultOpen ? 'up' : 'down'} text-[10px] text-slate-300`}></i>
              </div>
            </button>
            {isRecurringFaultOpen && (
              <div className="p-3 space-y-2 bg-white animate-slideDown">
                {insights.recurringAlerts.map(a => (
                  <div key={a.tag} className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-rose-50">
                    <div><h4 className="font-black text-slate-800 text-[10px]">{a.tag}</h4><p className="text-[8px] text-rose-400 font-bold uppercase mt-1">Frequent Failure</p></div>
                    <button onClick={() => handleAcknowledge(a, 'Recurring Fault Check', `${a.tag}_recurring`)} className="bg-rose-600 text-white text-[8px] font-black px-4 py-2 rounded-lg">{ackState[`${a.tag}_recurring`] || 'Ack'}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2. SYSTEM INSIGHTS */}
      <section className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000"></div>
        <div className="relative z-10">
          <h3 className="text-xs font-black text-white/50 uppercase tracking-[0.4em] mb-6">System Insights Hub</h3>
          <div className="grid grid-cols-2 gap-4">
             <div className="bg-white/10 p-5 rounded-[2rem] border border-white/5">
                <span className="text-[10px] font-black text-white/30 uppercase block mb-2 tracking-widest">Efficiency</span>
                <span className="text-2xl font-black text-white">{pct}%</span>
                <div className="mt-4 h-1 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${pct}%` }}></div></div>
             </div>
             <div className="bg-white/10 p-5 rounded-[2rem] border border-white/5">
                <span className="text-[10px] font-black text-white/30 uppercase block mb-2 tracking-widest">Load Index</span>
                <span className="text-2xl font-black text-white">{complaintBuckets.open.length} <span className="text-xs opacity-30">Jobs</span></span>
                <div className="mt-4 flex gap-1">
                   {[1,2,3,4,5].map(i => <div key={i} className={`h-1 flex-1 rounded-full ${i <= complaintBuckets.open.length ? 'bg-rose-500' : 'bg-white/5'}`}></div>)}
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* 3. MASTER ASSET HUB (FIXED COUNTERS) */}
      <section className="slide-up" style={{ animationDelay: '0.2s' }}>
        <div className="flex justify-between items-end mb-6 ml-1">
          <div>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-2">Inventory Central</h3>
            <h2 className="text-3xl font-black text-slate-900 leading-none">Asset Hub</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">Total AC: {categories.totalCount} (Excl. Disposed)</p>
          </div>
          <button onClick={() => setIsAddAssetOpen(true)} className="text-[9px] bg-indigo-600 text-white px-5 py-3 rounded-2xl font-black uppercase shadow-xl hover:bg-indigo-700 transition-all">Add AC</button>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Active', list: categories.active, icon: 'shield-check', color: 'emerald' },
            { label: 'Maint.', list: categories.maintenance, icon: 'wrench', color: 'rose' },
            { label: 'Spare', list: categories.spare, icon: 'box-open', color: 'amber' },
            { label: 'Wait.', list: categories.waiting, icon: 'hourglass-end', color: 'blue' },
            { label: 'Disp.', list: categories.disposed, icon: 'trash-can', color: 'slate' }
          ].map((cat) => (
            <button key={cat.label} onClick={() => { setDetailView({ title: `${cat.label} Assets`, data: cat.list, color: cat.color, type: 'asset' }); setSubSearch(''); }} className="bg-white p-4 rounded-[2rem] border border-slate-100 flex flex-col items-center hover:shadow-2xl hover:-translate-y-1 transition-all group">
              <div className={`w-12 h-12 bg-${cat.color}-50 text-${cat.color}-600 rounded-2xl flex items-center justify-center mb-3 shadow-inner group-hover:scale-110 transition-transform`}><i className={`fas fa-${cat.icon}`}></i></div>
              <span className="text-[8px] font-black uppercase text-slate-400 mb-1 tracking-tighter">{cat.label}</span>
              <span className="text-xl font-black text-slate-900 leading-none">{cat.list.length}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 4. COMPLAINT METRICS */}
      <section className="slide-up" style={{ animationDelay: '0.3s' }}>
        <div className="flex justify-between items-end mb-6 ml-1">
          <div><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-2">Metrics v8.0</h3><h2 className="text-3xl font-black text-slate-900 leading-none">Job Distribution</h2></div>
          <button onClick={() => setExportDialog({ type: 'complaint', open: true })} className="text-[9px] bg-slate-900 text-white px-5 py-3 rounded-2xl font-black uppercase shadow-xl">{reportStatus.complaint === 'In Progress' ? 'Syncing...' : 'Export CSV'}</button>
        </div>
        
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 mb-6 flex flex-col md:flex-row items-center gap-4 shadow-sm">
           <div className="flex-1 grid grid-cols-2 gap-3 w-full">
              <div className="relative"><span className="absolute -top-2 left-4 bg-white px-2 text-[8px] font-black text-slate-300 uppercase z-10">From</span><input type="date" value={compRange.start} onChange={e => setCompRange({...compRange, start: e.target.value})} className="w-full bg-slate-50/50 p-4 rounded-xl text-[10px] font-black border border-slate-100 outline-none" /></div>
              <div className="relative"><span className="absolute -top-2 left-4 bg-white px-2 text-[8px] font-black text-slate-300 uppercase z-10">To</span><input type="date" value={compRange.end} onChange={e => setCompRange({...compRange, end: e.target.value})} className="w-full bg-slate-50/50 p-4 rounded-xl text-[10px] font-black border border-slate-100 outline-none" /></div>
           </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Pending', list: complaintBuckets.open, color: 'rose' },
            { label: 'Work In Progress', list: complaintBuckets.wip, color: 'amber' },
            { label: 'Resolved', list: complaintBuckets.resolved, color: 'emerald' }
          ].map(b => (
            <button key={b.label} onClick={() => setDetailView({ title: `${b.label} Queue`, data: b.list, color: b.color, type: 'complaint' })} className={`bg-white border-b-8 border-${b.color}-500 rounded-[2.5rem] p-6 flex flex-col items-center shadow-sm hover:shadow-2xl transition-all group`}>
              <span className={`text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest`}>{b.label}</span>
              <span className="text-3xl font-black text-slate-900 group-hover:scale-110 transition-transform">{b.list.length}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 5. CHECKLIST ARCHIVE (FIXED SUMMARY LOGIC) */}
      <section className="slide-up" style={{ animationDelay: '0.4s' }}>
        <div className="flex justify-between items-end mb-6 ml-1">
          <div><h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-2">History Engine</h3><h2 className="text-3xl font-black text-slate-900 leading-none">Checklist Archive</h2></div>
          <button onClick={() => setExportDialog({ type: 'checklist', open: true })} className="text-[9px] bg-indigo-600 text-white px-5 py-3 rounded-2xl font-black uppercase shadow-xl">{reportStatus.checklist === 'In Progress' ? 'Syncing...' : 'CSV Export'}</button>
        </div>
        
        {/* Today's Unified Progress Hub */}
        <div className="grid grid-cols-3 gap-3 mb-6">
           {[ChecklistType.DAILY, ChecklistType.MONTHLY, ChecklistType.QUARTERLY].map(type => (
             <div key={type} className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                <span className="text-[8px] font-black text-slate-400 uppercase block mb-2">{type} Progress</span>
                <span className="text-xl font-black text-slate-900 block leading-none mb-3">{getProgress(type)}%</span>
                <div className="h-1 w-full bg-slate-50 rounded-full overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${getProgress(type)}%` }}></div></div>
             </div>
           ))}
        </div>

        <div className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-sm">
           <div className="flex items-center gap-4 mb-8">
              <input type="date" value={histRange.start} onChange={e => setHistRange({...histRange, start: e.target.value})} className="bg-slate-50 px-5 py-4 rounded-2xl text-[10px] font-black border border-slate-100 outline-none flex-1" />
              <input type="date" value={histRange.end} onChange={e => setHistRange({...histRange, end: e.target.value})} className="bg-slate-50 px-5 py-4 rounded-2xl text-[10px] font-black border border-slate-100 outline-none flex-1" />
              <button onClick={fetchChecklistHistory} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl hover:bg-slate-800 transition-all">Search Archive</button>
           </div>

           <div className="space-y-6">
              {/* Green Heading: Fully Completed */}
              <div>
                <h4 className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-4">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> Days Fully Completed (100%)
                </h4>
                <div className="space-y-2">
                  {archiveSummary.completeDates.map(date => (
                    <button key={date} onClick={() => setExpandedDate(expandedDate === date ? null : date)} className="w-full bg-emerald-50/50 p-4 rounded-2xl flex justify-between items-center border border-emerald-100">
                      <span className="text-[11px] font-black text-slate-800">{date}</span>
                      <i className={`fas fa-chevron-${expandedDate === date ? 'up' : 'down'} text-[10px] text-emerald-400`}></i>
                    </button>
                  ))}
                  {archiveSummary.completeDates.length === 0 && <p className="text-center py-4 text-[9px] font-bold text-slate-300 uppercase">No 100% days found</p>}
                </div>
              </div>

              {/* Red Heading: Not Completed */}
              <div>
                <h4 className="flex items-center gap-2 text-[10px] font-black text-rose-600 uppercase tracking-[0.2em] mb-4">
                  <span className="w-2 h-2 bg-rose-500 rounded-full"></span> Days Not Completed (&lt;100%)
                </h4>
                <div className="space-y-2">
                  {archiveSummary.incompleteDates.map(date => (
                    <button key={date} onClick={() => setExpandedDate(expandedDate === date ? null : date)} className="w-full bg-rose-50/50 p-4 rounded-2xl flex justify-between items-center border border-rose-100">
                      <span className="text-[11px] font-black text-slate-800">{date}</span>
                      <i className={`fas fa-chevron-${expandedDate === date ? 'up' : 'down'} text-[10px] text-rose-400`}></i>
                    </button>
                  ))}
                </div>
              </div>
           </div>

           {/* Expanded Date Drill-Down */}
           {expandedDate && (
              <div className="mt-8 p-6 bg-slate-50 rounded-[2.5rem] border border-slate-200 animate-slideDown max-h-[400px] overflow-y-auto hide-scroll">
                <div className="flex justify-between items-center mb-6">
                  <h5 className="text-[11px] font-black text-slate-900 uppercase">Archive Summary: {expandedDate}</h5>
                  <span className="text-[9px] font-black text-indigo-500">{archiveSummary.groups[expandedDate].entries.length} Records</span>
                </div>
                <div className="space-y-3">
                  {archiveSummary.groups[expandedDate].entries.map((item, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl flex justify-between items-center border border-slate-100">
                      <div>
                        <h6 className="text-[10px] font-black text-slate-800">{item.AssetTag}</h6>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{item.Technician} • {item.Status}</p>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${item.Status === 'OK' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    </div>
                  ))}
                </div>
              </div>
           )}
        </div>
      </section>

      {/* 6. LEADERBOARD */}
      <section className="bg-slate-900 p-10 rounded-[3.5rem] shadow-2xl relative overflow-hidden group slide-up" style={{ animationDelay: '0.5s' }}>
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -mr-40 -mt-40 group-hover:scale-125 transition-transform duration-1000"></div>
        <div className="relative z-10">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em] mb-2 leading-none">Efficiency Index</h3>
              <h2 className="text-2xl font-black text-white leading-none">Leaderboard</h2>
            </div>
            <button onClick={onViewTech} className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Full Stats</button>
          </div>
          <LeaderboardItem performanceLogs={stats?.performanceLogs || []} limit={4} onRefresh={onRefresh} />
        </div>
      </section>

      {/* CSV EXPORT PROMPT MODAL */}
      {exportDialog.open && (
        <div className="fixed inset-0 bg-slate-900/95 z-[400] flex items-center justify-center p-8 backdrop-blur-3xl animate-fadeIn">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl slide-up">
              <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Export {exportDialog.type === 'complaint' ? 'Complaints' : 'Checklists'}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-10 tracking-widest">Select Date Range for CSV Generation</p>
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Start Date</label>
                    <input type="date" value={exportRange.start} onChange={e => setExportRange({...exportRange, start: e.target.value})} className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 font-black text-sm outline-none focus:border-indigo-600" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">End Date</label>
                    <input type="date" value={exportRange.end} onChange={e => setExportRange({...exportRange, end: e.target.value})} className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 font-black text-sm outline-none focus:border-indigo-600" />
                 </div>
                 <div className="grid grid-cols-2 gap-3 mt-6">
                    <button onClick={() => setExportDialog({ ...exportDialog, open: false })} className="py-5 text-slate-400 font-black uppercase text-[10px]">Cancel</button>
                    <button onClick={handleExport} className="bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-[10px] shadow-xl">Generate CSV</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MODALS & DRILL-DOWNS */}
      {detailView && (
        <div className="fixed inset-0 bg-slate-900/95 z-[200] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
           <div className="bg-white w-full max-w-2xl rounded-[3.5rem] h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-white/20 slide-up">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div>
                   <h3 className="text-2xl font-black text-slate-900 leading-none uppercase tracking-tight">{detailView.title}</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-4 tracking-[0.3em]">Filtered Analytics Hub</p>
                 </div>
                 <button onClick={() => {setDetailView(null); setSubSearch(''); setShufflingTag(null);}} className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-2xl text-slate-400 border border-slate-100 transition-all hover:rotate-90 active:scale-90"><i className="fas fa-times text-2xl"></i></button>
              </div>
              
              <div className="p-8 bg-white border-b border-slate-50">
                <div className="relative group">
                  <i className="fas fa-search absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors"></i>
                  <input 
                    type="text" value={subSearch} onChange={e => setSubSearch(e.target.value)}
                    placeholder={`Search within ${detailView.title}...`}
                    className="w-full bg-slate-50 px-14 py-4 rounded-2xl border border-slate-100 font-black text-[11px] uppercase tracking-widest outline-none focus:border-indigo-500 transition-all placeholder:text-slate-200" 
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-4 hide-scroll bg-white">
                 {filteredViewData.length === 0 ? (
                   <div className="text-center py-24 opacity-10"><i className="fas fa-search text-6xl mb-4 block"></i><p className="text-sm font-black uppercase tracking-widest">No matching records</p></div>
                 ) : (
                   filteredViewData.map((item, idx) => (
                      <div key={idx} className="bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100 flex flex-col gap-4 group hover:bg-white hover:shadow-2xl transition-all relative overflow-hidden">
                         <div className="flex justify-between items-start">
                           <div className="flex-1">
                              <div className="flex items-center gap-3 mb-3">
                                 <span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest bg-${detailView.color || 'indigo'}-600 text-white shadow-lg`}>{(item.tag || item.AssetTag || item.tag)}</span>
                              </div>
                              <h4 className="font-black text-slate-900 text-lg leading-tight mb-2">{item.room || item.details || item.Remarks || 'System Event Log'}</h4>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest"><i className="fas fa-map-marker-alt mr-2 text-indigo-400"></i>{item.location || item.Location || 'Site'}</p>
                           </div>
                           
                           {detailView.type === 'asset' && (
                             <button 
                                onClick={() => setShufflingTag(shufflingTag === (item.tag || item.AssetTag) ? null : (item.tag || item.AssetTag))} 
                                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${shufflingTag === (item.tag || item.AssetTag) ? 'bg-slate-900 text-white shadow-xl rotate-90' : 'bg-white text-slate-300 shadow-sm'}`}
                             >
                                <i className="fas fa-random"></i>
                             </button>
                           )}
                         </div>

                         {shufflingTag === (item.tag || item.AssetTag) && (
                           <div className="p-5 bg-indigo-50/50 rounded-[2rem] border border-indigo-100 animate-slideDown">
                              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 ml-1">Update Status: {shuffleStatus}</p>
                              <div className="grid grid-cols-2 gap-2">
                                 {['Active', 'Maintenance', 'Spare', 'Waiting for Disposal', 'Disposed'].map(st => (
                                   <button 
                                      key={st} 
                                      onClick={() => handleShuffleAction(item.tag || item.AssetTag, st)}
                                      disabled={shuffleStatus !== 'Idle' || item.status === st}
                                      className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${item.status === st ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-700 hover:bg-slate-900 hover:text-white'}`}
                                   >
                                      {st}
                                   </button>
                                 ))}
                              </div>
                           </div>
                         )}
                      </div>
                    ))
                 )}
              </div>
           </div>
        </div>
      )}

      {/* ADD ASSET MODAL */}
      {isAddAssetOpen && (
        <div className="fixed inset-0 bg-slate-900/98 z-[300] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-[4rem] p-12 shadow-2xl border border-white/20 max-h-[90vh] overflow-y-auto hide-scroll slide-up">
            <div className="flex justify-between items-center mb-10">
               <div><h3 className="text-3xl font-black uppercase text-slate-900">Add AC</h3><p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">Master Database v8.0</p></div>
               <button onClick={() => setIsAddAssetOpen(false)} className="w-14 h-14 bg-slate-50 rounded-full text-slate-300 border border-slate-100"><i className="fas fa-times text-2xl"></i></button>
            </div>
            <div className="space-y-4">
              {['tag', 'room', 'location', 'campus', 'floor', 'brand', 'cap', 'year'].map(field => (
                <div key={field} className="bg-slate-50 p-5 rounded-[2.5rem] border border-slate-100 shadow-inner">
                  <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">{field}</label>
                  <input type={field === 'year' ? 'number' : 'text'} value={(newAsset as any)[field] || ''} onChange={(e) => setNewAsset({...newAsset, [field]: e.target.value})} className="w-full bg-transparent font-black text-sm outline-none placeholder:text-slate-200" placeholder={`Enter ${field}...`} />
                </div>
              ))}
              <button onClick={() => { addAsset(newAsset); setIsAddAssetOpen(false); onRefresh(); }} className="w-full bg-slate-900 text-white py-8 rounded-[3rem] font-black uppercase tracking-[0.4em] text-[10px] shadow-2xl active:scale-95 transition-all mt-6">Add to Inventory</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardView;
