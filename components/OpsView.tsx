import React, { useState, useMemo } from 'react';
import { Asset, Ticket, CategoryKey } from '../types.ts';
import { postAction, updateAssetStatus, adminReviewTicket } from '../services/api.ts';
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
  // Authorization State
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authPin, setAuthPin] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [foundAsset, setFoundAsset] = useState<Asset | null>(null);
  const [faultDesc, setFaultDesc] = useState('');
  const [isManualAssign, setIsManualAssign] = useState(false);
  const [complaintType, setComplaintType] = useState<'Proactive' | 'Reactive'>('Proactive');

  const [selCampus, setSelCampus] = useState('');
  const [selFloor, setSelFloor] = useState('');
  const [selLocation, setSelLocation] = useState('');
  
  // Guided Selection states for AC ONLY
  const [acSelCampus, setAcSelCampus] = useState('');
  const [acSelFloor, setAcSelFloor] = useState('');
  
  const techList = CATEGORY_TECHS[category] || [];
  const [manualTech, setManualTech] = useState(techList[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Review states (Password request removed)
  const [isReviewUnlocked, setIsReviewUnlocked] = useState(false);
  const [submittingRows, setSubmittingRows] = useState<Set<number>>(new Set());
  
  // Tracking local selection before submission to prevent immediate scoring
  const [pendingStars, setPendingStars] = useState<Record<number, number>>({});

  const campuses = Object.keys(CAMPUS_ROOMS);
  
  const floors = useMemo(() => {
    if (!selCampus) return [];
    return Object.keys(CAMPUS_ROOMS[selCampus] || {});
  }, [selCampus]);

  const locations = useMemo(() => {
    if (!selCampus || !selFloor) return [];
    return CAMPUS_ROOMS[selCampus][selFloor] || [];
  }, [selCampus, selFloor]);

  // AC Guided Selection Derivations
  const acCampusOptions = useMemo(() => {
    if (category !== 'ac') return [];
    return Array.from(new Set(assets.map(a => a.campus))).filter(Boolean).sort();
  }, [assets, category]);

  const acFloorOptions = useMemo(() => {
    if (category !== 'ac' || !acSelCampus) return [];
    return Array.from(new Set(assets.filter(a => a.campus === acSelCampus).map(a => a.floor))).filter(Boolean).sort();
  }, [assets, acSelCampus, category]);

  const acAssetOptions = useMemo(() => {
    if (category !== 'ac' || !acSelCampus || !acSelFloor) return [];
    return assets.filter(a => a.campus === acSelCampus && a.floor === acSelFloor).sort((a, b) => String(a.tag).localeCompare(String(b.tag)));
  }, [assets, acSelCampus, acSelFloor, category]);

  const liveQueue = useMemo(() => 
    tickets.filter(t => !['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status)),
  [tickets]);

  const pendingReviewQueue = useMemo(() =>
    tickets.filter(t => t.status === 'Resolved – Pending Admin Review'),
  [tickets]);

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authPin === '5566') {
      setIsAuthorized(true);
      showToast("Ops Protocol Authorized");
    } else {
      showToast("Access Denied: Invalid Password");
      setAuthPin('');
    }
  };

  const handleLookup = (val: string) => {
    setLookupId(val);
    if (!val) { setFoundAsset(null); return; }
    const asset = assets.find(a => 
      String(a.id) === val.trim() || 
      String(a.tag || '').toLowerCase() === val.toLowerCase().trim() ||
      String(a.tag || '').toLowerCase().includes(val.toLowerCase().trim())
    );
    setFoundAsset(asset || null);
  };

  const handleACAssetSelect = (tag: string) => {
    setLookupId(tag);
    const asset = assets.find(a => String(a.tag) === tag);
    setFoundAsset(asset || null);
  };

  const handleDispatch = async () => {
    if (!faultDesc) return;
    if (category === 'ac' && !foundAsset && lookupId.length < 2) return;
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
          if (category === 'electrical') {
             const elecTicketCount = tickets.filter(t => String(t.category).toUpperCase() === 'ELECTRICAL').length;
             assignee = presentTechs[elecTicketCount % presentTechs.length];
          } else {
             const load: Record<string, number> = {};
             presentTechs.forEach(t => load[t] = 0);
             tickets.forEach(t => {
               if (!['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status)) {
                 if (load[t.assignedTo] !== undefined) load[t.assignedTo]++;
               }
             });
             const minLoad = Math.min(...Object.values(load));
             const candidates = presentTechs.filter(t => load[t] === minLoad);
             assignee = candidates[0];
          }
        }
      }
    }

    try {
      const fd = new FormData();
      fd.append('action', 'complain');
      fd.append('category', category.toUpperCase()); 
      fd.append('complaintType', complaintType);
      
      if (category === 'ac') {
        fd.append('location', foundAsset ? `${foundAsset.campus} - ${foundAsset.floor} - ${foundAsset.room}` : 'AC Hub Log');
        fd.append('assetTag', String(foundAsset?.tag || lookupId));
      } else {
        fd.append('location', `${selCampus} - ${selFloor} - ${selLocation}`);
        fd.append('assetTag', 'N/A');
      }

      fd.append('details', faultDesc);
      fd.append('assignedTech', assignee);
      fd.append('status', finalStatus);

      await postAction(fd);
      
      if (category === 'ac' && foundAsset) {
        await updateAssetStatus(category, foundAsset.tag, 'Maintenance');
      }

      setIsModalOpen(false);
      setLookupId('');
      setFoundAsset(null);
      setFaultDesc('');
      setSelCampus('');
      setSelFloor('');
      setSelLocation('');
      setAcSelCampus('');
      setAcSelFloor('');
      onRefresh();
      showToast(`Incident Dispatched: ${assignee}`);
    } catch (e) {
      showToast("Sync Error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusUpdate = async (t: Ticket, newStatus: string) => {
    const fd = new FormData();
    fd.append('rowIndex', String(t.rowIndex));
    fd.append('assetTag', String(t.assetTag || ''));
    fd.append('action', 'resolve_ticket');
    fd.append('category', category);
    fd.append('status', newStatus); 
    fd.append('resolvedBy', 'Command Hub');
    fd.append('remarks', `Administrative Action: ${newStatus}`);
    await postAction(fd);
    if (newStatus.toLowerCase().includes('resolved') && t.assetTag !== 'N/A') {
      await updateAssetStatus(category, t.assetTag, 'Active');
    }
    onRefresh();
  };

  const handleAdminReview = async (t: Ticket) => {
    const stars = pendingStars[t.rowIndex];
    if (stars === undefined) return; 

    setSubmittingRows(prev => new Set(prev).add(t.rowIndex));
    
    // NEW STAR TO POINT MAPPING:
    // 1★ -> -1 point
    // 2★ -> 0 point
    // 3★ -> 1 point
    // 4★ -> 2 points
    // 5★ -> 3 points
    const points = stars - 2;

    try {
      await adminReviewTicket(category, t.assignedTo, t.rowIndex, stars, points);
      showToast(`Evaluation Completed: ${stars} Stars (${points >= 0 ? '+' : ''}${points} pts)`);
      
      // Cleanup local state for this row
      setPendingStars(prev => {
        const next = { ...prev };
        delete next[t.rowIndex];
        return next;
      });
      
      onRefresh();
    } catch (e) {
      showToast("Sync failure on review submission");
    } finally {
      setSubmittingRows(prev => {
        const next = new Set(prev);
        next.delete(t.rowIndex);
        return next;
      });
    }
  };

  // ────────────────────────────
  // RENDER ACCESS RESTRICTED VIEW
  // ────────────────────────────
  if (!isAuthorized) {
    return (
      <div className="max-w-[1400px] mx-auto p-4 md:p-8 h-[70vh] flex items-center justify-center animate-fadeIn">
        <div className="bg-slate-900 border border-white/5 p-10 md:p-16 rounded-[3rem] shadow-3xl w-full max-w-md text-center space-y-10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] group-hover:bg-indigo-500/10 transition-all duration-700"></div>
          
          <div className="relative z-10 space-y-6">
            <div className="w-20 h-20 bg-slate-800 border border-white/10 text-indigo-400 rounded-3xl flex items-center justify-center mx-auto shadow-2xl group-hover:scale-110 transition-transform duration-500">
              <i className="fas fa-shield-alt text-3xl animate-pulse"></i>
            </div>
            
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Ops Authorization</h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-3 italic">Restricted Deployment Access</p>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-6">
              <div className="relative group/input">
                <input 
                  type="password" 
                  autoFocus
                  placeholder="ENTER ACCESS CODE" 
                  value={authPin}
                  onChange={(e) => setAuthPin(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-2xl py-5 text-center text-2xl font-black tracking-[0.5em] text-white outline-none focus:border-indigo-500/50 transition-all shadow-inner placeholder:text-slate-800 placeholder:text-[10px] placeholder:tracking-widest"
                />
                <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent opacity-0 group-focus-within/input:opacity-100 transition-opacity"></div>
              </div>
              
              <button 
                type="submit" 
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] italic shadow-2xl active:scale-95 transition-all group/btn flex items-center justify-center gap-3 overflow-hidden relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:animate-shimmer"></div>
                <span className="relative z-10">Initialize Session</span>
                <i className="fas fa-arrow-right relative z-10 group-hover/btn:translate-x-1 transition-transform"></i>
              </button>
            </form>
          </div>

          <div className="pt-6 border-t border-white/5 opacity-40">
            <p className="text-[7px] font-black text-slate-500 uppercase tracking-[0.5em] italic">Enterprise Encryption Protocol AES-256</p>
          </div>
        </div>
        
        <style>{`
          @keyframes shimmer {
            100% { transform: translateX(100%); }
          }
          .group-hover\\/btn\\:animate-shimmer {
            animation: shimmer 1.5s infinite;
          }
        `}</style>
      </div>
    );
  }

  // ────────────────────────────
  // RENDER AUTHORIZED OPS VIEW
  // ────────────────────────────
  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
        <div>
          <p className="text-[7px] md:text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1 italic">Operations Ledger</p>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter leading-none italic uppercase">Deployment Pipeline</h2>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsReviewUnlocked(!isReviewUnlocked)} 
            className={`px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[9px] active:scale-95 transition-all flex items-center gap-3 italic ${isReviewUnlocked ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-400 hover:text-indigo-600'}`}
          >
            <i className={`fas fa-${isReviewUnlocked ? 'eye-slash' : 'clipboard-check'}`}></i>
            <span>{isReviewUnlocked ? 'Hide Reviews' : 'Review Protocol'}</span>
          </button>
          <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[9px] shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3 italic">
             <span>Raise Issue</span>
             <i className="fas fa-plus-circle text-indigo-400 animate-pulse"></i>
          </button>
        </div>
      </div>

      {/* ADMIN REVIEW QUEUE */}
      {isReviewUnlocked && (
        <section className="bg-indigo-50/30 p-6 md:p-8 rounded-[2rem] border-2 border-indigo-100/50 space-y-6 animate-slideDown">
          <div className="flex justify-between items-center px-2">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 italic">Evaluation Registry</h3>
              <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 italic">Authorized Audit Flow</p>
            </div>
            <button onClick={() => setIsReviewUnlocked(false)} className="text-slate-300 hover:text-rose-500 transition-colors"><i className="fas fa-times text-sm"></i></button>
          </div>

          <div className="space-y-3">
            {pendingReviewQueue.length === 0 ? (
              <div className="py-12 text-center opacity-20"><p className="text-[9px] font-black uppercase italic tracking-widest">No Evaluations Pending</p></div>
            ) : (
              pendingReviewQueue.map((t, i) => {
                const selected = pendingStars[t.rowIndex];
                const isProcessing = submittingRows.has(t.rowIndex);
                const hasSelected = selected !== undefined;
                
                return (
                  <div key={i} className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-fadeIn">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="bg-indigo-600 text-white text-[7px] font-black px-2 py-0.5 rounded italic">REVIEW REQ</span>
                        <span className="text-[7px] font-bold text-slate-400 italic">{t.assignedTo} resolved this</span>
                      </div>
                      <h4 className="font-black text-slate-900 text-[13px] italic leading-tight">"{t.details}"</h4>
                      <p className="text-[8px] text-slate-400 font-bold uppercase truncate max-w-xs">{t.location} • {t.remarks}</p>
                    </div>
                    
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map(star => {
                          const potentialPoints = star - 2;
                          return (
                            <button 
                              key={star} 
                              disabled={isProcessing}
                              onClick={() => setPendingStars(prev => ({...prev, [t.rowIndex]: star}))}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all text-sm active:scale-90 ${
                                selected >= star ? 'bg-amber-100 text-amber-500' : 'bg-slate-50 text-slate-200 hover:text-amber-300'
                              }`}
                              title={`${star} Stars (${potentialPoints >= 0 ? '+' : ''}${potentialPoints} pts)`}
                            >
                              <i className="fas fa-star"></i>
                            </button>
                          );
                        })}
                      </div>
                      
                      {hasSelected ? (
                        <div className="flex items-center gap-4 animate-fadeIn">
                           <span className="text-[7px] font-black uppercase text-amber-500 italic tracking-widest animate-pulse">
                             Rating selected – pending submission
                           </span>
                           <button 
                             disabled={isProcessing}
                             onClick={() => handleAdminReview(t)}
                             className="bg-slate-900 text-white px-5 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                           >
                             {isProcessing ? (
                               <>
                                 <i className="fas fa-circle-notch animate-spin"></i>
                                 <span>Submitting...</span>
                               </>
                             ) : (
                               <>
                                 <i className="fas fa-cloud-upload-alt"></i>
                                 <span>Submit Evaluation</span>
                               </>
                             )}
                           </button>
                        </div>
                      ) : (
                        <span className="text-[7px] font-black uppercase text-slate-300 italic tracking-widest">Select stars to begin evaluation</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      <div className="bg-white rounded-2xl md:rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col min-h-[420px] overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
          <div>
            <h3 className="font-black text-slate-900 uppercase text-[8px] md:text-[10px] tracking-widest">Active Pipeline</h3>
            <p className="text-[6px] md:text-[8px] font-bold text-slate-300 uppercase italic">Infrastructure Sync Status</p>
          </div>
          <span className="text-[7px] md:text-[9px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase italic">{liveQueue.length} Active Records</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2.5 md:space-y-3 hide-scroll">
          {liveQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 opacity-10">
              <i className="fas fa-clipboard-check text-6xl mb-4"></i>
              <p className="text-[10px] font-black uppercase tracking-[0.5em]">Zero Active Deployments</p>
            </div>
          ) : (
            liveQueue.map((t, i) => (
              <div key={i} className="bg-white p-4 md:p-5 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden group">
                <div className="absolute left-0 top-0 h-full w-1 bg-slate-900 opacity-20 group-hover:opacity-100 transition-opacity"></div>
                <div className="flex-1 space-y-1.5 md:space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={`text-[7px] px-2 py-0.5 rounded font-black uppercase tracking-widest ${t.status === 'Open' ? 'bg-indigo-50 text-indigo-600' : t.status === 'On Hold' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>{t.status}</span>
                    <span className="text-[7px] font-bold text-slate-200 uppercase italic">{new Date(t.date).toLocaleDateString()}</span>
                  </div>
                  <h4 className="font-black text-slate-900 text-[12px] md:text-[14px] leading-tight italic tracking-tight">"{t.details}"</h4>
                  <div className="flex flex-wrap gap-2">
                    <span className="bg-slate-50 text-slate-400 px-2 py-0.5 rounded text-[7px] font-black uppercase italic border border-slate-100">{t.assetTag}</span>
                    <span className="bg-slate-50 text-slate-400 px-2 py-0.5 rounded text-[7px] font-black uppercase italic border border-slate-100">{t.location}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-50">
                   <div className="flex items-center gap-3 pr-4 border-r border-slate-50">
                      <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs font-black shadow-lg italic">{t.assignedTo?.[0]}</div>
                      <div className="text-left">
                        <p className="text-[9px] md:text-[11px] text-slate-900 font-black uppercase leading-none">{t.assignedTo}</p>
                        <p className="text-[6px] md:text-[7px] text-slate-300 font-bold uppercase mt-1 italic">Force Specialist</p>
                      </div>
                   </div>
                   <div className="flex gap-1.5">
                      <button onClick={() => handleStatusUpdate(t, 'Resolved (Admin)')} className="w-8 h-8 md:w-10 md:h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-inner" title="Admin Resolve"><i className="fas fa-check text-xs"></i></button>
                      <button onClick={() => handleStatusUpdate(t, 'Resolved by Technician')} className="w-8 h-8 md:w-10 md:h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-inner" title="Tech Resolve"><i className="fas fa-clipboard-check text-xs"></i></button>
                   </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 z-[500] flex items-center justify-center p-3 md:p-6 backdrop-blur-xl animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-[2rem] md:rounded-[3rem] shadow-3xl flex flex-col max-h-[85vh] md:max-h-[90vh] overflow-hidden border border-white/10">
             <div className="p-5 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/30 shrink-0">
               <div>
                 <h3 className="text-lg md:text-xl font-black text-slate-950 uppercase italic tracking-tighter leading-none">Issue Transmission</h3>
                 <p className="text-[7px] md:text-[8px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Authorized Registry Entry</p>
               </div>
               <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-xl text-slate-200 hover:text-rose-500 shadow-sm flex items-center justify-center transition-all active:scale-90 border border-slate-50"><i className="fas fa-times text-lg"></i></button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-5 md:space-y-6 hide-scroll">
                <div className="bg-slate-50 p-3 md:p-4 rounded-xl border border-slate-200 flex items-center justify-between shadow-inner">
                   <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest italic ml-1">Protocol Type</label>
                   <div className="flex bg-white p-1 rounded-lg gap-1 shadow-sm border border-slate-100">
                      {['Proactive', 'Reactive'].map(type => (
                        <button key={type} onClick={() => setComplaintType(type as any)} className={`px-4 md:px-6 py-1.5 md:py-2 rounded-md text-[7px] md:text-[8px] font-black uppercase transition-all ${complaintType === type ? 'bg-slate-900 text-white shadow-md' : 'text-slate-300 hover:text-slate-500'}`}>{type}</button>
                      ))}
                   </div>
                </div>

                {category === 'ac' ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-3 md:p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 shadow-inner">
                        <label className="block text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-1.5 ml-1 italic">1. Select Campus</label>
                        <select value={acSelCampus} onChange={e => {setAcSelCampus(e.target.value); setAcSelFloor(''); setFoundAsset(null); setLookupId('');}} className="w-full bg-transparent font-black text-[10px] md:text-[11px] outline-none italic uppercase text-slate-900 cursor-pointer">
                           <option value="">-- CAMPUS --</option>
                           {acCampusOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className={`bg-slate-50 p-3 md:p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 shadow-inner transition-opacity ${!acSelCampus ? 'opacity-40 pointer-events-none' : ''}`}>
                        <label className="block text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-1.5 ml-1 italic">2. Select Floor</label>
                        <select disabled={!acSelCampus} value={acSelFloor} onChange={e => {setAcSelFloor(e.target.value); setFoundAsset(null); setLookupId('');}} className="w-full bg-transparent font-black text-[10px] md:text-[11px] outline-none italic uppercase text-slate-900 cursor-pointer">
                           <option value="">-- FLOOR --</option>
                           {acFloorOptions.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    </div>
                    
                    <div className={`bg-slate-50 p-4 md:p-5 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 shadow-inner transition-opacity ${!acSelFloor ? 'opacity-40 pointer-events-none' : ''}`}>
                      <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 italic tracking-widest">3. Select Asset ID</label>
                      <select 
                        disabled={!acSelFloor} 
                        value={lookupId} 
                        onChange={e => handleACAssetSelect(e.target.value)} 
                        className="w-full bg-transparent font-black text-[11px] md:text-[13px] text-slate-900 outline-none italic uppercase cursor-pointer"
                      >
                         <option value="">-- CHOOSE ASSET --</option>
                         {acAssetOptions.map(a => (
                           <option key={a.tag} value={a.tag}>
                             {a.tag} | {a.brand} | {a.cap} Ton | {a.room}
                           </option>
                         ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-3 md:p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 shadow-inner">
                        <label className="block text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-1.5 ml-1 italic">Campus</label>
                        <select value={selCampus} onChange={e => {setSelCampus(e.target.value); setSelFloor(''); setSelLocation('');}} className="w-full bg-transparent font-black text-[10px] md:text-[11px] outline-none italic uppercase text-slate-900">
                           <option value="">-- HUB --</option>
                           {campuses.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className={`bg-slate-50 p-3 md:p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 shadow-inner transition-opacity ${!selCampus ? 'opacity-40 pointer-events-none' : ''}`}>
                        <label className="block text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-1.5 ml-1 italic">Floor</label>
                        <select disabled={!selCampus} value={selFloor} onChange={e => {setSelFloor(e.target.value); setSelLocation('');}} className="w-full bg-transparent font-black text-[10px] md:text-[11px] outline-none italic uppercase text-slate-900">
                           <option value="">-- FL --</option>
                           {floors.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className={`bg-slate-50 p-3 md:p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 shadow-inner transition-opacity ${!selFloor ? 'opacity-40 pointer-events-none' : ''}`}>
                      <label className="block text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-1.5 md:mb-2 ml-1 italic">Space / Sector</label>
                      <select disabled={!selFloor} value={selLocation} onChange={e => setSelLocation(e.target.value)} className="w-full bg-transparent font-black text-[10px] md:text-[11px] outline-none italic uppercase text-slate-900">
                         <option value="">-- SELECT AREA --</option>
                         {locations.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                
                {foundAsset && category === 'ac' && (
                  <div className="bg-indigo-50/50 p-4 md:p-6 rounded-2xl border border-indigo-100 flex justify-between items-center animate-slideDown shadow-inner">
                     <div className="pr-4 border-r border-indigo-100">
                       <p className="text-[7px] md:text-[8px] font-black text-indigo-400 uppercase italic">Registry Match</p>
                       <h4 className="font-black text-indigo-900 text-xs md:text-sm italic mt-1 leading-none uppercase">"{foundAsset.room}"</h4>
                     </div>
                     <div className="text-right pl-4">
                       <p className="text-[7px] md:text-[8px] font-bold text-indigo-300 uppercase italic leading-none">{foundAsset.campus}</p>
                       <p className="text-[7px] md:text-[8px] font-bold text-indigo-300 uppercase italic mt-1">{foundAsset.floor}</p>
                     </div>
                  </div>
                )}

                <div className="bg-slate-50 p-4 md:p-6 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all shadow-inner">
                   <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-3 ml-1 italic tracking-widest">Findings Narrative</label>
                   <textarea value={faultDesc} onChange={e => setFaultDesc(e.target.value)} rows={3} className="w-full bg-transparent font-bold text-[11px] md:text-[13px] text-slate-900 outline-none placeholder:text-slate-200 resize-none italic uppercase leading-relaxed" placeholder="Detailed system discrepancy report..." />
                </div>
                
                <div className="bg-slate-50 p-4 md:p-5 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all shadow-inner">
                   <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-2 ml-1 italic tracking-widest">Target Specialist</label>
                   <select value={manualTech} onChange={e => setManualTech(e.target.value)} className="w-full bg-transparent font-black text-[11px] md:text-[13px] text-slate-900 outline-none italic uppercase">
                      {techList.map(t => <option key={t} value={t}>{t}</option>)}
                   </select>
                </div>
             </div>

             <div className="p-5 md:p-8 border-t border-slate-100 bg-slate-50/30 shrink-0">
                <button onClick={handleDispatch} disabled={isSubmitting || !faultDesc.trim() || !lookupId} className="w-full bg-slate-900 text-white py-4 md:py-6 rounded-xl md:rounded-[2rem] font-black text-[10px] md:text-[11px] shadow-2xl active:scale-95 transition-all disabled:opacity-30 uppercase tracking-[0.3em] italic flex items-center justify-center gap-4 group">
                   {isSubmitting ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-satellite-dish text-indigo-400 group-hover:scale-125 transition-transform"></i>}
                   <span>{isSubmitting ? 'Transmitting...' : 'Dispatch Protocol'}</span>
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpsView;