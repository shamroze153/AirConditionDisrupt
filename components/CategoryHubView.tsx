
import React, { useState, useMemo } from 'react';
import { FM_CATEGORIES, CAMPUS_ROOMS, TECHNICIANS, ELECTRICAL_TECHNICIANS } from '../constants';
import { FMCategory, Ticket, Asset } from '../types';
import { postAction, fetchAssets, updateAssetStatus } from '../services/api.ts';

interface Props {
  onBack: () => void;
  onSelectCategory: (category: FMCategory) => void;
  onOpenGlobal: () => void;
  tickets: Ticket[];
  acAttendance: Record<string, boolean>;
  elecAttendance: Record<string, boolean>;
}

const ISSUE_CATEGORIES: Record<string, string[]> = {
  'ac': ['Cooling Issue', 'Water Leakage', 'Noisy Operation', 'Electrical Fault', 'Preventive Check', 'Gas Top-up', 'Others'],
  'electrical': ['Power Outage', 'Socket/Switch Fault', 'Lighting Issue', 'UPS/Generator', 'DB Trip', 'Others'],
  'handyman': ['Furniture Repair', 'Door/Lock Fix', 'Wall/Paint', 'Plumbing', 'Glass Work', 'Others'],
  'default': ['Technical Breakdown', 'General Request', 'Safety Hazard', 'Operational Support', 'Others']
};

const CategoryHubView: React.FC<Props> = ({ onBack, onSelectCategory, onOpenGlobal, tickets, acAttendance, elecAttendance }) => {
  const [reportModal, setReportModal] = useState(false);
  const [reportStep, setReportStep] = useState(1); // 1: Category Selection, 2: Details/Asset
  const [selectedCat, setSelectedCat] = useState<FMCategory | null>(null);
  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  
  const [formData, setFormData] = useState({
    campus: '',
    floor: '',
    location: '', 
    details: '',
    tag: '',
    issueCategory: '',
    complaintType: 'Proactive' as 'Proactive' | 'Reactive',
    immediateResolve: false
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [foundAsset, setFoundAsset] = useState<Asset | null>(null);
  const [assignedFeedback, setAssignedFeedback] = useState<string | null>(null);

  const hardFM = FM_CATEGORIES.filter(c => c.group === 'Hard FM');
  const softFM = FM_CATEGORIES.filter(c => c.group === 'Soft FM');

  const campuses = Object.keys(CAMPUS_ROOMS || {});
  
  const floors = useMemo(() => {
    if (!formData.campus || !CAMPUS_ROOMS[formData.campus]) return [];
    return Object.keys(CAMPUS_ROOMS[formData.campus]);
  }, [formData.campus]);

  const handleOpenReport = () => {
    setReportModal(true);
    setReportStep(1);
    setFoundAsset(null);
    setIsSearching(false);
    setAssignedFeedback(null);
    setFormData({ campus: '', floor: '', location: '', details: '', tag: '', issueCategory: '', complaintType: 'Proactive', immediateResolve: false });
  };

  const handleSelectReportCat = async (cat: FMCategory) => {
    setSelectedCat(cat);
    setReportStep(2);
    setFormData(prev => ({ ...prev, issueCategory: ISSUE_CATEGORIES[cat.id]?.[0] || ISSUE_CATEGORIES.default[0] }));
    if (cat.id === 'ac') {
      setIsFetchingAssets(true);
      try {
        const list = await fetchAssets(cat.id);
        setAssets(list || []);
      } catch (e) {
        console.error("Registry fetch failed", e);
      } finally {
        setIsFetchingAssets(false);
      }
    }
  };

  const handleTagLookup = (val: string) => {
    const searchVal = val.trim().toLowerCase();
    setFormData(prev => ({ ...prev, tag: val }));
    setFoundAsset(null);

    if (!searchVal || !assets.length) {
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const asset = assets.find(a => 
      String(a.id).toLowerCase() === searchVal || 
      String(a.tag || '').toLowerCase() === searchVal
    );
    
    setTimeout(() => {
      setFoundAsset(asset || null);
      setIsSearching(false);
    }, 900);
  };

  const handleSubmitReport = async () => {
    if (!selectedCat || !formData.details || isSearching || isSubmitting) return;
    if (selectedCat.id === 'ac' && !foundAsset) return;
    if (selectedCat.id !== 'ac' && (!formData.campus || !formData.floor || !formData.location)) return;
    
    setIsSubmitting(true);
    try {
      const getDynamicAssignee = (techPool: string[], attendanceMap: Record<string, boolean>, catName: string) => {
        const activeTechs = techPool.filter(t => attendanceMap[t]);
        if (activeTechs.length === 0) return "Unassigned";
        
        const load: Record<string, number> = {};
        activeTechs.forEach(t => load[t] = 0);
        
        (tickets || []).forEach(t => {
          if (String(t.category).toUpperCase() === catName.toUpperCase() && 
              !['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status)) {
            if (load[t.assignedTo] !== undefined) load[t.assignedTo]++;
          }
        });
        
        const minLoad = Math.min(...Object.values(load));
        const candidates = activeTechs.filter(t => load[t] === minLoad);
        return candidates[0] || activeTechs[0];
      };

      const finalTag = String(foundAsset?.tag || (selectedCat.id === 'ac' ? formData.tag : 'N/A'));
      const fd = new FormData();
      fd.append('action', 'complain');
      fd.append('category', selectedCat.id.toUpperCase());
      fd.append('complaintType', formData.complaintType);
      fd.append('issueCategory', formData.issueCategory);
      
      let finalLocation = '';
      let finalAssigned = 'Unassigned';
      let finalStatus = formData.immediateResolve ? 'Completed' : 'Open';

      if (selectedCat.id === 'ac') {
        const asset = assets.find(a => a.tag === finalTag || String(a.id) === finalTag);
        finalLocation = asset ? `${asset.campus} - ${asset.floor} - ${asset.room}` : 'Field Scan';
        finalAssigned = formData.immediateResolve ? 'Maestro Sync' : getDynamicAssignee(TECHNICIANS, acAttendance, 'AC');
      } else if (selectedCat.id === 'electrical') {
        finalLocation = `${formData.campus} - ${formData.floor} - ${formData.location}`;
        finalAssigned = getDynamicAssignee(ELECTRICAL_TECHNICIANS, elecAttendance, 'ELECTRICAL');
      } else if (selectedCat.id === 'handyman') {
        finalLocation = `${formData.campus} - ${formData.floor} - ${formData.location}`;
        finalAssigned = 'Sajid';
      } else {
        finalLocation = `${formData.campus} - ${formData.floor} - ${formData.location}`;
      }
      
      if (finalAssigned === "Unassigned" && !formData.immediateResolve) finalStatus = "Pending Assignment";
      
      fd.append('assetTag', finalTag);
      fd.append('location', finalLocation);
      fd.append('details', formData.details);
      fd.append('assignedTech', finalAssigned);
      fd.append('status', finalStatus);

      await postAction(fd);

      if (selectedCat.id === 'ac' && finalTag !== 'N/A') {
        const nextStatus = formData.immediateResolve ? 'Active' : 'Maintenance';
        await updateAssetStatus(selectedCat.id as any, finalTag, nextStatus);
      }

      setAssignedFeedback(finalAssigned);
      setTimeout(() => {
        setReportModal(false);
        setAssignedFeedback(null);
      }, 3000);
    } catch (e) {
      console.error(e);
      alert("Transmission Failure. System Lock Reset.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col overflow-hidden animate-fadeIn">
      {/* HEADER */}
      <div className="bg-white/80 backdrop-blur-xl px-4 md:px-6 py-4 md:py-6 border-b border-slate-100 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-1 md:w-1.5 h-8 md:h-10 bg-indigo-600 rounded-full"></div>
          <div>
            <p className="text-[6px] md:text-[7px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-0.5 md:mb-1 italic">Enterprise Registry</p>
            <h1 className="text-lg md:text-2xl font-black text-slate-900 tracking-tighter italic uppercase leading-none">Command Hub</h1>
          </div>
        </div>
        <div className="flex gap-2 md:gap-4">
          <button onClick={onOpenGlobal} className="hidden sm:flex bg-white border border-slate-200 text-slate-900 px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl text-[8px] md:text-[9px] font-black uppercase tracking-widest shadow-sm items-center gap-3 hover:bg-slate-50 transition-all">
            <i className="fas fa-globe-americas text-indigo-500"></i>
            <span className="italic">Global Ops</span>
          </button>
          
          <button onClick={handleOpenReport} className="bg-slate-950 text-white px-6 md:px-12 py-3 md:py-5 rounded-xl md:rounded-2xl text-[9px] md:text-[11px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] shadow-2xl flex items-center gap-3 md:gap-6 hover:scale-[1.03] active:scale-95 transition-all group overflow-hidden relative">
            <i className="fas fa-bolt text-amber-400 animate-pulse text-xs md:text-lg"></i>
            <span className="italic">Raise Issue</span>
          </button>

          <button onClick={onBack} className="w-10 h-10 md:w-16 md:h-16 bg-slate-50 rounded-xl md:rounded-2xl shadow-inner flex items-center justify-center text-slate-300 hover:text-rose-500 transition-all active:scale-90 border border-slate-100">
            <i className="fas fa-power-off text-sm md:text-xl"></i>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-12 space-y-10 md:space-y-12 hide-scroll pb-24 md:pb-20">
        <section>
          <div className="flex items-center gap-4 mb-5 md:mb-6">
            <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-slate-400 italic">Centralized Analytics</h2>
            <div className="h-px flex-1 bg-slate-100"></div>
          </div>
          <button onClick={onOpenGlobal} className="w-full bg-slate-900 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white/5 relative overflow-hidden group transition-all hover:scale-[1.01] active:scale-[0.99] text-left shadow-2xl">
             <div className="absolute top-0 right-0 w-64 md:w-80 h-64 md:h-80 bg-indigo-500/10 blur-[100px]"></div>
             <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-center gap-6 md:gap-8">
               <div className="flex gap-4 md:gap-8 items-center">
                 <div className="w-14 h-14 md:w-20 md:h-20 bg-white/10 text-indigo-400 rounded-2xl md:rounded-[2rem] flex items-center justify-center text-2xl md:text-3xl shadow-2xl backdrop-blur-md">
                   <i className="fas fa-project-diagram"></i>
                 </div>
                 <div>
                   <h2 className="text-xl md:text-4xl font-black text-white italic tracking-tighter uppercase leading-none mb-2 md:mb-3">Disrupt FM Operations</h2>
                   <p className="text-[7px] font-black text-indigo-400 uppercase tracking-[0.4em] md:tracking-[0.5em] italic">Real-Time Infrastructure Sync & Merit Data Stream</p>
                 </div>
               </div>
             </div>
          </button>
        </section>

        <section>
          <div className="flex items-center gap-4 mb-5 md:mb-6">
            <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-slate-400 italic">Hard FM Infrastructure</h2>
            <div className="h-px flex-1 bg-slate-100"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {hardFM.map(cat => <CategoryCard key={cat.id} category={cat} onClick={onSelectCategory} />)}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-4 mb-5 md:mb-6">
            <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-slate-400 italic">Soft FM Services</h2>
            <div className="h-px flex-1 bg-slate-100"></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {softFM.map(cat => <CategoryCard key={cat.id} category={cat} onClick={onSelectCategory} />)}
          </div>
        </section>
      </div>

      {/* RAISE ISSUE MODAL */}
      {reportModal && (
        <div className="fixed inset-0 bg-slate-950/98 z-[100] flex items-center justify-center p-3 md:p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-xl rounded-[2rem] md:rounded-[3.5rem] p-5 md:p-12 shadow-3xl border border-white/5 relative overflow-hidden flex flex-col max-h-[90dvh]">
             <div className="absolute top-0 right-0 w-64 md:w-80 h-64 md:h-80 bg-indigo-600/5 blur-[80px]"></div>
             
             <div className="flex justify-between items-center mb-5 md:mb-10 relative z-10 shrink-0">
               <div>
                 <h3 className="text-lg md:text-3xl font-black text-slate-900 leading-none italic uppercase tracking-tighter">Raise Issue</h3>
                 <p className="text-[7px] md:text-[9px] font-bold text-slate-400 uppercase mt-1.5 md:mt-4 tracking-widest italic">
                    {reportStep === 1 ? 'Phase 1: Classification' : `Phase 2: Registry Protocol`}
                 </p>
               </div>
               <button onClick={() => setReportModal(false)} className="w-10 h-10 md:w-16 md:h-16 bg-slate-50 rounded-xl md:rounded-2xl text-slate-300 shadow-inner flex items-center justify-center active:scale-90 transition-all border border-slate-100">
                 <i className="fas fa-times text-lg md:text-2xl"></i>
               </button>
             </div>
             
             <div className="overflow-y-auto pr-1 hide-scroll shrink min-h-0 relative z-10 space-y-4 md:space-y-6">
               {assignedFeedback ? (
                  <div className="flex flex-col items-center justify-center py-10 animate-fadeIn text-center">
                    <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-4xl mb-6 shadow-inner animate-bounce">
                      <i className="fas fa-check"></i>
                    </div>
                    <h4 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter mb-2">Protocol Verified</h4>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest italic">Assigned to: <span className="text-indigo-600">{assignedFeedback}</span></p>
                  </div>
               ) : reportStep === 1 ? (
                 <div className="grid grid-cols-1 gap-2.5 md:gap-4 animate-slideUp">
                    {hardFM.map(cat => (
                      <button key={cat.id} onClick={() => handleSelectReportCat(cat)} className="flex items-center justify-between p-5 md:p-8 bg-slate-50 border border-slate-100 rounded-2xl md:rounded-[2rem] hover:bg-white hover:border-indigo-600 hover:shadow-xl transition-all group">
                        <div className="flex items-center gap-4 md:gap-6">
                          <div className={`w-10 h-10 md:w-16 md:h-16 bg-${cat.color}-50 text-${cat.color}-600 rounded-xl md:rounded-[1.5rem] flex items-center justify-center text-lg md:text-2xl shadow-inner group-hover:bg-slate-900 group-hover:text-white transition-all`}>
                            <i className={`fas fa-${cat.icon}`}></i>
                          </div>
                          <div className="text-left">
                            <span className="text-sm md:text-lg font-black uppercase italic tracking-tighter text-slate-900 block">{cat.name}</span>
                            <span className="text-[6px] md:text-[8px] font-bold text-slate-300 uppercase tracking-widest block mt-1">Registry Access</span>
                          </div>
                        </div>
                        <i className="fas fa-chevron-right text-[10px] md:text-xs text-slate-200 group-hover:text-slate-950 group-hover:translate-x-1 transition-all"></i>
                      </button>
                    ))}
                 </div>
               ) : (
                 <div className="space-y-4 md:space-y-6 animate-slideUp pb-4">
                    <div className="bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border-2 border-slate-100 flex items-center justify-between shadow-inner">
                       <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest italic ml-1">Type</label>
                       <div className="flex bg-white p-1 rounded-lg md:rounded-xl shadow-sm border border-slate-100 gap-1">
                          {['Proactive', 'Reactive'].map(type => (
                            <button key={type} onClick={() => setFormData({...formData, complaintType: type as any})} className={`px-3 md:px-6 py-1 md:py-2 rounded-md md:rounded-lg text-[7px] md:text-[8px] font-black uppercase tracking-widest transition-all ${formData.complaintType === type ? 'bg-slate-900 text-white shadow-md' : 'text-slate-300 hover:text-slate-50'}`}>{type}</button>
                          ))}
                       </div>
                    </div>

                    <div className="bg-slate-50 p-4 md:p-5 rounded-xl md:rounded-2xl border-2 border-slate-100 shadow-inner">
                        <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-2 md:mb-3 ml-1 italic">Issue Classification</label>
                        <select 
                          value={formData.issueCategory} 
                          onChange={e => setFormData({...formData, issueCategory: e.target.value})} 
                          className="w-full bg-transparent font-black text-[10px] md:text-[12px] outline-none italic uppercase text-slate-950"
                        >
                          {(ISSUE_CATEGORIES[selectedCat?.id || ''] || ISSUE_CATEGORIES.default).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                    </div>

                    {selectedCat?.id === 'ac' ? (
                      <div className="bg-slate-50 p-4 md:p-6 rounded-2xl md:rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all shadow-inner">
                          <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-2 md:mb-3 ml-1 italic tracking-widest">Asset Recognition (Enter ID / Tag)</label>
                          <div className="relative">
                            <input 
                              type="text" 
                              autoFocus 
                              value={formData.tag} 
                              onChange={(e) => handleTagLookup(e.target.value)} 
                              className="w-full bg-transparent font-black text-lg md:text-2xl outline-none italic uppercase placeholder:text-slate-200 tracking-tighter text-slate-900" 
                              placeholder="TAG / ID..." 
                            />
                            {isSearching && (
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    <i className="fas fa-circle-notch animate-spin text-indigo-400 text-sm"></i>
                                </div>
                            )}
                          </div>

                          {isSearching && !foundAsset && (
                            <div className="mt-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 animate-pulse flex items-center gap-4">
                               <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-400 shadow-sm">
                                  <i className="fas fa-satellite-dish animate-bounce"></i>
                               </div>
                               <div>
                                  <p className="text-[10px] font-black text-indigo-900 uppercase italic leading-none">Please Wait</p>
                                  <p className="text-[7px] font-bold text-indigo-400 uppercase mt-1 italic tracking-widest">Syncing Enterprise Registry Details...</p>
                               </div>
                            </div>
                          )}

                          {foundAsset && (
                            <div className="mt-4 p-4 md:p-6 bg-white rounded-2xl border border-indigo-100 flex justify-between items-center animate-slideDown shadow-xl group">
                               <div className="flex-1">
                                 <div className="flex items-center gap-2 mb-2">
                                   <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]"></div>
                                   <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest italic">Registry Verified</p>
                                 </div>
                                 <h4 className="font-black text-slate-950 text-base md:text-lg italic leading-tight uppercase mb-3">"{foundAsset.room}"</h4>
                                 <div className="flex flex-wrap gap-3">
                                    <div className="bg-slate-950 text-white text-[10px] font-black px-4 py-1 rounded-xl italic uppercase shadow-lg">Tag: {foundAsset.tag}</div>
                                    <div className="bg-slate-100 text-slate-500 text-[10px] font-black px-3 py-1 rounded-xl italic uppercase">ID: {foundAsset.id}</div>
                                 </div>
                               </div>
                               <div className="text-right pl-6 border-l border-slate-50">
                                  <p className="text-[10px] font-black text-slate-950 italic uppercase mb-1">{foundAsset.floor}</p>
                                  <p className="text-[8px] font-black text-slate-400 uppercase italic tracking-widest">{foundAsset.campus}</p>
                                  <div className={`mt-4 inline-block px-3 py-1 rounded-lg text-[8px] font-black uppercase ${foundAsset.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                    {foundAsset.status}
                                  </div>
                               </div>
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                          <div className="bg-slate-50 p-4 md:p-5 rounded-xl md:rounded-2xl border-2 border-slate-100 shadow-inner">
                              <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-2 md:mb-3 ml-1 italic">Step 1: Campus / Hub</label>
                              <div className="flex flex-wrap gap-2 md:gap-3">
                                 {campuses.map(c => (
                                   <button key={c} onClick={() => setFormData({...formData, campus: c, floor: ''})} className={`px-4 md:px-6 py-1.5 md:py-2.5 rounded-lg md:rounded-2xl text-[7px] md:text-[9px] font-black uppercase italic transition-all ${formData.campus === c ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}>{c}</button>
                                 ))}
                              </div>
                          </div>
                          
                          <div className={`bg-slate-50 p-4 md:p-5 rounded-xl md:rounded-2xl border-2 border-slate-100 shadow-inner transition-opacity ${!formData.campus ? 'opacity-30' : ''}`}>
                              <label className="block text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-1.5 md:mb-2 ml-1 italic">Step 2: Floor Selection</label>
                              <select disabled={!formData.campus} value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value})} className="w-full bg-transparent font-black text-[9px] md:text-[11px] outline-none italic uppercase text-slate-950">
                                  <option value="">-- SELECT FLOOR --</option>
                                  {floors.map(f => <option key={f} value={f}>{f}</option>)}
                              </select>
                          </div>

                          <div className={`bg-slate-50 p-4 md:p-5 rounded-xl md:rounded-2xl border-2 border-slate-100 shadow-inner transition-opacity ${!formData.floor ? 'opacity-30' : ''}`}>
                              <label className="block text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-1.5 md:mb-2 ml-1 italic">Step 3: Area Specification (Manual Entry)</label>
                              <input 
                                disabled={!formData.floor}
                                type="text"
                                placeholder="TYPE PRECISE LOCATION..."
                                value={formData.location}
                                onChange={e => setFormData({...formData, location: e.target.value})}
                                className="w-full bg-transparent font-black text-[9px] md:text-[11px] outline-none italic uppercase text-slate-950 placeholder:text-slate-200"
                              />
                          </div>
                      </div>
                    )}

                    <div className="bg-slate-50 p-4 md:p-8 rounded-2xl md:rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 shadow-inner transition-all">
                       <label className="block text-[8px] md:text-[10px] font-black text-slate-400 uppercase mb-2 md:mb-4 tracking-widest italic ml-1">Step 4: Findings Brief</label>
                       <textarea value={formData.details} onChange={(e) => setFormData({ ...formData, details: e.target.value })} rows={3} className="w-full bg-transparent font-bold text-xs md:text-base text-slate-900 outline-none italic uppercase resize-none placeholder:text-slate-200 leading-relaxed" placeholder="Describe the findings..." />
                    </div>

                    <button onClick={() => setFormData({...formData, immediateResolve: !formData.immediateResolve})} className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between group ${formData.immediateResolve ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                       <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-inner ${formData.immediateResolve ? 'bg-white/20' : 'bg-white'}`}><i className={`fas fa-check-double text-sm ${formData.immediateResolve ? 'text-white' : 'text-slate-200'}`}></i></div>
                          <div className="text-left">
                             <p className="text-[10px] font-black uppercase tracking-widest italic leading-none">Execute Immediate Sync</p>
                             <p className={`text-[7px] font-bold uppercase mt-1 italic ${formData.immediateResolve ? 'text-white/40' : 'text-slate-300'}`}>Bypass technician queue and mark resolved</p>
                          </div>
                       </div>
                       <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formData.immediateResolve ? 'border-white bg-white' : 'border-slate-200'}`}>{formData.immediateResolve && <i className="fas fa-check text-[10px] text-emerald-600"></i>}</div>
                    </button>
                 </div>
               )}
             </div>

             <div className="pt-4 md:pt-8 border-t border-slate-100 bg-white shrink-0 relative z-10">
                {assignedFeedback ? (
                   <p className="text-center text-[10px] font-black text-slate-400 uppercase italic">Hub Sync Completed Successfully</p>
                ) : reportStep === 1 ? (
                  <p className="text-[7px] md:text-[8px] text-center font-bold text-slate-300 uppercase tracking-widest italic mb-2">Select sector category to proceed</p>
                ) : (
                  <div className="flex gap-2 md:gap-4">
                    <button onClick={() => setReportStep(1)} className="flex-1 py-3 md:py-6 rounded-xl md:rounded-2xl font-black uppercase text-[8px] md:text-[11px] tracking-widest text-slate-400 italic hover:bg-slate-50 transition-all">Go Back</button>
                    <button 
                       onClick={handleSubmitReport} 
                       disabled={isSubmitting || isSearching || !formData.details.trim() || (selectedCat?.id === 'ac' && !foundAsset) || (selectedCat?.id !== 'ac' && (!formData.campus || !formData.floor || !formData.location)) || !!assignedFeedback} 
                       className={`flex-[2.5] py-4 md:py-6 rounded-xl md:rounded-[2rem] font-black uppercase text-[9px] md:text-[12px] tracking-[0.2em] md:tracking-[0.4em] shadow-2xl active:scale-95 transition-all disabled:opacity-30 italic flex items-center justify-center gap-3 md:gap-5 ${formData.immediateResolve ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-white'}`}
                    >
                      {isSearching ? <i className="fas fa-satellite-dish animate-pulse"></i> : isSubmitting ? <i className="fas fa-circle-notch animate-spin"></i> : <i className={`fas fa-${formData.immediateResolve ? 'shield-check' : 'paper-plane'} ${formData.immediateResolve ? 'text-white' : 'text-indigo-400'}`}></i>}
                      <span>{isSearching ? 'Registry Scan Active...' : isSubmitting ? 'Transmitting...' : formData.immediateResolve ? 'Finalize Protocol' : 'Dispatch Protocol'}</span>
                    </button>
                  </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CategoryCard: React.FC<{ category: FMCategory, onClick: (cat: FMCategory) => void }> = ({ category, onClick }) => (
  <button onClick={() => onClick(category)} className="bg-white p-6 md:p-10 rounded-2xl md:rounded-[3rem] border border-slate-100 group text-left relative overflow-hidden transition-all hover:scale-105 active:scale-[0.98] shadow-sm hover:shadow-xl">
    <div className={`absolute top-0 right-0 w-32 md:w-48 h-32 md:h-48 bg-${category?.color}-500/5 blur-[50px] group-hover:bg-${category?.color}-500/10 transition-all duration-700`}></div>
    <div className={`w-10 h-10 md:w-16 md:h-16 bg-${category?.color}-50 text-${category?.color}-600 rounded-xl md:rounded-[1.5rem] flex items-center justify-center text-xl md:text-3xl shadow-inner group-hover:bg-slate-900 group-hover:text-white transition-all duration-500 mb-6 md:mb-10`}>
      <i className={`fas fa-${category?.icon}`}></i>
    </div>
    <div>
      <h3 className="text-sm md:text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none italic">{category?.name}</h3>
      <p className="text-[7px] md:text-[9px] text-slate-300 font-black uppercase tracking-widest md:tracking-[0.6em] mt-2 md:mt-4 italic">{category?.group}</p>
    </div>
    <div className="mt-8 md:mt-12 flex items-center justify-between border-t border-slate-50 pt-4 md:pt-6 opacity-40 group-hover:opacity-100 transition-opacity">
       <span className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest italic">Synchronize</span>
       <i className="fas fa-arrow-right text-[10px] md:text-xs text-slate-200 group-hover:text-slate-950 group-hover:translate-x-1 md:group-hover:translate-x-2 transition-all"></i>
    </div>
  </button>
);

export default CategoryHubView;
