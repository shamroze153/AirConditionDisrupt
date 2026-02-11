import React, { useState, useMemo, useEffect } from 'react';
import { Asset, Ticket, StatsResponse, CategoryKey, Tool, MaterialDemand } from '../types.ts';
import { CATEGORY_TECHS, DEFAULT_TOOLS, GAS_TYPES } from '../constants.ts';
import { postAction, fetchTools, updateAssetStatus, updatePoints, logTakeover, submitDemand, addTool, updateTool, deleteTool, logGasTransaction } from '../services/api.ts';

interface Props {
  category: CategoryKey;
  attendance: Record<string, boolean>;
  toggleAttendance: (tech: string) => void;
  tickets: Ticket[];
  assets: Asset[];
  onOpenChecklist: (zoneIdx: number, tech: string) => void;
  showToast: (msg: string) => void;
  onRefresh: () => void;
  stats: StatsResponse | null;
}

const TechView: React.FC<Props> = ({ category, attendance, toggleAttendance, tickets, assets, onOpenChecklist, showToast, onRefresh, stats }) => {
  const [view, setView] = useState<'profiles' | 'hub' | 'demands' | 'tools'>('profiles');
  const [selectedTech, setSelectedTech] = useState<string | null>(null);
  const [multiSelectedTechs, setMultiSelectedTechs] = useState<string[]>([]);
  const [isSyncingSLA, setIsSyncingSLA] = useState(false);
  
  const [takeoverModal, setTakeoverModal] = useState<{ zoneIdx: number, originalTech: string } | null>(null);
  const [actingTechSelection, setActingTechSelection] = useState<string>('');

  const activeTechList = CATEGORY_TECHS[category] || [];
  
  const allAvailableTechs = useMemo(() => {
    return [...(CATEGORY_TECHS.ac || []), ...(CATEGORY_TECHS.electrical || []), ...(CATEGORY_TECHS.handyman || [])];
  }, []);

  const [resolveTicket, setResolveTicket] = useState<Ticket | null>(null);
  const [solvingTechs, setSolvingTechs] = useState<string[]>([]);
  const [resolveType, setResolveType] = useState<'Minor' | 'Major'>('Minor');
  const [resolveRemarks, setResolveRemarks] = useState('');
  const [gasUsedYesNo, setGasUsedYesNo] = useState<'Yes' | 'No'>('No');
  const [gasAmount, setGasAmount] = useState<string>('0');
  const [selectedGasType, setSelectedGasType] = useState<string>(GAS_TYPES[0]?.name || '');
  const [isResolving, setIsResolving] = useState(false);

  // 1️⃣ SINGLE SOURCE OF TRUTH (LOCKED to Master_Assets via assets prop)
  const masterACAssets = useMemo(() => {
    return assets.filter(a => {
      const cat = String(a.category || '').toUpperCase();
      return cat.includes('AC') || cat.includes('HVAC') || category === 'ac';
    });
  }, [assets, category]);

  // 3️⃣ CONNECTION VERIFICATION (NON-OPTIONAL)
  const isRegistryEmpty = category === 'ac' && masterACAssets.length === 0;

  // Normalization Helpers (Strictly enforced)
  const norm = (s: string) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Unified Raise Issue Modal (Tech Era Flow)
  const [showRaiseIssueModal, setShowRaiseIssueModal] = useState(false);
  const [issueStep, setIssueStep] = useState(1); // 1: Campus, 2: Floor, 3: AC Selection, 4: Narrative
  const [issueData, setIssueData] = useState({
    campus: '',
    floor: '',
    assetTag: '',
    details: '',
    complaintType: 'Proactive' as 'Proactive' | 'Reactive'
  });
  
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

  // 7️⃣ SUPPLIES & TOOLS STATE
  const [demandTech, setDemandTech] = useState<string>(activeTechList[0] || '');
  const [demandDetails, setDemandDetails] = useState('');
  const [isSubmittingDemand, setIsSubmittingDemand] = useState(false);
  
  const [serverTools, setServerTools] = useState<Tool[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [isToolAdminUnlocked, setIsToolAdminUnlocked] = useState(false);
  const [showToolModal, setShowToolModal] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [toolFormData, setToolFormData] = useState<Tool>({ category: category.toUpperCase(), name: '', qty: 0, technician: '' });
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');

  // 4️⃣ CAMPUS DROPDOWN (DATA-DRIVEN ONLY)
  const dynamicCampuses = useMemo(() => {
    const set = new Set<string>();
    masterACAssets.forEach(a => { if (a.campus) set.add(String(a.campus).trim()); });
    return Array.from(set).sort();
  }, [masterACAssets]);

  // 5️⃣ FLOOR DROPDOWN (CASCADE FILTER)
  const dynamicFloors = useMemo(() => {
    if (!issueData.campus) return [];
    const target = norm(issueData.campus);
    const set = new Set<string>();
    masterACAssets.forEach(a => {
      if (norm(a.campus) === target && a.floor) set.add(String(a.floor).trim());
    });
    return Array.from(set).sort();
  }, [masterACAssets, issueData.campus]);

  // 6️⃣ AC LIST RENDERING (FINAL FILTER)
  const filteredAssetsForIssue = useMemo(() => {
    if (!issueData.campus || !issueData.floor) return [];
    const cTarget = norm(issueData.campus);
    const fTarget = norm(issueData.floor);
    
    return masterACAssets.filter(a => {
      const isLocMatch = norm(a.campus) === cTarget && norm(a.floor) === fTarget;
      const isActive = String(a.status || '').toUpperCase() === 'ACTIVE';
      return isLocMatch && isActive;
    });
  }, [masterACAssets, issueData.campus, issueData.floor]);

  const loadTools = async () => {
    setIsLoadingTools(true);
    try {
      const data = await fetchTools(category);
      setServerTools(data.length > 0 ? data : (DEFAULT_TOOLS[category] || []).map(t => ({ ...t, category: category.toUpperCase() })));
    } catch (e) {
      setServerTools((DEFAULT_TOOLS[category] || []).map(t => ({ ...t, category: category.toUpperCase() })));
    } finally {
      setIsLoadingTools(false);
    }
  };

  useEffect(() => {
    if (view === 'tools') loadTools();
  }, [view, category]);

  const handleApplyTool = async () => {
    if (!toolFormData.name || !isToolAdminUnlocked) return;
    try {
      if (editingTool) {
        await updateTool(category, editingTool.name, toolFormData);
      } else {
        await addTool(category, toolFormData);
      }
      showToast("Tool Registry Synchronized");
      setShowToolModal(false);
      loadTools();
    } catch (e) { showToast("Sync Error"); }
  };

  const handleDeleteTool = async (name: string) => {
    if (!window.confirm("Authorize Permanent Removal from Registry?") || !isToolAdminUnlocked) return;
    try {
      await deleteTool(category, name);
      showToast("Tool Removed from Registry");
      loadTools();
    } catch (e) { showToast("Sync Error"); }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '5566') {
      setIsToolAdminUnlocked(true);
      setShowPinModal(false);
      setPinInput('');
      showToast("ADMIN PROTOCOL UNLOCKED");
    } else {
      showToast("ACCESS DENIED");
      setPinInput('');
    }
  };

  const handleDemandSubmit = async () => {
    if (!demandDetails.trim() || isSubmittingDemand) return;
    setIsSubmittingDemand(true);
    try {
      await submitDemand(category, demandTech, demandDetails);
      showToast("Supply Chain Request Transmitted");
      setDemandDetails('');
      onRefresh();
    } catch (e) { showToast("Transmission Error"); } finally { setIsSubmittingDemand(false); }
  };

  const techProfileData = useMemo(() => {
    if (!selectedTech) return { active: [], resolved: [], merit: 0, demerit: 0, compliance: { d: 0, m: 0, q: 0, zone: 0 } };
    const all = (tickets || []).filter(t => t.assignedTo?.trim().toLowerCase() === selectedTech.trim().toLowerCase());
    const techLogs = (stats?.performanceLogs || []).filter(l => l.tech === selectedTech && String(l.category || '').toUpperCase() === category.toUpperCase());
    const merit = techLogs.filter(l => l.points > 0).reduce((a, b) => a + b.points, 0);
    const demerit = Math.abs(techLogs.filter(l => l.points < 0).reduce((a, b) => a + b.points, 0));
    
    let zoneCompliance = { d: 0, m: 0, q: 0, zone: 0 };
    if (category === 'ac') {
      const idx = activeTechList.indexOf(selectedTech);
      if (idx !== -1) {
        zoneCompliance.zone = idx + 1;
        const techAssets = masterACAssets.filter(a => a.assignedTech === selectedTech);
        const assetCount = techAssets.length || 1;
        const calc = (done: string[]) => Math.round((techAssets.filter(a => done.includes(String(a.tag).toUpperCase())).length / assetCount) * 100);
        zoneCompliance.d = calc(stats?.hvac?.daily || []);
        zoneCompliance.m = calc(stats?.hvac?.monthly || []);
        zoneCompliance.q = calc(stats?.hvac?.quarterly || []);
      }
    }
    return { active: all.filter(t => !['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status)), resolved: all.filter(t => ['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status)), merit, demerit, compliance: zoneCompliance };
  }, [tickets, selectedTech, stats, category, activeTechList, masterACAssets]);

  const handleEnforceSLA = async () => {
    if (!selectedTech || !complianceData || !complianceData.isBreached || isSyncingSLA) return;
    const pin = prompt("AUTHORIZED ACCESS REQUIRED\nEnter Registry Command Hub PIN:");
    if (pin !== '5566') { showToast("Access Denied"); return; }
    setIsSyncingSLA(true);
    try {
      const reason = category === 'ac' ? `SLA BREACH: Incomplete Daily Zone Checklist. Missed Tags: ${complianceData.dailyMisses.join(', ')}` : `SLA BREACH: Incomplete Daily Electrical Synergy Protocol. 10 Points Deducted.`;
      await updatePoints(category, selectedTech, -10, reason);
      showToast("SLA Penalty Synchronized");
      onRefresh();
    } catch (e) { showToast("Sync Error"); } finally { setIsSyncingSLA(false); }
  };

  const handleTakeover = async () => {
    if (!takeoverModal || !actingTechSelection) return;
    try {
      await updatePoints(category, actingTechSelection, 5, `TAKEOVER COVERAGE: Covering Sector ${takeoverModal.zoneIdx + 1} for ${takeoverModal.originalTech}`);
      await logTakeover(category, takeoverModal.originalTech, actingTechSelection);
      onOpenChecklist(takeoverModal.zoneIdx, actingTechSelection);
      setTakeoverModal(null);
      setActingTechSelection('');
      showToast(`Takeover Authorized: ${actingTechSelection}`);
      onRefresh();
    } catch (e) { showToast("Sync Error"); }
  };

  const handleResolve = async () => {
    if (!resolveTicket || solvingTechs.length === 0) return;
    setIsResolving(true);
    const solversStr = solvingTechs.join(' & ');
    const now = new Date();
    
    try {
      // 🔄 RESTORED: Optional Gas Transaction Logging
      if (category === 'ac' && gasUsedYesNo === 'Yes' && Number(gasAmount) > 0) {
        await logGasTransaction({
          timestamp: now.toLocaleString(),
          action: 'USAGE',
          gasType: selectedGasType,
          amount: Number(gasAmount),
          tech: solversStr,
          refTicket: `WO-${resolveTicket.rowIndex}`,
          category: 'AC'
        });
      }

      const fd = new FormData();
      fd.append('action', 'resolve_ticket');
      fd.append('category', category.toUpperCase());
      fd.append('rowIndex', String(resolveTicket.rowIndex));
      fd.append('assetTag', resolveTicket.assetTag);
      fd.append('status', 'Resolved – Pending Admin Review');
      fd.append('resolvedBy', `${solversStr} • ${now.toLocaleString()}`);
      fd.append('workType', resolveType);
      fd.append('remarks', resolveRemarks);
      fd.append('gasUsed', String(gasUsedYesNo === 'Yes' ? gasAmount : 0));
      fd.append('gasType', gasUsedYesNo === 'Yes' ? selectedGasType : '');
      await postAction(fd);
      
      if (resolveTicket.assetTag && resolveTicket.assetTag !== 'N/A') {
        await updateAssetStatus(category, resolveTicket.assetTag, 'Active');
      }

      onRefresh(); 
      setResolveTicket(null);
      setSolvingTechs([]);
      setResolveRemarks('');
      setGasUsedYesNo('No');
      setGasAmount('0');
      showToast("Resolution Synchronized");
    } catch (e) { showToast("Sync Failure"); } finally { setIsResolving(false); }
  };

  const handleRaiseIssueSubmit = async () => {
    if (!issueData.details || isSubmittingIssue) return;
    setIsSubmittingIssue(true);
    try {
      const fd = new FormData();
      fd.append('action', 'complain');
      fd.append('category', category.toUpperCase());
      fd.append('complaintType', issueData.complaintType);
      
      let finalLocation = `${issueData.campus} - ${issueData.floor}`;
      const asset = assets.find(a => a.tag === issueData.assetTag);
      if (asset) finalLocation += ` - ${asset.room}`;
      
      const activeTechs = activeTechList.filter(t => attendance[t]);
      let assigned = 'Unassigned';
      if (activeTechs.length > 0) {
        const load: Record<string, number> = {};
        activeTechs.forEach(t => load[t] = 0);
        tickets.forEach(t => { if (activeTechs.includes(t.assignedTo) && !['Resolved', 'Completed'].some(s => t.status.includes(s))) load[t.assignedTo]++; });
        assigned = activeTechs.sort((a,b) => load[a] - load[b])[0];
      }

      fd.append('location', finalLocation);
      fd.append('assetTag', issueData.assetTag || 'N/A');
      fd.append('details', issueData.details);
      fd.append('assignedTech', assigned);
      fd.append('status', assigned === 'Unassigned' ? 'Pending Assignment' : 'Open');

      await postAction(fd);

      if (issueData.assetTag && issueData.assetTag !== 'N/A') {
        await updateAssetStatus(category, issueData.assetTag, 'Maintenance');
      }

      showToast("Issue Dispatched to Pipeline");
      setShowRaiseIssueModal(false);
      setIssueStep(1);
      setIssueData({ campus: '', floor: '', assetTag: '', details: '', complaintType: 'Proactive' });
      onRefresh();
    } catch (e) { showToast("Transmission Error"); } finally { setIsSubmittingIssue(false); }
  };

  const toggleMultiSelect = (tech: string) => { setMultiSelectedTechs(prev => prev.includes(tech) ? prev.filter(t => t !== tech) : [...prev, tech]); setSelectedTech(tech); };
  const toggleSolvingTech = (tech: string) => { setSolvingTechs(prev => prev.includes(tech) ? prev.filter(t => t !== tech) : [...prev, tech]); };

  const zoneSummaries = useMemo(() => {
    if (category !== 'ac') return [];
    return [0, 1, 2, 3].map(idx => {
      const technicianName = activeTechList[idx];
      const zoneAssets = masterACAssets.filter(a => a.assignedTech === technicianName);
      const totalActive = zoneAssets.length || 0;
      const checkFreq = (doneTags: string[]) => {
        const normDone = doneTags.map(t => String(t || '').trim().toUpperCase());
        const count = zoneAssets.filter(a => normDone.includes(String(a.tag).trim().toUpperCase())).length;
        if (count === 0) return 'Pending';
        if (count >= totalActive) return 'Done';
        return 'In Progress';
      };
      return { totalActive, daily: checkFreq(stats?.hvac?.daily || []), monthly: checkFreq(stats?.hvac?.monthly || []), quarterly: checkFreq(stats?.hvac?.quarterly || []) };
    });
  }, [category, masterACAssets, stats, activeTechList]);

  const complianceData = useMemo(() => {
    if (!selectedTech) return null;
    const todayTags = (stats?.hvac?.daily || []).map(t => String(t).toUpperCase());
    let dailyMisses: string[] = [];
    let slaPenaltyPoints = 0;
    let isBreached = false;

    if (category === 'ac') {
      const zoneAssets = masterACAssets.filter(a => a.assignedTech === selectedTech);
      dailyMisses = zoneAssets.filter(a => !todayTags.includes(String(a.tag).toUpperCase())).map(a => a.tag);
      if (dailyMisses.length > 0) {
        isBreached = true;
        slaPenaltyPoints = 10;
      }
    }

    const slaLogs = (stats?.performanceLogs || []).filter(l => l.tech === selectedTech && String(l.reason).includes('SLA BREACH') && String(l.category).toUpperCase() === category.toUpperCase());
    return { dailyMisses, isBreached, pendingPenalty: slaPenaltyPoints, totalBreachEvents: slaLogs.length, totalSlaDeducted: Math.abs(slaLogs.reduce((a, b) => a + (b.points < 0 ? b.points : 0), 0)) };
  }, [selectedTech, stats, masterACAssets, category]);

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6 animate-fadeIn pb-32">
      <div className="flex bg-white p-1.5 rounded-2xl shadow-xl border border-slate-100 gap-1.5 sticky top-4 z-50 glass-panel overflow-x-auto hide-scroll">
        {[
          { id: 'profiles', label: 'Field Hub', icon: 'id-card' },
          { id: 'hub', label: category === 'ac' ? 'Sector Hub' : 'Operations Hub', icon: 'map-marked-alt' },
          { id: 'demands', label: 'Supplies', icon: 'truck-loading' },
          { id: 'tools', label: 'Tools', icon: 'toolbox' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id as any)} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 min-w-[110px] rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === tab.id ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>
            <i className={`fas fa-${tab.icon} ${view === tab.id ? 'text-indigo-400' : 'opacity-40'}`}></i>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {view === 'profiles' && (
        <div className="space-y-6">
          <div className="flex gap-3 overflow-x-auto pb-4 hide-scroll">
            {activeTechList.map(t => (
              <button key={t} onClick={() => toggleMultiSelect(t)} className={`group flex items-center gap-4 p-4 rounded-3xl border-2 transition-all min-w-[180px] md:min-w-[220px] ${multiSelectedTechs.includes(t) ? (selectedTech === t ? 'bg-slate-950 border-slate-950 shadow-2xl scale-105' : 'bg-slate-800 border-slate-800 shadow-xl') : 'bg-white border-slate-100 opacity-60 shadow-sm'}`}>
                 <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl italic ${multiSelectedTechs.includes(t) ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300'}`}>{t?.[0] || '?'}</div>
                 <div className="text-left"><p className={`text-[10px] font-black uppercase italic ${multiSelectedTechs.includes(t) ? 'text-white' : 'text-slate-900'}`}>{t}</p><p className={`text-[7px] font-bold uppercase mt-1 italic ${multiSelectedTechs.includes(t) ? 'text-white/40' : 'text-slate-300'}`}>{attendance[t] ? '● Online' : '○ Offline'}</p></div>
              </button>
            ))}
          </div>
          {selectedTech && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-slideUp">
               <div className="lg:col-span-4 space-y-6">
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl relative overflow-hidden">
                    <div className="text-center mb-8">
                       <div className="w-24 h-24 bg-slate-950 text-white rounded-[2rem] flex items-center justify-center text-4xl font-black italic shadow-2xl mx-auto mb-6">{selectedTech?.[0] || '?'}</div>
                       <h3 className="text-2xl font-black text-slate-900 uppercase italic leading-none mb-2">{selectedTech}</h3>
                       <p className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.4em] italic">{category.toUpperCase()} SPECIALIST</p>
                    </div>
                    {complianceData && (
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-6 space-y-4">
                         <div className="flex justify-between items-center"><span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">SLA Integrity</span><div className={`px-2 py-0.5 rounded-full text-[6px] font-black uppercase ${complianceData.isBreached ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-emerald-100 text-emerald-600'}`}>{complianceData.isBreached ? 'Breach Detected' : 'Operational'}</div></div>
                         <div className="grid grid-cols-2 gap-3"><div className="bg-white p-3 rounded-xl shadow-sm text-center"><p className="text-[7px] font-black text-slate-300 uppercase mb-1">Breach Count</p><p className="text-xl font-black italic text-slate-900">{complianceData.totalBreachEvents}</p></div><div className="bg-white p-3 rounded-xl shadow-sm text-center"><p className="text-[7px] font-black text-slate-300 uppercase mb-1">SLA Demerits</p><p className="text-xl font-black italic text-rose-600">-{complianceData.totalSlaDeducted}</p></div></div>
                         {complianceData.isBreached && <button onClick={handleEnforceSLA} disabled={isSyncingSLA} className="w-full mt-4 bg-rose-600 text-white py-3 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-lg italic flex items-center justify-center gap-2"><i className={`fas fa-${isSyncingSLA ? 'circle-notch animate-spin' : 'shield-alt'}`}></i>{isSyncingSLA ? 'Syncing...' : 'Log Penalty (-10)'}</button>}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4"><div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 text-center"><p className="text-[8px] font-black text-emerald-400 uppercase italic mb-2">Merit</p><p className="text-3xl font-black text-emerald-600 italic leading-none">+{techProfileData.merit}</p></div><div className="bg-rose-50 p-5 rounded-2xl border border-rose-100 text-center"><p className="text-[8px] font-black text-rose-400 uppercase italic mb-2">Demerit</p><p className="text-3xl font-black text-rose-600 italic leading-none">-{techProfileData.demerit}</p></div></div>
                    <div className="mt-8 pt-8 border-t border-slate-50 flex justify-between items-center"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Presence Hub</span><button onClick={() => toggleAttendance(selectedTech)} className={`w-12 h-6 rounded-full transition-all relative ${attendance[selectedTech] ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${attendance[selectedTech] ? 'left-7' : 'left-1'}`}></div></button></div>
                 </div>
               </div>
               <div className="lg:col-span-8 space-y-6">
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl">
                     <div className="flex items-center justify-between mb-8 border-b border-slate-50 pb-6"><h4 className="text-sm font-black text-slate-950 uppercase italic tracking-widest">Live Pipeline</h4><span className="bg-indigo-50 text-indigo-600 text-[8px] font-black px-3 py-1 rounded-full uppercase italic">{techProfileData.active.length} Tickets</span></div>
                     <div className="space-y-4 max-h-[400px] overflow-y-auto hide-scroll">
                        {techProfileData.active.length > 0 ? techProfileData.active.map((t, i) => (
                           <div key={i} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 group">
                               <div className="flex-1 space-y-2"><div className="flex items-center gap-3"><span className="text-[7px] font-black text-white bg-slate-950 px-2 py-0.5 rounded italic uppercase">{t.assetTag}</span><span className="text-[7px] font-bold text-slate-300 uppercase italic">{new Date(t.date).toLocaleDateString()}</span></div><h5 className="text-[13px] font-black text-slate-900 italic uppercase group-hover:text-indigo-600 transition-colors">"{t.details}"</h5><p className="text-[8px] font-bold text-slate-400 uppercase italic">{t.location}</p></div>
                               <button onClick={() => { setResolveTicket(t); setSolvingTechs([selectedTech!]); }} className="w-full md:w-auto bg-slate-950 text-white px-8 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest italic shadow-xl hover:scale-105 active:scale-95 transition-all">Solve Protocol</button>
                           </div>
                        )) : <div className="py-20 text-center opacity-10 flex flex-col items-center"><i className="fas fa-check-circle text-6xl mb-4 text-indigo-600"></i><p className="text-xs font-black uppercase italic tracking-widest">Registry Fully Cleared</p></div>}
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>
      )}

      {view === 'hub' && (
        <div className="animate-fadeIn">
          <div className="flex justify-between items-center mb-6">
            <div className="bg-slate-900 text-indigo-400 px-4 py-2 rounded-xl border border-white/5 font-black text-[9px] uppercase tracking-widest italic animate-pulse">
              Master_Assets Loaded: {masterACAssets.length} ACs
            </div>
            <button onClick={() => setShowRaiseIssueModal(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] italic shadow-xl flex items-center gap-3 hover:scale-105 active:scale-95 transition-all">
              <i className="fas fa-exclamation-triangle"></i>
              <span>Raise Issue</span>
            </button>
          </div>
          <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 blur-[100px] pointer-events-none"></div>
             <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900 italic mb-8 relative z-10">{category === 'ac' ? 'Sector Deployment Control' : 'Operations Synergy Protocol'}</h3>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative z-10">
                {activeTechList.map((tech, i) => {
                  const summary = zoneSummaries[i];
                  const isAbsent = !attendance[tech];
                  return (
                    <div key={i} className="relative group">
                      <button onClick={() => !isAbsent && onOpenChecklist(i, tech)} disabled={isAbsent} className={`w-full bg-slate-50 p-6 md:p-8 rounded-[2.5rem] border border-slate-100 hover:bg-white hover:shadow-2xl transition-all flex items-center justify-between text-left relative overflow-hidden ${isAbsent ? 'opacity-40 grayscale cursor-default' : ''}`}>
                        <div className="flex items-center gap-4 md:gap-6 relative z-10"><div className={`w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-2xl font-black shadow-inner border border-slate-50 transition-all ${!isAbsent ? 'group-hover:bg-slate-900 group-hover:text-white' : ''}`}>{category.toUpperCase()[0]}{i+1}</div><div><div className="flex items-center gap-3"><p className="text-lg font-black text-slate-900 uppercase italic leading-none">{tech}</p>{category === 'ac' && summary && <span className="bg-slate-900 text-white text-[7px] font-black px-2 py-0.5 rounded italic uppercase tracking-widest">{summary.totalActive} ACs</span>}</div><p className="text-[9px] font-bold text-slate-300 uppercase mt-2 italic">Sector {i+1} {isAbsent ? 'Registry Locked' : 'Active Duty'}</p></div></div>
                        {!isAbsent && <i className="fas fa-chevron-right text-slate-200 group-hover:text-indigo-500 text-xl relative z-10"></i>}
                      </button>
                      {isAbsent && <div onClick={() => setTakeoverModal({ zoneIdx: i, originalTech: tech })} className="absolute inset-0 bg-slate-950/80 backdrop-blur-md rounded-[2.5rem] z-20 flex flex-col items-center justify-center text-center p-6 cursor-pointer border-2 border-amber-500/20 hover:bg-slate-950/90 transition-all shadow-2xl"><div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mb-4 animate-pulse"><i className="fas fa-lock text-amber-500 text-2xl"></i></div><p className="text-white text-[10px] font-black uppercase tracking-[0.2em] mb-1 italic">Secure Lock: {tech} Absent</p><p className="text-amber-400 text-[8px] font-black uppercase tracking-widest italic animate-bounce mt-2">TAP TO TAKEOVER</p></div>}
                    </div>
                  );
                })}
             </div>
          </div>
        </div>
      )}

      {view === 'demands' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
           <div className="lg:col-span-4">
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl space-y-6">
                 <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Raise Supply Demand</h3>
                    <p className="text-[8px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Protocol: Material Acquisition</p>
                 </div>
                 <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 shadow-inner">
                       <label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 italic">Requesting Specialist</label>
                       <select value={demandTech} onChange={e => setDemandTech(e.target.value)} className="w-full bg-transparent font-black text-[11px] outline-none italic uppercase">
                          {activeTechList.map(t => <option key={t} value={t}>{t}</option>)}
                       </select>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 shadow-inner">
                       <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Material Inventory Brief</label>
                       <textarea value={demandDetails} onChange={e => setDemandDetails(e.target.value)} rows={4} placeholder="List items required for registry update..." className="w-full bg-transparent font-bold text-[11px] outline-none italic uppercase resize-none leading-relaxed" />
                    </div>
                    <button onClick={handleDemandSubmit} disabled={!demandDetails.trim() || isSubmittingDemand} className="w-full bg-slate-950 text-white py-6 rounded-[2rem] font-black uppercase text-[10px] tracking-widest italic shadow-2xl active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-4">
                       {isSubmittingDemand ? <i className="fas fa-circle-notch animate-spin text-indigo-400"></i> : <i className="fas fa-paper-plane text-indigo-400"></i>}
                       <span>Transmit to Pipeline</span>
                    </button>
                 </div>
              </div>
           </div>
           <div className="lg:col-span-8">
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex flex-col h-full">
                 <div className="flex justify-between items-center mb-8 border-b border-slate-50 pb-6">
                    <h3 className="text-sm font-black text-slate-950 uppercase italic tracking-widest">Active Demand Ledger</h3>
                    <span className="bg-indigo-50 text-indigo-600 text-[8px] font-black px-3 py-1 rounded-full uppercase italic">Registry Records</span>
                 </div>
                 <div className="flex-1 overflow-y-auto space-y-4 pr-1 hide-scroll">
                    {(stats?.demands || []).length > 0 ? (stats?.demands || []).map((d: MaterialDemand, i: number) => (
                       <div key={i} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex justify-between items-center group">
                          <div>
                             <div className="flex items-center gap-3 mb-2">
                                <span className="text-[7px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded italic uppercase">{d.technician}</span>
                                <span className="text-[7px] font-bold text-slate-300 uppercase italic">{new Date(d.timestamp).toLocaleDateString()}</span>
                             </div>
                             <h4 className="text-[12px] font-black text-slate-900 italic uppercase">"{d.details}"</h4>
                          </div>
                          <div className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase italic ${d.status === 'Submitted' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                             {d.status}
                          </div>
                       </div>
                    )) : (
                       <div className="py-24 text-center opacity-10 flex flex-col items-center">
                          <i className="fas fa-box-open text-6xl mb-4"></i>
                          <p className="text-[10px] font-black uppercase tracking-widest italic">Demand Registry Empty</p>
                       </div>
                    )}
                 </div>
              </div>
           </div>
        </div>
      )}

      {view === 'tools' && (
        <div className="space-y-8 animate-fadeIn">
           <div className="flex justify-between items-center px-4">
              <div>
                 <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Tools Registry</h3>
                 <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Domain: {category.toUpperCase()}</p>
              </div>
              <div className="flex gap-4">
                 <button onClick={() => !isToolAdminUnlocked ? setShowPinModal(true) : setIsToolAdminUnlocked(false)} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isToolAdminUnlocked ? 'bg-indigo-600 text-white shadow-xl' : 'bg-white border border-slate-100 text-slate-300 shadow-sm'}`}>
                    <i className={`fas fa-${isToolAdminUnlocked ? 'lock-open' : 'lock'} text-lg`}></i>
                 </button>
                 {isToolAdminUnlocked && (
                    <button onClick={() => { setEditingTool(null); setToolFormData({ category: category.toUpperCase(), name: '', qty: 0, technician: '' }); setShowToolModal(true); }} className="bg-slate-950 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] italic shadow-xl flex items-center gap-3">
                       <i className="fas fa-plus-circle text-indigo-400"></i>
                       <span>Add Asset</span>
                    </button>
                 )}
              </div>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {isLoadingTools ? (
                 <div className="col-span-full py-32 flex flex-col items-center justify-center opacity-20">
                    <i className="fas fa-circle-notch animate-spin text-4xl mb-4"></i>
                    <p className="text-[10px] font-black uppercase italic tracking-widest">Scanning Registry...</p>
                 </div>
              ) : serverTools.length > 0 ? serverTools.map((t, i) => (
                 <div key={i} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 blur-[30px] opacity-50 group-hover:bg-indigo-50 transition-colors"></div>
                    <div className="relative z-10">
                       <div className="flex justify-between items-start mb-6">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-xl text-slate-300 group-hover:bg-slate-950 group-hover:text-white transition-all shadow-inner">
                             <i className="fas fa-wrench"></i>
                          </div>
                          <div className="text-right">
                             <p className="text-2xl font-black text-slate-950 tracking-tighter leading-none">{t.qty}</p>
                             <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mt-1">Available Qty</p>
                          </div>
                       </div>
                       <h4 className="text-sm font-black text-slate-900 uppercase italic tracking-tight mb-2">"{t.name}"</h4>
                       <p className="text-[7px] font-bold text-slate-300 uppercase italic">Category: {t.category}</p>
                       
                       {isToolAdminUnlocked && (
                          <div className="mt-6 pt-6 border-t border-slate-50 flex gap-3">
                             <button onClick={() => { setEditingTool(t); setToolFormData(t); setShowToolModal(true); }} className="flex-1 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-[8px] font-black uppercase italic hover:bg-indigo-600 hover:text-white transition-all">Edit</button>
                             <button onClick={() => handleDeleteTool(t.name)} className="flex-1 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-[8px] font-black uppercase italic hover:bg-rose-600 hover:text-white transition-all">Del</button>
                          </div>
                       )}
                    </div>
                 </div>
              )) : (
                 <div className="col-span-full py-32 flex flex-col items-center justify-center opacity-10">
                    <i className="fas fa-toolbox text-8xl mb-6"></i>
                    <p className="text-xl font-black uppercase italic tracking-[0.5em]">Inventory Stream Offline</p>
                 </div>
              )}
           </div>
        </div>
      )}

      {/* MODALS SECTION */}
      {showPinModal && (
        <div className="fixed inset-0 bg-slate-950/98 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-10 shadow-3xl border border-white/5">
             <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner"><i className="fas fa-shield-alt text-3xl"></i></div>
                <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Command Override</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-3 tracking-widest italic">Authorized Entry Protocol</p>
             </div>
             <form onSubmit={handlePinSubmit} className="space-y-8">
                <input type="password" autoFocus maxLength={4} value={pinInput} onChange={(e) => setPinInput(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 text-center text-3xl font-black tracking-[0.6em] focus:border-indigo-600 outline-none transition-all shadow-inner" placeholder="••••" />
                <div className="flex gap-4">
                  <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 italic">Abort</button>
                  <button type="submit" className="flex-1 bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest italic shadow-2xl">Verify</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {showToolModal && (
        <div className="fixed inset-0 bg-slate-950/98 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-12 shadow-3xl border border-white/5">
             <div className="flex justify-between items-center mb-10">
                <div>
                   <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">{editingTool ? 'Modify Asset' : 'Register Asset'}</h3>
                   <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Tool Inventory Protocol</p>
                </div>
                <button onClick={() => setShowToolModal(false)} className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-300 flex items-center justify-center hover:text-rose-500 transition-all"><i className="fas fa-times text-xl"></i></button>
             </div>
             <div className="space-y-6">
                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 shadow-inner">
                   <label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 italic">Asset Designation</label>
                   <input type="text" value={toolFormData.name} onChange={e => setToolFormData({...toolFormData, name: e.target.value})} className="w-full bg-transparent font-black text-[13px] outline-none italic uppercase" placeholder="NAME OF TOOL..." />
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 shadow-inner">
                   <label className="block text-[8px] font-black text-slate-400 uppercase mb-2 ml-1 italic">Quantity Allocation</label>
                   <input type="number" value={toolFormData.qty} onChange={e => setToolFormData({...toolFormData, qty: Number(e.target.value)})} className="w-full bg-transparent font-black text-[13px] outline-none" />
                </div>
                <button onClick={handleApplyTool} className="w-full bg-slate-950 text-white py-6 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest italic shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-4">
                   <i className="fas fa-cloud-upload-alt text-indigo-400"></i>
                   <span>{editingTool ? 'Execute Update' : 'Authorize Entry'}</span>
                </button>
             </div>
          </div>
        </div>
      )}

      {showRaiseIssueModal && (
        <div className="fixed inset-0 bg-slate-950/98 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
           <div className="bg-white w-full max-w-2xl rounded-[3rem] p-10 shadow-3xl border border-white/5 relative overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-4 shrink-0">
                 <div>
                    <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Raise Protocol</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Phase {issueStep}: {issueStep === 1 ? 'Select Campus' : issueStep === 2 ? 'Select Floor' : issueStep === 3 ? 'Select Asset' : 'Narrative Detail'}</p>
                 </div>
                 <button onClick={() => setShowRaiseIssueModal(false)} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-300 hover:text-rose-500 active:scale-90 transition-all"><i className="fas fa-times text-xl"></i></button>
              </div>

              {isRegistryEmpty ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-rose-50 rounded-[2rem] border-2 border-rose-100">
                   <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-4xl mb-6 shadow-inner animate-pulse">
                      <i className="fas fa-database"></i>
                   </div>
                   <h4 className="text-xl font-black text-rose-900 uppercase italic mb-4">Registry Lock Error</h4>
                   <p className="text-sm font-bold text-rose-600 uppercase tracking-widest italic leading-relaxed">
                     ❌ No AC assets loaded from Master_Assets tab.<br/>Check sheet connection or permissions.
                   </p>
                </div>
              ) : (
                <>
                  {issueStep === 3 && (
                    <div className="mb-6 bg-slate-900 rounded-2xl p-4 border border-white/10 flex items-center justify-between group">
                       <div className="flex items-center gap-4">
                          <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400">
                             <i className="fas fa-satellite-dish animate-pulse"></i>
                          </div>
                          <div>
                            <p className="text-[7px] font-black text-indigo-400 uppercase italic tracking-widest leading-none mb-1">Maestro Query Monitor</p>
                            <p className="text-[9px] text-white/60 font-medium">
                              Searching <span className="text-white italic">{issueData.campus}</span> | <span className="text-white italic">{issueData.floor}</span>
                            </p>
                          </div>
                       </div>
                       <div className="text-right">
                          <p className="text-[12px] font-black text-indigo-400 italic">{filteredAssetsForIssue.length}</p>
                          <p className="text-[6px] font-bold text-white/30 uppercase tracking-widest">Matches Verified</p>
                       </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto space-y-4 pr-2 hide-scroll">
                     {issueStep === 1 && (
                        <div className="grid grid-cols-1 gap-3 animate-slideUp">
                           {dynamicCampuses.map(c => (
                             <button key={c} onClick={() => { setIssueData({...issueData, campus: c}); setIssueStep(2); }} className="w-full bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 hover:border-indigo-600 hover:bg-white transition-all text-left group">
                                <span className="text-lg font-black uppercase italic text-slate-950">Campus {c}</span>
                                <i className="fas fa-chevron-right float-right text-slate-200 group-hover:text-indigo-600 transition-all"></i>
                             </button>
                           ))}
                        </div>
                     )}

                     {issueStep === 2 && (
                        <div className="grid grid-cols-1 gap-3 animate-slideUp">
                           {dynamicFloors.map(f => (
                             <button key={f} onClick={() => { setIssueData({...issueData, floor: f}); setIssueStep(3); }} className="w-full bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 hover:border-indigo-600 hover:bg-white transition-all text-left group">
                                <span className="text-lg font-black uppercase italic text-slate-950">{f}</span>
                                <i className="fas fa-chevron-right float-right text-slate-200 group-hover:text-indigo-600 transition-all"></i>
                             </button>
                           ))}
                           <button onClick={() => setIssueStep(1)} className="mt-4 text-[10px] font-black uppercase text-slate-400 italic">Back to Campus Selection</button>
                        </div>
                     )}

                     {issueStep === 3 && (
                        <div className="animate-slideUp">
                           <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden shadow-inner">
                             <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-900 text-white">
                                   <tr>
                                      <th className="p-4 text-[8px] font-black uppercase tracking-widest italic">Asset Tag</th>
                                      <th className="p-4 text-[8px] font-black uppercase tracking-widest italic">Asset ID</th>
                                      <th className="p-4 text-[8px] font-black uppercase tracking-widest italic">Location</th>
                                      <th className="p-4 text-[8px] font-black uppercase tracking-widest italic text-center">Protocol</th>
                                   </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                   {filteredAssetsForIssue.length > 0 ? filteredAssetsForIssue.map(a => (
                                     <tr key={a.tag} onClick={() => { setIssueData({...issueData, assetTag: a.tag}); setIssueStep(4); }} className="hover:bg-indigo-50 cursor-pointer transition-colors group">
                                        <td className="p-4 font-black italic text-slate-900 text-[11px] group-hover:text-indigo-600">{a.tag}</td>
                                        <td className="p-4 font-black italic text-slate-400 text-[10px] group-hover:text-indigo-600">#{a.id}</td>
                                        <td className="p-4 font-black italic text-slate-500 text-[10px] uppercase truncate max-w-[1400px] group-hover:text-indigo-900">"{a.room}"</td>
                                        <td className="p-4 text-center">
                                           <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-600 rounded-lg text-[7px] font-black uppercase italic group-hover:bg-indigo-600 group-hover:text-white transition-all">Select</span>
                                        </td>
                                     </tr>
                                   )) : (
                                     <tr>
                                        <td colSpan={4} className="py-24 text-center">
                                           <div className="flex flex-col items-center opacity-20">
                                              <i className="fas fa-search-minus text-6xl mb-4"></i>
                                              <p className="text-sm font-black uppercase italic tracking-widest leading-relaxed">No Assets Detected in {issueData.floor}<br/><span className="text-[10px] opacity-60">Maestro Registry Scan Returned 0 Results</span></p>
                                           </div>
                                        </td>
                                     </tr>
                                   )}
                                </tbody>
                             </table>
                           </div>
                           <button onClick={() => setIssueStep(2)} className="mt-6 text-[10px] font-black uppercase text-slate-400 italic flex items-center gap-2">
                              <i className="fas fa-chevron-left text-[8px]"></i>
                              <span>Return to Floor Selection</span>
                           </button>
                        </div>
                     )}

                     {issueStep === 4 && (
                        <div className="space-y-6 animate-slideUp">
                           <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 shadow-inner">
                              <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic tracking-widest">Findings Narrative</label>
                              <textarea value={issueData.details} onChange={e => setIssueData({...issueData, details: e.target.value})} rows={4} placeholder="Narrate the anomaly..." className="w-full bg-transparent font-black text-base outline-none uppercase italic resize-none" />
                           </div>
                           <div className="flex bg-slate-100 p-1.5 rounded-xl gap-2">
                              {['Proactive', 'Reactive'].map(t => (
                                <button key={t} onClick={() => setIssueData({...issueData, complaintType: t as any})} className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest italic transition-all ${issueData.complaintType === t ? 'bg-slate-950 text-white shadow-md' : 'text-slate-400'}`}>{t}</button>
                              ))}
                           </div>
                           <button onClick={handleRaiseIssueSubmit} disabled={!issueData.details.trim() || isSubmittingIssue} className="w-full bg-slate-950 text-white py-6 rounded-[2rem] font-black uppercase text-[10px] tracking-widest italic shadow-2xl active:scale-95 transition-all disabled:opacity-30">
                              {isSubmittingIssue ? 'Transmitting Registry Update...' : 'Authorize Dispatch Protocol'}
                           </button>
                           <button onClick={() => setIssueStep(3)} className="w-full text-[10px] font-black uppercase text-slate-400 italic">Modify Asset Selection</button>
                        </div>
                     )}
                  </div>
                </>
              )}
           </div>
        </div>
      )}

      {resolveTicket && (
        <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-3xl relative overflow-hidden max-h-[90vh] overflow-y-auto hide-scroll">
             <div className="flex justify-between items-center mb-8">
               <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Resolution Hub</h3>
               <button onClick={() => setResolveTicket(null)} className="w-12 h-12 bg-slate-50 rounded-2xl text-slate-300 flex items-center justify-center hover:text-rose-500 transition-all"><i className="fas fa-times text-xl"></i></button>
             </div>
             <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100"><label className="block text-[8px] font-black text-slate-400 uppercase mb-4 ml-1 italic">Specialist Attribution</label><div className="grid grid-cols-2 gap-3">{allAvailableTechs.map(tech => (<button key={tech} onClick={() => toggleSolvingTech(tech)} className={`p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${solvingTechs.includes(tech) ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-md' : 'border-white bg-white text-slate-400'}`}><span className="text-[9px] font-bold uppercase">{tech}</span></button>))}</div></div>
                
                {/* 🔄 RESTORED: AC Refrigerant Logic Section */}
                {category === 'ac' && (
                  <div className="bg-indigo-50/50 p-6 rounded-2xl border-2 border-indigo-100 space-y-5">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-black text-indigo-900 uppercase italic tracking-widest">Refrigerant Utilized?</label>
                       <div className="flex bg-white p-1 rounded-xl shadow-inner border border-indigo-100 gap-1">
                          {['Yes', 'No'].map(val => (
                            <button key={val} onClick={() => setGasUsedYesNo(val as any)} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${gasUsedYesNo === val ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300'}`}>{val}</button>
                          ))}
                       </div>
                    </div>

                    {gasUsedYesNo === 'Yes' && (
                      <div className="space-y-4 animate-slideDown">
                        <div className="grid grid-cols-2 gap-4">
                           <div className="bg-white p-3 rounded-xl border border-indigo-100">
                              <label className="block text-[7px] font-black text-slate-400 uppercase mb-1 italic">Gas Grade</label>
                              <select value={selectedGasType} onChange={e => setSelectedGasType(e.target.value)} className="w-full bg-transparent font-black text-[11px] outline-none italic uppercase">
                                 {GAS_TYPES.filter(g => g.type === 'ac').map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                              </select>
                           </div>
                           <div className="bg-white p-3 rounded-xl border border-indigo-100">
                              <label className="block text-[7px] font-black text-slate-400 uppercase mb-1 italic">Volume (KG)</label>
                              <input type="number" step="0.1" value={gasAmount} onChange={e => setGasAmount(e.target.value)} className="w-full bg-transparent font-black text-[12px] outline-none italic" placeholder="0.0" />
                           </div>
                        </div>
                        <p className="text-[7px] text-indigo-400 font-bold uppercase text-center italic tracking-widest animate-pulse">Inventory Stock deduction will trigger on submission</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-indigo-600 shadow-inner"><label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-1 italic">Resolution Brief</label><textarea value={resolveRemarks} onChange={e => setResolveRemarks(e.target.value)} rows={3} placeholder="Narrate actions taken..." className="w-full bg-transparent font-bold text-[11px] outline-none italic uppercase resize-none leading-relaxed" /></div>
                <button onClick={handleResolve} disabled={isResolving || !resolveRemarks.trim() || solvingTechs.length === 0} className="w-full bg-slate-950 text-white py-6 rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.4em] shadow-2xl active:scale-[0.98] transition-all disabled:opacity-30 italic flex items-center justify-center gap-4">{isResolving ? <i className="fas fa-circle-notch animate-spin text-teal-400"></i> : <i className="fas fa-check-double text-teal-400"></i>}<span>{isResolving ? 'Synchronizing...' : 'Finalize Task'}</span></button>
             </div>
          </div>
        </div>
      )}

      {takeoverModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-sm rounded-[3rem] p-10 shadow-3xl">
             <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter mb-4">Coverage Authorization</h3>
             <p className="text-[10px] font-bold text-slate-400 uppercase mb-8 italic tracking-widest leading-relaxed">Select acting specialist to bypass lock on Sector {takeoverModal.zoneIdx + 1} ({takeoverModal.originalTech} Absent)</p>
             <div className="space-y-4">
                {activeTechList.filter(t => attendance[t] && t !== takeoverModal.originalTech).map(t => (
                   <button key={t} onClick={() => setActingTechSelection(t)} className={`w-full p-6 rounded-3xl border-2 transition-all text-left group ${actingTechSelection === t ? 'bg-slate-950 border-slate-950 text-white shadow-xl' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-white hover:border-indigo-600'}`}>
                      <span className="text-[10px] font-black uppercase italic tracking-widest">{t}</span>
                   </button>
                ))}
                <div className="grid grid-cols-2 gap-4 mt-8">
                   <button onClick={() => { setTakeoverModal(null); setActingTechSelection(''); }} className="py-4 text-[10px] font-black uppercase text-slate-400 italic">Abort</button>
                   <button onClick={handleTakeover} disabled={!actingTechSelection} className="bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] italic shadow-2xl active:scale-95 transition-all disabled:opacity-30">Authorize</button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TechView;