
import React, { useState, useMemo } from 'react';
import { Asset, ChecklistType, StatsResponse } from '../types';
import { postAction } from '../services/api';

interface Props {
  zoneIdx: number;
  techName: string;
  assets: Asset[];
  stats: StatsResponse | null;
  onBack: () => void;
  showToast: (msg: string) => void;
  refreshData: () => void;
}

const ChecklistView: React.FC<Props> = ({ zoneIdx, techName, assets, stats, onBack, showToast, refreshData }) => {
  const [activeTab, setActiveTab] = useState<ChecklistType>(ChecklistType.DAILY);
  const [currentAsset, setCurrentAsset] = useState<Asset | null>(null);
  const [issueDetails, setIssueDetails] = useState('');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showTaskDrill, setShowTaskDrill] = useState<Asset | null>(null);

  // STRICT ZONE PARTITIONING BY MASTER_ASSETS ID
  const zoneAssets = useMemo(() => {
    return assets.filter(a => {
      const id = Number(a.id);
      if (zoneIdx === 0) return id >= 1 && id <= 40;
      if (zoneIdx === 1) return id >= 41 && id <= 82;
      if (zoneIdx === 2) return id >= 83 && id <= 121;
      if (zoneIdx === 3) return id >= 122 && id <= 161;
      return false;
    });
  }, [assets, zoneIdx]);

  const zoneLetter = ['A', 'B', 'C', 'D'][zoneIdx] || 'A';

  const getDoneList = (type: ChecklistType) => {
    if (!stats?.hvac) return [];
    if (type === ChecklistType.DAILY) return stats.hvac.inspection || [];
    if (type === ChecklistType.MONTHLY) return stats.hvac.filters || [];
    return stats.hvac.quarterly || [];
  };

  const currentDoneList = getDoneList(activeTab);

  const handleAction = async (asset: Asset, status: 'OK' | 'Issue') => {
    if (status === 'Issue') {
      setCurrentAsset(asset);
      setShowIssueModal(true);
    } else {
      await finalizeEntry(asset, "OK", "Routine Verification Passed");
    }
  };

  const submitIssue = async () => {
    if (!currentAsset || !issueDetails) return;
    
    // 1. Create Complaint Ticket
    const fd = new FormData();
    fd.append('action', 'complain');
    fd.append('category', 'Checklist Maintenance');
    fd.append('location', currentAsset.location);
    fd.append('assetTag', currentAsset.tag);
    fd.append('details', `[${activeTab}] Fault Detected: ${issueDetails}`);
    fd.append('assignedTech', techName); // Assigned to zone tech
    fd.append('status', 'Open');
    
    showToast("Committing Complaint...");
    await postAction(fd);
    
    // 2. Record Checklist Issue Entry
    await finalizeEntry(currentAsset, "Issue", issueDetails);
    
    setShowIssueModal(false);
    setIssueDetails('');
    setCurrentAsset(null);
  };

  const finalizeEntry = async (asset: Asset, status: string, remarks: string) => {
    const fd = new FormData();
    fd.append('action', 'checklist_entry');
    fd.append('technician', techName);
    fd.append('assetTag', asset.tag);
    fd.append('task', `${activeTab} Tasks`);
    fd.append('status', status);
    fd.append('remarks', remarks);

    showToast("Syncing Grid...");
    await postAction(fd);
    showToast(`Verification: ${status}`);
    refreshData();
  };

  const progressPct = useMemo(() => {
    if (!zoneAssets.length) return 0;
    const doneCount = zoneAssets.filter(a => currentDoneList.includes(a.tag)).length;
    return Math.round((doneCount / zoneAssets.length) * 100);
  }, [zoneAssets, currentDoneList]);

  return (
    <div className="h-full w-full bg-slate-50 flex flex-col">
      <div className="bg-white pt-6 pb-4 px-6 shadow-sm z-30 sticky top-0 border-b">
        <div className="flex justify-between items-center mb-5">
          <button onClick={onBack} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 shadow-inner"><i className="fas fa-arrow-left"></i></button>
          <div className="text-right">
            <h3 className="font-black text-slate-900 text-xl uppercase leading-none">Zone {zoneLetter}</h3>
            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-widest">{techName} Management</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-2xl border border-slate-100">
          {Object.values(ChecklistType).map(t => (
            <button 
              key={t}
              onClick={() => setActiveTab(t)} 
              className={`flex-1 px-4 py-3 rounded-xl text-[9px] font-black uppercase transition-all tracking-tighter ${activeTab === t ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-white'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-100">
            <div className={`h-full bg-emerald-500 transition-all duration-1000`} style={{ width: `${progressPct}%` }}></div>
          </div>
          <span className="text-[10px] font-black text-slate-900">{progressPct}%</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-32 hide-scroll bg-slate-50/50">
        {zoneAssets.length === 0 ? (
          <div className="text-center py-24 opacity-20">
            <i className="fas fa-satellite-dish text-6xl mb-6"></i>
            <p className="text-sm font-black uppercase tracking-widest">Scanning empty zone...</p>
          </div>
        ) : (
          zoneAssets.map((a, i) => {
            const isDone = currentDoneList.includes(a.tag);
            return (
              <div key={i} className={`bg-white p-6 rounded-[3rem] border-2 transition-all group ${isDone ? 'border-emerald-200 bg-emerald-50/20' : 'border-white hover:border-indigo-100'}`}>
                 <div className="flex justify-between items-start mb-4">
                    <div onClick={() => setShowTaskDrill(a)} className="cursor-pointer">
                      <div className="flex items-center gap-2 mb-2">
                         <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-indigo-100">{a.tag}</span>
                         <span className="text-[8px] font-bold text-slate-300 uppercase">ID: {a.id}</span>
                      </div>
                      <h4 className="font-black text-slate-900 text-base leading-tight group-hover:text-indigo-600 transition-colors">{a.room}</h4>
                      <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{a.brand} • {a.location}</p>
                    </div>
                    {isDone ? (
                      <div className="bg-emerald-500 text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-100 animate-fadeIn"><i className="fas fa-check"></i></div>
                    ) : (
                      <div className="w-10 h-10 bg-slate-50 text-slate-200 rounded-2xl flex items-center justify-center border border-slate-100"><i className="fas fa-hourglass-half"></i></div>
                    )}
                 </div>
                 {!isDone && (
                   <div className="flex gap-2 mt-6">
                      <button onClick={() => handleAction(a, 'OK')} className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">Verify OK</button>
                      <button onClick={() => handleAction(a, 'Issue')} className="flex-1 bg-rose-50 text-rose-600 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-rose-100 active:scale-95 transition-all">Report Issue</button>
                   </div>
                 )}
              </div>
            );
          })
        )}
      </div>

      {showTaskDrill && (
        <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
           <div className="bg-white w-full max-w-sm rounded-[3.5rem] p-10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="flex justify-between items-center mb-8">
                 <div>
                   <h3 className="text-2xl font-black text-slate-900 leading-none uppercase">Task Drill</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest">Asset Analysis: {showTaskDrill.tag}</p>
                 </div>
                 <button onClick={() => setShowTaskDrill(null)} className="w-12 h-12 bg-slate-50 rounded-full text-slate-300 border border-slate-100"><i className="fas fa-times text-xl"></i></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                 {[ChecklistType.DAILY, ChecklistType.MONTHLY, ChecklistType.QUARTERLY].map(type => {
                   const done = getDoneList(type).includes(showTaskDrill.tag);
                   return (
                     <div key={type} className={`p-6 rounded-[2rem] border flex justify-between items-center ${done ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{type} Check</p>
                          <h5 className={`text-xs font-black mt-1 ${done ? 'text-emerald-700' : 'text-slate-400'}`}>{done ? 'Verified & Synced' : 'Pending Verification'}</h5>
                        </div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-100'}`}><i className={`fas ${done ? 'fa-check' : 'fa-minus'}`}></i></div>
                     </div>
                   );
                 })}
              </div>
           </div>
        </div>
      )}

      {showIssueModal && (
        <div className="fixed inset-0 bg-slate-900/95 z-[200] flex items-center justify-center p-8 backdrop-blur-md">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl animate-slideDown">
              <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase">Fault Details</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-8 tracking-widest">Complaint logged to {techName}</p>
              <textarea 
                value={issueDetails}
                onChange={(e) => setIssueDetails(e.target.value)}
                placeholder="Diagnostic summary of issue..."
                className="w-full bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 focus:border-rose-500 outline-none font-bold text-sm min-h-[160px] transition-all placeholder:text-slate-300"
              />
              <div className="grid grid-cols-2 gap-3 mt-8">
                 <button onClick={() => setShowIssueModal(false)} className="py-5 text-slate-400 font-black uppercase text-[10px] tracking-widest">Cancel</button>
                 <button onClick={submitIssue} className="bg-rose-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all">Commit Issue</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ChecklistView;
