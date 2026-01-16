
import React, { useState, useMemo } from 'react';
import { Asset, Ticket } from '../types';
import { postAction } from '../services/api';
import { TECHNICIANS } from '../constants';

interface Props {
  assets: Asset[];
  tickets: Ticket[];
  attendance: Record<string, boolean>;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}

const OpsView: React.FC<Props> = ({ assets, tickets, attendance, onRefresh, showToast }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [foundAsset, setFoundAsset] = useState<Asset | null>(null);
  const [faultDesc, setFaultDesc] = useState('');
  const [isManualAssign, setIsManualAssign] = useState(false);
  const [manualTech, setManualTech] = useState(TECHNICIANS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [actionTicket, setActionTicket] = useState<Ticket | null>(null);
  const [actionType, setActionType] = useState<'hold' | 'resolve_tech' | 'resolve_admin' | null>(null);
  const [remarks, setRemarks] = useState('');
  const [selectedResolvers, setSelectedResolvers] = useState<string[]>([]);

  const liveTickets = useMemo(() => 
    tickets.filter(t => !['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status)),
  [tickets]);

  const handleLookup = (val: string) => {
    setLookupId(val);
    if (!val) {
      setFoundAsset(null);
      return;
    }
    const asset = assets.find(a => 
      String(a.id) === val.trim() || 
      String(a.tag || '').toLowerCase() === val.toLowerCase().trim() ||
      String(a.tag || '').toLowerCase().includes(val.toLowerCase().trim())
    );
    setFoundAsset(asset || null);
  };

  const handleSubmit = async () => {
    if (!foundAsset || !faultDesc) return;
    setIsSubmitting(true);
    let assignee = manualTech;
    
    if (!isManualAssign) {
      const presentTechs = TECHNICIANS.filter(t => attendance[t] === true);
      if (presentTechs.length === 0) {
        assignee = "Unassigned";
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

    const fd = new FormData();
    fd.append('action', 'complain');
    fd.append('category', 'AC');
    fd.append('location', String(foundAsset.location || 'Site'));
    fd.append('assetTag', String(foundAsset.tag || ''));
    fd.append('details', faultDesc);
    fd.append('assignedTech', assignee);
    fd.append('status', 'In Progress');

    showToast("Committing Ops Data...");
    await postAction(fd);
    setIsModalOpen(false);
    setLookupId('');
    setFoundAsset(null);
    setFaultDesc('');
    setIsManualAssign(false);
    onRefresh();
    showToast(`Assigned: ${assignee} to ${foundAsset.tag}`);
    setIsSubmitting(false);
  };

  const handleAdminResolve = async (ticket: Ticket) => {
    setIsSubmitting(true);
    const fd = new FormData();
    fd.append('rowIndex', String(ticket.rowIndex));
    fd.append('assetTag', String(ticket.assetTag || ''));
    fd.append('action', 'resolve_ticket');
    fd.append('status', 'Resolved'); 
    fd.append('resolvedBy', 'Admin');
    
    showToast("Admin Resolution Syncing...");
    await postAction(fd);
    onRefresh(); 
    showToast("Ticket Resolved & Archived");
    setIsSubmitting(false);
  };

  const handleQueueAction = async () => {
    if (!actionTicket || !actionType) return;
    setIsSubmitting(true);
    const fd = new FormData();
    fd.append('rowIndex', String(actionTicket.rowIndex));
    fd.append('assetTag', String(actionTicket.assetTag || ''));
    fd.append('action', 'resolve_ticket');
    
    if (actionType === 'hold') {
      fd.append('status', 'On Hold');
      fd.append('resolvedBy', 'Admin');
      fd.append('remarks', remarks);
    } else if (actionType === 'resolve_tech') {
      fd.append('status', 'Resolved by Technician');
      fd.append('resolvedBy', selectedResolvers.join(', '));
      fd.append('remarks', remarks || 'Service completed');
    }

    await postAction(fd);
    setActionTicket(null);
    setActionType(null);
    setRemarks('');
    setSelectedResolvers([]);
    setIsSubmitting(false);
    onRefresh();
    showToast("Queue Updated Successfully");
  };

  const toggleResolver = (tech: string) => {
    setSelectedResolvers(prev => 
      prev.includes(tech) ? prev.filter(t => t !== tech) : [...prev, tech]
    );
  };

  return (
    <div className="p-6 space-y-6 animate-fadeIn pb-24">
      <button onClick={() => setIsModalOpen(true)} className="w-full bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl flex justify-between items-center group active:scale-[0.97] transition-all hover:bg-indigo-950">
        <div className="text-left">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-2">Ops & Admin Hub</p>
          <h3 className="text-3xl font-black tracking-tight leading-none">Report Issue</h3>
          <p className="text-[10px] font-bold text-white/30 uppercase mt-3 tracking-widest">Type ID (1-161) or Tag</p>
        </div>
        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl text-red-400 group-hover:rotate-12 transition-transform shadow-inner"><i className="fas fa-exclamation-triangle"></i></div>
      </button>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 flex flex-col h-[65vh] shadow-sm overflow-hidden group">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
          <div><h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Live Ticket Queue</h3><p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Real-time Sheet Sync</p></div>
          <div className="flex items-center gap-2"><span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span><span className="text-[9px] font-black text-red-600 uppercase tracking-widest">Live Engine</span></div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scroll bg-gradient-to-b from-white to-slate-50/30">
          {liveTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 opacity-30"><i className="fas fa-check-circle text-6xl mb-4 text-emerald-500"></i><p className="text-xs font-black uppercase tracking-widest">All Pending Jobs Resolved</p></div>
          ) : (
            liveTickets.map((t, i) => (
              <div key={i} className="bg-white p-6 rounded-[2rem] border-l-[8px] border-red-500 shadow-sm group/ticket hover:shadow-xl transition-all">
                <div className="flex justify-between items-start mb-4">
                  <span className={`text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-tighter ${t.status === 'Open' ? 'bg-red-100 text-red-600' : t.status === 'On Hold' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>{t.status}</span>
                  <span className="text-[8px] font-black text-slate-300 uppercase">{new Date(t.date).toLocaleDateString()}</span>
                </div>
                <h4 className="font-black text-slate-800 text-sm leading-relaxed mb-5 group-hover/ticket:text-red-900">{t.details}</h4>
                <div className="flex items-center justify-between pt-4 border-t border-slate-50 mb-6">
                   <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center text-[11px] font-black uppercase shadow-inner">{t.assignedTo?.[0] || '?'}</div>
                      <div><p className="text-[10px] text-slate-500 font-bold uppercase leading-none">{t.assignedTo}</p><p className="text-[8px] text-slate-300 font-bold uppercase mt-1">Field Tech</p></div>
                   </div>
                   <div className="text-right"><p className="text-[10px] text-indigo-400 font-black uppercase leading-none">{t.assetTag}</p><p className="text-[8px] text-slate-300 font-bold uppercase mt-1">{t.location}</p></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                   <button disabled={isSubmitting} onClick={() => handleAdminResolve(t)} className="bg-slate-900 text-white text-[9px] font-black uppercase py-3 rounded-xl active:scale-95 transition-all shadow-md hover:bg-slate-800 disabled:opacity-50">Admin</button>
                   <button disabled={isSubmitting} onClick={() => { setActionTicket(t); setActionType('hold'); }} className="bg-amber-500 text-white text-[9px] font-black uppercase py-3 rounded-xl active:scale-95 transition-all shadow-md hover:bg-amber-600 disabled:opacity-50">On Hold</button>
                   <button disabled={isSubmitting} onClick={() => { setActionTicket(t); setActionType('resolve_tech'); }} className="bg-emerald-600 text-white text-[9px] font-black uppercase py-3 rounded-xl active:scale-95 transition-all shadow-md hover:bg-emerald-700 disabled:opacity-50">Tech</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {actionTicket && actionType && (
        <div className="fixed inset-0 bg-slate-900/95 z-[200] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
           <div className="bg-white w-full max-w-sm rounded-[3.5rem] p-10 shadow-2xl border border-white/10">
              <div className="flex justify-between items-center mb-8">
                <div><h3 className="text-2xl font-black text-slate-900 leading-none uppercase">{actionType === 'hold' ? 'Set On Hold' : 'Tech Resolve'}</h3><p className="text-[9px] font-bold text-slate-400 uppercase mt-2">Log entry for {actionTicket.assetTag}</p></div>
                <button onClick={() => { setActionTicket(null); setActionType(null); setRemarks(''); setSelectedResolvers([]); }} className="w-12 h-12 bg-slate-50 rounded-full text-slate-400 hover:bg-slate-100 transition-colors shadow-inner"><i className="fas fa-times"></i></button>
              </div>
              <div className="space-y-6">
                 <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-inner">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest">Remarks / Details</p>
                    <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full bg-transparent font-bold text-sm outline-none resize-none placeholder:text-slate-300" placeholder={actionType === 'hold' ? "Reason for putting on hold..." : "Notes on job completion..."} rows={4} />
                 </div>
                 {actionType === 'resolve_tech' && (
                   <div className="space-y-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Resolved By Who?</p>
                      <div className="grid grid-cols-2 gap-2">
                        {TECHNICIANS.map(t => (<button key={t} onClick={() => toggleResolver(t)} className={`p-4 rounded-2xl text-[10px] font-black uppercase transition-all border-2 ${selectedResolvers.includes(t) ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-slate-50 text-slate-400 border-transparent'}`}>{t}</button>))}
                      </div>
                   </div>
                 )}
                 <button onClick={handleQueueAction} disabled={isSubmitting || (actionType === 'resolve_tech' && selectedResolvers.length === 0) || (actionType === 'hold' && !remarks)} className="w-full bg-slate-900 text-white py-6 rounded-[2.5rem] font-black uppercase tracking-[0.3em] text-[10px] shadow-2xl active:scale-95 disabled:opacity-30 transition-all relative overflow-hidden group">
                   <span className="relative z-10">{isSubmitting ? 'Syncing...' : 'Confirm Status Update'}</span>
                   <div className="absolute inset-0 bg-indigo-600 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                 </button>
              </div>
           </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/95 z-[100] flex items-center justify-center p-6 backdrop-blur-xl animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-[3.5rem] p-10 max-h-[90vh] overflow-y-auto shadow-2xl border border-white/20 hide-scroll">
             <div className="flex justify-between items-center mb-10">
               <div><h3 className="text-3xl font-black text-slate-900 tracking-tight leading-none">Report Issue</h3><p className="text-[10px] font-bold text-slate-400 uppercase mt-3 tracking-widest">Round-Robin Dispatch</p></div>
               <button onClick={() => setIsModalOpen(false)} className="w-14 h-14 bg-slate-50 rounded-full text-slate-400 hover:text-red-500 transition-colors shadow-inner"><i className="fas fa-times text-2xl"></i></button>
             </div>
             <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 focus-within:bg-white focus-within:border-indigo-500 transition-all shadow-inner">
                   <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest">Asset TAG or ID (1-161)</label>
                   <input type="text" value={lookupId} onChange={(e) => handleLookup(e.target.value)} className="w-full bg-transparent font-black text-xl outline-none placeholder:text-slate-200" placeholder="E.g. 5 or AC-102" />
                </div>
                {foundAsset && (
                  <div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100 animate-slideDown shadow-sm flex items-center gap-5">
                     <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-indigo-600 text-2xl shadow-sm"><i className="fas fa-check-circle"></i></div>
                     <div className="flex-1">
                       <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Asset Identified [ID: {foundAsset.id}]</p>
                       <h4 className="font-black text-indigo-900 text-sm leading-tight mt-1">{foundAsset.room}</h4>
                       <p className="text-[9px] text-indigo-700 font-bold uppercase mt-1 opacity-70">{foundAsset.location} • {foundAsset.tag}</p>
                     </div>
                  </div>
                )}
                <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 focus-within:bg-white focus-within:border-indigo-500 transition-all shadow-inner">
                   <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest">Job Details</label>
                   <textarea value={faultDesc} onChange={(e) => setFaultDesc(e.target.value)} rows={4} className="w-full bg-transparent font-black text-sm outline-none placeholder:text-slate-200 resize-none" placeholder="Describe the fault precisely..." />
                </div>
                <div className="bg-slate-50 p-5 rounded-[2rem] flex items-center justify-between border border-slate-100 shadow-sm">
                   <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-sm ${isManualAssign ? 'bg-indigo-600 text-white' : 'bg-white text-slate-300'}`}><i className="fas fa-user-shield"></i></div>
                      <div><span className="text-[11px] font-black text-slate-900 uppercase leading-none">Manual Override</span><p className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Bypass Auto-Assignment</p></div>
                   </div>
                   <button onClick={() => setIsManualAssign(!isManualAssign)} className={`w-14 h-8 rounded-full transition-all relative shadow-inner ${isManualAssign ? 'bg-indigo-600' : 'bg-slate-200'}`}><div className={`absolute top-1.5 w-5 h-5 bg-white rounded-full shadow transition-all ${isManualAssign ? 'left-8' : 'left-1'}`}></div></button>
                </div>
                {isManualAssign && (
                  <div className="animate-slideDown bg-slate-50 p-6 rounded-[2.5rem] border border-indigo-100 shadow-inner">
                     <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 ml-2 tracking-widest">Assigned Tech</label>
                     <select value={manualTech} onChange={(e) => setManualTech(e.target.value)} className="w-full bg-transparent font-black text-sm outline-none cursor-pointer">
                       {TECHNICIANS.map(t => <option key={t} value={t}>{t}</option>)}
                     </select>
                  </div>
                )}
                <button onClick={handleSubmit} disabled={!foundAsset || !faultDesc || isSubmitting} className="w-full bg-slate-900 text-white py-7 rounded-[2.5rem] font-black text-xs shadow-2xl active:scale-95 transition-all disabled:opacity-30 uppercase tracking-[0.4em] relative overflow-hidden group">
                  <span className="relative z-10">{isSubmitting ? 'Syncing...' : 'Commit Ticket'}</span>
                  <div className="absolute inset-0 bg-indigo-600 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpsView;
