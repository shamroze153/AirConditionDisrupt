
import React, { useState, useMemo, useEffect } from 'react';
import { FM_CATEGORIES, CAMPUS_ROOMS, TECHNICIANS, ELECTRICAL_TECHNICIANS } from '../constants';
import { FMCategory, Ticket, Asset } from '../types';
import { postAction, fetchAssets } from '../services/api.ts';

interface Props {
  onBack: () => void;
  onSelectCategory: (category: FMCategory) => void;
  onOpenGlobal: () => void;
  tickets: Ticket[];
  acAttendance: Record<string, boolean>;
  elecAttendance: Record<string, boolean>;
}

const CategoryHubView: React.FC<Props> = ({ onBack, onSelectCategory, onOpenGlobal, tickets, acAttendance, elecAttendance }) => {
  const [reportModal, setReportModal] = useState(false);
  const [reportStep, setReportStep] = useState(1); // 1: Category, 2: Details
  const [selectedCat, setSelectedCat] = useState<FMCategory | null>(null);
  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  
  // Metadata for AC lookup
  const [assets, setAssets] = useState<Asset[]>([]);
  
  // Form State
  const [formData, setFormData] = useState({
    campus: '',
    floor: '',
    location: '',
    details: '',
    tag: '',
    complaintType: 'Proactive' as 'Proactive' | 'Reactive'
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [foundAsset, setFoundAsset] = useState<Asset | null>(null);

  const hardFM = FM_CATEGORIES.filter(c => c.group === 'Hard FM');
  const softFM = FM_CATEGORIES.filter(c => c.group === 'Soft FM');

  // Logic for cascading selects in Electrical/GM (Location-based)
  const campuses = Object.keys(CAMPUS_ROOMS);
  
  const floors = useMemo(() => {
    if (!formData.campus) return [];
    return Object.keys(CAMPUS_ROOMS[formData.campus] || {});
  }, [formData.campus]);

  const locations = useMemo(() => {
    if (!formData.campus || !formData.floor) return [];
    return CAMPUS_ROOMS[formData.campus][formData.floor] || [];
  }, [formData.campus, formData.floor]);

  const handleOpenReport = () => {
    setReportModal(true);
    setReportStep(1);
    setFoundAsset(null);
    setFormData({ campus: '', floor: '', location: '', details: '', tag: '', complaintType: 'Proactive' });
  };

  const handleSelectReportCat = async (cat: FMCategory) => {
    setSelectedCat(cat);
    setReportStep(2);
    if (cat.id === 'ac') {
      setIsFetchingAssets(true);
      try {
        const list = await fetchAssets(cat.id);
        setAssets(list);
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
    
    if (!searchVal || assets.length === 0) {
      setFoundAsset(null);
      return;
    }

    const asset = assets.find(a => 
      String(a.id).toLowerCase() === searchVal || 
      String(a.tag || '').toLowerCase() === searchVal ||
      String(a.tag || '').toLowerCase().includes(searchVal)
    );
    
    setFoundAsset(asset || null);
  };

  const handleSubmitReport = async () => {
    if (!selectedCat || !formData.details) return;
    
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('action', 'complain');
      fd.append('category', selectedCat.id.toUpperCase());
      fd.append('complaintType', formData.complaintType);
      
      let finalLocation = '';
      let finalAssetTag = 'N/A';
      let finalAssigned = 'Unassigned';
      let finalStatus = 'Open';

      if (selectedCat.id === 'ac') {
        finalAssetTag = foundAsset?.tag || formData.tag;
        finalLocation = foundAsset ? `${foundAsset.campus} - ${foundAsset.floor} - ${foundAsset.room}` : 'AC Direct Entry';
        
        // AUTO-ASSIGN LOGIC BASED ON ASSET ID (Sectors)
        const idNum = Number(foundAsset?.id || 0);
        if (idNum >= 1 && idNum <= 40) finalAssigned = 'Bilal';
        else if (idNum >= 41 && idNum <= 82) finalAssigned = 'Asad';
        else if (idNum >= 83 && idNum <= 121) finalAssigned = 'Taimoor';
        else if (idNum >= 122 && idNum <= 161) finalAssigned = 'Saboor';
      } else if (selectedCat.id === 'electrical') {
        finalLocation = `${formData.campus} - ${formData.floor} - ${formData.location}`;
        
        // ISSUE 1: ELECTRICAL ROUND-ROBIN (Ibraheem → Naveed Ali → Haris → Owais)
        const activeElectricians = ELECTRICAL_TECHNICIANS.filter(t => elecAttendance[t]);
        if (activeElectricians.length === 0) {
          finalAssigned = "Unassigned";
          finalStatus = "Pending Assignment – All Absent";
        } else {
          // Calculate rotation based on total Electrical tickets
          const elecTicketCount = tickets.filter(t => String(t.category).toUpperCase() === 'ELECTRICAL').length;
          finalAssigned = activeElectricians[elecTicketCount % activeElectricians.length];
        }
      } else if (selectedCat.id === 'handyman') {
        finalLocation = `${formData.campus} - ${formData.floor} - ${formData.location}`;
        finalAssigned = 'Sajid'; // Always Sajid for GM
      } else {
        finalLocation = `${formData.campus} - ${formData.floor} - ${formData.location}`;
      }
      
      fd.append('assetTag', finalAssetTag);
      fd.append('location', finalLocation);
      fd.append('details', formData.details);
      fd.append('assignedTech', finalAssigned);
      fd.append('status', finalStatus);

      await postAction(fd);
      setReportModal(false);
      alert(`Failure Protocol Initialized: ${selectedCat.name} Incident Logged (${formData.complaintType}). Assigned to: ${finalAssigned}`);
    } catch (e) {
      console.error(e);
      alert("Transmission Failure. Incident not logged.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = () => {
    if (!formData.details || formData.details.trim().length < 3) return false;
    if (selectedCat?.id === 'ac') {
      return formData.tag.trim().length >= 2;
    } else {
      return formData.campus && formData.floor && formData.location;
    }
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col overflow-hidden animate-fadeIn">
      {/* HEADER */}
      <div className="bg-white/80 backdrop-blur-xl px-6 py-6 border-b border-slate-100 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-10 bg-indigo-600 rounded-full"></div>
          <div>
            <p className="text-[7px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-1 italic">Enterprise Registry</p>
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter italic uppercase leading-none">Command Hub</h1>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={onOpenGlobal} className="bg-white border border-slate-200 text-slate-900 px-6 py-4 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-sm flex items-center gap-3 hover:bg-slate-50 transition-all">
            <i className="fas fa-globe-americas text-indigo-500"></i>
            <span className="italic">Global Ops</span>
          </button>
          
          <button 
            onClick={handleOpenReport} 
            className="bg-slate-950 text-white px-12 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.4em] shadow-2xl flex items-center gap-6 hover:scale-[1.03] active:scale-95 transition-all group overflow-hidden relative"
          >
            <div className="absolute inset-0 bg-indigo-600 opacity-0 group-hover:opacity-10 transition-opacity"></div>
            <i className="fas fa-exclamation-triangle text-amber-400 animate-pulse text-lg"></i>
            <span className="italic">Log Failure Protocol</span>
            <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center group-hover:rotate-90 transition-transform">
               <i className="fas fa-plus text-[10px]"></i>
            </div>
          </button>

          <button onClick={onBack} className="w-16 h-16 bg-slate-50 rounded-2xl shadow-inner flex items-center justify-center text-slate-300 hover:text-rose-500 transition-all active:scale-90 border border-slate-100">
            <i className="fas fa-power-off text-xl"></i>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 lg:p-12 space-y-12 hide-scroll pb-20">
        <section>
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 italic">Centralized Analytics</h2>
            <div className="h-px flex-1 bg-slate-100"></div>
          </div>
          <button onClick={onOpenGlobal} className="w-full bg-slate-900 p-10 rounded-[3rem] border border-white/5 relative overflow-hidden group transition-all hover:scale-[1.01] active:scale-[0.99] text-left shadow-2xl">
             <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 blur-[100px]"></div>
             <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-center gap-8">
               <div className="flex gap-8 items-center">
                 <div className="w-20 h-20 bg-white/10 text-indigo-400 rounded-[2rem] flex items-center justify-center text-3xl shadow-2xl backdrop-blur-md">
                   <i className="fas fa-project-diagram"></i>
                 </div>
                 <div>
                   <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none mb-3">Disrupt FM Operations Hub</h2>
                   <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.5em] italic">Real-Time Infrastructure Visualization & Merit Stream</p>
                 </div>
               </div>
               <div className="bg-white/5 border border-white/10 px-8 py-5 rounded-[1.5rem] backdrop-blur-md flex flex-col items-center">
                 <span className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1 italic">Active Uptime</span>
                 <span className="text-3xl font-black text-white italic tracking-tighter">99.9%</span>
               </div>
             </div>
          </button>
        </section>

        <section>
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 italic">Hard FM Infrastructure</h2>
            <div className="h-px flex-1 bg-slate-100"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {hardFM.map(cat => <CategoryCard key={cat.id} category={cat} onClick={onSelectCategory} />)}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 italic">Soft FM Services</h2>
            <div className="h-px flex-1 bg-slate-100"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {softFM.map(cat => <CategoryCard key={cat.id} category={cat} onClick={onSelectCategory} />)}
          </div>
        </section>
      </div>

      {/* SMART COMPLAINT PROTOCOL MODAL */}
      {reportModal && (
        <div className="fixed inset-0 bg-slate-950/98 z-[100] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] p-12 shadow-3xl border border-white/5 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/5 blur-[80px]"></div>
             
             <div className="flex justify-between items-center mb-10 relative z-10">
               <div>
                 <h3 className="text-3xl font-black text-slate-900 leading-none italic uppercase tracking-tighter">Failure Protocol</h3>
                 <p className="text-[9px] font-bold text-slate-400 uppercase mt-4 tracking-[0.3em] italic">
                    {reportStep === 1 ? 'Phase 1: Identify Asset Category' : `Phase 2: ${selectedCat?.name} Protocol`}
                 </p>
               </div>
               <button onClick={() => setReportModal(false)} className="w-16 h-16 bg-slate-50 rounded-2xl text-slate-300 shadow-inner flex items-center justify-center active:scale-90 transition-all hover:text-rose-500">
                 <i className="fas fa-times text-2xl"></i>
               </button>
             </div>
             
             {reportStep === 1 ? (
               <div className="grid grid-cols-1 gap-4 animate-slideUp relative z-10">
                  {hardFM.map(cat => (
                    <button key={cat.id} onClick={() => handleSelectReportCat(cat)} className="flex items-center justify-between p-8 bg-slate-50 border border-slate-100 rounded-[2rem] hover:bg-white hover:border-indigo-600 hover:shadow-xl transition-all group">
                      <div className="flex items-center gap-6">
                        <div className={`w-16 h-16 bg-${cat.color}-50 text-${cat.color}-600 rounded-2xl flex items-center justify-center text-2xl shadow-inner group-hover:bg-${cat.color}-600 group-hover:text-white transition-all`}>
                          <i className={`fas fa-${cat.icon}`}></i>
                        </div>
                        <div className="text-left">
                          <span className="text-lg font-black uppercase italic tracking-tighter text-slate-900 block">{cat.name}</span>
                          <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest block mt-2">Log Failure Protocol</span>
                        </div>
                      </div>
                      <i className="fas fa-arrow-right text-xs text-slate-200 group-hover:text-slate-950 group-hover:translate-x-1 transition-all"></i>
                    </button>
                  ))}
               </div>
             ) : (
               <div className="space-y-6 animate-slideUp relative z-10">
                  {/* Complaint Type Switcher */}
                  <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 flex items-center justify-between">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic ml-1">Protocol Type</label>
                     <div className="flex bg-white p-1 rounded-xl shadow-inner gap-1">
                        {['Proactive', 'Reactive'].map(type => (
                          <button 
                            key={type}
                            onClick={() => setFormData({...formData, complaintType: type as any})}
                            className={`px-6 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${formData.complaintType === type ? 'bg-slate-900 text-white shadow-md' : 'text-slate-300 hover:text-slate-500'}`}
                          >
                            {type}
                          </button>
                        ))}
                     </div>
                  </div>

                  {selectedCat?.id === 'ac' ? (
                    <div className="space-y-6">
                      <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all shadow-inner">
                         <div className="flex justify-between items-center mb-4">
                           <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] italic ml-1">Asset ID Verification</label>
                           {isFetchingAssets && <i className="fas fa-circle-notch animate-spin text-indigo-500 text-[10px]"></i>}
                         </div>
                         <input 
                           type="text" 
                           autoFocus 
                           value={formData.tag} 
                           onChange={(e) => handleTagLookup(e.target.value)} 
                           className="w-full bg-transparent font-black text-2xl outline-none italic uppercase placeholder:text-slate-200 tracking-tighter" 
                           placeholder="Enter AC Tag / ID..." 
                         />
                      </div>
                      {foundAsset && (
                        <div className="bg-indigo-50/50 p-8 rounded-[2rem] border border-indigo-100 grid grid-cols-2 gap-6 animate-slideDown shadow-sm">
                           <div>
                             <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest italic mb-2">Registry Detection</p>
                             <h4 className="font-extrabold text-indigo-900 text-base italic leading-tight">"{foundAsset.room}"</h4>
                             <p className="text-[10px] font-black text-slate-400 mt-2">TAG: {foundAsset.tag}</p>
                           </div>
                           <div className="text-right flex flex-col justify-between">
                              <div>
                                <p className="text-[9px] font-bold text-slate-500 uppercase italic leading-none">{foundAsset.campus}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase italic mt-1">{foundAsset.floor}</p>
                              </div>
                              <div className="bg-white/50 px-3 py-1.5 rounded-xl border border-indigo-100 inline-block mt-4">
                                <p className="text-[7px] font-black text-indigo-500 uppercase leading-none mb-1">Infrastructure Profile</p>
                                <p className="text-[9px] font-black text-slate-900 italic leading-none uppercase">{foundAsset.brand} | {foundAsset.cap}T</p>
                              </div>
                           </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-5">
                        <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 transition-all">
                            <label className="block text-[9px] font-black text-slate-400 uppercase mb-4 ml-1 tracking-widest italic">1. Select Campus</label>
                            <div className="flex flex-wrap gap-3">
                               {campuses.map(c => (
                                 <button 
                                   key={c} 
                                   onClick={() => setFormData({...formData, campus: c, floor: '', location: ''})}
                                   className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase italic transition-all ${formData.campus === c ? 'bg-slate-950 text-white shadow-xl scale-105' : 'bg-white text-slate-400 border border-slate-100 hover:bg-slate-50'}`}
                                 >
                                   {c}
                                 </button>
                               ))}
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className={`bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all ${!formData.campus ? 'opacity-30 pointer-events-none' : ''}`}>
                              <label className="block text-[9px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest italic">2. Select Floor</label>
                              <select value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value, location: ''})} className="w-full bg-transparent font-black text-[11px] outline-none italic uppercase cursor-pointer">
                                  <option value="">--- FLOOR ---</option>
                                  {floors.map(f => <option key={f} value={f}>{f}</option>)}
                              </select>
                          </div>

                          <div className={`bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 transition-all ${!formData.floor ? 'opacity-30 pointer-events-none' : ''}`}>
                              <label className="block text-[9px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest italic">3. Select Room</label>
                              <select value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full bg-transparent font-black text-[11px] outline-none italic uppercase cursor-pointer">
                                  <option value="">--- AREA ---</option>
                                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                              </select>
                          </div>
                        </div>
                    </div>
                  )}

                  <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all shadow-inner">
                     <label className="block text-[10px] font-black text-slate-400 uppercase mb-4 tracking-[0.3em] italic ml-1">Incident Narrative</label>
                     <textarea value={formData.details} onChange={(e) => setFormData({ ...formData, details: e.target.value })} rows={3} className="w-full bg-transparent font-bold text-base outline-none italic uppercase resize-none placeholder:text-slate-200 leading-relaxed" placeholder="Describe the system failure precisely..." />
                  </div>

                  <div className="flex gap-4 pt-6">
                    <button onClick={() => setReportStep(1)} className="flex-1 py-6 rounded-2xl font-black uppercase text-[11px] tracking-widest text-slate-400 italic hover:bg-slate-50 transition-all">Go Back</button>
                    <button onClick={handleSubmitReport} disabled={isSubmitting || !isFormValid()} className="flex-[2] bg-slate-950 text-white py-6 rounded-[1.5rem] font-black uppercase text-[12px] tracking-[0.5em] shadow-2xl active:scale-95 transition-all disabled:opacity-30 italic flex items-center justify-center gap-5">
                      {isSubmitting ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-paper-plane text-teal-400"></i>}
                      <span>Transmit Protocol</span>
                    </button>
                  </div>
               </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
};

const CategoryCard: React.FC<{ category: FMCategory, onClick: (cat: FMCategory) => void }> = ({ category, onClick }) => (
  <button onClick={() => onClick(category)} className="bg-white p-10 rounded-[3rem] premium-card border border-slate-100 group text-left relative overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-md">
    <div className={`absolute top-0 right-0 w-48 h-48 bg-${category.color}-500/5 blur-[50px] group-hover:bg-${category.color}-500/10 transition-all duration-700`}></div>
    <div className={`w-16 h-16 bg-${category.color}-50 text-${category.color}-600 rounded-[1.5rem] flex items-center justify-center text-3xl shadow-inner group-hover:bg-${category.color}-600 group-hover:text-white transition-all duration-500 mb-10`}>
      <i className={`fas fa-${category.icon}`}></i>
    </div>
    <div>
      <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none italic group-hover:text-slate-950">{category.name}</h3>
      <p className="text-[9px] text-slate-300 font-black uppercase tracking-[0.6em] mt-4 italic">{category.group}</p>
    </div>
    <div className="mt-12 flex items-center justify-between border-t border-slate-50 pt-6 opacity-40 group-hover:opacity-100 transition-opacity">
       <div className="flex gap-4 items-center">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]"></div>
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">Hub Synchronizer</span>
       </div>
       <i className="fas fa-arrow-right text-xs text-slate-200 group-hover:text-slate-950 group-hover:translate-x-2 transition-all"></i>
    </div>
  </button>
);

export default CategoryHubView;
