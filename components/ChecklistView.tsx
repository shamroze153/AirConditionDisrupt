import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Asset, ChecklistType, StatsResponse, CategoryKey } from '../types.ts';
import { CAMPUS_ASSETS, ELECTRICAL_MODULE_DATA, EXHAUST_FAN_INVENTORY } from '../constants.ts';
import { postAction, updatePoints, getReport, updateAssetStatus } from '../services/api.ts';

interface Props {
  category: CategoryKey;
  zoneIdx: number;
  techName: string;
  assets: Asset[];
  stats: StatsResponse | null;
  onBack: () => void;
  showToast: (msg: string) => void;
  refreshData: () => void;
}

const ChecklistView: React.FC<Props> = ({ category, zoneIdx, techName, assets, stats, onBack, showToast, refreshData }) => {
  const [activeFrequency, setActiveFrequency] = useState<ChecklistType>(ChecklistType.DAILY);
  const [selectedCampus, setSelectedCampus] = useState<'140H' | '141D' | '141C' | ''>(category === 'ac' ? '140H' : ''); 
  
  const [currentTask, setCurrentTask] = useState<string | null>(null);
  const [issueDetails, setIssueDetails] = useState('');
  const [showIssueModal, setShowIssueModal] = useState(false);

  // Requirement 1: Local state for zero-latency feedback (Green & Locked)
  const [locallyDoneTags, setLocallyDoneTags] = useState<Set<string>>(new Set());

  // Store metadata for completion sync to see who completed shared items
  const [electricalMetadata, setElectricalMetadata] = useState<Record<string, { tech: string, timestamp: string }>>({});

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  const [syncingTags, setSyncingTags] = useState<Set<string>>(new Set());
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Reset local tracking when context changes to prevent stale UI locks
  useEffect(() => {
    setLocallyDoneTags(new Set());
  }, [activeFrequency, selectedCampus]);

  // Requirement 4: Operational Logging for Sync Checks
  useEffect(() => {
    if (stats) {
      console.log(`[CHECKLIST SYSTEM] Syncing Registry... Category: ${category.toUpperCase()}, Tech: ${techName}, Freq: ${activeFrequency}`);
      const list = stats.hvac[activeFrequency.toLowerCase() as keyof typeof stats.hvac] || [];
      console.log(`[CHECKLIST SYSTEM] Remote Records Found for ${activeFrequency}: ${list.length}`);
    }
  }, [category, activeFrequency, stats, techName]);

  // Fetch detailed metadata for Electrical synchronization
  useEffect(() => {
    const fetchElectricalMeta = async () => {
      try {
        const now = new Date();
        const todayDateStr = now.toISOString().split('T')[0];
        const report = await getReport(category, 'checklist', '2024-01-01', todayDateStr);
        const meta: Record<string, { tech: string, timestamp: string }> = {};
        
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();

        report.forEach((row: any) => {
          const rDate = new Date(row[0]);
          const rDateStr = rDate.toISOString().split('T')[0];
          const rFreq = row[8] || row.Frequency;
          const rCat = String(row[7] || '').toUpperCase();
          const rStatus = String(row[4] || row.Status || '').trim().toUpperCase();
          
          if (rCat !== category.toUpperCase()) return;
          if (rStatus !== 'OK' && rStatus !== 'DONE' && rStatus !== 'COMPLETED') return;

          let inWindow = false;
          if (rFreq === ChecklistType.DAILY && rDateStr === todayDateStr) inWindow = true;
          if (rFreq === ChecklistType.MONTHLY && rDate.getMonth() === thisMonth && rDate.getFullYear() === thisYear) inWindow = true;
          if (rFreq === ChecklistType.QUARTERLY && Math.floor(rDate.getMonth() / 3) === Math.floor(thisMonth / 3) && rDate.getFullYear() === thisYear) inWindow = true;

          if (inWindow && rFreq === activeFrequency) {
            const tag = String(row[2] || row.AssetTag || '').trim().toUpperCase();
            const tech = row[1] || row.Technician;
            meta[tag] = { tech, timestamp: rDate.toLocaleString() };
          }
        });
        setElectricalMetadata(meta);
      } catch (e) {
        console.error("Registry meta-sync failed", e);
      }
    };
    if (category === 'electrical') fetchElectricalMeta();
  }, [category, activeFrequency, stats]);

  const currentTaskItems = useMemo(() => {
    if (category === 'ac') {
      return assets.filter(a => {
        const status = String(a.status || '').trim().toUpperCase();
        if (status !== 'ACTIVE') return false;
        const id = Number(a.id);
        if (zoneIdx === 0) return id >= 1 && id <= 40;
        if (zoneIdx === 1) return id >= 41 && id <= 82;
        if (zoneIdx === 2) return id >= 83 && id <= 121;
        if (zoneIdx === 3) return id >= 122 && id <= 161;
        return false;
      }).map(a => ({ 
        tag: a.tag, 
        label: a.room, 
        group: `Zone ${zoneIdx + 1}`, 
        id: a.id, 
        exactLocation: `${a.campus} - ${a.floor} - ${a.room}`
      }));
    } else if (category === 'electrical') {
      if (!selectedCampus) return [];
      const items: any[] = [];
      const commonTasks = ELECTRICAL_MODULE_DATA.commonItems.filter(i => i.frequency === activeFrequency);
      commonTasks.forEach(item => {
        items.push({ 
          id: item.id.toUpperCase(),
          tag: `${item.id}_${selectedCampus}`.toUpperCase(), 
          label: item.label, 
          group: item.group, 
          exactLocation: selectedCampus 
        });
      });
      if (activeFrequency === ChecklistType.MONTHLY) {
        const fanData = EXHAUST_FAN_INVENTORY[selectedCampus];
        if (fanData) {
          fanData.forEach(floorInfo => {
            for (let i = 1; i <= floorInfo.qty; i++) {
              const fanId = `EF_${floorInfo.floor.replace(/\s/g, '_')}_${i}`.toUpperCase();
              items.push({ 
                id: fanId,
                tag: `${fanId}_${selectedCampus}`.toUpperCase(), 
                label: `Exhaust Fan ${i} - ${floorInfo.floor}`, 
                group: `Exhaust Fans (${floorInfo.floor})`, 
                exactLocation: `${selectedCampus} - ${floorInfo.floor}` 
              });
            }
          });
        }
      }
      return items;
    }
    return [];
  }, [category, assets, zoneIdx, selectedCampus, activeFrequency]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, any[]> = {};
    currentTaskItems.forEach(item => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });
    return groups;
  }, [currentTaskItems]);

  const currentDoneList = useMemo(() => {
    let list: string[] = [];
    if (activeFrequency === ChecklistType.DAILY) list = stats?.hvac?.daily || [];
    else if (activeFrequency === ChecklistType.MONTHLY) list = stats?.hvac?.monthly || [];
    else if (activeFrequency === ChecklistType.QUARTERLY) list = stats?.hvac?.quarterly || [];
    return list.map(t => String(t || '').trim().toUpperCase());
  }, [stats, activeFrequency]);

  const completionStats = useMemo(() => {
    const calc = (listRaw: string[]) => {
      if (currentTaskItems.length === 0) return 0;
      const list = [...listRaw.map(t => String(t || '').trim().toUpperCase()), ...Array.from(locallyDoneTags)];
      const count = currentTaskItems.filter(item => list.includes(String(item.tag || '').toUpperCase())).length;
      return Math.round((count / currentTaskItems.length) * 100);
    };
    return {
      daily: calc(stats?.hvac?.daily || []),
      monthly: calc(stats?.hvac?.monthly || []),
      quarterly: calc(stats?.hvac?.quarterly || [])
    };
  }, [currentTaskItems, stats, locallyDoneTags]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        setCapturedPhoto(null);
      }
    } catch (err) { showToast("Camera Access Denied"); }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      setIsCameraActive(false);
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = 800;
      canvasRef.current.height = 600;
      context?.drawImage(videoRef.current, 0, 0, 800, 600);
      const data = canvasRef.current.toDataURL('image/jpeg', 0.5); 
      setCapturedPhoto(data);
      stopCamera();
    }
  };

  const handleAction = async (itemTag: string, status: 'OK' | 'Issue') => {
    if ((category === 'electrical') && !selectedCampus) {
      showToast("Select Campus First");
      return;
    }

    if (status === 'Issue') {
      setCurrentTask(itemTag);
      setShowIssueModal(true);
      return;
    }

    // Requirement 2: Evidence Protocol for non-daily tasks
    if (activeFrequency !== ChecklistType.DAILY) {
      setCurrentTask(itemTag);
      setCapturedPhoto(null);
      setUploadSuccess(false);
      setShowPhotoModal(true);
      startCamera();
      return;
    }

    // Requirement 1 & 2: Instant Feedback & Lock
    const tagNormalized = itemTag.toUpperCase();
    setLocallyDoneTags(prev => new Set(prev).add(tagNormalized));
    setSyncingTags(prev => new Set(prev).add(itemTag));
    
    try {
      await finalizeEntry(itemTag, "OK", "Routine Verified", "");
      // Requirement 4: Logging
      console.log(`[LOG] Task marked DONE. Tag: ${itemTag}, Tech: ${techName}, Freq: ${activeFrequency}, Time: ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      setLocallyDoneTags(prev => { const n = new Set(prev); n.delete(tagNormalized); return n; });
      setSyncingTags(prev => { const n = new Set(prev); n.delete(itemTag); return n; });
      showToast("Transmission Failure. Retrying...");
    }
  };

  const handleTransmitPhoto = async () => {
    if (!currentTask || !capturedPhoto) return;
    setIsUploading(true);
    setSyncingTags(prev => new Set(prev).add(currentTask));
    try {
      await finalizeEntry(currentTask, "OK", `Verified via ${activeFrequency} Evidence`, capturedPhoto);
      setUploadSuccess(true);
      setLocallyDoneTags(prev => new Set(prev).add(currentTask.toUpperCase()));
      console.log(`[LOG] Task marked DONE with PHOTO. Tag: ${currentTask}, Tech: ${techName}, Freq: ${activeFrequency}`);
      setTimeout(() => { setShowPhotoModal(false); setIsUploading(false); setUploadSuccess(false); setCapturedPhoto(null); }, 1500);
    } catch (e) {
      setIsUploading(false);
      setSyncingTags(prev => { const n = new Set(prev); n.delete(currentTask); return n; });
      showToast("Transmission failure");
    }
  };

  const finalizeEntry = async (itemTag: string, status: string, remarks: string, photo: string) => {
    const fd = new FormData();
    fd.append('action', 'checklist_entry');
    fd.append('category', category.toUpperCase());
    fd.append('technician', techName);
    fd.append('assetTag', itemTag.toUpperCase());
    fd.append('frequency', activeFrequency);
    fd.append('task', `${activeFrequency} ${category.toUpperCase()} Check`);
    fd.append('status', status); 
    fd.append('remarks', remarks);
    if (photo) fd.append('photo', photo); 
    
    if (!isUploading) showToast(`Synchronizing Registry...`);
    await postAction(fd);

    // Requirement 1 & 2: Award points only to action-taker
    if (status === "OK") await updatePoints(category, techName, 1, `${category.toUpperCase()} ${activeFrequency} Verification`);

    if (status === "Issue") {
      const taskItem = currentTaskItems.find(it => it.tag === itemTag);
      const wofd = new FormData();
      wofd.append('action', 'complain');
      wofd.append('category', category.toUpperCase());
      wofd.append('complaintType', 'Proactive');
      wofd.append('location', taskItem?.exactLocation || selectedCampus);
      wofd.append('assetTag', itemTag.toUpperCase());
      wofd.append('details', `[CHECKLIST ALERT] ${remarks}`);
      wofd.append('assignedTech', techName); 
      wofd.append('status', 'Open');
      await postAction(wofd);
      showToast("Work Order Dispatched");
    }
    refreshData();
  };

  return (
    <div className="h-full w-full bg-slate-50 flex flex-col pb-20 overflow-hidden">
      <div className="bg-white pt-6 pb-4 px-6 shadow-sm z-30 sticky top-0 border-b">
        <div className="flex justify-between items-center mb-5">
          <button onClick={onBack} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 active:scale-90">
            <i className="fas fa-arrow-left"></i>
          </button>
          <div className="text-right">
            <h3 className="font-black text-slate-900 text-lg uppercase italic tracking-tighter leading-none">{category.toUpperCase()} HUB</h3>
            <p className="text-[8px] text-slate-400 font-bold uppercase mt-1 tracking-widest italic">{techName} Operational</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-xl shadow-inner overflow-x-auto hide-scroll">
          {[ChecklistType.DAILY, ChecklistType.MONTHLY, ChecklistType.QUARTERLY].map(freq => (
            <button key={freq} onClick={() => setActiveFrequency(freq)} className={`flex-1 min-w-[70px] py-2 rounded-lg text-[8px] font-black uppercase transition-all tracking-widest italic ${activeFrequency === freq ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>{freq}</button>
          ))}
        </div>

        {category !== 'ac' && (
          <div className="flex gap-2 mb-4 bg-slate-50 p-1 rounded-xl shadow-inner overflow-x-auto hide-scroll border border-slate-100">
            {['140H', '141D', '141C'].map(campus => (
              <button key={campus} onClick={() => setSelectedCampus(campus as any)} className={`flex-1 min-w-[80px] px-2 py-2 rounded-lg text-[7px] font-black uppercase transition-all tracking-widest italic ${selectedCampus === campus ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-400 hover:bg-white'}`}>Campus {campus}</button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 py-3 border-t border-slate-50 mt-2 px-2">
           <div className="flex gap-6">
              {[
                { label: 'Daily', pct: completionStats.daily },
                { label: 'Monthly', pct: completionStats.monthly },
                { label: 'Quartly', pct: completionStats.quarterly }
              ].map(stat => (
                <div key={stat.label} className="flex flex-col items-center">
                   <span className="text-[7px] font-black text-slate-300 uppercase italic mb-1">{stat.label}</span>
                   <div className={`text-xl font-black italic leading-none ${stat.pct === 100 ? 'text-emerald-500' : 'text-slate-900'}`}>{stat.pct}<span className="text-[10px] ml-0.5">%</span></div>
                </div>
              ))}
           </div>
           <div className="flex-1 max-w-[120px] flex flex-col items-end">
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Progress</span>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-slate-900 transition-all duration-1000" style={{ width: `${completionStats[activeFrequency.toLowerCase() as keyof typeof completionStats] || 0}%` }}></div>
              </div>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-8 hide-scroll">
        {category !== 'ac' && !selectedCampus ? (
          <div className="py-24 text-center opacity-10 flex flex-col items-center">
            <i className="fas fa-building text-7xl mb-6"></i>
            <p className="text-xs font-black uppercase tracking-[0.5em]">Select Building Segment</p>
          </div>
        ) : (
          Object.entries(groupedTasks).map(([group, tasks]) => (
            <div key={group} className="space-y-3">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic ml-2">{group}</h4>
               {(tasks as any[]).map((item, i) => {
                 const tagNormalized = String(item.tag || '').toUpperCase();
                 // Requirement 1 & 2: Robust Shared Lock Logic
                 const isDone = locallyDoneTags.has(tagNormalized) || currentDoneList.includes(tagNormalized);
                 const isSyncing = syncingTags.has(item.tag);
                 const metadata = electricalMetadata[tagNormalized];

                 return (
                   <div key={i} className={`bg-white p-5 rounded-[2rem] border-2 transition-all shadow-sm ${isDone ? 'border-emerald-100 bg-emerald-50/20' : isSyncing ? 'border-amber-100 bg-amber-50/10' : 'border-white'}`}>
                     <div className="flex justify-between items-center">
                       <div className="flex-1 pr-4">
                         <div className="flex flex-wrap items-center gap-2 mb-1">
                           <span className="bg-indigo-50 text-indigo-600 text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">{item.tag}</span>
                           <span className="text-[7px] text-slate-300 font-bold uppercase tracking-tighter italic">{item.exactLocation}</span>
                         </div>
                         <p className="text-[11px] font-black text-slate-900 uppercase italic leading-tight">{item.label}</p>
                         
                         {isDone && (
                           <div className="mt-2 flex flex-col gap-1 animate-fadeIn">
                              <div className="flex items-center gap-1.5">
                                <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>
                                <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest italic">
                                  {locallyDoneTags.has(tagNormalized) ? `Verified by You` : `Verified by ${metadata?.tech || 'Field Team'}`}
                                </p>
                              </div>
                              {metadata?.timestamp && <p className="text-[6px] font-bold text-slate-300 ml-2.5 uppercase italic">{metadata.timestamp}</p>}
                           </div>
                         )}
                       </div>
                       
                       <div className="flex items-center gap-2">
                         {isDone ? (
                           <div className="flex flex-col items-center gap-1">
                             <div className="bg-emerald-600 text-white w-9 h-9 rounded-2xl flex items-center justify-center shadow-lg animate-fadeIn shadow-emerald-200"><i className="fas fa-check text-xs"></i></div>
                             <span className="text-[6px] font-black text-emerald-400 uppercase tracking-tighter italic">Verified</span>
                           </div>
                         ) : isSyncing ? (
                           <div className="bg-slate-100 text-slate-400 w-9 h-9 rounded-2xl flex items-center justify-center shadow-inner"><i className="fas fa-circle-notch animate-spin text-xs"></i></div>
                         ) : (
                           <div className="flex gap-2">
                             <button onClick={() => handleAction(item.tag, 'OK')} className="bg-slate-900 text-white px-5 py-3 rounded-xl text-[9px] font-black uppercase italic active:scale-95 transition-all shadow-md">Done</button>
                             <button onClick={() => handleAction(item.tag, 'Issue')} className="bg-rose-50 text-rose-600 px-5 py-3 rounded-xl text-[9px] font-black uppercase italic active:scale-95 transition-all">Fault</button>
                           </div>
                         )}
                       </div>
                     </div>
                   </div>
                 );
               })}
            </div>
          ))
        )}
      </div>

      {showPhotoModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center p-6 backdrop-blur-md animate-fadeIn">
           <div className="bg-white w-full max-sm rounded-[2.5rem] p-8 shadow-2xl flex flex-col items-center">
              <h3 className="text-xl font-black text-slate-950 uppercase italic tracking-tighter text-center mb-2">Evidence Protocol</h3>
              <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest italic text-center mb-6">Verification Mandatory for {activeFrequency} Validation</p>
              <div className="w-full aspect-square bg-slate-100 rounded-[2rem] overflow-hidden mb-6 border-2 border-slate-100 relative">
                {capturedPhoto ? (
                  <div className="relative h-full w-full">
                    <img src={capturedPhoto} className="w-full h-full object-cover animate-fadeIn" alt="Captured" />
                    {isUploading && (
                      <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center backdrop-blur-sm">
                        {uploadSuccess ? <i className="fas fa-check-circle text-emerald-400 text-5xl animate-bounce"></i> : <i className="fas fa-circle-notch animate-spin text-teal-400 text-5xl"></i>}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover grayscale brightness-110" />
                    <div className="absolute bottom-4 left-0 w-full flex justify-center gap-3">
                       <button onClick={() => fileInputRef.current?.click()} className="bg-white/90 text-slate-900 px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest shadow-xl"><i className="fas fa-folder-open mr-2"></i>Gallery</button>
                    </div>
                  </>
                )}
              </div>
              <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => { setCapturedPhoto(reader.result as string); stopCamera(); };
                  reader.readAsDataURL(file);
                }
              }} />
              <div className="grid grid-cols-2 gap-4 w-full">
                {capturedPhoto ? (
                  <>
                    <button disabled={isUploading} onClick={() => { setCapturedPhoto(null); startCamera(); }} className="py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] italic">Retake</button>
                    <button disabled={isUploading} onClick={handleTransmitPhoto} className="py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl italic flex items-center justify-center gap-3">
                       <i className="fas fa-cloud-upload-alt"></i><span>Authorize</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setShowPhotoModal(false); stopCamera(); }} className="py-4 text-slate-400 font-black uppercase text-[10px] italic">Abort</button>
                    <button onClick={takePhoto} className="py-4 bg-slate-950 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl italic flex items-center justify-center gap-3">
                       <i className="fas fa-camera"></i><span>Capture</span>
                    </button>
                  </>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
           </div>
        </div>
      )}

      {showIssueModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[200] flex items-center justify-center p-6 backdrop-blur-md animate-fadeIn">
           <div className="bg-white w-full max-sm rounded-[2.5rem] p-10 shadow-2xl">
              <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase italic tracking-tighter leading-none">Declare Fault</h3>
              <textarea value={issueDetails} onChange={e => setIssueDetails(e.target.value)} placeholder="Narrate the discrepancy..." className="w-full bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 focus:border-rose-500 outline-none font-bold text-xs min-h-[160px] resize-none italic" />
              <div className="grid grid-cols-2 gap-4 mt-8">
                 <button onClick={() => setShowIssueModal(false)} className="py-4 text-slate-400 font-black uppercase text-[10px] italic">Abort</button>
                 <button onClick={() => { if(currentTask) { finalizeEntry(currentTask, "Issue", issueDetails, ""); setShowIssueModal(false); setIssueDetails(''); setCurrentTask(null); }}} className="bg-rose-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] italic shadow-2xl">Confirm Fault</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ChecklistView;