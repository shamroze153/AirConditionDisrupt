
import React, { useState, useMemo } from 'react';
import { Asset, Ticket } from '../types.ts';
import { postAction, updateAssetStatus } from '../services/api.ts';
import { TECHNICIANS } from '../constants.ts';

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
    fd.append('category', 'AC Breakdown');
    fd.append('location', String(foundAsset.location || 'Site'));
    fd.append('assetTag', String(foundAsset.tag || ''));
    fd.append('details', faultDesc);
    fd.append('assignedTech', assignee);
    fd.append('status', 'Open');

    showToast("Dispatching Force...");
    await postAction(fd);
    
    // Auto-move to Maintenance
    await updateAssetStatus(foundAsset.tag, 'Maintenance');

    setIsModalOpen(false);
    setLookupId('');
    setFoundAsset(null);
    setFaultDesc('');
    setIsManualAssign(false);
    onRefresh();
    showToast(`Dispatched: ${assignee}`);
    setIsSubmitting(false);
  };

  const handleStatusUpdate = async (t: Ticket, newStatus: string) => {
    const fd = new FormData();
    fd.append('rowIndex', String(t.rowIndex));
    fd.append('assetTag', String(t.assetTag || ''));
    fd.append('action', 'resolve_ticket');
    fd.append('status', newStatus); 
    fd.append('resolvedBy', 'Command');
    fd.append('remarks', `Command Overrule: ${newStatus}`);
    showToast(`Marking as ${newStatus}...`);
    await postAction(fd);

    // If resolved, auto-move back to Active
    if (newStatus.toLowerCase().includes('resolved')) {
      await updateAssetStatus(t.assetTag, 'Active');
    }

    onRefresh();
  };

  const handleExportArchive = () => {
    const resolved = tickets.filter(t => ['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status));
    if (!resolved.length) return alert("No resolved activity");
    const headers = "Timestamp,Category,Location,Asset,Details,Assigned,Status,Remarks\n";
    const rows = resolved.map(t => `${t.date},${t.category},${t.location},${t.assetTag},"${t.details}",${t.assignedTo},${t.status},"${t.remarks || ''}"`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resolved_Archive_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="max-w-[1400px] mx-auto p-3 lg:p-10 space-y-6 animate-fadeIn">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 px-1.5">
        <div><p className="text-[7px] font-black uppercase tracking-[0.3em] text-indigo-500 mb-1 italic">Operations Management</p><h2 className="text-2xl font-extrabold text-slate-900 tracking-tighter leading-none italic uppercase">Force Control</h2></div>
        <div className="flex gap-2">
           <button onClick={handleExportArchive} className="bg-white border border-slate-100 text-slate-900 px-4 py-2 rounded-xl font-black uppercase tracking-[0.1em] text-[8px] shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2 overflow-hidden"><i className="fas fa-file-csv text-indigo-500"></i><span>Archive</span></button>
           {/* BIGGER Report Issue button */}
           <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl hover:bg-black transition-all flex items-center gap-4 group hover:scale-105 active:scale-95">
             <span className="italic">Report Failure Registry</span>
             <i className="fas fa-plus text-xs animate-pulse"></i>
           </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl premium-card border border-slate-100 flex flex-col min-h-[420px] shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/10">
          <div><h3 className="font-black text-slate-900 uppercase text-[9px] tracking-[0.2em]">Activity Synchronizer</h3><p className="text-[7px] font-bold text-slate-400 uppercase mt-0.5 italic">Real-time Pipeline</p></div>
          <div className="flex items-center gap-2"><span className="relative flex h-1 w-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1 w-1 bg-indigo-600"></span></span><span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest italic">{liveQueue.length} Active Workflows</span></div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 hide-scroll bg-slate-50/5">
          {liveQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 opacity-5"><i className="fas fa-check-double text-5xl mb-5"></i><p className="text-[9px] font-black uppercase tracking-[0.4em]">Zero Active Issues</p></div>
          ) : (
            liveQueue.map((t, i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-lg transition-all flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative overflow-hidden">
                <div className="absolute left-0 top-0 h-full w-0.5 bg-indigo-600"></div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2.5"><span className={`text-[7px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${t.status === 'Open' ? 'bg-indigo-50 text-indigo-600' : t.status === 'On Hold' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>{t.status}</span><span className="text-[7px] font-bold text-slate-200 uppercase italic">{new Date(t.date).toLocaleDateString()}</span></div>
                  <h4 className="font-black text-slate-900 text-[13px] leading-tight tracking-tight italic">"{t.details}"</h4>
                  <div className="flex gap-1.5 pt-0.5"><span className="bg-slate-50 text-slate-300 px-2 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest italic">{t.assetTag}</span><span className="bg-slate-50 text-slate-300 px-2 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest italic">{t.location}</span></div>
                </div>
                <div className="flex items-center gap-4 w-full lg:w-auto pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-50/50">
                   <div className="flex items-center gap-2 pr-4 border-r border-slate-50"><div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs font-black">{t.assignedTo?.[0]}</div><div className="text-left"><p className="text-[9px] text-slate-900 font-black uppercase leading-none">{t.assignedTo}</p><p className="text-[6px] text-slate-300 font-bold uppercase mt-1 tracking-widest italic">Specialist</p></div></div>
                   <div className="flex gap-1.5">
                      <button onClick={() => handleStatusUpdate(t, 'Resolved (Admin)')} title="Admin Resolve" className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-inner"><i className="fas fa-check text-xs"></i></button>
                      <button onClick={() => handleStatusUpdate(t, t.status === 'On Hold' ? 'Open' : 'On Hold')} title="Pause" className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-inner ${t.status === 'On Hold' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white'}`}><i className="fas fa-pause text-xs"></i></button>
                      <button onClick={() => handleStatusUpdate(t, 'Resolved by Technician')} title="Mark Resolved" className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-inner"><i className="fas fa-clipboard-check text-xs"></i></button>
                   </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 z-[300] flex items-center justify-center p-4 backdrop-blur-2xl animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-white/5 relative overflow-hidden">
             <div className="flex justify-between items-center mb-6"><div><h3 className="text-xl font-extrabold text-slate-900 tracking-tighter uppercase leading-none italic">Report Failure</h3><p className="text-[7px] font-bold text-slate-400 uppercase mt-1.5 tracking-[0.3em]">Operational Maintenance Entry</p></div><button onClick={() => setIsModalOpen(false)} className="w-9 h-9 bg-slate-50 rounded-lg text-slate-300 shadow-inner flex items-center justify-center active:scale-90"><i className="fas fa-times text-base"></i></button></div>
             <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all"><label className="block text-[7px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Asset Tag / ID</label><input type="text" value={lookupId} onChange={e => handleLookup(e.target.value)} className="w-full bg-transparent font-extrabold text-lg outline-none placeholder:text-slate-200 italic tracking-tighter uppercase" placeholder="Search Asset..." /></div>
                {foundAsset && (
                  <div className="bg-indigo-50/30 p-4 rounded-xl border border-indigo-50 flex items-center gap-3 animate-slideDown"><div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-indigo-600 text-base shadow-sm"><i className="fas fa-crosshairs"></i></div><div className="flex-1"><p className="text-[7px] font-black text-indigo-400 uppercase tracking-widest italic">Asset Found: {foundAsset.tag}</p><h4 className="font-extrabold text-indigo-900 text-sm leading-tight mt-0.5 italic">"{foundAsset.room}"</h4></div></div>
                )}
                <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all"><label className="block text-[7px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Failure Narrative</label><textarea value={faultDesc} onChange={e => setFaultDesc(e.target.value)} rows={2} className="w-full bg-transparent font-bold text-sm outline-none placeholder:text-slate-200 resize-none italic" placeholder="Describe the fault clearly..." /></div>
                <div className="flex items-center justify-between gap-3"><p className="text-[7px] font-black text-slate-300 uppercase tracking-widest italic">Assignment Strategy</p><div className="h-0.5 flex-1 bg-slate-50"></div><button onClick={() => setIsManualAssign(!isManualAssign)} className={`text-[7px] font-black uppercase underline ${isManualAssign ? 'text-indigo-600' : 'text-slate-200'}`}>{isManualAssign ? 'Manual' : 'Enable Manual'}</button></div>
                {isManualAssign && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-indigo-50 grid grid-cols-4 gap-1.5 animate-slideDown">
                       {TECHNICIANS.map(t => (<button key={t} onClick={() => setManualTech(t)} className={`py-2 rounded-md text-[7px] font-black uppercase transition-all ${manualTech === t ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-300 border border-slate-50'}`}>{t}</button>))}
                  </div>
                )}
                <button onClick={handleDispatch} disabled={!foundAsset || !faultDesc || isSubmitting} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-[10px] shadow-2xl active:scale-95 transition-all disabled:opacity-30 uppercase tracking-[0.2em] italic">{isSubmitting ? 'Processing...' : 'Confirm Dispatch'}</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpsView;
