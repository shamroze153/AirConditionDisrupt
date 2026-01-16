
import React, { useState, useMemo } from 'react';
import { Asset, Ticket } from '../types.ts';
import { postAction } from '../services/api.ts';
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

    showToast("Deploying Force...");
    await postAction(fd);
    setIsModalOpen(false);
    setLookupId('');
    setFoundAsset(null);
    setFaultDesc('');
    setIsManualAssign(false);
    onRefresh();
    showToast(`Dispatched: ${assignee}`);
    setIsSubmitting(false);
  };

  const handleExportArchive = () => {
    const resolved = tickets.filter(t => ['Resolved', 'Resolved (Admin)', 'Resolved by Technician'].includes(t.status));
    if (!resolved.length) return alert("No resolved work orders");
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
    <div className="max-w-[1400px] mx-auto p-4 lg:p-10 space-y-8 animate-fadeIn">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 px-2">
        <div><p className="text-[8px] font-black uppercase tracking-[0.5em] text-indigo-500 mb-2 italic">Operations Center</p><h2 className="text-3xl font-extrabold text-slate-900 tracking-tighter leading-none italic">Force Control</h2></div>
        <div className="flex gap-3">
           <button onClick={handleExportArchive} className="bg-white border border-slate-100 text-slate-900 px-5 py-3 rounded-xl font-black uppercase tracking-[0.3em] text-[9px] shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2 overflow-hidden"><i className="fas fa-file-csv text-indigo-500"></i><span>Export CSV</span></button>
           <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black uppercase tracking-[0.3em] text-[9px] shadow-2xl hover:bg-black transition-all flex items-center gap-4 group"><span>Initialize Force</span><i className="fas fa-plus text-[8px] group-hover:rotate-90 transition-transform"></i></button>
        </div>
      </div>

      <div className="bg-white rounded-[1.5rem] premium-card border border-slate-100 flex flex-col min-h-[500px] shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
          <div><h3 className="font-black text-slate-900 uppercase text-[10px] tracking-[0.4em]">Live Synchronizer</h3><p className="text-[8px] font-bold text-slate-400 uppercase mt-1 tracking-widest italic">Operations Pipeline</p></div>
          <div className="flex items-center gap-3"><span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-600"></span></span><span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest italic">{liveQueue.length} Active Workflows</span></div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3 hide-scroll bg-slate-50/5">
          {liveQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 opacity-5"><i className="fas fa-check-double text-6xl mb-6"></i><p className="text-xs font-black uppercase tracking-[0.7em]">Nominal Status</p></div>
          ) : (
            liveQueue.map((t, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative overflow-hidden">
                <div className="absolute left-0 top-0 h-full w-1 bg-indigo-600"></div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3"><span className={`text-[8px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${t.status === 'Open' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>{t.status}</span><span className="text-[8px] font-bold text-slate-300 uppercase italic">{new Date(t.date).toLocaleDateString()}</span></div>
                  <h4 className="font-bold text-slate-900 text-lg leading-tight tracking-tight italic">"{t.details}"</h4>
                  <div className="flex gap-2 pt-1"><span className="bg-slate-50 text-slate-400 px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest italic">{t.assetTag}</span><span className="bg-slate-50 text-slate-400 px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest italic">{t.location}</span></div>
                </div>
                <div className="flex items-center gap-6 w-full lg:w-auto pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-50">
                   <div className="flex items-center gap-3 pr-6 border-r border-slate-100"><div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center text-base font-black">{t.assignedTo?.[0]}</div><div className="text-left"><p className="text-[10px] text-slate-900 font-black uppercase leading-none">{t.assignedTo}</p><p className="text-[7px] text-slate-400 font-bold uppercase mt-1 tracking-widest italic">Specialist</p></div></div>
                   <div className="flex gap-2">
                      <button onClick={async () => {
                         const fd = new FormData();
                         fd.append('rowIndex', String(t.rowIndex));
                         fd.append('assetTag', String(t.assetTag || ''));
                         fd.append('action', 'resolve_ticket');
                         fd.append('status', 'Resolved (Admin)'); 
                         fd.append('resolvedBy', 'Command');
                         fd.append('remarks', 'Direct Resolve');
                         await postAction(fd);
                         onRefresh();
                      }} className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-inner"><i className="fas fa-check text-sm"></i></button>
                      <button className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center hover:bg-amber-600 hover:text-white transition-all shadow-inner"><i className="fas fa-pause text-sm"></i></button>
                   </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 z-[300] flex items-center justify-center p-4 backdrop-blur-2xl animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-white/5 relative overflow-hidden">
             <div className="flex justify-between items-center mb-8"><div><h3 className="text-2xl font-extrabold text-slate-900 tracking-tighter uppercase leading-none italic">Force Deploy</h3><p className="text-[8px] font-bold text-slate-400 uppercase mt-2 tracking-[0.4em]">Logistics Synchronization</p></div><button onClick={() => setIsModalOpen(false)} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-300 shadow-inner flex items-center justify-center"><i className="fas fa-times text-lg"></i></button></div>
             <div className="space-y-6">
                <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all"><label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Asset Reference</label><input type="text" value={lookupId} onChange={e => handleLookup(e.target.value)} className="w-full bg-transparent font-extrabold text-2xl outline-none placeholder:text-slate-200 italic tracking-tighter" placeholder="ID or Tag" /></div>
                {foundAsset && (
                  <div className="bg-indigo-50/40 p-6 rounded-2xl border border-indigo-100 flex items-center gap-4 animate-slideDown shadow-sm"><div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center text-indigo-600 text-2xl shadow-lg"><i className="fas fa-crosshairs"></i></div><div className="flex-1"><p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest italic">Unit: {foundAsset.tag}</p><h4 className="font-extrabold text-indigo-900 text-lg leading-tight mt-1 italic">"{foundAsset.room}"</h4></div></div>
                )}
                <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all"><label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest italic">Fault Brief</label><textarea value={faultDesc} onChange={e => setFaultDesc(e.target.value)} rows={2} className="w-full bg-transparent font-bold text-base outline-none placeholder:text-slate-200 resize-none italic" placeholder="Provide diagnostic brief..." /></div>
                <div className="flex items-center justify-between gap-3"><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">Strategy</p><div className="h-0.5 flex-1 bg-slate-50"></div><button onClick={() => setIsManualAssign(!isManualAssign)} className={`text-[8px] font-black uppercase underline ${isManualAssign ? 'text-indigo-600' : 'text-slate-300'}`}>{isManualAssign ? 'Manual Mode' : 'Enable Manual'}</button></div>
                {isManualAssign && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-indigo-200 grid grid-cols-4 gap-2 animate-slideDown">
                       {TECHNICIANS.map(t => (<button key={t} onClick={() => setManualTech(t)} className={`py-2 rounded-lg text-[8px] font-black uppercase transition-all ${manualTech === t ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}>{t}</button>))}
                  </div>
                )}
                <button onClick={handleDispatch} disabled={!foundAsset || !faultDesc || isSubmitting} className="w-full bg-slate-900 text-white py-6 rounded-2xl font-black text-[12px] shadow-2xl active:scale-95 transition-all disabled:opacity-30 uppercase tracking-[0.4em] italic">{isSubmitting ? 'Syncing...' : 'Confirm Dispatch'}</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpsView;
