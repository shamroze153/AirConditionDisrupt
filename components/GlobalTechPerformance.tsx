
import React, { useMemo, useState } from 'react';
import { Ticket, GlobalStatsResponse } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, CheckCircle2, Clock, 
  Target, Zap, Filter, Calendar, Activity, PieChart as PieIcon,
  ArrowLeft, Award
} from 'lucide-react';

interface TechMetrics {
  name: string;
  tasksTackled: number;
  totalResolved: number;
  dailyHours: number;
  weeklyHours: number;
  monthlyHours: number;
  dailyOccupancy: number;
  weeklyOccupancy: number;
  monthlyOccupancy: number;
  avgResolutionTime: number; // in minutes
  avgRating: number;
  categorySplit: { name: string, value: number }[];
  dailyTrend: { date: string, hours: number, occupancy: number }[];
}

interface Props {
  stats: GlobalStatsResponse | null;
}

const HARD_FM_TECHS = [
  'Bilal', 'Asad', 'Saboor', 'Taimoor', // AC
  'Ibraheem', 'Naveed Ali', 'Haris', 'Owais', // Electrical
  'Sajid' // Handyman
];

const SHIFT_HOURS = 9;
const SHIFT_MINS = SHIFT_HOURS * 60; // 540 minutes

const parseHubDate = (str: any): Date | null => {
  if (!str) return null;
  if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
  const s = String(str).trim();
  if (!s) return null;

  // Try standard parsing
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // Handle DD/MM/YYYY HH:mm:ss (Common in Google Sheets)
  const parts = s.split(/[\/\s,:]+/);
  if (parts.length >= 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    const hour = parts[3] ? parseInt(parts[3]) : 0;
    const min = parts[4] ? parseInt(parts[4]) : 0;
    const sec = parts[5] ? parseInt(parts[5]) : 0;
    
    if (day > 0 && day <= 31 && month >= 0 && month < 12 && year > 2000) {
      d = new Date(year, month, day, hour, min, sec);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
};

const isWorkingDay = (date: Date) => {
  const day = date.getDay();
  if (day === 0) return false; // Sunday
  if (day >= 1 && day <= 5) return true; // Mon-Fri
  if (day === 6) {
    // Alternate Saturdays: Even weeks of the year
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const weekNum = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
    return weekNum % 2 === 0;
  }
  return false;
};

const getWorkingDaysInMonth = (year: number, month: number) => {
  let count = 0;
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    if (isWorkingDay(date)) count++;
    date.setDate(date.getDate() + 1);
  }
  return count;
};

const getWorkingDaysInWeek = (date: Date) => {
  let count = 0;
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(d.setDate(diff));
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    if (isWorkingDay(cur)) count++;
  }
  return count;
};

const parseTechNames = (str: string) => {
  if (!str) return [];
  // Handle "Name1 & Name2", "Name1 / Name2", "Name1, Name2", "Name1 and Name2"
  return str.split(/[&/,]|\band\b/i).map(s => s.trim()).filter(Boolean);
};

const GlobalTechPerformance: React.FC<Props> = ({ stats }) => {
  const [selectedTech, setSelectedTech] = useState<string | null>(null);

  const statsData = useMemo(() => {
    if (!stats) return null;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Weekly range (Mon-Sun)
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diff);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Deduplicate tickets and filter out invalid rows
    const seenTimestamps = new Set();
    const uniqueTickets = (stats.allTickets || []).filter(t => {
      if (!t.date) return false;
      const ts = String(t.date).trim();
      if (seenTimestamps.has(ts)) return false;
      seenTimestamps.add(ts);
      return true;
    });

    // Global Resolved Count
    const globalResolvedTickets = uniqueTickets.filter(t => {
      const status = String(t.status || '').toLowerCase();
      const resolvedBy = String(t.resolvedBy || '').trim();
      return status.includes('resolved') || status.includes('completed') || resolvedBy !== '';
    });

    const metrics = HARD_FM_TECHS.map(name => {
      const lowerName = name.toLowerCase();
      
      // 4. ASSIGNED VS RESOLVED
      const tackledTickets = uniqueTickets.filter(t => 
        parseTechNames(String(t.assignedTo || '')).some(s => s.toLowerCase() === lowerName)
      );

      const resolvedTickets = uniqueTickets.filter(t => {
        const resolvedBy = String(t.resolvedBy || '').trim();
        const status = String(t.status || '').toLowerCase();
        const isResolvedByThem = parseTechNames(resolvedBy).some(s => s.toLowerCase() === lowerName);
        // 2. RESOLVED LOGIC
        const isCompleted = status.includes('resolved') || status.includes('completed') || resolvedBy !== '';
        return isResolvedByThem && isCompleted;
      });

      let dailyMinutes = 0;
      let weeklyMinutes = 0;
      let monthlyMinutes = 0;
      let totalUncappedMinutes = 0;

      const dailyMinutesMap: Record<string, number> = {};

      resolvedTickets.forEach(t => {
        const start = parseHubDate(t.date);
        const end = parseHubDate(t.resolvedTimestampFull || t.resolvedDate || '');

        if (start && end) {
          // 2. CALCULATE TASK DURATION
          let duration = (end.getTime() - start.getTime()) / 60000;
          if (duration < 10) duration = 10; // Minimum floor time
          
          const techNames = parseTechNames(String(t.resolvedBy || ''));
          const techCount = techNames.length || 1;
          const splitDuration = duration / techCount;

          // For Average Time calculation (Uncapped but split)
          totalUncappedMinutes += splitDuration;
          
          // 3. DAILY OCCUPANCY HOURS (Attributing to resolution day)
          const resDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
          const resDayKey = resDay.toDateString();
          dailyMinutesMap[resDayKey] = (dailyMinutesMap[resDayKey] || 0) + splitDuration;
        }
      });

      // 3 & 4. SUM DAILY HOURS & APPLY CAPS
      const dailyTrendMap: Record<string, number> = {};
      Object.entries(dailyMinutesMap).forEach(([dateKey, mins]) => {
        const date = new Date(dateKey);
        // Cap daily hours at 9 hours per shift
        const cappedMins = Math.min(mins, SHIFT_MINS);
        
        const dateTs = date.getTime();
        if (dateTs === startOfToday.getTime()) dailyMinutes = cappedMins;
        if (dateTs >= startOfWeek.getTime()) weeklyMinutes += cappedMins;
        if (dateTs >= startOfMonth.getTime()) monthlyMinutes += cappedMins;

        dailyTrendMap[dateKey] = cappedMins;
      });

      const dailyHours = dailyMinutes / 60;
      const weeklyHours = weeklyMinutes / 60;
      const monthlyHours = monthlyMinutes / 60;

      // 3. DAILY OCCUPANCY %
      const dailyOcc = Math.min((dailyHours / SHIFT_HOURS) * 100, 100);
      
      // 4. WEEKLY / MONTHLY OCCUPANCY %
      const weeklyCapacity = getWorkingDaysInWeek(now) * SHIFT_HOURS;
      const weeklyOcc = Math.min((weeklyHours / weeklyCapacity) * 100, 100);
      
      const monthlyCapacity = getWorkingDaysInMonth(now.getFullYear(), now.getMonth()) * SHIFT_HOURS;
      const monthlyOcc = Math.min((monthlyHours / monthlyCapacity) * 100, 100);

      // 5. AVERAGE TIME PER COMPLAINT (Realistic work done)
      const avgResolutionTime = resolvedTickets.length > 0 ? Math.round(totalUncappedMinutes / resolvedTickets.length) : 0;

      const starRatings = resolvedTickets.map(t => t.starRating).filter((r): r is number => typeof r === 'number' && r > 0);
      const avgRating = starRatings.length > 0 ? starRatings.reduce((a, b) => a + b, 0) / starRatings.length : 0;

      const categorySplit = [
        { name: 'AC', value: resolvedTickets.filter(t => ['AC', 'HVAC'].includes(String(t.category).toUpperCase())).length },
        { name: 'Electrical', value: resolvedTickets.filter(t => ['ELECTRICAL', 'ELECTRIC'].includes(String(t.category).toUpperCase())).length },
        { name: 'Handyman', value: resolvedTickets.filter(t => ['HANDYMAN', 'GM', 'GENERAL MAINTENANCE', 'GENERAL MAINTENANCE (GM)', 'GENERAL-MAINTENANCE', 'PLUMBING'].includes(String(t.category).toUpperCase())).length },
      ].filter(d => d.value > 0);

      const dailyTrend = Object.entries(dailyTrendMap).map(([date, mins]) => ({
        date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        hours: Number((mins / 60).toFixed(1)),
        occupancy: Number(((mins / SHIFT_MINS) * 100).toFixed(1))
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-15);

      return {
        name,
        tasksTackled: tackledTickets.length,
        totalResolved: resolvedTickets.length,
        dailyHours: Number(dailyHours.toFixed(1)),
        weeklyHours: Number(weeklyHours.toFixed(1)),
        monthlyHours: Number(monthlyHours.toFixed(1)),
        dailyOccupancy: Number(dailyOcc.toFixed(1)),
        weeklyOccupancy: Number(weeklyOcc.toFixed(1)),
        monthlyOccupancy: Number(monthlyOcc.toFixed(1)),
        avgResolutionTime,
        avgRating,
        categorySplit,
        dailyTrend
      };
    });

    const globalLaunched = uniqueTickets.length;
    const globalResolved = globalResolvedTickets.length;
    const avgOcc = metrics.reduce((a, b) => a + b.monthlyOccupancy, 0) / (metrics.length || 1);

    return {
      metrics,
      globalLaunched,
      globalResolved,
      avgOcc
    };
  }, [stats]);

  const metrics = statsData?.metrics || [];
  const activeTech = selectedTech ? metrics.find(m => m.name === selectedTech) : null;

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#64748b'];

  return (
    <div className="space-y-8 p-4 lg:p-8 bg-slate-50/50 min-h-screen font-sans">
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Activity size={28} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Hard FM Performance</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Real-Time Occupancy & Resolution Audit</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
              <Filter size={14} />
            </div>
            <select 
              value={selectedTech || 'ALL'}
              onChange={(e) => setSelectedTech(e.target.value === 'ALL' ? null : e.target.value)}
              className="bg-slate-50 border border-slate-200 pl-10 pr-8 py-3 rounded-2xl text-[11px] font-black uppercase outline-none italic transition-all focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
            >
              <option value="ALL">Team Overview</option>
              {HARD_FM_TECHS.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!selectedTech ? (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Team Overview KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { label: 'Total Launched', value: statsData?.globalLaunched || 0, icon: Zap, color: 'blue' },
                { label: 'Total Resolved', value: statsData?.globalResolved || 0, icon: CheckCircle2, color: 'emerald' },
                { label: 'Avg Occupancy %', value: `${(statsData?.avgOcc || 0).toFixed(1)}%`, icon: TrendingUp, color: 'indigo' }
              ].map((kpi, i) => (
                <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center gap-6 group hover:border-indigo-200 transition-all">
                  <div className={`w-16 h-16 bg-${kpi.color}-50 text-${kpi.color}-600 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform`}>
                    <kpi.icon size={28} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic mb-1">{kpi.label}</p>
                    <p className="text-2xl font-black text-slate-900 tracking-tighter italic">{kpi.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Technician Table */}
            <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-10 border-b border-slate-100 bg-slate-50/30">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest italic">Technician Performance Ledger</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      {['Technician', 'Assigned', 'Resolved', 'Daily Hours', 'Weekly Hours', 'Monthly Hours', 'Daily %', 'Weekly %', 'Monthly %', 'Avg Time'].map(h => (
                        <th key={h} className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest italic whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.map((m, i) => (
                      <tr key={i} className="hover:bg-slate-50/80 transition-colors cursor-pointer group" onClick={() => setSelectedTech(m.name)}>
                        <td className="px-8 py-5">
                          <p className="text-[12px] font-black text-slate-900 uppercase italic group-hover:text-indigo-600 transition-colors">{m.name}</p>
                        </td>
                        <td className="px-8 py-5 font-black text-slate-600">{m.tasksTackled}</td>
                        <td className="px-8 py-5 font-black text-emerald-600">{m.totalResolved}</td>
                        <td className="px-8 py-5 font-black text-slate-900">{m.dailyHours}h</td>
                        <td className="px-8 py-5 font-black text-slate-900">{m.weeklyHours}h</td>
                        <td className="px-8 py-5 font-black text-slate-900">{m.monthlyHours}h</td>
                        <td className="px-8 py-5 font-black text-indigo-600">{m.dailyOccupancy}%</td>
                        <td className="px-8 py-5 font-black text-indigo-600">{m.weeklyOccupancy}%</td>
                        <td className="px-8 py-5 font-black text-indigo-600">{m.monthlyOccupancy}%</td>
                        <td className="px-8 py-5 font-black text-amber-600">{m.avgResolutionTime}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="individual"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            {/* Individual KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              {[
                { label: 'Daily Occupancy', value: `${activeTech?.dailyHours}h (${activeTech?.dailyOccupancy}%)`, icon: Clock, color: 'indigo' },
                { label: 'Weekly Occupancy', value: `${activeTech?.weeklyHours}h (${activeTech?.weeklyOccupancy}%)`, icon: Clock, color: 'indigo' },
                { label: 'Monthly Occupancy', value: `${activeTech?.monthlyHours}h (${activeTech?.monthlyOccupancy}%)`, icon: Clock, color: 'indigo' },
                { label: 'Avg Time per Ticket', value: `${activeTech?.avgResolutionTime}m`, icon: Zap, color: 'amber' },
                { label: 'Avg Rating', value: activeTech?.avgRating.toFixed(1), icon: Award, color: 'emerald' }
              ].map((kpi, i) => (
                <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center gap-6">
                  <div className={`w-16 h-16 bg-${kpi.color}-50 text-${kpi.color}-600 rounded-2xl flex items-center justify-center`}>
                    <kpi.icon size={28} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic mb-1">{kpi.label}</p>
                    <p className="text-2xl font-black text-slate-900 tracking-tighter italic">{kpi.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Daily Occupancy Graph */}
              <div className="lg:col-span-8 bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-10">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest italic">Daily Occupancy Trend (%)</h3>
                  <Calendar size={16} className="text-slate-300" />
                </div>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activeTech?.dailyTrend}>
                      <defs>
                        <linearGradient id="colorOcc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#64748b'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                      <Tooltip 
                        contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                        itemStyle={{fontSize: '11px', fontWeight: 900, textTransform: 'uppercase'}}
                      />
                      <Area type="monotone" dataKey="occupancy" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorOcc)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Category Split */}
              <div className="lg:col-span-4 bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-10">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest italic">Category Split</h3>
                  <PieIcon size={16} className="text-slate-300" />
                </div>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={activeTech?.categorySplit}
                        cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={8} dataKey="value" nameKey="name"
                      >
                        {activeTech?.categorySplit.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} />
                      <Legend verticalAlign="bottom" wrapperStyle={{fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', paddingTop: '20px'}} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setSelectedTech(null)}
              className="flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest italic hover:bg-indigo-600 transition-all shadow-lg shadow-slate-200 group"
            >
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
              Back to Team Overview
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GlobalTechPerformance;
