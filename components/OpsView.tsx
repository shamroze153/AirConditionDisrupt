
import React, { useState, useMemo } from 'react';
import { Asset, Ticket, CategoryKey } from '../types.ts';
import { postAction, updateAssetStatus } from '../services/api.ts';
import { CATEGORY_TECHS, CAMPUS_ROOMS, ELECTRICAL_TECHNICIANS } from '../constants.ts';

interface Props {
  category: CategoryKey;
  assets: Asset[];
  tickets: Ticket[];
  attendance: Record<string, boolean>;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

const OpsView: React.FC<Props> = ({ category, assets, tickets, attendance, onRefresh, showToast }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [foundAsset, setFoundAsset] = useState<Asset | null>(null);
  const [faultDesc, setFaultDesc] = useState('');
  const [isManualAssign, setIsManualAssign] = useState(false);
  const [complaintType, setComplaintType] = useState<'Proactive' | 'Reactive'>('Proactive');

  // Cascading site selection state
  const [selCampus, setSelCampus] = useState('');
  const [selFloor, setSelFloor] = useState('');
  const [selLocation, setSelLocation] = useState('');
  
  const techList = CATEGORY_TECHS[category] || [];
  const [manualTech, setManualTech] = useState(techList[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Metadata for cascading logic
  const campuses = Object.keys(CAMPUS_ROOMS);
  
  const floors = useMemo(() => {
    if (!selCampus) return [];
    return Object.keys(CAMPUS_ROOMS[selCampus] || {});
  }, [selCampus]);

  const locations = useMemo(() => {
    if (!selCampus || !selFloor) return [];
    return CAMPUS_ROOMS[selCampus][selFloor] || [];
  }, [selCampus, selFloor]);

  const liveQueue = useMemo(() => 
    tickets.filter(t => !['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status)),
  [tickets]);

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

  const handleDispatch = async () => {
    if (!faultDesc) return;
    if (category === 'ac' && !foundAsset && lookupId.length < 2) return;
    if (category !== 'ac' && (!selCampus || !selFloor || !selLocation)) return;

    setIsSubmitting(true);
    let assignee = manualTech;
    let finalStatus = 'Open';
    
    if (!isManualAssign) {
      if (category === 'handyman') {
        assignee = 'Sajid'; // Always Sajid for GM
      } else {
        const presentTechs = techList.filter(t => attendance[t] === true);
        if (presentTechs.length === 0) {
          assignee = "Unassigned";
          finalStatus = "Pending Assignment – All Absent";
        } else {
          // ISSUE 1: Restore Round Robin for Electrical or Smart assignment for others
          if (category === 'electrical') {
             const elecTicketCount = tickets.filter(t => String(t.category).toUpperCase() === 'ELECTRICAL').length;
             assignee = presentTechs[elecTicketCount % presentTechs.length];
          } else {
             const load: Record<string, number> = {};
             presentTechs.forEach(t => load[t] = 0);
             tickets.forEach(t => {
               if (!['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status)) {
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
        fd.append('location', foundAsset ? `${foundAsset.campus} - ${foundAsset.floor} - ${foundAsset.room}` : 'AC Direct Log');
        fd.append('assetTag', String(foundAsset?.tag || lookupId));
      } else {
        fd.append('location', `${selCampus} - ${selFloor} - ${selLocation}`);
        fd.append('assetTag', 'N/A');
      }

      fd.append('details', faultDesc);
      fd.append('assignedTech', assignee);
      fd.append('status', finalStatus);

      showToast("Dispatching Specialist...");
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
      setIsManualAssign(false);
      setComplaintType('Proactive');
      onRefresh();
      showToast(`Specialist Notified: ${assignee}`);
    } catch (e) {
      showToast("Dispatch Hub Failure");
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
    fd.append('resolvedBy', 'Hub Command');
    fd.append('remarks', `Hub Action: ${newStatus}`);
    showToast(`Marking as ${newStatus}...`);
    await postAction(fd);

    if (newStatus.toLowerCase().includes('resolved') && t.assetTag !== 'N/A') {
      await updateAssetStatus(category, t.assetTag, 'Active');
    }

    onRefresh();
  };

  const isDispatchValid = () => {
    if (!faultDesc || isSubmitting) return false;
    if (category === 'ac') return !!foundAsset || lookupId.length > 2;
    return selCampus && selFloor && selLocation;
  };

  return (
    <div className="max-w-[1400px] mx-auto p-3 lg:p-10 space-y-6 animate-fadeIn">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 px-1.5">
        <div><p className={`text-[7px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1 italic`}>{category.toUpperCase()} Force Control</p><h2 className="text-2xl font-extrabold text-slate-900 tracking-tighter leading-none italic uppercase">Deployment Ledger</h2></div>
        <div className="flex gap-2">
           <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl hover:bg-black transition-all flex items-center gap-4 group hover:scale-105 active:scale-95">
             <span className="italic">Log Deployment Failure</span>
             <i className="fas fa-plus text-xs animate-pulse"></i>
           </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl premium-card border border-slate-100 flex flex-col min-h-[420px] shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/10">
          <div><h3 className="font-black text-slate-900 uppercase text-[9px] tracking-[0.2em]">Active Force Pipeline</h3><p className="text-[7px] font-bold text-slate-400 uppercase mt-0.5 italic">Departmental Synchronization</p></div>
          <div className="flex items-center gap-2"><span className="relative flex h-1 w-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1 w-1 bg-indigo-600"></span></span><span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest italic">{liveQueue.length} Active Records</span></div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 hide-scroll bg-slate-50/5">
          {liveQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 opacity-5"><i className="fas fa-check-double text-5xl mb-5"></i><p className="text-[9px] font-black uppercase tracking-[0.4em]">Zero Active Deployments</p></div>
          ) : (
            liveQueue.map((t, i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-lg transition-all flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative overflow-hidden">
                <div className={`absolute left-0 top-0 h-full w-0.5 bg-slate-900`}></div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2.5"><span className={`text-[7px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${t.status === 'Open' ? 'bg-indigo-50 text-indigo-600' : t.status === 'On Hold' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>{t.status}</span><span className="text-[7px] font-bold text-slate-200 uppercase italic">{new Date(t.date).toLocaleDateString()}</span></div>
                  <h4 className="font-black text-slate-900 text-[13px] leading-tight tracking-tight italic">"{t.details}"</h4>
                  <div className="flex gap-1.5 pt-0.5"><span className="bg-slate-50 text-slate-300 px-2 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest italic">{t.assetTag}</span><span className="bg-slate-50 text-slate-300 px-2 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest italic">{t.location}</span></div>
                </div>
                <div className="flex items-center gap-4 w-full lg:w-auto pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-50/50">
                   <div className="flex items-center gap-2 pr-4 border-r border-slate-50"><div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs font-black shadow-inner">{t.assignedTo?.[0]}</div><div className="text-left"><p className="text-[9px] text-slate-900 font-black uppercase leading-none">{t.assignedTo}</p><p className="text-[6px] text-slate-300 font-bold uppercase mt-1 tracking-widest italic">Specialist</p></div></div>
                   <div className="flex gap-1.5">
                      <button onClick={() => handleStatusUpdate(t, 'Resolved (Admin)')} className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-inner"><i className="fas fa-check text-xs"></i></button>
                      <button onClick={() => handleStatusUpdate(t, t.status === 'On Hold' ? 'Open' : 'On Hold')} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-inner ${t.status === 'On Hold' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white'}`}><i className="fas fa-pause text-xs"></i></button>
                      <button onClick={() => handleStatusUpdate(t, 'Resolved by Technician')} className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-inner"><i className="fas fa-clipboard-check text-xs"></i></button>
                   </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 z-[300] flex items-center justify-center p-4 backdrop-blur-2xl animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-2xl p-8 shadow-2xl border border-white/5 relative overflow-hidden">
             <div className="flex justify-between items-center mb-6"><div><h3 className="text-xl font-extrabold text-slate-900 tracking-tighter uppercase leading-none italic">Deployment Entry</h3><p className="text-[7px] font-bold text-slate-400 uppercase mt-1.5 tracking-[0.3em]">Operational Protocol</p></div><button onClick={() => setIsModalOpen(false)} className="w-9 h-9 bg-slate-50 rounded-lg text-slate-300 shadow-inner flex items-center justify-center active:scale-90"><i className="fas fa-times text-base"></i></button></div>
             <div className="space-y-4">
                
                {/* Protocol Selection */}
                <div className="bg-slate-50 p-3 rounded-xl border-2 border-slate-100 flex items-center justify-between">
                   <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic ml-1">Protocol</label>
                   <div className="flex bg-white p-1 rounded-lg shadow-inner gap-1">
                      {['Proactive', 'Reactive'].map(type => (
                        <button 
                          key={type}
                          onClick={() => setComplaintType(type as any)}
                          className={`px-4 py-1.5 rounded-md text-[7px] font-black uppercase tracking-widest transition-all ${complaintType === type ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-300 hover:text-slate-500'}`}
                        >
                          {type}
                        </button>
                      ))}
                   </div>
                </div>

                {category === 'ac' ? (
                  <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                    <label className="block text-[7px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Asset Tag / ID</label>
                    <input type="text" value={lookupId} onChange={e => handleLookup(e.target.value)} className="w-full bg-transparent font-extrabold text-lg outline-none placeholder:text-slate-200 italic tracking-tighter uppercase" placeholder="Search Unit Tag..." />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-slate-50 p-3 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                      <label className="block text-[7px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest italic">1. Select Campus</label>
                      <select value={selCampus} onChange={e => {setSelCampus(e.target.value); setSelFloor(''); setSelLocation('');}} className="w-full bg-transparent font-black text-[10px] outline-none italic uppercase cursor-pointer">
                         <option value="">--- CHOOSE CAMPUS ---</option>
                         {campuses.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className={`bg-slate-50 p-3 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all ${!selCampus ? 'opacity-30' : ''}`}>
                      <label className="block text-[7px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest italic">2. Select Floor</label>
                      <select disabled={!selCampus} value={selFloor} onChange={e => {setSelFloor(e.target.value); setSelLocation('');}} className="w-full bg-transparent font-black text-[10px] outline-none italic uppercase cursor-pointer">
                         <option value="">--- CHOOSE FLOOR ---</option>
                         {floors.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div className={`bg-slate-50 p-3 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all ${!selFloor ? 'opacity-30' : ''}`}>
                      <label className="block text-[7px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest italic">3. Select Room / Space</label>
                      <select disabled={!selFloor} value={selLocation} onChange={e => setSelLocation(e.target.value)} className="w-full bg-transparent font-black text-[10px] outline-none italic uppercase cursor-pointer">
                         <option value="">--- CHOOSE AREA ---</option>
                         {locations.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                
                {foundAsset && category === 'ac' && (
                  <div className="bg-indigo-50/30 p-5 rounded-2xl border border-indigo-100 animate-slideDown shadow-inner">
                    <div className="flex justify-between items-start">
                       <div>
                         <p className="text-[7px] font-black text-indigo-400 uppercase tracking-widest italic">System Target: {foundAsset.tag}</p>
                         <h4 className="font-extrabold text-indigo-900 text-sm italic mt-1 leading-none">"{foundAsset.room}"</h4>
                       </div>
                       <div className="text-right">
                         <p className="text-[6px] font-bold text-slate-400 uppercase italic leading-none">{foundAsset.campus} • {foundAsset.floor}</p>
                         <p className="text-[6px] font-bold text-slate-300 uppercase italic mt-1">{foundAsset.brand} - {foundAsset.cap}T</p>
                       </div>
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all"><label className="block text-[7px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Fault Narrative</label><textarea value={faultDesc} onChange={e => setFaultDesc(e.target.value)} rows={2} className="w-full bg-transparent font-bold text-sm outline-none placeholder:text-slate-200 resize-none italic" placeholder="Describe your issue..." /></div>
                
                <button onClick={handleDispatch} disabled={!isDispatchValid()} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-[10px] shadow-2xl active:scale-95 transition-all disabled:opacity-30 uppercase tracking-[0.2em] italic flex items-center justify-center gap-3">
                   {isSubmitting ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-paper-plane text-teal-400"></i>}
                   <span>{isSubmitting ? 'Syncing...' : 'Authorize Dispatch'}</span>
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpsView;
