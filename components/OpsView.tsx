
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, Ticket, CategoryKey } from '../types';
import { postAction, updateAssetStatus, adminReviewTicket, rebalanceAssets } from '../services/api';
import { CATEGORY_TECHS, CAMPUS_ROOMS } from '../constants';

interface Props {
  category: CategoryKey;
  assets: Asset[];
  tickets: Ticket[];
  attendance: Record<string, boolean>;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

const resolveStatusLabel = (status: any) => {
  const s = String(status || '').trim();
  const map: Record<string, string> = { '1': 'Open', '2': 'In Progress', '3': 'On Hold', '4': 'Pending', '5': 'Completed' };
  return map[s] || status;
};

const ISSUE_CATEGORIES: Record<string, string[]> = {
  'ac': ['Cooling Issue', 'Water Leakage', 'Noisy Operation', 'Electrical Fault', 'Preventive Check', 'Gas Top-up', 'Others'],
  'electrical': ['Power Outage', 'Socket/Switch Fault', 'Lighting Issue', 'UPS/Generator', 'DB Trip', 'Others'],
  'handyman': ['Furniture Repair', 'Door/Lock Fix', 'Wall/Paint', 'Plumbing', 'Glass Work', 'Others'],
  'default': ['Technical Breakdown', 'General Request', 'Safety Hazard', 'Operational Support', 'Others']
};

const OpsView: React.FC<Props> = ({ category, assets, tickets, attendance, onRefresh, showToast }) => {
  const [isOpsUnlocked, setIsOpsUnlocked] = useState(false);
  const [mainPinInput, setMainPinInput] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [foundAsset, setFoundAsset] = useState<Asset | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [faultDesc, setFaultDesc] = useState('');
  const [issueCategory, setIssueCategory] = useState('');
  const [complaintType, setComplaintType] = useState<'Proactive' | 'Reactive'>('Proactive');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState<string | null>(null);
  const [submittingRows, setSubmittingRows] = useState<Set<number>>(new Set());

  const [reviewTicket, setReviewTicket] = useState<Ticket | null>(null);
  const [selectedStars, setSelectedStars] = useState<number>(0);
  const [hoverStars, setHoverStars] = useState<number>(0);
  const [reviewReason, setReviewReason] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const techList = CATEGORY_TECHS[category] || [];

  const liveQueue = useMemo(() => 
    tickets.filter(t => !['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status)), 
    [tickets]
  );

  const auditQueue = useMemo(() => 
    tickets.filter(t => t.status === 'Resolved – Pending Admin Review'),
    [tickets]
  );

  useEffect(() => {
    setIssueCategory(ISSUE_CATEGORIES[category]?.[0] || ISSUE_CATEGORIES.default[0]);
  }, [category]);

  const handleLookup = (val: string) => {
    setLookupId(val);
    if (!val) { setFoundAsset(null); setIsSearching(false); return; }
    setIsSearching(true);
    const asset = assets.find(a => String(a.id) === val.trim() || String(a.tag || '').toLowerCase() === val.toLowerCase().trim());
    setTimeout(() => { setFoundAsset(asset || null); setIsSearching(false); }, 800);
  };

  const handleMainPinSubmit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (mainPinInput === '5566') { 
      setIsOpsUnlocked(true); 
      setMainPinInput(''); 
    } else { 
      showToast("Access Denied"); 
      setMainPinInput(''); 
    } 
  };

  const handleDispatch = async () => {
    if (isSearching || isSubmitting || !faultDesc.trim() || (category === 'ac' && !foundAsset)) return;
    setIsSubmitting(true);
    try {
      const activeTechs = techList.filter(t => attendance[t]);
      let assigned = activeTechs[0] || 'Unassigned';
      const fd = new FormData();
      fd.append('action', 'complain');
      fd.append('category', category.toUpperCase()); 
      fd.append('complaintType', complaintType);
      fd.append('issueCategory', issueCategory);
      const targetTag = String(foundAsset?.tag || 'N/A');
      fd.append('location', category === 'ac' ? `${foundAsset?.campus} - ${foundAsset?.floor} - ${foundAsset?.room}` : 'Command Assigned');
      fd.append('assetTag', targetTag);
      fd.append('details', faultDesc);
      fd.append('assignedTech', assigned);
      fd.append('status', 'Open');
      await postAction(fd);

      if (category === 'ac' && targetTag !== 'N/A') await updateAssetStatus(category, targetTag, 'Maintenance');

      setAssignmentFeedback(assigned);
      setTimeout(() => { setIsModalOpen(false); setAssignmentFeedback(null); setFaultDesc(''); onRefresh(); }, 2500);
    } catch (e) { showToast("Sync Error"); } finally { setIsSubmitting(false); }
  };

  const handleStatusUpdate = async (t: Ticket, newStatus: string) => {
    if (submittingRows.has(t.rowIndex)) return;
    setSubmittingRows(prev => new Set(prev).add(t.rowIndex));
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const resolvedDate = `${dd}/${mm}/${yyyy}`;
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const resolvedTime = `${hh}:${min}:${ss}`;
    const resolvedTimestampFull = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}, ${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${now.getHours() >= 12 ? 'PM' : 'AM'}`;

    try {
      const fd = new FormData();
      fd.append('rowIndex', String(t.rowIndex));
      fd.append('assetTag', String(t.assetTag || ''));
      fd.append('action', 'resolve_ticket');
      fd.append('category', category);
      fd.append('status', newStatus); 
      fd.append('resolvedBy', 'Command Hub');
      fd.append('resolvedDate', resolvedDate);
      fd.append('resolvedTime', resolvedTime);
      fd.append('resolvedTimestampFull', resolvedTimestampFull);
      fd.append('complaintType', t.complaintType || 'Reactive');
      fd.append('remarks', `Administrative Protocol Override: ${newStatus}`);
      await postAction(fd);

      if (t.assetTag && t.assetTag !== 'N/A') {
        await updateAssetStatus(category, t.assetTag, 'Active');
      }

      onRefresh();
      showToast("Record Finalized in Registry");
    } catch (e) { showToast("Sync Error"); } finally { setSubmittingRows(prev => { const n = new Set(prev); n.delete(t.rowIndex); return n; }); }
  };

  const starConfig = [
    { stars: 1, points: -1, reasonRequired: true },
    { stars: 2, points: 0, reasonRequired: false },
    { stars: 3, points: 1, reasonRequired: false },
    { stars: 4, points: 2, reasonRequired: false },
    { stars: 5, points: 3, reasonRequired: true },
  ];

  const handleReviewSubmit = async () => {
    if (!reviewTicket || selectedStars === 0 || isReviewing) return;
    
    const config = starConfig.find(c => c.stars === selectedStars);
    if (config?.reasonRequired && !reviewReason.trim()) return;

    setIsReviewing(true);
    try {
      const points = config?.points || 0;
      const technicianName = (reviewTicket.resolvedBy || reviewTicket.assignedTo).split('•')[0].trim();

      await adminReviewTicket(
        category,
        technicianName,
        reviewTicket.rowIndex,
        selectedStars,
        points,
        reviewTicket.assetTag,
        reviewReason
      );

      showToast("Review Registry Synchronized");
      setReviewTicket(null);
      setSelectedStars(0);
      setReviewReason('');
      onRefresh();
    } catch (e) {
      showToast("Registry Submission Failure");
    } finally {
      setIsReviewing(false);
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
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-12 animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
        <div><p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1 italic">Operations Ledger</p><h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter leading-none italic uppercase">Deployment Pipeline</h2></div>
        <button onClick={() => setIsModalOpen(true)} className="bg-slate-950 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[9px] shadow-xl flex items-center gap-3 italic"><span>Raise Issue</span><i className="fas fa-plus-circle text-indigo-400"></i></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col min-h-[420px] overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
            <div className="flex items-center gap-3">
               <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
               <h3 className="font-black text-slate-900 uppercase text-[10px] tracking-widest">Live Pipeline</h3>
            </div>
            <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase italic">{liveQueue.length} Active Records</span>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3 hide-scroll">
            {liveQueue.length > 0 ? liveQueue.map((t, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden group">
                <div className="absolute left-0 top-0 h-full w-1 bg-slate-900 opacity-20"></div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[7px] px-2 py-0.5 rounded font-black uppercase tracking-widest bg-indigo-50 text-indigo-600">{t.status}</span>
                    {Number(t.repeatCount || 0) > 1 && (
                      <div className="flex items-center gap-1.5 bg-rose-600 text-white text-[7px] font-black px-2 py-0.5 rounded uppercase italic animate-pulse shadow-md">
                        <i className="fas fa-redo-alt text-[6px]"></i>
                        <span>Repeated {t.repeatCount} Times</span>
                      </div>
                    )}
                    <span className="text-[7px] font-black text-slate-400 uppercase italic">/ {t.issueCategory}</span>
                  </div>
                  <h4 className="font-black text-slate-900 text-[14px] leading-tight italic uppercase whitespace-pre-wrap">"{t.details}"</h4>
                  <p className="text-[7px] text-slate-400 font-bold uppercase italic">{t.location} • {t.assetTag}</p>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-50">
                  <div className="text-left"><p className="text-[11px] text-slate-900 font-black uppercase leading-none">{t.assignedTo}</p></div>
                  <div className="flex gap-1.5">
                    <button disabled={submittingRows.has(t.rowIndex)} onClick={() => handleStatusUpdate(t, 'Resolved (Admin)')} className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm"><i className="fas fa-check-circle text-xs"></i></button>
                  </div>
                </div>
              </div>
            )) : (
              <div className="h-full flex flex-col items-center justify-center opacity-10">
                <i className="fas fa-satellite-dish text-6xl mb-4"></i>
                <p className="text-[10px] font-black uppercase tracking-widest italic">Scanning for Active Data...</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col min-h-[420px] overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-emerald-50/20">
            <div className="flex items-center gap-3">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
               <h3 className="font-black text-slate-900 uppercase text-[10px] tracking-widest">Audit Ledger</h3>
            </div>
            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase italic">{auditQueue.length} Pending Review</span>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3 hide-scroll">
            {auditQueue.length > 0 ? auditQueue.map((t, i) => (
              <div key={i} className="bg-slate-50/50 p-5 rounded-2xl border border-emerald-100/50 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden group">
                <div className="absolute left-0 top-0 h-full w-1 bg-emerald-500 opacity-20"></div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[7px] px-2 py-0.5 rounded font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 italic">Resolved</span>
                    <span className="text-[7px] text-slate-300 font-bold uppercase italic">{t.workType}</span>
                    {Number(t.repeatCount || 0) > 1 && (
                      <span className="bg-rose-50 text-rose-600 text-[7px] font-black px-2 py-0.5 rounded uppercase italic border border-rose-100">Repeat: {t.repeatCount}</span>
                    )}
                  </div>
                  <h4 className="font-black text-slate-900 text-[14px] leading-tight italic uppercase">"{t.details}"</h4>
                  <p className="text-[7px] text-slate-400 font-bold uppercase italic">{t.location} • {t.assetTag}</p>
                </div>
                <button 
                  onClick={() => setReviewTicket(t)}
                  className="bg-white border border-emerald-200 text-emerald-600 px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest italic shadow-sm hover:bg-emerald-600 hover:text-white transition-all active:scale-95"
                >
                  Rate Registry
                </button>
              </div>
            )) : (
              <div className="h-full flex flex-col items-center justify-center opacity-10">
                <i className="fas fa-check-double text-6xl mb-4"></i>
                <p className="text-[10px] font-black uppercase tracking-widest italic">All Records Finalized</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {reviewTicket && (
        <div className="fixed inset-0 bg-slate-950/98 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-xl rounded-[3rem] p-10 shadow-3xl border border-white/5 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 blur-[100px] pointer-events-none"></div>
             
             <div className="flex justify-between items-center mb-8 relative z-10">
                <div>
                   <h3 className="text-3xl font-black text-slate-950 italic uppercase tracking-tighter leading-none">Record Audit</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-4 tracking-widest italic">Protocol Verification & Excellence Rating</p>
                </div>
                <button onClick={() => { setReviewTicket(null); setSelectedStars(0); setReviewReason(''); }} className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-300 hover:text-rose-500 active:scale-90 transition-all flex items-center justify-center border border-slate-100 shadow-inner">
                   <i className="fas fa-times text-xl"></i>
                </button>
             </div>

             <div className="space-y-8 relative z-10">
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                   <div className="flex items-center gap-3 mb-2">
                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">Technical Summary</p>
                     {Number(reviewTicket.repeatCount || 0) > 1 && (
                       <span className="text-[7px] font-black text-rose-600 uppercase italic">Merged Issue ({reviewTicket.repeatCount} entries)</span>
                     )}
                   </div>
                   <h4 className="text-lg font-black text-slate-900 italic uppercase">"{reviewTicket.details}"</h4>
                   <div className="flex flex-wrap gap-4 mt-4">
                      <div><p className="text-[7px] font-bold text-slate-300 uppercase italic">Technician</p><p className="text-[11px] font-black text-indigo-600 uppercase">{(reviewTicket.resolvedBy || reviewTicket.assignedTo).split('•')[0]}</p></div>
                      <div><p className="text-[7px] font-bold text-slate-300 uppercase italic">Asset</p><p className="text-[11px] font-black text-slate-950 uppercase">{reviewTicket.assetTag}</p></div>
                   </div>
                </div>

                <div className="text-center space-y-4">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] italic">Assign Quality Score</p>
                   <div className="flex justify-center items-center gap-4">
                      {[1, 2, 3, 4, 5].map(num => {
                        const config = starConfig.find(c => c.stars === num);
                        return (
                          <button 
                            key={num}
                            onMouseEnter={() => setHoverStars(num)}
                            onMouseLeave={() => setHoverStars(0)}
                            onClick={() => setSelectedStars(num)}
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all ${
                              (hoverStars || selectedStars) >= num 
                                ? 'text-amber-400 scale-110 shadow-xl bg-white border border-amber-100' 
                                : 'text-slate-200 bg-slate-50'
                            }`}
                          >
                            <i className="fas fa-star"></i>
                          </button>
                        );
                      })}
                   </div>

                   <div className="h-6 flex items-center justify-center">
                      {(hoverStars || selectedStars) > 0 && (
                        <p className="text-[9px] font-black uppercase tracking-widest italic animate-fadeIn">
                          {(() => {
                            const config = starConfig.find(c => c.stars === (hoverStars || selectedStars));
                            return (
                              <span className={config && config.points < 0 ? 'text-rose-500' : 'text-emerald-500'}>
                                ⭐ {(hoverStars || selectedStars)} Star → {config?.points && config.points > 0 ? '+' : ''}{config?.points} Point{config?.points === 1 || config?.points === -1 ? '' : 's'} 
                                {config?.reasonRequired ? ' (Narrative Required)' : ''}
                              </span>
                            );
                          })()}
                        </p>
                      )}
                   </div>
                </div>

                <div className={`bg-slate-50 p-6 rounded-[2rem] border-2 transition-all ${starConfig.find(c => c.stars === selectedStars)?.reasonRequired ? 'border-indigo-100 shadow-inner' : 'border-transparent'}`}>
                   <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Audit Narrative</label>
                   <textarea 
                      value={reviewReason}
                      onChange={e => setReviewReason(e.target.value)}
                      placeholder={starConfig.find(c => c.stars === selectedStars)?.reasonRequired ? "NARRATIVE BRIEF REQUIRED FOR THIS SCORE..." : "OPTIONAL AUDIT BRIEF..."}
                      className="w-full bg-transparent font-bold text-xs outline-none italic uppercase resize-none leading-relaxed"
                      rows={3}
                   />
                </div>

                {selectedStars > 0 && (
                  <button 
                    onClick={handleReviewSubmit}
                    disabled={isReviewing || (starConfig.find(c => c.stars === selectedStars)?.reasonRequired && !reviewReason.trim())}
                    className="w-full bg-slate-950 text-white py-6 rounded-[2rem] font-black uppercase text-[10px] tracking-[0.4em] shadow-2xl active:scale-95 italic transition-all disabled:opacity-30 flex items-center justify-center gap-4"
                  >
                    {isReviewing ? (
                      <i className="fas fa-circle-notch animate-spin text-emerald-400"></i>
                    ) : (
                      <i className="fas fa-check-double text-emerald-400"></i>
                    )}
                    <span>{isReviewing ? 'Transmitting Registry Update...' : 'Finalize Audit Protocol'}</span>
                  </button>
                )}
             </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/98 z-[500] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] p-10 shadow-3xl border border-white/5 relative flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-10 shrink-0"><div><h3 className="text-3xl font-black text-slate-950 italic uppercase tracking-tighter leading-none">Command Hub Issue</h3></div><button onClick={() => setIsModalOpen(false)} className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-300 hover:text-rose-500 transition-all"><i className="fas fa-times text-xl"></i></button></div>
            <div className="flex-1 overflow-y-auto space-y-6 pr-2 hide-scroll">
               <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 shadow-inner"><label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic tracking-widest">Identify Asset (Tag/ID)</label><input type="text" value={lookupId} onChange={e => handleLookup(e.target.value)} placeholder="SEARCH REGISTRY..." className="w-full bg-transparent font-black text-2xl outline-none italic uppercase text-slate-950 placeholder:text-slate-200" /></div>
               {isSearching && <div className="p-4 bg-indigo-50 rounded-2xl flex items-center gap-4 animate-pulse"><i className="fas fa-satellite-dish text-indigo-400"></i><p className="text-[10px] font-black text-indigo-900 uppercase italic">Scanning...</p></div>}
               {foundAsset && (<div className="bg-emerald-50 p-6 rounded-2xl border-2 border-emerald-100 shadow-inner animate-slideDown"><p className="text-[8px] font-black text-emerald-600 uppercase mb-2">Registry Verified</p><h4 className="text-xl font-black italic text-slate-950 uppercase">"{foundAsset.room}"</h4></div>)}
               
               <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100 shadow-inner">
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 italic">Issue Classification</label>
                  <select 
                    value={issueCategory} 
                    onChange={e => setIssueCategory(e.target.value)} 
                    className="w-full bg-transparent font-black text-[12px] outline-none italic uppercase text-slate-950"
                  >
                    {(ISSUE_CATEGORIES[category] || ISSUE_CATEGORIES.default).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
               </div>

               <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 shadow-inner"><label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic tracking-widest">Narrative</label><textarea value={faultDesc} onChange={e => setFaultDesc(e.target.value)} rows={3} placeholder="Describe anomaly..." className="w-full bg-transparent font-bold text-base outline-none uppercase italic resize-none" /></div>
               
               <div className="flex bg-slate-100 p-2 rounded-2xl gap-3">
                  {['Proactive', 'Reactive'].map(t => (
                    <button key={t} onClick={() => setComplaintType(t as any)} className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] italic transition-all ${complaintType === t ? 'bg-slate-950 text-white shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}>{t}</button>
                  ))}
               </div>
            </div>
            <div className="pt-8 shrink-0">{assignmentFeedback ? (<div className="bg-emerald-500 text-white p-6 rounded-2xl text-center animate-bounce shadow-xl"><p className="text-xl font-black italic uppercase">Assigned to {assignmentFeedback}</p></div>) : (<button onClick={handleDispatch} disabled={isSubmitting || !faultDesc.trim() || (category === 'ac' && !foundAsset)} className="w-full bg-slate-950 text-white py-6 rounded-[2rem] font-black uppercase text-[11px] tracking-[0.4em] shadow-2xl active:scale-95 italic transition-all disabled:opacity-30">{isSubmitting ? 'Submitting...' : 'Execute Dispatch Protocol'}</button>)}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpsView;
