import React, { useState, useMemo, useEffect } from 'react';
import { GlobalStatsResponse, Seat } from '../types';
import { addOccupancy, updateOccupancy, deleteOccupancy } from '../services/api';

interface Props {
  stats: GlobalStatsResponse | null;
  onRefresh: () => void;
}

type SortKey = 'seatCode' | 'roomTag' | 'empName' | 'department' | 'category' | 'status' | 'snapshotDate';

const SeatingView: React.FC<Props> = ({ stats, onRefresh }) => {
  const [selectedSeatingStatus, setSelectedSeatingStatus] = useState<string | null>(null);
  const [filterCampus, setFilterCampus] = useState<string>('All');
  const [filterFloor, setFilterFloor] = useState<string>('All');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: 'asc' | 'desc' }>({ key: 'seatCode', direction: 'asc' });

  // Admin Access State
  const [adminMode, setAdminMode] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingSeat, setEditingSeat] = useState<Seat | null>(null);
  const [formData, setFormData] = useState<Partial<Seat>>({});

  const seating = useMemo(() => stats?.seatingData || [], [stats]);

  const handleAdminToggle = () => {
    if (adminMode) {
      setAdminMode(false);
    } else {
      setShowPinModal(true);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '5566') {
      setAdminMode(true);
      setShowPinModal(false);
      setPinInput('');
    } else {
      alert("AUTHORIZATION FAILURE: Invalid PIN");
      setPinInput('');
    }
  };

  const handleOpenForm = (seat?: Seat) => {
    if (seat) {
      setEditingSeat(seat);
      setFormData({...seat});
    } else {
      setEditingSeat(null);
      setFormData({
        no: seating.length > 0 ? Math.max(...seating.map(s => Number(s.no))) + 1 : 1,
        status: 'Vacant',
        snapshotDate: new Date().toISOString().split('T')[0],
        location: filterCampus !== 'All' ? filterCampus : '',
        campusCode: filterCampus !== 'All' ? filterCampus : '',
        category: filterCategory !== 'All' ? filterCategory : ''
      });
    }
    setShowFormModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingSeat) {
        await updateOccupancy(formData as Seat);
      } else {
        await addOccupancy(formData as Seat);
      }
      onRefresh();
      setShowFormModal(false);
    } catch (err) {
      console.error(err);
      alert("System Sync Failed. Please verify connectivity.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (no: number | string) => {
    if (!window.confirm("CRITICAL: Confirm permanent removal of this seating record from the registry?")) return;
    setIsSubmitting(true);
    try {
      await deleteOccupancy(no);
      onRefresh();
    } catch (err) {
      console.error(err);
      alert("Deletion request rejected by server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filterOptions = useMemo(() => {
    const campuses = new Set<string>(['All']);
    const floors = new Set<string>(['All']);
    const categories = new Set<string>(['All']);
    
    seating.forEach(s => {
      if (s.campusCode) campuses.add(s.campusCode);
      if (s.floorTag) floors.add(s.floorTag);
      if (s.category) categories.add(s.category);
    });

    return {
      campuses: Array.from(campuses).sort(),
      floors: Array.from(floors).sort(),
      categories: Array.from(categories).sort()
    };
  }, [seating]);

  const filteredSeating = useMemo(() => {
    return seating.filter(s => {
      const matchCampus = filterCampus === 'All' || s.campusCode === filterCampus;
      const matchFloor = filterFloor === 'All' || s.floorTag === filterFloor;
      const matchCategory = filterCategory === 'All' || s.category === filterCategory;
      return matchCampus && matchFloor && matchCategory;
    });
  }, [seating, filterCampus, filterFloor, filterCategory]);

  const seatingStats = useMemo(() => {
    const counts = { 'Vacant': 0, 'Occupied': 0, 'Temp Occup': 0, 'OOO': 0 };
    filteredSeating.forEach(s => {
      const status = s.status;
      if (status === 'Vacant') counts.Vacant++;
      else if (status === 'Occupied') counts.Occupied++;
      else if (status === 'Temp Occup' || status?.toLowerCase().includes('progress')) counts['Temp Occup']++;
      else if (status === 'OOO' || status?.toLowerCase().includes('maintenance')) counts['OOO']++;
    });
    const total = filteredSeating.length;
    return { ...counts, total };
  }, [filteredSeating]);

  const detailData = useMemo(() => {
    let data = selectedSeatingStatus 
      ? filteredSeating.filter(s => {
          if (selectedSeatingStatus === 'Temp Occup') return s.status === 'Temp Occup' || s.status?.toLowerCase().includes('progress');
          if (selectedSeatingStatus === 'OOO') return s.status === 'OOO' || s.status?.toLowerCase().includes('maintenance');
          return s.status === selectedSeatingStatus;
        })
      : filteredSeating;

    return [...data].sort((a, b) => {
      const aVal = String(a[sortConfig.key] || '');
      const bVal = String(b[sortConfig.key] || '');
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredSeating, selectedSeatingStatus, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const renderDonut = () => {
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const { Vacant, Occupied, ['Temp Occup']: Temp, OOO, total } = seatingStats;
    if (total === 0) return (
      <div className="w-[240px] h-[240px] flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-full text-slate-300 gap-2">
         <i className="fas fa-database text-2xl"></i>
         <span className="font-black text-[10px] uppercase italic">Registry Empty</span>
      </div>
    );

    let currentOffset = 0;
    const segments = [
      { key: 'Occupied', val: Occupied, color: '#f97316' },
      { key: 'Vacant', val: Vacant, color: '#14b8a6' },
      { key: 'Temp Occup', val: Temp, color: '#a855f7' },
      { key: 'OOO', val: OOO, color: '#94a3b8' }
    ].filter(s => s.val > 0);

    return (
      <svg width="240" height="240" viewBox="0 0 200 200" className="transform rotate-[-90deg]">
        <circle cx="100" cy="100" r={radius} fill="transparent" stroke="#f1f5f9" strokeWidth="20" />
        {segments.map((s) => {
          const dash = (s.val / total) * circumference;
          const strokeOffset = circumference - currentOffset;
          currentOffset += dash;
          return (
            <circle
              key={s.key}
              cx="100"
              cy="100"
              r={radius}
              fill="transparent"
              stroke={s.color}
              strokeWidth="22"
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={strokeOffset}
              className="cursor-pointer transition-all hover:stroke-width-[26] group"
              onClick={() => setSelectedSeatingStatus(selectedSeatingStatus === s.key ? null : s.key)}
            />
          );
        })}
        <circle cx="100" cy="100" r="55" fill="#fff" className="transform rotate-[90deg] origin-center shadow-lg" />
      </svg>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 lg:p-10 space-y-8 animate-fadeIn pb-32">
      {/* Dynamic Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-100">
        <div className="flex items-start gap-4">
          <div className="w-1.5 h-12 bg-teal-600 rounded-full mt-1"></div>
          <div className="relative">
            <h2 className="text-4xl font-black text-slate-950 tracking-tighter uppercase italic leading-none select-none transition-all duration-300">
              Seating Occupancy Control
            </h2>
            <div className="flex items-center gap-3 mt-3">
               <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.5em] italic">Enterprise Capacity Registry</span>
               {adminMode && (
                 <div className="flex items-center gap-2 bg-teal-600 text-white px-3 py-1 rounded-full animate-pulse shadow-lg">
                    <i className="fas fa-lock-open text-[8px]"></i>
                    <span className="text-[7px] font-black uppercase tracking-widest italic">Admin Unlocked</span>
                 </div>
               )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           <button 
             onClick={handleAdminToggle}
             className={`w-14 h-14 rounded-2xl shadow-sm flex items-center justify-center transition-all ${adminMode ? 'bg-teal-600 text-white' : 'bg-white border border-slate-100 text-slate-300 hover:text-teal-600'}`}
             title={adminMode ? "Lock Admin Control" : "Unlock Admin Control"}
           >
              <i className={`fas fa-${adminMode ? 'lock-open' : 'lock'} text-lg`}></i>
           </button>
           {adminMode && (
             <button 
               onClick={() => handleOpenForm()} 
               className="group relative bg-slate-950 text-white pl-6 pr-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 hover:scale-105 active:scale-95 transition-all overflow-hidden"
             >
                <div className="absolute inset-0 bg-teal-600 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                <div className="w-8 h-8 bg-teal-600 rounded-xl flex items-center justify-center text-white shadow-lg group-hover:rotate-90 transition-transform">
                   <i className="fas fa-plus text-xs"></i>
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest italic leading-none">Add Occupancy</p>
                  <p className="text-[6px] font-bold text-white/40 uppercase tracking-[0.2em] mt-1.5 italic">Register New Station</p>
                </div>
             </button>
           )}
           <button 
             onClick={onRefresh} 
             className="w-14 h-14 bg-white border border-slate-100 rounded-2xl shadow-sm flex items-center justify-center text-slate-300 hover:text-teal-600 hover:border-teal-100 transition-all active:rotate-180"
           >
              <i className="fas fa-sync-alt text-lg"></i>
           </button>
        </div>
      </div>

      {/* PIN AUTH MODAL */}
      {showPinModal && (
        <div className="fixed inset-0 bg-slate-950/95 z-[600] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-10 shadow-3xl border border-white/5">
             <div className="text-center mb-8">
                <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                   <i className="fas fa-fingerprint text-3xl"></i>
                </div>
                <h3 className="text-2xl font-black text-slate-950 italic uppercase tracking-tighter">Command Entry</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-3 tracking-widest italic">Authorized PIN Required</p>
             </div>
             <form onSubmit={handlePinSubmit} className="space-y-8">
                <input 
                  type="password" 
                  autoFocus
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] py-5 text-center text-3xl font-black tracking-[0.6em] focus:border-teal-600 outline-none transition-all shadow-inner"
                  placeholder="••••"
                />
                <div className="flex gap-4">
                  <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 italic">Exit</button>
                  <button type="submit" className="flex-1 bg-slate-950 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest italic shadow-2xl">Confirm</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Filter Ribbon */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-wrap items-center gap-6">
         <div className="flex items-center gap-3 px-4 border-r border-slate-100">
            <i className="fas fa-layer-group text-teal-600 text-xs"></i>
            <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest italic">Registry Sorting:</span>
         </div>
         
         <div className="flex-1 flex flex-wrap gap-4">
           {[
             { label: 'Campus', value: filterCampus, setter: setFilterCampus, options: filterOptions.campuses },
             { label: 'Floor', value: filterFloor, setter: setFilterFloor, options: filterOptions.floors },
             { label: 'Category', value: filterCategory, setter: setFilterCategory, options: filterOptions.categories }
           ].map(f => (
             <div key={f.label} className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-100 hover:bg-white hover:border-teal-200 transition-all group">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest group-hover:text-teal-600 italic">{f.label}:</label>
                <select 
                  value={f.value} 
                  onChange={e => f.setter(e.target.value)} 
                  className="bg-transparent text-[9px] font-black outline-none italic uppercase cursor-pointer"
                >
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
             </div>
           ))}
         </div>

         <button 
           onClick={() => { setFilterCampus('All'); setFilterFloor('All'); setFilterCategory('All'); setSelectedSeatingStatus(null); }} 
           className="px-6 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-[8px] font-black uppercase tracking-widest italic hover:bg-rose-600 hover:text-white transition-all active:scale-95"
         >
           Reset Registry
         </button>
      </div>

      {/* Analytics Overview Card */}
      <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.05),transparent_60%)]"></div>
        
        <div className="relative z-10 flex flex-col lg:flex-row items-center gap-20">
          <div className="relative flex-shrink-0 group">
             {renderDonut()}
             <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none group-hover:scale-105 transition-transform duration-500">
                <span className="text-6xl font-black text-slate-950 italic tracking-tighter leading-none">{seatingStats.total}</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-3 italic">Total Units</span>
             </div>
          </div>

          <div className="flex-1 w-full space-y-12">
            <div className="flex items-end justify-between border-b border-slate-50 pb-8">
              <div>
                <h3 className="text-4xl font-black text-slate-950 italic tracking-tighter uppercase leading-none">Utilization Metrics</h3>
                <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.3em] mt-4 italic">Real-time status distribution across facility sectors</p>
              </div>
              <div className="text-right">
                 <div className="flex items-baseline justify-end gap-1">
                    <span className="text-5xl font-black text-slate-950 italic tracking-tighter">
                      {((seatingStats.Occupied / (seatingStats.total || 1)) * 100).toFixed(1)}
                    </span>
                    <span className="text-2xl font-black text-slate-300">%</span>
                 </div>
                 <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-2 italic">Active Occupancy Rate</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {[
                { label: 'Occupied', count: seatingStats.Occupied, color: 'bg-orange-500', text: 'text-orange-600', hover: 'hover:bg-orange-50 hover:border-orange-100' },
                { label: 'Vacant', count: seatingStats.Vacant, color: 'bg-teal-500', text: 'text-teal-600', hover: 'hover:bg-teal-50 hover:border-teal-100' },
                { label: 'Temp Occup', count: seatingStats['Temp Occup'], color: 'bg-purple-500', text: 'text-purple-600', hover: 'hover:bg-purple-50 hover:border-purple-100' },
                { label: 'OOO', count: seatingStats.OOO, color: 'bg-slate-400', text: 'text-slate-500', hover: 'hover:bg-slate-50 hover:border-slate-100' }
              ].map(item => (
                <button 
                  key={item.label} 
                  onClick={() => setSelectedSeatingStatus(selectedSeatingStatus === item.label ? null : item.label)}
                  className={`p-8 rounded-[2.5rem] border transition-all text-left relative overflow-hidden group ${selectedSeatingStatus === item.label ? `border-${item.color.split('-')[1]}-500 bg-${item.color.split('-')[1]}-50 shadow-2xl scale-[1.05]` : `border-slate-50 bg-slate-50/30 ${item.hover} hover:shadow-xl`}`}
                >
                  <div className="flex items-center gap-3 mb-5">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.color} ${selectedSeatingStatus === item.label ? 'animate-pulse' : ''}`}></div>
                    <span className={`text-[10px] font-black uppercase tracking-widest italic ${item.text}`}>{item.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-slate-950 italic leading-none">{item.count}</span>
                    <span className="text-[12px] font-black text-slate-300 italic uppercase">Seats</span>
                  </div>
                  <div className="mt-5 w-full bg-slate-200/50 h-1.5 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} transition-all duration-1000`} style={{ width: `${(item.count / (seatingStats.total || 1)) * 100}%` }}></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Registry Table */}
      <section className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl overflow-hidden animate-slideUp">
        <div className="p-10 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-8 bg-slate-50/30">
           <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-slate-950 text-white rounded-2xl flex items-center justify-center text-xl shadow-xl">
                 <i className="fas fa-list-ul"></i>
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-950 italic tracking-tighter uppercase leading-none">Inventory Control Detail</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-3 italic">
                   {selectedSeatingStatus ? `Registry Segment: ${selectedSeatingStatus}` : 'Complete Facility Inventory Stream'} • {detailData.length} records synchronized
                </p>
              </div>
           </div>
           <div className="flex flex-col items-end gap-2">
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">Sorted Registry By {sortConfig.key}</span>
              {adminMode && <div className="text-[8px] font-black text-teal-600 uppercase tracking-widest animate-pulse italic bg-teal-50 px-4 py-1.5 rounded-full border border-teal-100">CRUD Operations Unlocked</div>}
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead>
              <tr className="bg-slate-950 text-white">
                {[
                  { key: 'seatCode', label: 'Seat Code', icon: 'hashtag' },
                  { key: 'roomTag', label: 'Room Tag', icon: 'door-open' },
                  { key: 'empName', label: 'Employee Registry', icon: 'user' },
                  { key: 'department', label: 'Departmental Unit', icon: 'sitemap' },
                  { key: 'category', label: 'Station Category', icon: 'tag' },
                  { key: 'status', label: 'System Status', icon: 'signal' },
                  { key: 'snapshotDate', label: 'Registry Date', icon: 'calendar-alt' }
                ].map(col => (
                  <th 
                    key={col.key} 
                    onClick={() => requestSort(col.key as SortKey)} 
                    className="py-8 px-8 text-[10px] font-black uppercase tracking-widest italic cursor-pointer hover:bg-slate-900 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-4">
                       <div className="flex items-center gap-2">
                         <i className={`fas fa-${col.icon} opacity-30 group-hover:opacity-100 transition-opacity`}></i>
                         <span>{col.label}</span>
                       </div>
                       <i className={`fas fa-${sortConfig.key === col.key ? (sortConfig.direction === 'asc' ? 'sort-up' : 'sort-down') : 'sort'} text-[12px] ${sortConfig.key === col.key ? 'text-teal-400' : 'opacity-10'} group-hover:opacity-40`}></i>
                    </div>
                  </th>
                ))}
                {adminMode && <th className="py-8 px-8 text-[10px] font-black uppercase tracking-widest italic text-center">Protocol Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detailData.map((seat, idx) => (
                <tr key={idx} className="hover:bg-teal-50/40 transition-all duration-300 group">
                  <td className="py-6 px-8">
                     <span className="bg-slate-100 text-slate-950 text-[11px] font-black px-4 py-2 rounded-xl italic group-hover:bg-slate-950 group-hover:text-white transition-all shadow-sm">
                        {seat.seatCode}
                     </span>
                  </td>
                  <td className="py-6 px-8 text-[11px] font-bold text-slate-400 italic">{seat.roomTag}</td>
                  <td className="py-6 px-8">
                    <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-slate-50 text-slate-300 rounded-xl flex items-center justify-center font-black group-hover:bg-white group-hover:text-teal-600 transition-all">
                          {seat.empName?.[0] || '—'}
                       </div>
                       <div>
                          <p className="text-[13px] font-black text-slate-950 italic leading-none">{seat.empName || 'VACANT STATION'}</p>
                          <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mt-1.5 italic">{seat.empCode || 'REGISTRY_OPEN'}</p>
                       </div>
                    </div>
                  </td>
                  <td className="py-6 px-8 text-[11px] font-bold text-slate-500 italic uppercase tracking-wider">{seat.department}</td>
                  <td className="py-6 px-8">
                     <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-teal-600 rounded-full"></div>
                        <span className="text-[9px] font-black text-slate-950 uppercase tracking-widest italic">{seat.category}</span>
                     </div>
                  </td>
                  <td className="py-6 px-8">
                     <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${
                          seat.status === 'Vacant' ? 'bg-teal-500' :
                          seat.status === 'Occupied' ? 'bg-orange-500' :
                          (seat.status === 'Temp Occup' || seat.status?.toLowerCase().includes('progress')) ? 'bg-purple-500' :
                          'bg-slate-400'
                        }`}></div>
                        <span className={`text-[10px] font-black uppercase italic ${
                          seat.status === 'Vacant' ? 'text-teal-600' :
                          seat.status === 'Occupied' ? 'text-orange-600' :
                          (seat.status === 'Temp Occup' || seat.status?.toLowerCase().includes('progress')) ? 'text-purple-600' :
                          'text-slate-400'
                        }`}>
                          {seat.status}
                        </span>
                     </div>
                  </td>
                  <td className="py-6 px-8 text-[11px] font-bold text-slate-300 italic">{seat.snapshotDate}</td>
                  {adminMode && (
                    <td className="py-6 px-8 text-center">
                       <div className="flex items-center justify-center gap-3">
                          <button 
                            onClick={() => handleOpenForm(seat)} 
                            className="w-11 h-11 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-950 hover:text-white transition-all shadow-inner active:scale-90"
                            title="Edit Record"
                          >
                             <i className="fas fa-pencil-alt text-xs"></i>
                          </button>
                          <button 
                            onClick={() => handleDelete(seat.no)} 
                            className="w-11 h-11 bg-rose-50 text-rose-300 rounded-2xl hover:bg-rose-600 hover:text-white transition-all shadow-inner active:scale-90"
                            title="Delete Record"
                          >
                             <i className="fas fa-trash-alt text-xs"></i>
                          </button>
                       </div>
                    </td>
                  )}
                </tr>
              ))}
              {detailData.length === 0 && (
                <tr>
                  <td colSpan={adminMode ? 8 : 7} className="py-32 text-center bg-slate-50/30">
                    <div className="flex flex-col items-center opacity-10">
                       <i className="fas fa-search-minus text-8xl mb-8"></i>
                       <p className="text-xl font-black uppercase tracking-[0.5em] italic">No Matching Records Found</p>
                       <p className="text-[10px] font-bold uppercase mt-4 tracking-widest">Update filters to synchronize registry view</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Form Modal for CRUD Operations */}
      {showFormModal && (
        <div className="fixed inset-0 bg-slate-950/98 z-[500] flex items-center justify-center p-6 backdrop-blur-3xl animate-fadeIn">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] p-12 shadow-2xl border border-white/10 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-teal-600/5 blur-[80px]"></div>
             
             <div className="flex justify-between items-center mb-12 relative z-10">
               <div>
                 <h3 className="text-4xl font-black text-slate-950 leading-none italic uppercase tracking-tighter">
                   {editingSeat ? 'Modify Record' : 'Registry Entry'}
                 </h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase mt-4 tracking-[0.4em] italic">Authorized Inventory Synchronizer</p>
               </div>
               <button 
                 onClick={() => setShowFormModal(false)} 
                 className="w-14 h-14 bg-slate-50 rounded-2xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all flex items-center justify-center"
               >
                  <i className="fas fa-times text-2xl"></i>
               </button>
             </div>
             
             <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  {[
                    { key: 'seatCode', label: 'Seat Code', required: true },
                    { key: 'roomTag', label: 'Room Tag', required: true },
                    { key: 'stationTag', label: 'Station Tag', required: true },
                    { key: 'empName', label: 'Employee Name', required: false },
                    { key: 'empCode', label: 'Employee Code', required: false },
                    { key: 'department', label: 'Department Unit', required: true },
                    { key: 'category', label: 'Station Category', required: true },
                    { key: 'location', label: 'Campus/Site', required: true },
                    { key: 'campusCode', label: 'Building Code', required: true },
                  ].map(field => (
                    <div key={field.key} className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 focus-within:border-teal-600 transition-all">
                      <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-2 italic">{field.label}</label>
                      <input 
                        type="text" 
                        required={field.required}
                        placeholder={`Enter ${field.label}...`}
                        value={(formData as any)[field.key] || ''} 
                        onChange={e => setFormData({...formData, [field.key]: e.target.value})}
                        className="w-full bg-transparent font-black text-[12px] outline-none italic uppercase text-slate-950 placeholder:text-slate-200" 
                      />
                    </div>
                  ))}
                  <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 focus-within:border-teal-600 transition-all">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-3 ml-2 italic">Unit Status</label>
                    <select 
                      value={formData.status || 'Vacant'} 
                      onChange={e => setFormData({...formData, status: e.target.value})}
                      className="w-full bg-transparent font-black text-[12px] outline-none italic uppercase text-slate-950 cursor-pointer"
                    >
                      {['Vacant', 'Occupied', 'Temp Occup', 'OOO'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="group w-full bg-slate-950 text-white py-8 rounded-[2rem] font-black uppercase text-[12px] tracking-[0.5em] shadow-2xl active:scale-[0.98] transition-all disabled:opacity-30 italic flex items-center justify-center gap-4"
                >
                  {isSubmitting ? (
                    <>
                      <i className="fas fa-circle-notch animate-spin text-teal-400"></i>
                      <span>Synchronizing Registry...</span>
                    </>
                  ) : (
                    <>
                      <i className={`fas fa-${editingSeat ? 'sync-alt' : 'cloud-upload-alt'} text-teal-400 group-hover:rotate-12 transition-transform`}></i>
                      <span>{editingSeat ? 'Confirm Modification' : 'Authorize New Registry Entry'}</span>
                    </>
                  )}
                </button>
             </form>
          </div>
        </div>
      )}

      {/* Footer System Info */}
      <div className="pt-16 border-t border-slate-100 flex flex-col items-center gap-4 opacity-30">
         <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.8em] italic">Authorized Command Center View • End-to-End Encryption • v1.4.2 Registry</p>
         <div className="flex items-center gap-8">
            <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest italic">Latency: 14ms</span>
            <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest italic">Sync: High Priority</span>
            <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest italic">Session: Secure</span>
         </div>
      </div>
    </div>
  );
};

export default SeatingView;
