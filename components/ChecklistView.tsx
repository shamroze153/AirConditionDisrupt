import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Asset, ChecklistType, StatsResponse, CategoryKey } from '../types.ts';
import { CAMPUS_ASSETS, CATEGORY_TECHS, ELECTRICAL_MODULE_DATA, ELECTRICAL_TECHNICIANS, TECHNICIANS } from '../constants.ts';
import { postAction, updatePoints } from '../services/api.ts';

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

  // Photo Logic
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const currentTaskItems = useMemo(() => {
    if (category === 'ac') {
      return assets.filter(a => {
        const id = Number(a.id);
        if (zoneIdx === 0) return id >= 1 && id <= 40;
        if (zoneIdx === 1) return id >= 41 && id <= 82;
        if (zoneIdx === 2) return id >= 83 && id <= 121;
        if (zoneIdx === 3) return id >= 122 && id <= 161;
        return false;
      }).map(a => ({ 
        tag: a.tag, 
        label: a.room, 
        group: `Zone ${zoneIdx + 1} Registry`, 
        id: a.id, 
        detailPreview: `${a.brand} | ${a.cap}T`,
        exactLocation: `${a.campus} - ${a.floor} - ${a.room}`,
        assetCode: a.tag
      }));
    } else if (category === 'electrical') {
      if (!selectedCampus) return [];
      const campusInfo = ELECTRICAL_MODULE_DATA.campusSpecific[selectedCampus];
      const items: any[] = [];
      ELECTRICAL_MODULE_DATA.commonItems.forEach(item => {
        items.push({ tag: `${item.id}_${selectedCampus}`, label: item.label, group: item.group, exactLocation: selectedCampus });
      });
      for (let i = 1; i <= campusInfo.fans; i++) {
        items.push({ tag: `FAN_${i}_${selectedCampus}`, label: `Washroom Exhaust Fan ${i}`, group: 'Exhaust Fans', exactLocation: `${selectedCampus} - Washrooms` });
      }
      items.push({ tag: `ROOM_INSP_${selectedCampus}`, label: 'Room Inspection – Lights, Sockets, etc.', group: 'Room Inspection', exactLocation: selectedCampus });
      campusInfo.extraRooms.forEach(room => {
        items.push({ tag: `EXTRA_${room.replace(/\s/g, '_')}_${selectedCampus}`, label: room, group: 'Specific Areas', exactLocation: `${selectedCampus} - ${room}` });
      });
      return items;
    } else if (category === 'handyman') {
      if (!selectedCampus) return [];
      const count = CAMPUS_ASSETS[selectedCampus].washrooms;
      return Array.from({ length: count }, (_, i) => ({
        tag: `GM-WR-${selectedCampus}-${i + 1}`,
        label: `Washroom ${i + 1} (Basin/Tap/Toilet)`,
        group: 'Washrooms',
        id: undefined,
        detailPreview: undefined,
        exactLocation: `${selectedCampus} - Washroom ${i + 1}`
      }));
    }
    return [];
  }, [category, assets, zoneIdx, selectedCampus]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, any[]> = {};
    currentTaskItems.forEach(item => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });
    return groups;
  }, [currentTaskItems]);

  const currentDoneList = useMemo(() => {
    if (category === 'ac') {
      if (activeFrequency === ChecklistType.DAILY) return stats?.hvac?.daily || [];
      if (activeFrequency === ChecklistType.MONTHLY) return stats?.hvac?.monthly || [];
      if (activeFrequency === ChecklistType.QUARTERLY) return stats?.hvac?.quarterly || [];
    }
    return stats?.hvac?.daily || [];
  }, [stats, activeFrequency, category]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        setCapturedPhoto(null);
      }
    } catch (err) {
      showToast("Camera Access Denied");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      setIsCameraActive(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedPhoto(reader.result as string);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAction = async (itemTag: string, status: 'OK' | 'Issue') => {
    if ((category === 'electrical' || category === 'handyman') && !selectedCampus) {
      showToast("Select Campus Protocol First");
      return;
    }

    if (status === 'Issue') {
      setCurrentTask(itemTag);
      setShowIssueModal(true);
      return;
    }

    // Compulsory Photo for Monthly/Quarterly AC
    if (category === 'ac' && activeFrequency !== ChecklistType.DAILY) {
      setCurrentTask(itemTag);
      setCapturedPhoto(null);
      setUploadSuccess(false);
      setIsUploading(false);
      setShowPhotoModal(true);
      startCamera();
      return;
    }

    await finalizeEntry(itemTag, "OK", "Routine Check Verified", "");
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      const data = canvasRef.current.toDataURL('image/jpeg', 0.7);
      setCapturedPhoto(data);
      stopCamera();
    }
  };

  const handleTransmitWithStatus = async () => {
    if (!currentTask || !capturedPhoto) return;
    setIsUploading(true);
    try {
      await finalizeEntry(currentTask, "OK", `${activeFrequency} Evidence Logged`, capturedPhoto);
      setUploadSuccess(true);
      setTimeout(() => {
        setShowPhotoModal(false);
        setIsUploading(false);
        setUploadSuccess(false);
        setCapturedPhoto(null);
      }, 1500);
    } catch (e) {
      showToast("Sync Error");
      setIsUploading(false);
    }
  };

  const finalizeEntry = async (itemTag: string, status: string, remarks: string, photo: string) => {
    const frequency = category === 'ac' ? activeFrequency : ChecklistType.DAILY;
    const taskItem = currentTaskItems.find(it => it.tag === itemTag);
    const locationStr = taskItem?.exactLocation || (category === 'ac' ? 'Facility Sector' : (selectedCampus || 'Asset Sector'));

    const fd = new FormData();
    fd.append('action', 'checklist_entry');
    fd.append('category', category.toUpperCase());
    fd.append('technician', techName);
    fd.append('assetTag', itemTag);
    fd.append('frequency', frequency);
    fd.append('task', `${frequency} ${category.toUpperCase()} Verification`);
    fd.append('status', status);
    fd.append('remarks', remarks);
    if (photo) fd.append('photo', photo); 
    
    if (!isUploading) showToast(`Syncing ${category.toUpperCase()} Protocol...`);
    await postAction(fd);

    if (status === "OK") {
       await updatePoints(category, techName, 1, `${category.toUpperCase()} Checklist Merit`);
    }

    if (status === "Issue") {
      const wofd = new FormData();
      wofd.append('action', 'complain');
      wofd.append('category', category.toUpperCase());
      wofd.append('complaintType', 'Proactive');
      wofd.append('location', locationStr);
      wofd.append('assetTag', itemTag);
      wofd.append('details', `[CHECKLIST FAILURE] ${itemTag}: ${remarks}`);
      
      let finalAssigned = techName;
      if (category === 'ac') {
        const matchingAsset = assets.find(a => a.tag === itemTag);
        const idNum = Number(matchingAsset?.id || 0);
        if (idNum >= 1 && idNum <= 40) finalAssigned = 'Bilal';
        else if (idNum >= 41 && idNum <= 82) finalAssigned = 'Asad';
        else if (idNum >= 83 && idNum <= 121) finalAssigned = 'Taimoor';
        else if (idNum >= 122 && idNum <= 161) finalAssigned = 'Saboor';
      } else if (category === 'handyman') {
        finalAssigned = 'Sajid';
      } else if (category === 'electrical') {
         const ticketsCount = stats?.complaints?.length || 0;
         finalAssigned = ELECTRICAL_TECHNICIANS[ticketsCount % ELECTRICAL_TECHNICIANS.length];
      }
      
      wofd.append('assignedTech', finalAssigned); 
      wofd.append('status', 'Open');
      await postAction(wofd);
      showToast(`Work Order Dispatched: ${finalAssigned}`);
    }
    refreshData();
  };

  const progressPct = useMemo(() => {
    const doneCount = currentTaskItems.filter(a => currentDoneList.includes(a.tag)).length;
    return Math.round((doneCount / (currentTaskItems.length || 1)) * 100);
  }, [currentTaskItems, currentDoneList]);

  return (
    <div className="h-full w-full bg-slate-50 flex flex-col pb-20">
      <div className="bg-white pt-6 pb-4 px-6 shadow-sm z-30 sticky top-0 border-b">
        <div className="flex justify-between items-center mb-5">
          <button onClick={onBack} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 active:scale-90 shadow-inner">
            <i className="fas fa-arrow-left"></i>
          </button>
          <div className="text-right">
            <h3 className="font-black text-slate-900 text-lg uppercase italic tracking-tighter leading-none">
              {category.toUpperCase()} Protocol
            </h3>
            <p className="text-[8px] text-slate-400 font-bold uppercase mt-1 tracking-widest italic">{techName} Control Hub</p>
          </div>
        </div>

        {category === 'ac' ? (
          <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-xl shadow-inner">
            {[ChecklistType.DAILY, ChecklistType.MONTHLY, ChecklistType.QUARTERLY].map(freq => (
              <button 
                key={freq} 
                onClick={() => setActiveFrequency(freq)} 
                className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase transition-all tracking-widest italic ${activeFrequency === freq ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-white'}`}
              >
                {freq}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-xl shadow-inner overflow-x-auto hide-scroll">
            {['140H', '141D', '141C'].map(campus => (
              <button 
                key={campus} 
                onClick={() => setSelectedCampus(campus as any)} 
                className={`flex-1 min-w-[80px] px-2 py-2.5 rounded-lg text-[7px] font-black uppercase transition-all tracking-widest italic ${selectedCampus === campus ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-white'}`}
              >
                Campus {campus}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
            <div className={`h-full bg-slate-900 transition-all duration-1000`} style={{ width: `${progressPct}%` }}></div>
          </div>
          <span className="text-[10px] font-black text-slate-900 italic">{progressPct}%</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-8 hide-scroll bg-slate-50/50">
        {category !== 'ac' && !selectedCampus ? (
          <div className="py-24 text-center opacity-10 flex flex-col items-center">
            <i className="fas fa-building text-7xl mb-6"></i>
            <p className="text-xs font-black uppercase tracking-[0.5em]">Identify Campus Infrastructure</p>
          </div>
        ) : (
          Object.entries(groupedTasks).map(([group, tasks]) => (
            <div key={group} className="space-y-3">
               <div className="flex items-center gap-3 px-2">
                  <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">{group} Registry</h4>
               </div>
               {(tasks as any[]).map((item: any, i: number) => {
                 const isDone = currentDoneList.includes(item.tag);
                 return (
                   <div key={i} className={`bg-white p-5 rounded-[2rem] border-2 transition-all group ${isDone ? 'border-emerald-100 bg-emerald-50/20' : 'border-white shadow-sm hover:border-slate-100'}`}>
                     <div className="flex justify-between items-center">
                       <div className="flex-1 pr-6">
                         {category === 'ac' ? (
                           <div className="flex flex-col">
                             <div className="flex flex-wrap items-center gap-2 mb-1">
                               <span className="bg-slate-950 text-white text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest shadow-sm">ID {item.id}</span>
                               <span className="bg-indigo-50 text-indigo-600 text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest border border-indigo-100">{item.assetCode}</span>
                               <span className="text-[7px] text-slate-300 font-bold uppercase tracking-tighter italic">{item.exactLocation}</span>
                             </div>
                             <p className="text-[11px] font-black text-slate-900 uppercase italic leading-tight">
                               {item.label}
                             </p>
                             <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1.5 italic">
                               {item.detailPreview}
                             </p>
                           </div>
                         ) : (
                           <p className="text-[11px] font-black text-slate-900 uppercase italic leading-tight">
                             {item.label}
                           </p>
                         )}
                       </div>
                       {isDone ? (
                         <div className="bg-emerald-600 text-white w-9 h-9 rounded-2xl flex items-center justify-center shadow-lg animate-fadeIn"><i className="fas fa-check text-xs"></i></div>
                       ) : (
                         <div className="flex gap-2">
                           <button onClick={() => handleAction(item.tag, 'OK')} className="bg-slate-900 text-white px-5 py-3 rounded-xl text-[9px] font-black uppercase italic active:scale-95 transition-all">Verified</button>
                           <button onClick={() => handleAction(item.tag, 'Issue')} className="bg-rose-50 text-rose-600 px-5 py-3 rounded-xl text-[9px] font-black uppercase italic active:scale-95 transition-all">Fault</button>
                         </div>
                       )}
                     </div>
                   </div>
                 );
               })}
            </div>
          ))
        )}
      </div>

      {/* PHOTO EVIDENCE MODAL */}
      {showPhotoModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center p-6 backdrop-blur-md animate-fadeIn">
           <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl overflow-hidden flex flex-col items-center">
              <div className="w-full mb-6">
                 <h3 className="text-xl font-black text-slate-950 uppercase italic tracking-tighter leading-none mb-2 text-center">Evidence Protocol</h3>
                 <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest italic text-center">Required for {activeFrequency} verification</p>
              </div>
              
              <div className="w-full aspect-square bg-slate-100 rounded-[2rem] overflow-hidden mb-6 border-2 border-slate-100 relative group">
                {capturedPhoto ? (
                  <div className="relative h-full w-full">
                    <img src={capturedPhoto} className="w-full h-full object-cover animate-fadeIn" alt="Captured" />
                    {isUploading && (
                      <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center backdrop-blur-sm transition-all">
                        {uploadSuccess ? (
                          <div className="flex flex-col items-center animate-bounce">
                            <i className="fas fa-check-circle text-emerald-400 text-5xl mb-3"></i>
                            <p className="text-white text-[10px] font-black uppercase tracking-widest italic">Uploaded</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <i className="fas fa-circle-notch animate-spin text-teal-400 text-5xl mb-4"></i>
                            <p className="text-white text-[10px] font-black uppercase tracking-widest italic">Uploading...</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover grayscale brightness-110" />
                    {!capturedPhoto && isCameraActive && (
                      <div className="absolute inset-0 border-4 border-indigo-500/20 pointer-events-none"></div>
                    )}
                    <div className="absolute bottom-4 left-0 w-full flex justify-center gap-3">
                       <button onClick={() => fileInputRef.current?.click()} className="bg-white/90 text-slate-900 px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest italic shadow-xl">
                          <i className="fas fa-folder-open mr-2"></i>Gallery
                       </button>
                    </div>
                  </>
                )}
              </div>

              <input 
                type="file" 
                ref={fileInputRef} 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileChange} 
              />

              <div className="grid grid-cols-2 gap-4 w-full">
                {capturedPhoto ? (
                  <>
                    <button 
                      disabled={isUploading}
                      onClick={() => { setCapturedPhoto(null); startCamera(); }} 
                      className="py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest italic disabled:opacity-50"
                    >
                      Retake
                    </button>
                    <button 
                      disabled={isUploading}
                      onClick={handleTransmitWithStatus} 
                      className="py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest italic shadow-xl flex items-center justify-center gap-3 disabled:bg-slate-400"
                    >
                       <i className="fas fa-cloud-upload-alt"></i>
                       <span>Transmit</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setShowPhotoModal(false); stopCamera(); }} className="py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest italic">Cancel</button>
                    <button onClick={takePhoto} className="py-4 bg-slate-950 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest italic shadow-xl flex items-center justify-center gap-3">
                       <i className="fas fa-camera"></i>
                       <span>Capture</span>
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
           <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl border border-white/5 relative overflow-hidden">
              <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase italic tracking-tighter leading-none">Log Fault</h3>
              <textarea value={issueDetails} onChange={e => setIssueDetails(e.target.value)} placeholder="Describe the system failure..." className="w-full bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 focus:border-rose-500 outline-none font-bold text-xs min-h-[160px] resize-none italic" />
              <div className="grid grid-cols-2 gap-4 mt-8">
                 <button onClick={() => setShowIssueModal(false)} className="py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest italic">Cancel</button>
                 <button onClick={() => { if(currentTask) { finalizeEntry(currentTask, "Issue", issueDetails, ""); setShowIssueModal(false); setIssueDetails(''); setCurrentTask(null); }}} className="bg-rose-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all italic shadow-2xl">Confirm Fault</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ChecklistView;