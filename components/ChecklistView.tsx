
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, ChecklistType, StatsResponse, CategoryKey } from '../types';
import { ELECTRICAL_MODULE_DATA, EXHAUST_FAN_INVENTORY, CATEGORY_TECHS } from '../constants';
import { postAction, updatePoints, updateAssetStatus } from '../services/api';

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
  const [selectedCampus, setSelectedCampus] = useState<'140H' | '141D' | '141C' | ''>(
    (category === 'ac' || category === 'electrical') ? '140H' : ''
  ); 
  
  const [currentTask, setCurrentTask] = useState<string | null>(null);
  const [issueDetails, setIssueDetails] = useState('');
  const [showIssueModal, setShowIssueModal] = useState(false);

  const [locallyDoneTags, setLocallyDoneTags] = useState<Set<string>>(new Set());
  const [syncingTags, setSyncingTags] = useState<Set<string>>(new Set());
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

  useEffect(() => {
    setLocallyDoneTags(new Set());
  }, [activeFrequency, selectedCampus]);

  const activeTechList = CATEGORY_TECHS[category] || [];
  
  const isActingTech = useMemo(() => {
    return techName !== activeTechList[zoneIdx];
  }, [techName, activeTechList, zoneIdx]);

  const currentTaskItems = useMemo(() => {
    const cat = String(category).toLowerCase();
    
    if (cat === 'ac') {
      const operationalACs = assets
        .filter(a => String(a.category || '').toLowerCase().includes('ac') && ['ACTIVE', 'MAINTENANCE'].includes(String(a.status).trim().toUpperCase()))
        .sort((a, b) => Number(a.id) - Number(b.id));

      const originalAssignee = activeTechList[zoneIdx];
      let techAssets = operationalACs.filter(a => a.assignedTech === originalAssignee);

      if (techAssets.length === 0 && operationalACs.length > 0) {
        const numZones = 4;
        const baseSize = Math.floor(operationalACs.length / numZones);
        const remainder = operationalACs.length % numZones;
        let start = 0;
        for (let i = 0; i < zoneIdx; i++) {
          start += (i < remainder ? baseSize + 1 : baseSize);
        }
        const end = start + (zoneIdx < remainder ? baseSize + 1 : baseSize);
        techAssets = operationalACs.slice(start, end);
      }

      return techAssets.map(a => ({ 
        tag: a.tag, 
        label: a.room, 
        group: `Zone ${zoneIdx + 1}`, 
        id: a.id, 
        status: a.status,
        exactLocation: `${a.campus} - ${a.floor} - ${a.room}`
      }));
    } else if (cat === 'electrical') {
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
  }, [category, assets, zoneIdx, selectedCampus, activeFrequency, activeTechList]);

  const currentDoneList = useMemo(() => {
    let list: string[] = [];
    if (activeFrequency === ChecklistType.DAILY) list = stats?.hvac?.daily || [];
    else if (activeFrequency === ChecklistType.MONTHLY) list = stats?.hvac?.monthly || [];
    else if (activeFrequency === ChecklistType.QUARTERLY) list = stats?.hvac?.quarterly || [];
    return list.map(t => String(t || '').trim().toUpperCase());
  }, [stats, activeFrequency]);

  const completionStats = useMemo(() => {
    const calc = (listRaw: string[]) => {
      if (currentTaskItems.length === 0) return 100;
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

  const slaAlert = useMemo(() => {
    const freqKey = activeFrequency.toLowerCase() as 'daily' | 'monthly' | 'quarterly';
    const pct = completionStats[freqKey];
    if (pct < 100) {
      return {
        message: `SLA BREACH RISK: ${100 - pct}% of tasks pending. Incomplete cycles result in -10 Point Penalty.`,
        isBreached: true
      };
    }
    return { message: "Operational Integrity Met: SLA Target Synchronized.", isBreached: false };
  }, [completionStats, activeFrequency]);

  const handleAction = async (itemTag: string, status: 'OK' | 'Issue') => {
    if (syncingTags.has(itemTag)) return; 
    if (category === 'electrical' && !selectedCampus) {
      showToast("Select Campus First");
      return;
    }
    if (status === 'Issue') {
      setCurrentTask(itemTag);
      setShowIssueModal(true);
      return;
    }
    const tagNormalized = itemTag.toUpperCase();
    setSyncingTags(prev => new Set(prev).add(itemTag));
    try {
      await finalizeEntry(itemTag, "OK", "Routine Verified");
      setLocallyDoneTags(prev => new Set(prev).add(tagNormalized));
    } catch (e) {
      showToast("Transmission Failure");
    } finally {
      setSyncingTags(prev => { const n = new Set(prev); n.delete(itemTag); return n; });
    }
  };

  const finalizeEntry = async (itemTag: string, status: string, remarks: string) => {
    const fd = new FormData();
    fd.append('action', 'checklist_entry');
    fd.append('category', category.toUpperCase());
    fd.append('technician', techName);
    fd.append('assetTag', itemTag.toUpperCase());
    fd.append('frequency', activeFrequency);
    fd.append('task', `${activeFrequency} ${category.toUpperCase()} Check`);
    fd.append('status', status); 
    fd.append('remarks', remarks);
    await postAction(fd);
    
    if (status === "OK") {
      await updatePoints(category, techName, 1, `${category.toUpperCase()} ${activeFrequency} Verification`);
    }
    
    if (status === "Issue") {
      const taskItem = currentTaskItems.find(it => it.tag === itemTag);
      const wofd = new FormData();
      wofd.append('action', 'complain');
      wofd.append('category', category.toUpperCase());
      wofd.append('complaintType', 'Proactive');
      wofd.append('location', taskItem?.exactLocation || selectedCampus || 'Field');
      wofd.append('assetTag', itemTag.toUpperCase());
      wofd.append('details', `[CHECKLIST ALERT] ${remarks}`);
      wofd.append('assignedTech', techName); 
      wofd.append('status', 'Open');
      await postAction(wofd);

      // MANDATORY: Move AC asset to Maintenance mode when fault is flagged via Checklist
      if (category === 'ac' && itemTag) {
        await updateAssetStatus(category, itemTag, 'Maintenance');
      }
    }
    refreshData();
  };

  const groupedTasks = useMemo(() => {
    const groups: Record<string, any[]> = {};
    currentTaskItems.forEach(item => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });
    return groups;
  }, [currentTaskItems]);

  return (
    <div className="h-full w-full bg-slate-50 flex flex-col pb-20 overflow-hidden">
      <div className="bg-white pt-6 pb-4 px-6 shadow-sm z-30 sticky top-0 border-b">
        <div className={`mb-6 p-4 rounded-2xl flex items-center gap-4 border transition-all ${slaAlert.isBreached ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
           <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${slaAlert.isBreached ? 'bg-white' : 'bg-white'}`}>
              <i className={`fas fa-${slaAlert.isBreached ? 'exclamation-triangle animate-pulse' : 'shield-check'}`}></i>
           </div>
           <div>
              <p className="text-[7px] font-black uppercase tracking-widest italic opacity-50 mb-0.5">Operational Protocol</p>
              <p className="text-[10px] font-black uppercase tracking-tight leading-none">{slaAlert.message}</p>
           </div>
        </div>

        <div className="flex justify-between items-center mb-5">
          <button onClick={onBack} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 active:scale-90 shadow-inner hover:text-indigo-600 transition-colors">
            <i className="fas fa-arrow-left"></i>
          </button>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
               {isActingTech && (
                 <span className="bg-indigo-600 text-white text-[7px] font-black px-2 py-0.5 rounded-full uppercase italic animate-pulse">Acting Coverage</span>
               )}
               <h3 className="font-black text-slate-900 text-lg uppercase italic tracking-tighter leading-none">{category.toUpperCase()} HUB</h3>
            </div>
            <p className="text-[8px] text-slate-400 font-bold uppercase mt-1 tracking-widest italic">{techName} / Sector {zoneIdx + 1}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-xl shadow-inner overflow-x-auto hide-scroll">
          {[ChecklistType.DAILY, ChecklistType.MONTHLY, ChecklistType.QUARTERLY].map(freq => (
            <button key={freq} onClick={() => setActiveFrequency(freq)} className={`flex-1 min-w-[70px] py-2 rounded-lg text-[8px] font-black uppercase transition-all tracking-widest italic ${activeFrequency === freq ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{freq}</button>
          ))}
        </div>

        {(category === 'electrical' || category === 'ac') && (
          <div className="flex gap-2 mb-4 bg-slate-50 p-1 rounded-xl shadow-inner overflow-x-auto hide-scroll border border-slate-100">
            {['140H', '141D', '141C'].map(campus => (
              <button key={campus} onClick={() => setSelectedCampus(campus as any)} className={`flex-1 min-w-[80px] px-2 py-2 rounded-lg text-[7px] font-black uppercase transition-all tracking-widest italic ${selectedCampus === campus ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-400 hover:bg-white hover:text-slate-900'}`}>Campus {campus}</button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-8 hide-scroll">
        {!selectedCampus && (category === 'ac' || category === 'electrical') ? (
          <div className="py-24 text-center opacity-10 flex flex-col items-center">
            <i className="fas fa-building text-7xl mb-6"></i>
            <p className="text-xs font-black uppercase tracking-[0.5em]">Select Building Segment</p>
          </div>
        ) : Object.keys(groupedTasks).length > 0 ? (
          Object.entries(groupedTasks).map(([group, tasks]) => (
            <div key={group} className="space-y-3">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic ml-2">{group}</h4>
               {(tasks as any[]).map((item, i) => {
                 const tagNormalized = String(item.tag || '').toUpperCase();
                 const isDone = locallyDoneTags.has(tagNormalized) || currentDoneList.includes(tagNormalized);
                 const isSyncing = syncingTags.has(item.tag);
                 return (
                   <div key={i} className={`bg-white p-5 rounded-[2rem] border-2 transition-all shadow-sm ${isDone ? 'border-emerald-100 bg-emerald-50/20' : isSyncing ? 'border-amber-100 bg-amber-50/10' : 'border-white'}`}>
                     <div className="flex justify-between items-center">
                       <div className="flex-1 pr-4">
                         <div className="flex flex-wrap items-center gap-2 mb-1">
                           <span className="bg-indigo-50 text-indigo-600 text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">{item.tag}</span>
                           <span className="text-[7px] text-slate-300 font-bold uppercase tracking-tighter italic">{item.exactLocation}</span>
                         </div>
                         <p className="text-[11px] font-black text-slate-900 uppercase italic leading-tight">{item.label}</p>
                       </div>
                       <div className="flex items-center gap-2">
                         {isDone ? (
                           <div className="bg-emerald-600 text-white w-9 h-9 rounded-2xl flex items-center justify-center shadow-lg animate-fadeIn"><i className="fas fa-check text-xs"></i></div>
                         ) : (
                           <div className="flex gap-2">
                             <button onClick={() => handleAction(item.tag, 'OK')} disabled={isSyncing} className="bg-slate-900 text-white px-5 py-3 rounded-xl text-[9px] font-black uppercase italic active:scale-95 transition-all shadow-md disabled:opacity-30">Done</button>
                             <button onClick={() => handleAction(item.tag, 'Issue')} disabled={isSyncing} className="bg-rose-50 text-rose-600 px-5 py-3 rounded-xl text-[9px] font-black uppercase italic active:scale-95 transition-all disabled:opacity-30">Fault</button>
                           </div>
                         )}
                       </div>
                     </div>
                   </div>
                 );
               })}
            </div>
          ))
        ) : (
          <div className="py-24 text-center opacity-10 flex flex-col items-center">
            <i className="fas fa-clipboard-list text-7xl mb-6"></i>
            <p className="text-xs font-black uppercase tracking-[0.5em]">No Tasks Defined for this Registry</p>
            <p className="text-[8px] font-bold uppercase mt-2 italic">Please contact HUB administrator for registry mapping</p>
          </div>
        )}
      </div>

      {showIssueModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[200] flex items-center justify-center p-6 backdrop-blur-md animate-fadeIn">
           <div className="bg-white w-full max-sm rounded-[2.5rem] p-10 shadow-2xl">
              <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase italic tracking-tighter leading-none">Declare Fault</h3>
              <textarea value={issueDetails} onChange={e => setIssueDetails(e.target.value)} placeholder="Narrate the discrepancy..." className="w-full bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 focus:border-rose-500 outline-none font-bold text-xs min-h-[160px] resize-none italic" />
              <div className="grid grid-cols-2 gap-4 mt-8">
                 <button onClick={() => setShowIssueModal(false)} className="py-4 text-slate-400 font-black uppercase text-[10px] italic">Abort</button>
                 <button onClick={async () => { if(currentTask && !isSubmittingIssue) { setIsSubmittingIssue(true); try { await finalizeEntry(currentTask, "Issue", issueDetails); setShowIssueModal(false); setIssueDetails(''); setCurrentTask(null); } catch (e) { showToast("Sync Error"); } finally { setIsSubmittingIssue(false); } } }} disabled={isSubmittingIssue || !issueDetails.trim()} className="bg-rose-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] italic shadow-2xl disabled:opacity-30">{isSubmittingIssue ? 'Submitting...' : 'Confirm Fault'}</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ChecklistView;
