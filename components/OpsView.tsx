import React, { useState, useMemo, useEffect } from 'react';
import { Asset, Ticket, CategoryKey } from '../types.ts';
import { postAction, updateAssetStatus, adminReviewTicket, rebalanceAssets } from '../services/api.ts';
import { CATEGORY_TECHS, CAMPUS_ROOMS } from '../constants.ts';

interface Props {
  category: CategoryKey;
  assets: Asset[];
  tickets: Ticket[];
  attendance: Record<string, boolean>;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

const OpsView: React.FC<Props> = ({ category, assets, tickets, attendance, onRefresh, showToast }) => {
  const [isOpsUnlocked, setIsOpsUnlocked] = useState(false);
  const [mainPinInput, setMainPinInput] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [lookupId, setLookupId] = useState('');
  const [foundAsset, setFoundAsset] = useState<Asset | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  const [faultDesc, setFaultDesc] = useState('');
  const [isManualAssign, setIsManualAssign] = useState(false);
  const [complaintType, setComplaintType] = useState<'Proactive' | 'Reactive'>('Proactive');

  const [selCampus, setSelCampus] = useState('');
  const [selFloor, setSelFloor] = useState('');
  const [selLocation, setSelLocation] = useState(''); 
  
  const techList = CATEGORY_TECHS[category] || [];
  const [manualTech, setManualTech] = useState(techList[0] || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState<string | null>(null);

  const [submittingRows, setSubmittingRows] = useState<Set<number>>(new Set());
  const [pendingStars, setPendingStars] = useState<Record<number, number>>({});
  const [pendingReasons, setPendingReasons] = useState<Record<number, string>>({});
  
  const [reasonModal, setReasonModal] = useState<{ rowIndex: number, stars: number } | null>(null);
  const [tempReason, setTempReason] = useState('');

  const campuses = Object.keys(CAMPUS_ROOMS);
  
  const floors = useMemo(() => {
    if (!selCampus) return [];
    return Object.keys(CAMPUS_ROOMS[selCampus] || {});
  }, [selCampus]);

  const liveQueue = useMemo(() => 
    tickets.filter(t => !['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status)),
  [tickets]);

  const distributionStats = useMemo(() => {
    if (category !== 'ac') return null;
    const activeACs = assets.filter(a => String(a.category).toLowerCase() === 'ac' && String(a.status).toUpperCase() === 'ACTIVE');
    const counts: Record<string, number> = {};
    techList.forEach(t => counts[t] = 0);
    activeACs.forEach(a => {
      if (a.assignedTech && counts[a.assignedTech] !== undefined) counts[a.assignedTech]++;
    });
    const values = Object.values(counts);
    const max = Math.max(...values);
    const min = Math.min(...values);
    return { counts, total: activeACs.length, imbalance: max - min };
  }, [assets, category, techList]);

  const handleLookup = (val: string) => {
    setLookupId(val);
    if (!val) { setFoundAsset(null); setIsSearching(false); return; }
    setIsSearching(true);
    const asset = assets.find(a => String(a.id) === val.trim() || String(a.tag || '').toLowerCase() === val.toLowerCase().trim());
    setTimeout(() => { setFoundAsset(asset || null); setIsSearching(false); }, 800);
  };

  const handleMainPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mainPinInput === '5566') { setIsOpsUnlocked(true); setMainPinInput(''); } 
    else { showToast("Access Denied"); setMainPinInput(''); }
  };

  const handleRebalance = async () => {
    const presentTechs = techList.filter(t => !!attendance[t]);
    if (presentTechs.length === 0) {
      showToast("No active technicians present for rebalance.");
      return;
    }
    if (!window.confirm(`Execute full load rebalance among ${presentTechs.length} present technicians?`)) return;
    
    setIsRebalancing(true);
    try {
      await rebalanceAssets(category, presentTechs);
      showToast("Balanced Distribution Synced to Backend");
      onRefresh();
    } catch (e) {
      showToast("Sync Failure during rebalance");
    } finally {
      setIsRebalancing(false);
    }
  };

  const handleDispatch = async () => {
    if (isSearching || isSubmitting) return;
    if (!faultDesc.trim()) return;
    if (category === 'ac' && !foundAsset) return;
    if (category !== 'ac' && (!selCampus || !selFloor || !selLocation)) return;

    setIsSubmitting(true);
    let assignee = manualTech;
    let finalStatus = 'Open'; 
    
    if (!isManualAssign) {
      if (category === 'handyman') {
        assignee = 'Sajid';
      } else {
        const presentTechs = techList.filter(t => attendance[t] === true);
        if (presentTechs.length === 0) {
          assignee = "Unassigned";
          finalStatus = "Pending Assignment";
        } else {
          const load: Record<string, number> = {};
          presentTechs.forEach(t => load[t] = 0);
          tickets.forEach(t => {
            if (String(t.category).toUpperCase() === category.toUpperCase() && 
                !['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status)) {
              if (load[t.assignedTo] !== undefined) load[t.assignedTo]++;
            }
          });
          const minLoad = Math.min(...Object.values(load));
          const candidates = presentTechs.filter(t => load[t] === minLoad);
          assignee = candidates[0];
        }
      }
    }

    try {
      const fd = new FormData();
      fd.append('action', 'complain');
      fd.append('category', category.toUpperCase()); 
      fd.append('complaintType', complaintType);
      
      const targetTag = String(foundAsset?.tag || 'N/A');
      if (category === 'ac') {
        fd.append('location', `${foundAsset?.campus} - ${foundAsset?.floor} - ${foundAsset?.room}`);
        fd.append('assetTag', targetTag);
      } else {
        fd.append('location', `${selCampus} - ${selFloor} - ${selLocation}`);
        fd.append('assetTag', 'N/A');
      }

      fd.append('details', faultDesc);
      fd.append('assignedTech', assignee);
      fd.append('status', finalStatus);

      await postAction(fd);
      if (category === 'ac' && targetTag !== 'N/A') await updateAssetStatus(category, targetTag, 'Maintenance');

      setAssignmentFeedback(assignee);
      setTimeout(() => {
        setIsModalOpen(false);
        setAssignmentFeedback(null);
        setLookupId('');
        setFoundAsset(null);
        setFaultDesc('');
        setSelCampus('');
        setSelFloor('');
        setSelLocation('');
        onRefresh();
      }, 3000);
    } catch (e) { showToast("Sync Error"); } finally { setIsSubmitting(false); }
  };

  const handleStatusUpdate = async (t: Ticket, newStatus: string) => {
    if (submittingRows.has(t.rowIndex)) return;
    setSubmittingRows(prev => new Set(prev).add(t.rowIndex));
    try {
      const fd = new FormData();
      fd.append('rowIndex', String(t.rowIndex));
      fd.append('assetTag', String(t.assetTag || ''));
      fd.append('action', 'resolve_ticket');
      fd.append('category', category);
      fd.append('status', newStatus); 
      fd.append('resolvedBy', 'Command Hub');
      fd.append('remarks', `Administrative Action: ${newStatus}`);
      await postAction(fd);
      onRefresh();
    } finally {
      setSubmittingRows(prev => { const n = new Set(prev); n.delete(t.rowIndex); return n; });
    }
  };

  if (!isOpsUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 animate-fadeIn">
        <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-10 shadow-3xl border border-slate-100 text-center space-y-8">
           <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner"><i className="fas fa-shield-alt text-3xl"></i></div>
           <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Ops Access</h3>
           <form onSubmit={handleMainPinSubmit} className="space-y-8">
              <input type="password" autoFocus maxLength={4} value={mainPinInput} onChange={(e) => setMainPinInput(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 text-center text-3xl font-black tracking-[0.6em] outline-none shadow-inner focus:border-indigo-600 transition-all" placeholder="••••" />
              <button type="submit" className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] italic shadow-2xl">Authorize Entry</button>
           </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-8 animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
        <div>
          <p className="text-[7px] md:text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1 italic">Operations Ledger</p>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter leading-none italic uppercase">Deployment Pipeline</h2>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setIsModalOpen(true)} className="bg-slate-950 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[9px] shadow-xl flex items-center gap-3 italic">
             <span>Raise Issue</span>
             <i className="fas fa-plus-circle text-indigo-400"></i>
          </button>
        </div>
      </div>

      {category === 'ac' && distributionStats && (
        <section className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
           <div className="flex justify-between items-center">
              <div>
                 <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-900 italic">Asset Assignment Controller</h3>
                 <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 italic">Status: {distributionStats.imbalance > 1 ? '⚠️ Load Imbalance Detected' : '✅ Balanced (±1 Rule)'}</p>
              </div>
              <button 
                onClick={handleRebalance}
                disabled={isRebalancing}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest italic shadow-lg active:scale-95 transition-all disabled:opacity-30"
              >
                {isRebalancing ? 'Syncing...' : 'Auto-Balance Load'}
              </button>
           </div>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {techList.map(name => (
                <div key={name} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center">
                   <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{name}</p>
                   <p className="text-2xl font-black text-slate-900 italic">{distributionStats.counts[name]}</p>
                   <span className="text-[7px] font-bold text-slate-300 uppercase mt-1">ACs Assigned</span>
                </div>
              ))}
           </div>
        </section>
      )}

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col min-h-[420px] overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
          <h3 className="font-black text-slate-900 uppercase text-[10px] tracking-widest">Active Pipeline</h3>
          <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase italic">{liveQueue.length} Active Records</span>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3 hide-scroll">
          {liveQueue.map((t, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden group">
              <div className="absolute left-0 top-0 h-full w-1 bg-slate-900 opacity-20"></div>
              <div className="flex-1 space-y-2">
                <span className="text-[7px] px-2 py-0.5 rounded font-black uppercase tracking-widest bg-indigo-50 text-indigo-600">{t.status}</span>
                <h4 className="font-black text-slate-900 text-[14px] leading-tight italic uppercase">"{t.details}"</h4>
                <p className="text-[7px] text-slate-400 font-bold uppercase italic">{t.location} • {t.assetTag}</p>
              </div>
              <div className="flex items-center gap-4 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-50">
                <div className="text-left"><p className="text-[11px] text-slate-900 font-black uppercase leading-none">{t.assignedTo}</p></div>
                <div className="flex gap-1.5">
                  <button disabled={submittingRows.has(t.rowIndex)} onClick={() => handleStatusUpdate(t, 'Resolved (Admin)')} className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm"><i className="fas fa-check-circle text-xs"></i></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/98 z-[500] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] p-10 shadow-3xl border border-white/5 relative overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-10 shrink-0">
               <div>
                  <h3 className="text-3xl font-black text-slate-950 italic uppercase tracking-tighter leading-none">Dispatch Hub</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-4 tracking-widest italic">Operations Protocol</p>
               </div>
               <button onClick={() => setIsModalOpen(false)} className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-300 hover:text-rose-500 transition-all active:scale-90"><i className="fas fa-times text-xl"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-6 pr-2 hide-scroll">
               <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 shadow-inner">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic tracking-widest">Incident Narrative</label>
                  <textarea value={faultDesc} onChange={e => setFaultDesc(e.target.value)} rows={3} placeholder="Describe the findings..." className="w-full bg-transparent font-bold text-base outline-none uppercase italic resize-none" />
               </div>
            </div>
            <div className="pt-8 shrink-0">
               {assignmentFeedback ? (
                  <div className="bg-emerald-500 text-white p-6 rounded-2xl text-center animate-bounce shadow-xl">
                     <p className="text-xl font-black italic uppercase">Assigned to {assignmentFeedback}</p>
                  </div>
               ) : (
                  <button onClick={handleDispatch} disabled={isSubmitting || !faultDesc.trim()} className="w-full bg-slate-950 text-white py-6 rounded-[2rem] font-black uppercase text-[11px] tracking-[0.4em] shadow-2xl active:scale-95 italic transition-all disabled:opacity-30">
                     {isSubmitting ? 'Submitting...' : 'Execute Dispatch'}
                  </button>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpsView;