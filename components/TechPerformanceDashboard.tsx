
import React, { useMemo, useState } from 'react';
import { Ticket, PerformanceLogEntry, ChecklistAuditEntry, StatsResponse, FMCategory } from '../types';
import { TECHNICIAN_SALARIES } from '../constants';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, ComposedChart, Area, Radar, RadarChart, 
  PolarGrid, PolarAngleAxis, PolarRadiusAxis 
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, Users, CheckCircle2, AlertTriangle, Clock, 
  DollarSign, Award, Target, Zap, ShieldCheck 
} from 'lucide-react';

interface TechMetrics {
  name: string;
  category: string;
  tasksCompleted: number;
  avgStar: number;
  totalPoints: number;
  checklistCompliance: number;
  hoursWorked: number;
  occupancyPercent: number;
  financialCost: number;
  slaBreachesMinor: number;
  slaBreachesMajor: number;
  repeatCount: number;
  efficiencyScore: number;
  starCounts: Record<number, number>;
}

interface TechPerformanceDashboardProps {
  category: FMCategory;
  stats: StatsResponse | null;
  onRefresh: () => void;
}

const TechPerformanceDashboard: React.FC<TechPerformanceDashboardProps> = ({ category, stats, onRefresh }) => {
  const [timeFilter, setTimeFilter] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [selectedTech, setSelectedTech] = useState<string | null>(null);

  const metrics = useMemo(() => {
    if (!stats) return [];

    const techs = Array.from(new Set([
      ...stats.complaints.map((t: Ticket) => t.assignedTo),
      ...stats.complaints.map((t: Ticket) => t.resolvedBy),
      ...stats.performanceLogs.map((l: PerformanceLogEntry) => l.tech),
      ...(stats.checklistAudits || []).map((a: ChecklistAuditEntry) => a.technician)
    ])).filter(name => name && name !== 'Unassigned' && name !== 'SYSTEM' && name !== 'Maestro Sync');

    const now = new Date();
    const SHIFT_HOURS = 9;
    const SHIFT_MINS = SHIFT_HOURS * 60;

    const filterDate = (dateStr: string) => {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      if (timeFilter === 'daily') {
        return d.toDateString() === now.toDateString();
      } else if (timeFilter === 'weekly') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return d >= oneWeekAgo;
      } else {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
    };

    const workingDays = timeFilter === 'daily' ? 1 : timeFilter === 'weekly' ? 5 : 22;
    const standardHours = workingDays * 8;

    return techs.map(name => {
      const techTickets = stats.complaints.filter((t: Ticket) => (t.assignedTo === name || t.resolvedBy === name) && filterDate(t.date));
      const resolvedTickets = techTickets.filter((t: Ticket) => ['Resolved', 'Resolved (Admin)', 'Resolved by Technician', 'Resolved – Pending Admin Review', 'Completed'].includes(t.status));
      
      const starRatings = resolvedTickets.map((t: Ticket) => t.starRating).filter((r): r is number => typeof r === 'number' && r > 0);
      const avgStar = starRatings.length > 0 ? starRatings.reduce((a: number, b: number) => a + b, 0) / starRatings.length : 0;
      
      const starCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      starRatings.forEach((r: number) => { if (starCounts[Math.round(r)] !== undefined) starCounts[Math.round(r)]++; });

      const totalPoints = stats.performanceLogs
        .filter((l: PerformanceLogEntry) => l.tech === name && filterDate(l.Timestamp || ''))
        .reduce((sum: number, l: PerformanceLogEntry) => sum + l.points, 0);

      const techAudits = (stats.checklistAudits || []).filter((a: ChecklistAuditEntry) => a.technician === name && filterDate(a.timestamp));
      const checklistCompliance = techAudits.length > 0 
        ? (techAudits.filter((a: ChecklistAuditEntry) => ['OK', 'Resolved', 'Completed'].includes(a.status)).length / techAudits.length) * 100 
        : 0;

      const dailyMinutesMap: Record<string, number> = {};
      let totalUncappedMinutes = 0;

      techTickets.forEach((t: Ticket) => {
        const start = new Date(t.date);
        const end = t.resolvedTimestampFull ? new Date(t.resolvedTimestampFull) : (t.resolvedDate ? new Date(t.resolvedDate) : null);
        
        if (end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
          let duration = (end.getTime() - start.getTime()) / 60000;
          if (duration < 10) duration = 10; // Minimum floor time
          
          // Multi-tech split
          const techNames = String(t.resolvedBy || t.assignedTo || '').split(/[•&,]/).map(s => s.trim()).filter(Boolean);
          const techCount = techNames.length || 1;
          const splitDuration = duration / techCount;

          totalUncappedMinutes += splitDuration;
          
          const resDayKey = end.toDateString();
          dailyMinutesMap[resDayKey] = (dailyMinutesMap[resDayKey] || 0) + splitDuration;
        }
      });

      let hoursWorked = 0;
      Object.values(dailyMinutesMap).forEach(mins => {
        hoursWorked += Math.min(mins, SHIFT_MINS) / 60;
      });

      const slaBreachesMinor = techTickets.filter(t => {
        const start = new Date(t.date);
        const end = t.resolvedTimestampFull ? new Date(t.resolvedTimestampFull) : null;
        if (!end || isNaN(start.getTime()) || isNaN(end.getTime())) return false;
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        return diffHours > 24 && diffHours <= 168;
      }).length;

      const slaBreachesMajor = techTickets.filter(t => {
        const start = new Date(t.date);
        const end = t.resolvedTimestampFull ? new Date(t.resolvedTimestampFull) : null;
        if (!end || isNaN(start.getTime()) || isNaN(end.getTime())) return false;
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        return diffHours > 168;
      }).length;

      const repeatCount = techTickets.reduce((sum, t) => sum + (Math.max(0, (t.repeatCount || 1) - 1)), 0);

      const standardHours = workingDays * SHIFT_HOURS;
      const occupancyPercent = (hoursWorked / standardHours) * 100;
      const salary = TECHNICIAN_SALARIES[name] || 40000;
      const financialCost = (occupancyPercent / 100) * salary;

      // Efficiency Score: (Tasks / Hours) * Rating * Compliance
      const efficiencyScore = hoursWorked > 0 
        ? ((resolvedTickets.length / hoursWorked) * (avgStar || 1) * (checklistCompliance / 100 || 1)) * 10
        : 0;

      return {
        name,
        category: category.name,
        tasksCompleted: resolvedTickets.length,
        avgStar,
        totalPoints,
        checklistCompliance,
        hoursWorked,
        occupancyPercent: Math.min(occupancyPercent, 100),
        financialCost,
        slaBreachesMinor,
        slaBreachesMajor,
        repeatCount,
        efficiencyScore,
        starCounts
      };
    });
  }, [stats, category, timeFilter]);

  const topPerformer = useMemo(() => {
    if (metrics.length === 0) return null;
    return [...metrics].sort((a, b) => b.efficiencyScore - a.efficiencyScore)[0];
  }, [metrics]);

  const summary = useMemo(() => {
    if (metrics.length === 0) return null;
    return {
      totalTasks: metrics.reduce((sum, m) => sum + m.tasksCompleted, 0),
      avgRating: metrics.reduce((sum, m) => sum + m.avgStar, 0) / metrics.length,
      slaCompliance: 100 - (metrics.reduce((sum, m) => sum + m.slaBreachesMinor + m.slaBreachesMajor, 0) / Math.max(1, metrics.reduce((sum, m) => sum + m.tasksCompleted, 0)) * 100),
      avgOccupancy: metrics.reduce((sum, m) => sum + m.occupancyPercent, 0) / metrics.length,
      totalFinancialImpact: metrics.reduce((sum, m) => sum + m.financialCost, 0)
    };
  }, [metrics]);

  const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#64748b', '#ec4899'];

  if (!stats) return (
    <div className="h-96 flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Synchronizing Performance Data...</p>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-10 space-y-10">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.4em] text-indigo-500 italic">Management Intelligence</p>
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase leading-none">Technician Performance Hub</h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
          {(['daily', 'weekly', 'monthly'] as const).map(f => (
            <button 
              key={f} 
              onClick={() => setTimeFilter(f)}
              className={`px-8 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${timeFilter === f ? 'bg-slate-900 text-white shadow-xl scale-105' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Output', value: summary?.totalTasks, icon: Zap, color: 'indigo', sub: 'Tasks Resolved' },
          { label: 'Avg Rating', value: summary?.avgRating.toFixed(1), icon: Award, color: 'amber', sub: 'Customer Satisfaction' },
          { label: 'SLA Integrity', value: `${summary?.slaCompliance.toFixed(1)}%`, icon: ShieldCheck, color: 'emerald', sub: 'On-Time Delivery' },
          { label: 'Financial Impact', value: `Rs. ${summary?.totalFinancialImpact.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: DollarSign, color: 'blue', sub: 'Resource Utilization' }
        ].map((kpi, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={i} 
            className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex justify-between items-start mb-6">
              <div className={`w-12 h-12 bg-${kpi.color}-50 text-${kpi.color}-600 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110`}>
                <kpi.icon size={24} />
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">{kpi.label}</p>
                <p className="text-2xl font-black text-slate-900 tracking-tighter italic">{kpi.value}</p>
              </div>
            </div>
            <p className="text-[9px] font-bold text-slate-400 uppercase italic tracking-wider">{kpi.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Top Performer Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="lg:col-span-4 bg-slate-900 rounded-[3rem] p-10 text-white relative overflow-hidden shadow-2xl"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px]"></div>
          <div className="relative z-10 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-8">
                <Award className="text-amber-400" size={32} />
                <h3 className="text-xs font-black uppercase tracking-[0.4em] italic text-indigo-400">Top Performer</h3>
              </div>
              
              {topPerformer ? (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-4xl font-black italic uppercase tracking-tighter leading-none mb-2">{topPerformer.name}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">{topPerformer.category} Specialist</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/10">
                    <div>
                      <p className="text-[8px] font-black text-slate-500 uppercase italic mb-1">Efficiency Score</p>
                      <p className="text-2xl font-black text-emerald-400 italic">{topPerformer.efficiencyScore.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-500 uppercase italic mb-1">Occupancy</p>
                      <p className="text-2xl font-black text-indigo-400 italic">{topPerformer.occupancyPercent.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 italic">No data available for this period.</p>
              )}
            </div>
            
            <div className="mt-12">
              <button className="w-full bg-white/5 hover:bg-white/10 border border-white/10 py-4 rounded-2xl text-[9px] font-black uppercase tracking-widest italic transition-all">View Full Profile</button>
            </div>
          </div>
        </motion.div>

        {/* Occupancy vs Financial Cost Composed Chart */}
        <div className="lg:col-span-8 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest italic">Resource Utilization Matrix</h3>
              <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 italic">Hours Worked vs Financial Cost vs Tasks</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
                <span className="text-[8px] font-black uppercase text-slate-400">Hours</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span className="text-[8px] font-black uppercase text-slate-400">Cost</span>
              </div>
            </div>
          </div>
          
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#64748b'}} />
                <YAxis yAxisId="left" orientation="left" stroke="#6366f1" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                <YAxis yAxisId="right" orientation="right" stroke="#10b981" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                <Tooltip 
                  contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '20px'}}
                  labelStyle={{fontWeight: 900, marginBottom: '8px', textTransform: 'uppercase', fontSize: '10px'}}
                />
                <Area yAxisId="left" type="monotone" dataKey="hoursWorked" fill="#6366f1" stroke="#6366f1" fillOpacity={0.1} />
                <Bar yAxisId="right" dataKey="financialCost" name="Cost (PKR)" fill="#10b981" radius={[6, 6, 0, 0]} barSize={40} />
                <Line yAxisId="left" type="monotone" dataKey="tasksCompleted" stroke="#f59e0b" strokeWidth={3} dot={{r: 4, fill: '#f59e0b'}} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SLA Breach Aging Stacked Bar */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-10 italic">SLA Integrity Aging</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900}} width={80} />
                <Tooltip 
                  cursor={{fill: 'transparent'}}
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="slaBreachesMinor" name="Minor (>24h)" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="slaBreachesMajor" name="Major (>7d)" stackId="a" fill="#ef4444" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Compliance Radar Chart */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-10 italic">Skill & Compliance Radar</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={metrics}>
                <PolarGrid stroke="#f1f5f9" />
                <PolarAngleAxis dataKey="name" tick={{fontSize: 9, fontWeight: 900}} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Compliance %" dataKey="checklistCompliance" stroke="#6366f1" fill="#6366f1" fillOpacity={0.5} />
                <Radar name="Efficiency" dataKey="efficiencyScore" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                <Tooltip contentStyle={{borderRadius: '16px', border: 'none'}} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rating Distribution Pie */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-10 italic">Service Quality Mix</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={8}
                  dataKey="avgStar"
                  nameKey="name"
                >
                  {metrics.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                />
                <Legend iconType="circle" wrapperStyle={{fontSize: '10px', fontWeight: 900, textTransform: 'uppercase'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Ledger Table */}
      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest italic">Technician Performance Ledger</h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 italic">Comprehensive performance audit trail</p>
          </div>
          <button onClick={onRefresh} className="flex items-center gap-2 text-[9px] font-black text-indigo-600 uppercase italic hover:bg-indigo-50 px-6 py-3 rounded-xl transition-all">
            <Zap size={14} />
            Sync Live Data
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                {['Technician', 'Output', 'Rating', 'Points', 'Compliance', 'Hours', 'Occupancy', 'Financial Cost', 'SLA Status'].map(h => (
                  <th key={h} className="px-8 py-6 text-[8px] font-black text-slate-400 uppercase tracking-widest italic">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <AnimatePresence>
                {metrics.map((m, i) => (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={i} 
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    onClick={() => setSelectedTech(selectedTech === m.name ? null : m.name)}
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${m.efficiencyScore > 50 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {m.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-slate-900 uppercase italic leading-none">{m.name}</p>
                          <p className="text-[7px] font-bold text-slate-400 uppercase mt-1">ID: {m.name.slice(0, 3).toUpperCase()}-2024</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 font-black text-slate-700">{m.tasksCompleted}</td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-amber-500">{m.avgStar.toFixed(1)}</span>
                        <Award size={12} className="text-amber-400" />
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black ${m.totalPoints >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {m.totalPoints > 0 ? '+' : ''}{m.totalPoints}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-indigo-500 h-full" style={{width: `${m.checklistCompliance}%`}}></div>
                        </div>
                        <span className="text-[9px] font-black text-slate-900">{m.checklistCompliance.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 font-black text-slate-700">{m.hoursWorked.toFixed(1)}h</td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${m.occupancyPercent > 80 ? 'bg-emerald-500' : m.occupancyPercent < 40 ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                        <span className="text-[10px] font-black text-slate-900">{m.occupancyPercent.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 font-black text-slate-900">Rs. {m.financialCost.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td className="px-8 py-6">
                      <div className="flex gap-2">
                        {m.slaBreachesMinor + m.slaBreachesMajor === 0 ? (
                          <span className="text-emerald-500 text-[8px] font-black uppercase italic flex items-center gap-1">
                            <ShieldCheck size={12} />
                            Pristine
                          </span>
                        ) : (
                          <div className="flex gap-1">
                            {m.slaBreachesMinor > 0 && <span className="bg-amber-50 text-amber-600 px-2 py-0.5 rounded text-[7px] font-black">MIN: {m.slaBreachesMinor}</span>}
                            {m.slaBreachesMajor > 0 && <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded text-[7px] font-black">MAJ: {m.slaBreachesMajor}</span>}
                          </div>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TechPerformanceDashboard;
