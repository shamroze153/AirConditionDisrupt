
import React, { useState, useMemo } from 'react';
import { Asset, ChecklistType, StatsResponse } from '../types.ts';
import { postAction, updatePoints } from '../services/api.ts';

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
  const [showImageModal, setShowImageModal] = useState<Asset | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

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
      if (activeTab === ChecklistType.MONTHLY || activeTab === ChecklistType.QUARTERLY) {
        setShowImageModal(asset);
      } else {
        await finalizeEntry(asset, "OK", "Daily Pass");
      }
    }
  };

  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setCapturedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const submitWithImage = async () => {
    if (showImageModal && capturedImage) {
      await finalizeEntry(showImageModal, "OK", `Evidence Attached [${activeTab}]`);
      setShowImageModal(null);
      setCapturedImage(null);
    }
  };

  const submitIssue = async () => {
    if (!currentAsset || !issueDetails) return;
    const fd = new FormData();
    fd.append('action', 'complain');
    fd.append('category', 'Checklist Maintenance');
    fd.append('location', currentAsset.location);
    fd.append('assetTag', currentAsset.tag);
    fd.append('details', `[${activeTab}] Issue Found: ${issueDetails}`);
    fd.append('assignedTech', techName);
    fd.append('status', 'Open');
    showToast("Dispatching Issue Log...");
    await postAction(fd);
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
    fd.append('task', `${activeTab} Checklist`);
    fd.append('status', status);
    fd.append('remarks', remarks);
    showToast("Syncing Checklist Registry...");
    await postAction(fd);
    
    // Merit System: +1 point for checklist entry
    if (status === "OK") {
      await updatePoints(techName, 1, `Completed ${activeTab} Checklist: ${asset.tag}`);
    }
    
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
          <button onClick={onBack} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 shadow-inner active:scale-90"><i className="fas fa-arrow-left"></i></button>
          <div className="text-right">
            <h3 className="font-black text-slate-900 text-lg uppercase leading-none italic tracking-tighter">Zone {zoneLetter} Registry</h3>
            <p className="text-[8px] text-slate-400 font-bold uppercase mt-1 tracking-widest italic">{techName} Operational Control</p>
          </div>
        </div>
        <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-xl">
          {[ChecklistType.DAILY, ChecklistType.MONTHLY, ChecklistType.QUARTERLY].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 px-2 py-2.5 rounded-lg text-[7px] font-black uppercase transition-all tracking-widest italic ${activeTab === t ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-white'}`}>{t}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-emerald-500 transition-all duration-1000 shadow-[0_0_8px_#10b981]" style={{ width: `${progressPct}%` }}></div></div>
          <span className="text-[9px] font-black text-slate-900 italic">{progressPct}%</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-3 pb-32 hide-scroll bg-slate-50/50">
        {zoneAssets.length === 0 ? (
          <div className="text-center py-24 opacity-20"><i className="fas fa-satellite-dish text-5xl mb-6"></i><p className="text-[9px] font-black uppercase tracking-[0.4em] italic">Scanning Zone Assets...</p></div>
        ) : (
          zoneAssets.map((a, i) => {
            const isDone = currentDoneList.includes(a.tag);
            return (
              <div key={i} className={`bg-white p-5 rounded-3xl border-2 transition-all group ${isDone ? 'border-emerald-100 bg-emerald-50/20' : 'border-white hover:border-indigo-100 shadow-sm'}`}>
                 <div className="flex justify-between items-start">
                    <div onClick={() => setShowTaskDrill(a)} className="cursor-pointer">
                      <div className="flex items-center gap-2 mb-2"><span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[7px] font-black uppercase tracking-widest border border-indigo-100 italic">{a.tag}</span><span className="text-[7px] font-bold text-slate-200 uppercase italic">ID: {a.id}</span></div>
                      <h4 className="font-black text-slate-900 text-xs leading-tight group-hover:text-indigo-600 transition-colors italic tracking-tight">"{a.room}"</h4>
                      <p className="text-[7px] text-slate-400 font-bold mt-1 uppercase tracking-widest italic">{a.brand} • {a.location}</p>
                    </div>
                    {isDone ? (
                      <div className="bg-emerald-500 text-white w-9 h-9 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-100 animate-fadeIn"><i className="fas fa-check text-xs"></i></div>
                    ) : (
                      <div className="w-9 h-9 bg-slate-50 text-slate-200 rounded-2xl flex items-center justify-center border border-slate-100"><i className="fas fa-clock text-xs"></i></div>
                    )}
                 </div>
                 {!isDone && (
                   <div className="flex gap-2 mt-4">
                      <button onClick={() => handleAction(a, 'OK')} className="flex-[2] bg-slate-900 text-white py-3 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all italic">Log OK</button>
                      <button onClick={() => handleAction(a, 'Issue')} className="flex-1 bg-rose-50 text-rose-600 py-3 rounded-xl text-[8px] font-black uppercase tracking-widest border border-rose-100 active:scale-95 transition-all italic">Issue</button>
                   </div>
                 )}
              </div>
            );
          })
        )}
      </div>

      {/* EVIDENCE CAPTURE MODAL */}
      {showImageModal && (
        <div className="fixed inset-0 bg-slate-950/98 z-[150] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-2xl p-8 shadow-2xl text-center">
            <h3 className="text-xl font-black uppercase text-slate-900 mb-2 italic tracking-tighter">Maintenance Evidence</h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase mb-6 italic tracking-widest">A capture is required for {activeTab} logs on {showImageModal.tag}</p>
            
            <div className="bg-slate-50 border-2 border-dashed border-slate-100 rounded-2xl aspect-video mb-6 flex items-center justify-center relative overflow-hidden group">
              {capturedImage ? (
                <img src={capturedImage} alt="Capture" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center">
                  <i className="fas fa-camera text-slate-200 text-3xl mb-3"></i>
                  <p className="text-[7px] font-black text-slate-300 uppercase tracking-widest">Environment Capture Required</p>
                </div>
              )}
              <input type="file" accept="image/*" capture="environment" onChange={handleImageCapture} className="absolute inset-0 opacity-0 cursor-pointer" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => {setShowImageModal(null); setCapturedImage(null);}} className="py-3 text-[9px] font-black uppercase text-slate-300 italic">Cancel</button>
              <button onClick={submitWithImage} disabled={!capturedImage} className="bg-slate-900 text-white py-3 rounded-xl font-black uppercase text-[9px] italic tracking-widest shadow-xl disabled:opacity-20 transition-all">Submit Evidence</button>
            </div>
          </div>
        </div>
      )}

      {/* (Rest of ChecklistView remains the same...) */}
      {showTaskDrill && (
        <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
           <div className="bg-white w-full max-w-sm rounded-2xl p-8 shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-white/5">
              <div className="flex justify-between items-center mb-8"><div><h3 className="text-xl font-black text-slate-900 leading-none uppercase italic tracking-tighter">System Drill</h3><p className="text-[8px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Asset: {showTaskDrill.tag}</p></div><button onClick={() => setShowTaskDrill(null)} className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300 active:scale-90"><i className="fas fa-times text-base"></i></button></div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 hide-scroll">
                 {[ChecklistType.DAILY, ChecklistType.MONTHLY, ChecklistType.QUARTERLY].map(type => {
                   const done = getDoneList(type).includes(showTaskDrill.tag);
                   return (
                     <div key={type} className={`p-4 rounded-xl border flex justify-between items-center ${done ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 opacity-40'}`}>
                        <div><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">{type} Check</p><h5 className={`text-[9px] font-black mt-1 uppercase ${done ? 'text-emerald-700' : 'text-slate-400'}`}>{done ? 'Verified System' : 'Awaiting sync'}</h5></div>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${done ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-200 text-slate-100'}`}><i className={`fas ${done ? 'fa-check' : 'fa-minus'} text-[8px]`}></i></div>
                     </div>
                   );
                 })}
              </div>
           </div>
        </div>
      )}

      {showIssueModal && (
        <div className="fixed inset-0 bg-slate-900/95 z-[200] flex items-center justify-center p-6 backdrop-blur-md animate-fadeIn">
           <div className="bg-white w-full max-w-sm rounded-2xl p-8 shadow-2xl border border-white/5">
              <h3 className="text-xl font-black text-slate-900 mb-2 uppercase italic tracking-tighter leading-none">Fault Narrative</h3>
              <p className="text-[8px] font-bold text-slate-400 uppercase mb-6 tracking-widest italic">Anomalous findings for {currentAsset?.tag}</p>
              <textarea value={issueDetails} onChange={e => setIssueDetails(e.target.value)} placeholder="Narrate findings brief..." className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 focus:border-rose-500 outline-none font-bold text-xs min-h-[140px] transition-all resize-none italic" />
              <div className="grid grid-cols-2 gap-3 mt-6">
                 <button onClick={() => setShowIssueModal(false)} className="py-4 text-slate-400 font-black uppercase text-[9px] tracking-widest italic">Cancel</button>
                 <button onClick={submitIssue} className="bg-rose-600 text-white py-4 rounded-xl font-black uppercase text-[9px] tracking-widest shadow-2xl active:scale-95 transition-all italic">Commit fault</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ChecklistView;
