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
        
        const idNum = Number(foundAsset?.id || 0);
        if (idNum >= 1 && idNum <= 40) finalAssigned = 'Bilal';
        else if (idNum >= 41 && idNum <= 82) finalAssigned = 'Asad';
        else if (idNum >= 83 && idNum <= 121) finalAssigned = 'Taimoor';
        else if (idNum >= 122 && idNum <= 161) finalAssigned = 'Saboor';
      } else if (selectedCat.id === 'electrical') {
        finalLocation = `${formData.campus} - ${formData.floor} - ${formData.location}`;
        
        const activeElectricians = ELECTRICAL_TECHNICIANS.filter(t => elecAttendance[t]);
        if (activeElectricians.length === 0) {
          finalAssigned = "Unassigned";
          finalStatus = "Pending Assignment – All Absent";
        } else {
          const elecTicketCount = tickets.filter(t => String(t.category).toUpperCase() === 'ELECTRICAL').length;
          finalAssigned = activeElectricians[elecTicketCount % activeElectricians.length];
        }
      } else if (selectedCat.id === 'handyman') {
        finalLocation = `${formData.campus} - ${formData.floor} - ${formData.location}`;
        finalAssigned = 'Sajid';
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
      alert(`Issue Raised: Assigned to ${finalAssigned}`);
    } catch (e) {
      console.error(e);
      alert("Transmission Failure.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = () => {
    const detailValid = formData.details.trim().length > 0;
    if (!detailValid) return false;

    if (selectedCat?.id === 'ac') {
      return formData.tag.trim().length > 0;
    } else {
      return !!(formData.campus && formData.floor && formData.location);
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
          
          <button 
            onClick={handleOpenReport} 
            className="bg-slate-950 text-white px-6 md:px-12 py-3 md:py-5 rounded-xl md:rounded-2xl text-[9px] md:text-[11px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] shadow-2xl flex items-center gap-3 md:gap-6 hover:scale-[1.03] active:scale-95 transition-all group overflow-hidden relative"
          >
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
                   <p className="text-[7px] md:text-[9px] font-black text-indigo-400 uppercase tracking-[0.4em] md:tracking-[0.5em] italic">Real-Time Infrastructure Sync & Merit Data Stream</p>
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

      {/* RAISE ISSUE MODAL - Optimized for Mobile Scrolling */}
      {reportModal && (
        <div className="fixed inset-0 bg-slate-950/98 z-[100] flex items-center justify-center p-3 md:p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-xl rounded-[2rem] md:rounded-[3.5rem] p-5 md:p-12 shadow-3xl border border-white/5 relative overflow-hidden flex flex-col max-h-[85dvh] md:max-h-[90dvh]">
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
             
             {/* Modal body with auto-scroll and responsive font sizing */}
             <div className="overflow-y-auto pr-1 hide-scroll shrink min-h-0 relative z-10 space-y-4 md:space-y-6">
               {reportStep === 1 ? (
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
                            <button 
                              key={type}
                              onClick={() => setFormData({...formData, complaintType: type as any})}
                              className={`px-3 md:px-6 py-1 md:py-2 rounded-md md:rounded-lg text-[7px] md:text-[8px] font-black uppercase tracking-widest transition-all ${formData.complaintType === type ? 'bg-slate-900 text-white shadow-md' : 'text-slate-300 hover:text-slate-500'}`}
                            >
                              {type}
                            </button>
                          ))}
                       </div>
                    </div>

                    {selectedCat?.id === 'ac' ? (
                      <div className="bg-slate-50 p-4 md:p-6 rounded-2xl md:rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all shadow-inner">
                          <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-2 md:mb-3 ml-1 italic tracking-widest">Asset Identification</label>
                          <input 
                            type="text" 
                            autoFocus 
                            value={formData.tag} 
                            onChange={(e) => handleTagLookup(e.target.value)} 
                            className="w-full bg-transparent font-black text-lg md:text-2xl outline-none italic uppercase placeholder:text-slate-200 tracking-tighter text-slate-900" 
                            placeholder="TAG / ID..." 
                          />
                          {foundAsset && (
                            <div className="mt-3 md:mt-4 p-4 md:p-5 bg-white rounded-xl md:rounded-2xl border border-indigo-100 flex justify-between items-center animate-slideDown shadow-sm">
                               <div>
                                 <p className="text-[7px] md:text-[8px] font-black text-indigo-400 uppercase italic">Registry Match</p>
                                 <h4 className="font-black text-slate-950 text-[10px] md:text-[13px] italic mt-1 leading-none uppercase">"{foundAsset.room}"</h4>
                               </div>
                               <div className="text-right text-[7px] md:text-[8px] font-bold text-slate-300 uppercase italic">{foundAsset.campus} | {foundAsset.floor}</div>
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="space-y-3 md:space-y-4">
                          <div className="bg-slate-50 p-3 md:p-5 rounded-xl md:rounded-2xl border-2 border-slate-100 shadow-inner">
                              <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-2 md:mb-3 ml-1 italic">1. Location Hub</label>
                              <div className="flex flex-wrap gap-1.5 md:gap-3">
                                 {campuses.map(c => (
                                   <button 
                                     key={c} 
                                     onClick={() => setFormData({...formData, campus: c, floor: '', location: ''})}
                                     className={`px-3 md:px-6 py-1.5 md:py-2.5 rounded-lg md:rounded-2xl text-[7px] md:text-[9px] font-black uppercase italic transition-all ${formData.campus === c ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'}`}
                                   >
                                     {c}
                                   </button>
                                 ))}
                              </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 md:gap-4">
                            <div className={`bg-slate-50 p-3 md:p-5 rounded-xl md:rounded-2xl border-2 border-slate-100 shadow-inner transition-opacity ${!formData.campus ? 'opacity-30' : ''}`}>
                                <label className="block text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-1.5 md:mb-2 ml-1 italic">2. Floor</label>
                                <select value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value, location: ''})} className="w-full bg-transparent font-black text-[9px] md:text-[11px] outline-none italic uppercase text-slate-900">
                                    <option value="">-- FL --</option>
                                    {floors.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>

                            <div className={`bg-slate-50 p-3 md:p-5 rounded-xl md:rounded-2xl border-2 border-slate-100 shadow-inner transition-opacity ${!formData.floor ? 'opacity-30' : ''}`}>
                                <label className="block text-[7px] md:text-[8px] font-black text-slate-400 uppercase mb-1.5 md:mb-2 ml-1 italic">3. Area</label>
                                <select value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full bg-transparent font-black text-[9px] md:text-[11px] outline-none italic uppercase text-slate-900">
                                    <option value="">-- AREA --</option>
                                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                          </div>
                      </div>
                    )}

                    <div className="bg-slate-50 p-4 md:p-8 rounded-2xl md:rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 shadow-inner transition-all">
                       <label className="block text-[8px] md:text-[10px] font-black text-slate-400 uppercase mb-2 md:mb-4 tracking-widest italic ml-1">Incident Brief</label>
                       <textarea value={formData.details} onChange={(e) => setFormData({ ...formData, details: e.target.value })} rows={3} className="w-full bg-transparent font-bold text-xs md:text-base text-slate-900 outline-none italic uppercase resize-none placeholder:text-slate-200 leading-relaxed" placeholder="Describe findings..." />
                    </div>
                 </div>
               )}
             </div>

             <div className="pt-4 md:pt-8 border-t border-slate-100 bg-white shrink-0 relative z-10">
                {reportStep === 1 ? (
                  <p className="text-[7px] md:text-[8px] text-center font-bold text-slate-300 uppercase tracking-widest italic mb-2">Select sector category to proceed</p>
                ) : (
                  <div className="flex gap-2 md:gap-4">
                    <button onClick={() => setReportStep(1)} className="flex-1 py-3 md:py-6 rounded-xl md:rounded-2xl font-black uppercase text-[8px] md:text-[11px] tracking-widest text-slate-400 italic hover:bg-slate-50 transition-all">Go Back</button>
                    <button onClick={handleSubmitReport} disabled={isSubmitting || !isFormValid()} className="flex-[2.5] bg-slate-900 text-white py-4 md:py-6 rounded-xl md:rounded-[2rem] font-black uppercase text-[9px] md:text-[12px] tracking-[0.2em] md:tracking-[0.4em] shadow-2xl active:scale-95 transition-all disabled:opacity-30 italic flex items-center justify-center gap-3 md:gap-5">
                      {isSubmitting ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-paper-plane text-indigo-400"></i>}
                      <span>{isSubmitting ? 'Transmitting...' : 'Dispatch Protocol'}</span>
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
  <button onClick={() => onClick(category)} className="bg-white p-6 md:p-10 rounded-2xl md:rounded-[3rem] border border-slate-100 group text-left relative overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-sm hover:shadow-xl">
    <div className={`absolute top-0 right-0 w-32 md:w-48 h-32 md:h-48 bg-${category.color}-500/5 blur-[50px] group-hover:bg-${category.color}-500/10 transition-all duration-700`}></div>
    <div className={`w-10 h-10 md:w-16 md:h-16 bg-${category.color}-50 text-${category.color}-600 rounded-xl md:rounded-[1.5rem] flex items-center justify-center text-xl md:text-3xl shadow-inner group-hover:bg-slate-900 group-hover:text-white transition-all duration-500 mb-6 md:mb-10`}>
      <i className={`fas fa-${category.icon}`}></i>
    </div>
    <div>
      <h3 className="text-sm md:text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none italic">{category.name}</h3>
      <p className="text-[7px] md:text-[9px] text-slate-300 font-black uppercase tracking-widest md:tracking-[0.6em] mt-2 md:mt-4 italic">{category.group}</p>
    </div>
    <div className="mt-8 md:mt-12 flex items-center justify-between border-t border-slate-50 pt-4 md:pt-6 opacity-40 group-hover:opacity-100 transition-opacity">
       <span className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest italic">Synchronize</span>
       <i className="fas fa-arrow-right text-[10px] md:text-xs text-slate-200 group-hover:text-slate-950 group-hover:translate-x-1 md:group-hover:translate-x-2 transition-all"></i>
    </div>
  </button>
);

export default CategoryHubView;