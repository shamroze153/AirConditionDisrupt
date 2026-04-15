
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Star, Clock, UserCheck, MessageSquare, ArrowLeft, Save, TrendingUp, Award, User, Bike, Car, CheckCircle2, XCircle, Calculator, Trophy, Medal, BarChart3, Search, Activity, ShieldCheck, Zap } from 'lucide-react';
import { SoftFMEvaluation, SoftFMStaff, ValetLogEntry } from '../types';
import { submitSoftFMEvaluation, submitSecurityEvaluation, fetchSoftFMEvaluations, fetchSecurityEvaluations, fetchValetData } from '../services/api';
import { SOFT_FM_STAFF } from '../constants';

interface SoftFMViewProps {
  onBack: () => void;
  isAdmin: boolean;
  type: 'soft-fm' | 'security';
}

const SOFT_FM_CATEGORIES = ['Valet', 'Office Boy', 'Rider', 'Receptionist', 'Janitorial'];
const SECURITY_CATEGORIES = ['Gate keeper', 'Security Supervisor', 'Paramedic Staff'];

const StarRating: React.FC<{ value: number, onChange: (val: number) => void, label: string }> = ({ value, onChange, label }) => (
  <div className="space-y-3">
    <label className="block text-sm font-bold text-gray-700 leading-tight">{label}</label>
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`p-1.5 rounded-lg transition-all ${star <= value ? 'text-amber-400 bg-amber-50' : 'text-gray-200 hover:bg-gray-50'}`}
        >
          <Star size={28} fill={star <= value ? 'currentColor' : 'none'} strokeWidth={2.5} />
        </button>
      ))}
      <span className="ml-2 text-lg font-black text-gray-400 self-center">{value}/5</span>
    </div>
  </div>
);

export const SoftFMView: React.FC<SoftFMViewProps> = ({ onBack, isAdmin, type }) => {
  const [view, setView] = useState<'dashboard' | 'categories' | 'staff' | 'sub-category' | 'form' | 'self-view'>(type === 'security' ? 'dashboard' : 'categories');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<'Parking' | 'Office' | null>(null);
  
  const categories = type === 'soft-fm' ? SOFT_FM_CATEGORIES : SECURITY_CATEGORIES;
  const [selectedStaff, setSelectedStaff] = useState<SoftFMStaff | null>(null);
  const [evaluations, setEvaluations] = useState<SoftFMEvaluation[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [selfEval, setSelfEval] = useState<SoftFMEvaluation | null>(null);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [valetLogs, setValetLogs] = useState<ValetLogEntry[]>([]);

  const [formData, setFormData] = useState({
    attendance: 10,
    punctuality: 10,
    behavior: 10,
    performance: 10,
    manualAdjustment: 0,
    workingDays: 1,
    remarks: '',
    // Security specific KPIs (1-5 stars)
    accessControl: 5,
    visitorManagement: 5,
    materialMovement: 5,
    securityAwareness: 5,
    discipline: 5,
    communication: 5,
    // Security Supervisor KPIs
    teamManagement: 5,
    inspection: 5,
    incidentHandling: 5,
    reporting: 5,
    weaponHandling: 5,
    training: 5,
    fleetHandling: 5,
    liaison: 5,
    riskIdentification: 5,
    // Paramedic KPIs
    emergencyResponse: 5,
    firstAidCases: 5,
    equipmentReadiness: 5,
    medicineControl: 5,
    healthMonitoring: 5,
    hygieneClinic: 5
  });

  useEffect(() => {
    loadEvaluations();
  }, []);

  const loadEvaluations = async () => {
    try {
      setLoading(true);
      const [evalDataResult, valetDataResult] = await Promise.allSettled([
        type === 'security' ? fetchSecurityEvaluations() : fetchSoftFMEvaluations(),
        fetchValetData()
      ]);
      
      if (evalDataResult.status === 'fulfilled') {
        setEvaluations(evalDataResult.value);
      } else {
        console.warn('Failed to load Soft FM evaluations:', evalDataResult.reason);
        setEvaluations([]);
      }

      if (valetDataResult.status === 'fulfilled') {
        setValetLogs(valetDataResult.value);
      } else {
        console.warn('Failed to load Valet logs:', valetDataResult.reason);
        setValetLogs([]);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
    setView('staff');
  };

  const handleStaffSelect = (staff: SoftFMStaff) => {
    setSelectedStaff(staff);
    if (selectedCategory === 'Gate keeper') {
      setView('sub-category');
    } else {
      setView('form');
    }
  };

  const toggleAttendance = (code: string) => {
    setAttendance(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  const calculateValetPoints = (staffName: string) => {
    if (selectedCategory !== 'Valet') return 0;
    
    // Simple name matching (case insensitive, partial)
    const normalizedSearch = staffName.toLowerCase();
    
    // Filter logs for today or current period? User said "each day"
    // Let's look at logs from the last 7 days for a "Weekly" view, 
    // but maybe just today for a daily log.
    // For now, let's sum up all logs where this person was driverIn or driverOut
    // but filter by date if we want to be precise.
    const today = new Date().toISOString().split('T')[0];
    
    const activity = valetLogs.filter(log => {
      const logDate = typeof log.date === 'string' ? log.date.split('T')[0] : '';
      const isToday = logDate === today;
      if (!isToday) return false;

      const dIn = String(log.driverIn || '').toLowerCase();
      const dOut = String(log.driverOut || '').toLowerCase();
      
      // Partial match to handle "Farooq Hussain" vs "Farooq"
      return dIn.includes(normalizedSearch) || dOut.includes(normalizedSearch) || 
             normalizedSearch.includes(dIn && dIn.length > 2 ? dIn : '____') || 
             normalizedSearch.includes(dOut && dOut.length > 2 ? dOut : '____');
    });

    return activity.length * 10;
  };

  const calculateScores = () => {
    let supervisorScore = 0;
    
    if (type === 'security') {
      // 1 star = 2 points, 5 stars = 10 points
      const getPoints = (stars: number) => stars * 2;

      if (selectedCategory === 'Gate keeper') {
        supervisorScore = getPoints((formData.attendance + formData.punctuality) / 2);
        supervisorScore += getPoints(formData.accessControl);
        supervisorScore += getPoints(formData.visitorManagement);
        supervisorScore += getPoints(formData.materialMovement);
        supervisorScore += getPoints(formData.securityAwareness);
        supervisorScore += getPoints(formData.performance);
        supervisorScore += getPoints(formData.discipline);
        supervisorScore += getPoints(formData.communication);
      } else if (selectedCategory === 'Security Supervisor') {
        supervisorScore = getPoints(formData.attendance);
        supervisorScore += getPoints(formData.teamManagement);
        supervisorScore += getPoints(formData.inspection);
        supervisorScore += getPoints(formData.incidentHandling);
        supervisorScore += getPoints(formData.reporting);
        supervisorScore += getPoints(formData.weaponHandling);
        supervisorScore += getPoints(formData.training);
        supervisorScore += getPoints(formData.fleetHandling);
        supervisorScore += getPoints(formData.liaison);
        supervisorScore += getPoints(formData.riskIdentification);
      } else if (selectedCategory === 'Paramedic Staff') {
        supervisorScore = getPoints(formData.attendance);
        supervisorScore += getPoints(formData.punctuality);
        supervisorScore += getPoints(formData.emergencyResponse);
        supervisorScore += getPoints(formData.firstAidCases);
        supervisorScore += getPoints(formData.equipmentReadiness);
        supervisorScore += getPoints(formData.medicineControl);
        supervisorScore += getPoints(formData.healthMonitoring);
        supervisorScore += getPoints(formData.training);
        supervisorScore += getPoints(formData.reporting);
        supervisorScore += getPoints(formData.hygieneClinic);
      }
    } else {
      supervisorScore = formData.attendance + formData.punctuality + formData.behavior + formData.performance;
    }

    const valetPoints = selectedStaff ? calculateValetPoints(selectedStaff.name) : 0;
    const autoDailyScore = (10 * formData.workingDays); 
    const finalScore = supervisorScore + autoDailyScore + formData.manualAdjustment;
    return { supervisorScore, autoDailyScore, valetPoints, finalScore };
  };

  const handleSubmit = async () => {
    if (!selectedStaff || !selectedCategory) return;
    
    try {
      setSubmitting(true);
      const { supervisorScore, autoDailyScore, valetPoints, finalScore } = calculateScores();
      
      let finalRemarks = formData.remarks;
      if (formData.manualAdjustment !== 0) {
        finalRemarks = `[Manual Adjustment: ${formData.manualAdjustment > 0 ? '+' : ''}${formData.manualAdjustment}] ${finalRemarks}`;
      }
      if (valetPoints > 0) {
        finalRemarks = `[Valet Auto Points: +${valetPoints}] ${finalRemarks}`;
      }
      if (selectedSubCategory) {
        finalRemarks = `[Assignment: ${selectedSubCategory}] ${finalRemarks}`;
      }

      const newEval: Omit<SoftFMEvaluation, 'timestamp'> = {
        week: `Log ${new Date().toLocaleDateString()}`,
        name: selectedStaff.name,
        department: selectedCategory,
        subCategory: selectedSubCategory || undefined,
        attendance: formData.attendance,
        punctuality: formData.punctuality,
        behavior: formData.behavior,
        performance: formData.performance,
        supervisorScore,
        autoDailyScore,
        finalScore,
        remarks: finalRemarks,
        accessControl: formData.accessControl,
        visitorManagement: formData.visitorManagement,
        materialMovement: formData.materialMovement,
        securityAwareness: formData.securityAwareness,
        discipline: formData.discipline,
        communication: formData.communication,
        teamManagement: formData.teamManagement,
        inspection: formData.inspection,
        incidentHandling: formData.incidentHandling,
        reporting: formData.reporting,
        weaponHandling: formData.weaponHandling,
        training: formData.training,
        fleetHandling: formData.fleetHandling,
        liaison: formData.liaison,
        riskIdentification: formData.riskIdentification,
        emergencyResponse: formData.emergencyResponse,
        firstAidCases: formData.firstAidCases,
        equipmentReadiness: formData.equipmentReadiness,
        medicineControl: formData.medicineControl,
        healthMonitoring: formData.healthMonitoring,
        hygieneClinic: formData.hygieneClinic
      };

      if (type === 'security') {
        await submitSecurityEvaluation(newEval);
      } else {
        await submitSoftFMEvaluation(newEval);
      }
      
      alert("Evaluation saved successfully!");
      setView('categories');
      loadEvaluations();
    } catch (error) {
      alert("Failed to save evaluation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkAttendance = async () => {
    const presentStaff = (SOFT_FM_STAFF[selectedCategory!] || []).filter(s => attendance[s.code]);
    if (presentStaff.length === 0) {
      alert("No staff marked as present.");
      return;
    }

    if (!confirm(`Award points to ${presentStaff.length} staff members marked as present? (Includes valet auto-points if applicable)`)) return;

    try {
      setSubmitting(true);
      for (const staff of presentStaff) {
        const valetPoints = calculateValetPoints(staff.name);
        // Exclude valetPoints from finalScore here because they are submitted LIVE from ValetView
        const autoDailyScore = 10; 
        const finalScore = 40 + autoDailyScore; // 40 is base supervisor score (10 each)

        const newEval: Omit<SoftFMEvaluation, 'timestamp'> = {
          week: `Daily Attendance ${new Date().toLocaleDateString()}`,
          name: staff.name,
          department: selectedCategory!,
          attendance: 10,
          punctuality: 10,
          behavior: 10,
          performance: 10,
          supervisorScore: 40,
          autoDailyScore,
          finalScore,
          remarks: 'Daily Attendance Points Awarded'
        };
        if (type === 'security') {
          await submitSecurityEvaluation(newEval);
        } else {
          await submitSoftFMEvaluation(newEval);
        }
      }
      alert(`Attendance points awarded to ${presentStaff.length} staff members.`);
      loadEvaluations();
      // Reset attendance for this category
      const newAttendance = { ...attendance };
      (SOFT_FM_STAFF[selectedCategory!] || []).forEach(s => delete newAttendance[s.code]);
      setAttendance(newAttendance);
    } catch (error) {
      alert("Failed to award attendance points.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckScore = () => {
    const found = evaluations
      .filter(e => e.name.toLowerCase().includes(searchName.toLowerCase()))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    if (found) {
      setSelfEval(found);
    } else {
      alert("No evaluation found for this name.");
    }
  };

  const getLabel = (score: number) => {
    if (score >= 90) return { text: 'Excellent', color: 'text-green-600 bg-green-50' };
    if (score >= 75) return { text: 'Good', color: 'text-blue-600 bg-blue-50' };
    if (score >= 60) return { text: 'Average', color: 'text-yellow-600 bg-yellow-50' };
    return { text: 'Needs Improvement', color: 'text-red-600 bg-red-50' };
  };

  const getRankings = () => {
    const totals: Record<string, { points: number, count: number, dept: string }> = {};
    evaluations.forEach(e => {
      if (!totals[e.name]) {
        totals[e.name] = { points: 0, count: 0, dept: e.department };
      }
      totals[e.name].points += e.finalScore;
      totals[e.name].count += 1;
    });

    return Object.entries(totals)
      .map(([name, data]) => ({
        name,
        ...data,
        average: data.points / data.count
      }))
      .sort((a, b) => b.points - a.points);
  };

  const rankings = getRankings();

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-8 pb-32">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => {
              if (view === 'dashboard') onBack();
              else if (view === 'categories' && type === 'security') setView('dashboard');
              else if (view === 'categories') onBack();
              else if (view === 'staff') setView('categories');
              else if (view === 'sub-category') setView('staff');
              else if (view === 'form') {
                if (selectedCategory === 'Gate keeper') setView('sub-category');
                else setView('staff');
              }
              else if (view === 'self-view') {
                if (type === 'security') setView('dashboard');
                else setView('categories');
              }
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">
              {view === 'dashboard' || (view === 'categories' && type === 'soft-fm') ? 'Back to Excellence Hub' : 'Back'}
            </span>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{type === 'soft-fm' ? 'Soft FM' : 'Security'} Scorecard</h1>
        </div>

        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Live Status Header */}
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                    <div className="absolute inset-0 w-3 h-3 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
                  </div>
                  <span className="text-sm font-bold text-gray-600 uppercase tracking-wider">Live Security Feed</span>
                </div>
                <div className="text-xs text-gray-400 font-medium">
                  Last updated: {new Date().toLocaleTimeString()}
                </div>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <motion.div 
                  whileHover={{ y: -5 }}
                  className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 rounded-2xl shadow-lg text-white relative overflow-hidden group"
                >
                  <Trophy className="absolute -right-4 -bottom-4 w-24 h-24 opacity-20 group-hover:scale-110 transition-transform" />
                  <p className="text-amber-100 text-sm font-bold uppercase mb-1">Elite Performer</p>
                  <h3 className="text-2xl font-black truncate mb-2">{rankings[0]?.name || 'N/A'}</h3>
                  <div className="flex items-center gap-2 bg-white/20 w-fit px-3 py-1 rounded-full text-xs font-bold">
                    <Star size={12} fill="currentColor" />
                    {rankings[0]?.points || 0} Total Points
                  </div>
                </motion.div>

                <motion.div 
                  whileHover={{ y: -5 }}
                  className="bg-gradient-to-br from-indigo-600 to-blue-700 p-6 rounded-2xl shadow-lg text-white relative overflow-hidden group"
                >
                  <Users className="absolute -right-4 -bottom-4 w-24 h-24 opacity-20 group-hover:scale-110 transition-transform" />
                  <p className="text-indigo-100 text-sm font-bold uppercase mb-1">Force Strength</p>
                  <h3 className="text-3xl font-black mb-2">{rankings.length}</h3>
                  <div className="flex items-center gap-2 bg-white/20 w-fit px-3 py-1 rounded-full text-xs font-bold">
                    Active Personnel Evaluated
                  </div>
                </motion.div>

                <motion.div 
                  whileHover={{ y: -5 }}
                  className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-2xl shadow-lg text-white relative overflow-hidden group"
                >
                  <Zap className="absolute -right-4 -bottom-4 w-24 h-24 opacity-20 group-hover:scale-110 transition-transform" />
                  <p className="text-emerald-100 text-sm font-bold uppercase mb-1">Operational Excellence</p>
                  <h3 className="text-3xl font-black mb-2">
                    {rankings.length > 0 
                      ? (rankings.reduce((acc, curr) => acc + curr.average, 0) / rankings.length).toFixed(1)
                      : '0'}
                  </h3>
                  <div className="flex items-center gap-2 bg-white/20 w-fit px-3 py-1 rounded-full text-xs font-bold">
                    Average Performance Index
                  </div>
                </motion.div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Leaderboard */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <ShieldCheck className="text-indigo-600" size={24} />
                      Personnel Rankings
                    </h3>
                    <button
                      onClick={() => setView('categories')}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2 text-sm"
                    >
                      <Save size={16} />
                      New Evaluation
                    </button>
                  </div>
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full">
                      <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Rank</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Personnel</th>
                          <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Points</th>
                          <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Index</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rankings.length > 0 ? (
                          rankings.map((staff, index) => (
                            <tr key={staff.name} className="hover:bg-indigo-50/30 transition-colors group">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${
                                    index === 0 ? 'bg-amber-100 text-amber-600 border border-amber-200' :
                                    index === 1 ? 'bg-slate-100 text-slate-500 border border-slate-200' :
                                    index === 2 ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                                    'bg-gray-50 text-gray-400 border border-gray-100'
                                  }`}>
                                    {index + 1}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div>
                                  <div className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{staff.name}</div>
                                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{staff.dept}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div className="text-lg font-black text-indigo-600">{staff.points}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div className="inline-flex items-center px-2 py-1 rounded-lg bg-gray-100 text-gray-600 text-[10px] font-black group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                  {staff.average.toFixed(1)}
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-gray-400 font-medium">
                              No operational data recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Live Activity Feed */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <Activity className="text-rose-500" size={20} />
                      Live Activity
                    </h3>
                  </div>
                  <div className="p-4 space-y-4 overflow-y-auto max-h-[500px] flex-1">
                    {evaluations.length > 0 ? (
                      evaluations.slice(0, 10).map((evalItem, idx) => (
                        <div key={idx} className="flex gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0 font-bold text-xs">
                            {evalItem.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-sm font-bold text-gray-900 truncate">{evalItem.name}</p>
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                +{evalItem.finalScore}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-500 line-clamp-1 mb-1">{evalItem.remarks}</p>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                              {new Date(evalItem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {evalItem.department}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 text-gray-400 text-sm font-medium">
                        Waiting for live updates...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Self View Shortcut */}
              <div className="bg-indigo-600 p-8 rounded-3xl shadow-xl shadow-indigo-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="text-white">
                    <h4 className="text-2xl font-black mb-2">Personnel Access Portal</h4>
                    <p className="text-indigo-100 font-medium opacity-80">Access your individual performance metrics and historical data.</p>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <input 
                      type="text" 
                      placeholder="Enter Personnel Name..."
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      className="flex-1 md:w-72 px-6 py-4 rounded-2xl bg-white/10 border border-white/20 text-white placeholder:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-white/50 backdrop-blur-sm font-bold"
                    />
                    <button 
                      onClick={() => {
                        handleCheckScore();
                        setView('self-view');
                      }}
                      className="bg-white text-indigo-600 px-8 py-4 rounded-2xl font-black hover:bg-indigo-50 transition-all shadow-lg flex items-center gap-2 whitespace-nowrap"
                    >
                      <Search size={20} />
                      Access
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'categories' && (
            <motion.div 
              key="categories"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div className="col-span-full mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-700">Select Category</h2>
                {type === 'security' && (
                  <button
                    onClick={() => setView('dashboard')}
                    className="flex items-center gap-2 text-indigo-600 font-bold hover:text-indigo-700 transition-colors text-sm"
                  >
                    <Trophy size={16} />
                    View Leaderboard
                  </button>
                )}
              </div>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategorySelect(cat)}
                  className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-500 hover:shadow-md transition-all group text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">{cat}</h3>
                      <p className="text-gray-500">Manage {cat} team performance</p>
                    </div>
                    <Users className="text-gray-300 group-hover:text-indigo-500 transition-colors" size={32} />
                  </div>
                </button>
              ))}
              
              <div className="col-span-full mt-8 pt-8 border-t border-gray-200">
                <div className="bg-indigo-50 p-6 rounded-2xl">
                  <h3 className="text-lg font-bold text-indigo-900 mb-4 flex items-center gap-2">
                    <User size={20} />
                    Staff Self-View
                  </h3>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Enter your name..."
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      className="flex-1 px-4 py-2 rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button 
                      onClick={() => {
                        handleCheckScore();
                        setView('self-view');
                      }}
                      className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
                    >
                      Check Score
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'staff' && (
            <motion.div 
              key="staff"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <button onClick={() => setView('categories')} className="p-2 hover:bg-gray-100 rounded-full">
                    <ArrowLeft size={20} />
                  </button>
                  <h2 className="text-xl font-bold text-gray-900">{selectedCategory} Staff</h2>
                </div>
                {selectedCategory === 'Valet' && (
                  <div className="hidden md:flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-xs font-medium border border-indigo-100">
                    <Calculator size={14} />
                    Valet points are recorded LIVE in the sheet per action.
                  </div>
                )}
                <button
                  onClick={handleBulkAttendance}
                  disabled={submitting}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm"
                >
                  <Save size={18} />
                  Submit Attendance Points
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(SOFT_FM_STAFF[selectedCategory!] || []).map((staff) => (
                  <div
                    key={staff.code}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-indigo-500 transition-all flex items-center justify-between group"
                  >
                    <button
                      onClick={() => handleStaffSelect(staff)}
                      className="flex items-center gap-4 flex-1 text-left"
                    >
                      <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs relative">
                        {staff.code}
                        {selectedCategory === 'Valet' && (
                          <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-sm border border-indigo-100">
                            {staff.role === 'Rider' ? <Bike size={10} className="text-indigo-600" /> : <Car size={10} className="text-indigo-600" />}
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                          {staff.name}
                          {selectedCategory === 'Valet' && (
                            <span className="text-[10px] text-gray-400 font-normal">
                              ({staff.role})
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-gray-500">{selectedCategory}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleAttendance(staff.code)}
                        className={`px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all flex items-center gap-1.5 ${
                          attendance[staff.code] 
                            ? 'bg-green-100 text-green-700 border border-green-200' 
                            : 'bg-gray-100 text-gray-500 border border-gray-200'
                        }`}
                      >
                        {attendance[staff.code] ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {attendance[staff.code] ? 'Present' : 'Absent'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'sub-category' && (
            <motion.div 
              key="sub-category"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto"
            >
              <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setView('staff')} className="p-2 hover:bg-gray-100 rounded-full">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold text-gray-900">Select Assignment</h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {['Parking', 'Office'].map((sub) => (
                  <button
                    key={sub}
                    onClick={() => {
                      setSelectedSubCategory(sub as 'Parking' | 'Office');
                      setView('form');
                    }}
                    className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-500 hover:shadow-md transition-all group text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 mb-1">{sub}</h3>
                        <p className="text-gray-500">Evaluate {selectedStaff?.name} for {sub} duty</p>
                      </div>
                      <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                        {sub === 'Parking' ? <Car size={24} /> : <User size={24} />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'form' && (
            <motion.div 
              key="form"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-lg border border-gray-100"
            >
              <div className="bg-indigo-600 p-6 text-white">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-indigo-100">Excellence Hub: Performance Log</span>
                  <span className="bg-indigo-500 px-3 py-1 rounded-full text-xs font-bold">{new Date().toLocaleDateString()}</span>
                </div>
                <h2 className="text-2xl font-bold">{selectedStaff?.name} <span className="text-indigo-200 text-lg font-normal">({selectedStaff?.code})</span></h2>
                <p className="text-indigo-100">{selectedCategory} Department</p>
              </div>

              <div className="p-6 space-y-6">
                {type === 'security' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                    <div className="col-span-full bg-amber-50 p-4 rounded-xl border border-amber-100">
                      <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                        <Award className="text-amber-500" size={20} />
                        Security Performance Metrics: {selectedCategory}
                      </h3>
                      <p className="text-xs text-amber-700 mt-1">Rate each KPI from 1 to 5 stars (1★ = 2pts, 5★ = 10pts).</p>
                    </div>
                    
                    {selectedCategory === 'Gate keeper' && (
                      <>
                        <StarRating 
                          label="Attendance & Punctuality (On-time shift reporting)"
                          value={formData.attendance}
                          onChange={(val) => setFormData({...formData, attendance: val, punctuality: val})}
                        />

                        {selectedSubCategory === 'Office' ? (
                          <StarRating 
                            label="Access Control (Proper entry/exit log maintained)"
                            value={formData.accessControl}
                            onChange={(val) => setFormData({...formData, accessControl: val})}
                          />
                        ) : null}

                        {selectedSubCategory === 'Office' && (
                          <StarRating 
                            label="Visitor Management"
                            value={formData.visitorManagement}
                            onChange={(val) => setFormData({...formData, visitorManagement: val})}
                          />
                        )}

                        {selectedSubCategory === 'Parking' && (
                          <StarRating 
                            label="Proper Gate Pass Verification"
                            value={formData.materialMovement}
                            onChange={(val) => setFormData({...formData, materialMovement: val})}
                          />
                        )}

                        {selectedSubCategory === 'Office' ? (
                          <StarRating 
                            label="Material Movement (General)"
                            value={formData.materialMovement}
                            onChange={(val) => setFormData({...formData, materialMovement: val})}
                          />
                        ) : (
                          <StarRating 
                            label="Security Awareness"
                            value={formData.securityAwareness}
                            onChange={(val) => setFormData({...formData, securityAwareness: val})}
                          />
                        )}

                        <StarRating 
                          label="Security observation"
                          value={formData.performance}
                          onChange={(val) => setFormData({...formData, performance: val})}
                        />

                        <StarRating 
                          label={selectedSubCategory === 'Office' ? "Discipline" : "Discipline (Uniform & Conduct)"}
                          value={formData.discipline}
                          onChange={(val) => setFormData({...formData, discipline: val})}
                        />

                        <StarRating 
                          label="Communication (Coordination with control room)"
                          value={formData.communication}
                          onChange={(val) => setFormData({...formData, communication: val})}
                        />
                      </>
                    )}

                    {selectedCategory === 'Security Supervisor' && (
                      <>
                        <StarRating label="Attendance (Shift Adherence)" value={formData.attendance} onChange={(val) => setFormData({...formData, attendance: val})} />
                        <StarRating label="Team Management (Guard deployment as per plan)" value={formData.teamManagement} onChange={(val) => setFormData({...formData, teamManagement: val})} />
                        <StarRating label="Inspection (Routine site patrols conducted)" value={formData.inspection} onChange={(val) => setFormData({...formData, inspection: val})} />
                        <StarRating label="Incident Handling (Response time to incidents)" value={formData.incidentHandling} onChange={(val) => setFormData({...formData, incidentHandling: val})} />
                        <StarRating label="Reporting (Daily/weekly reports submission)" value={formData.reporting} onChange={(val) => setFormData({...formData, reporting: val})} />
                        <StarRating label="Weapon Handling (Maintenance & SOP compliance)" value={formData.weaponHandling} onChange={(val) => setFormData({...formData, weaponHandling: val})} />
                        <StarRating label="Training (Toolbox talks / briefings conducted)" value={formData.training} onChange={(val) => setFormData({...formData, training: val})} />
                        <StarRating label="Fleet handling (Liaison with drivers & routine)" value={formData.fleetHandling} onChange={(val) => setFormData({...formData, fleetHandling: val})} />
                        <StarRating label="Neighboring/Law enforcement Liaison" value={formData.liaison} onChange={(val) => setFormData({...formData, liaison: val})} />
                        <StarRating label="Risk Identification (Hazards/security gaps reported)" value={formData.riskIdentification} onChange={(val) => setFormData({...formData, riskIdentification: val})} />
                      </>
                    )}

                    {selectedCategory === 'Paramedic Staff' && (
                      <>
                        <StarRating label="Attendance (Shift Adherence)" value={formData.attendance} onChange={(val) => setFormData({...formData, attendance: val})} />
                        <StarRating label="Punctuality (On-time reporting)" value={formData.punctuality} onChange={(val) => setFormData({...formData, punctuality: val})} />
                        <StarRating label="Emergency Response (Response time)" value={formData.emergencyResponse} onChange={(val) => setFormData({...formData, emergencyResponse: val})} />
                        <StarRating label="First Aid Cases (Treatment & Documentation)" value={formData.firstAidCases} onChange={(val) => setFormData({...formData, firstAidCases: val})} />
                        <StarRating label="Equipment Readiness (First aid kits readiness)" value={formData.equipmentReadiness} onChange={(val) => setFormData({...formData, equipmentReadiness: val})} />
                        <StarRating label="Medicine Control (Stock availability/No expiry)" value={formData.medicineControl} onChange={(val) => setFormData({...formData, medicineControl: val})} />
                        <StarRating label="Health Monitoring (Routine employee checks)" value={formData.healthMonitoring} onChange={(val) => setFormData({...formData, healthMonitoring: val})} />
                        <StarRating label="Training & Awareness (First aid sessions)" value={formData.training} onChange={(val) => setFormData({...formData, training: val})} />
                        <StarRating label="Reporting (Incident/medical reports)" value={formData.reporting} onChange={(val) => setFormData({...formData, reporting: val})} />
                        <StarRating label="Hygiene & Clinic (Cleanliness & Infection control)" value={formData.hygieneClinic} onChange={(val) => setFormData({...formData, hygieneClinic: val})} />
                      </>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { id: 'attendance', label: 'Attendance', icon: <UserCheck size={18} /> },
                      { id: 'punctuality', label: 'Punctuality', icon: <Clock size={18} /> },
                      { id: 'behavior', label: 'Behavior', icon: <Star size={18} /> },
                      { id: 'performance', label: 'Performance', icon: <TrendingUp size={18} /> }
                    ].map((field) => (
                      <div key={field.id} className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                          {field.icon}
                          {field.label} (0-10)
                        </label>
                        <input 
                          type="number" 
                          min="0" 
                          max="10"
                          value={formData[field.id as keyof typeof formData]}
                          onChange={(e) => setFormData({...formData, [field.id]: parseInt(e.target.value) || 0})}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                      Manual Adjustment (Bonus/Penalty)
                    </label>
                    <input 
                      type="number" 
                      value={formData.manualAdjustment}
                      onChange={(e) => setFormData({...formData, manualAdjustment: parseInt(e.target.value) || 0})}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                      Working Days
                    </label>
                    <input 
                      type="number" 
                      min="1" 
                      max="7"
                      value={formData.workingDays}
                      onChange={(e) => setFormData({...formData, workingDays: parseInt(e.target.value) || 0})}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                    <MessageSquare size={18} />
                    Remarks (Mention reason for manual points here)
                  </label>
                  <textarea 
                    value={formData.remarks}
                    onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                    placeholder="Add any additional comments..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none h-24"
                  />
                </div>

                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-gray-600">Supervisor Score (Max 40)</span>
                    <span className="font-bold text-gray-900">{calculateScores().supervisorScore}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-gray-600">Attendance Base (10 pts/day)</span>
                    <span className="font-bold text-gray-900">{10 * formData.workingDays}</span>
                  </div>
                  {selectedCategory === 'Valet' && (
                    <div className="flex justify-between items-center mb-4 text-indigo-600 font-bold">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-2">
                          <Calculator size={16} />
                          Valet Auto Points (10 pts/car)
                          <span className="bg-indigo-100 text-indigo-600 text-[10px] px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
                        </span>
                        <span className="text-[10px] text-indigo-400 font-normal mt-1 italic">Already recorded in sheet per action</span>
                      </div>
                      <span>+{calculateScores().valetPoints}</span>
                    </div>
                  )}
                  {formData.manualAdjustment !== 0 && (
                    <div className="flex justify-between items-center mb-4 text-amber-600 font-bold">
                      <span>Manual Adjustment</span>
                      <span>{formData.manualAdjustment > 0 ? '+' : ''}{formData.manualAdjustment}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                    <span className="text-lg font-bold text-gray-900">Final Soft Score</span>
                    <span className="text-2xl font-black text-indigo-600">{calculateScores().finalScore}</span>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setView('staff')}
                    className="flex-1 py-4 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 py-4 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    {submitting ? 'Saving...' : <><Save size={20} /> Save Evaluation</>}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'self-view' && (
            <motion.div 
              key="self-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setView('categories')} className="p-2 hover:bg-gray-100 rounded-full">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold text-gray-900">Your Performance Report</h2>
              </div>

              {selfEval ? (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100">
                  <div className="bg-indigo-600 p-8 text-white text-center">
                    <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Award size={40} />
                    </div>
                    <h2 className="text-3xl font-bold mb-1">{selfEval.name}</h2>
                    <p className="text-indigo-100 mb-4">{selfEval.department} Department • {selfEval.week}</p>
                    <div className={`inline-block px-4 py-1 rounded-full text-sm font-bold ${getLabel(selfEval.finalScore).color}`}>
                      {getLabel(selfEval.finalScore).text}
                    </div>
                  </div>

                  <div className="p-8">
                    <div className="grid grid-cols-2 gap-8 mb-8">
                      <div className="text-center p-6 bg-gray-50 rounded-2xl">
                        <p className="text-gray-500 text-sm mb-1">Final Score</p>
                        <p className="text-4xl font-black text-indigo-600">{selfEval.finalScore}</p>
                      </div>
                      <div className="text-center p-6 bg-gray-50 rounded-2xl">
                        <p className="text-gray-500 text-sm mb-1">Supervisor Rating</p>
                        <p className="text-4xl font-black text-gray-900">{selfEval.supervisorScore}<span className="text-lg text-gray-400">/40</span></p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-bold text-gray-900 border-b pb-2">Breakdown</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex justify-between p-3 bg-white border rounded-xl">
                          <span className="text-gray-600">Attendance</span>
                          <span className="font-bold">{selfEval.attendance}/10</span>
                        </div>
                        <div className="flex justify-between p-3 bg-white border rounded-xl">
                          <span className="text-gray-600">Punctuality</span>
                          <span className="font-bold">{selfEval.punctuality}/10</span>
                        </div>
                        <div className="flex justify-between p-3 bg-white border rounded-xl">
                          <span className="text-gray-600">Behavior</span>
                          <span className="font-bold">{selfEval.behavior}/10</span>
                        </div>
                        <div className="flex justify-between p-3 bg-white border rounded-xl">
                          <span className="text-gray-600">Performance</span>
                          <span className="font-bold">{selfEval.performance}/10</span>
                        </div>
                      </div>
                      
                      <div className="mt-6 p-4 bg-indigo-50 rounded-xl">
                        <p className="text-sm font-bold text-indigo-900 mb-1">Supervisor Remarks:</p>
                        <p className="text-indigo-700 italic">"{selfEval.remarks || 'No remarks provided.'}"</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-12 rounded-2xl text-center shadow-sm border border-gray-100">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                    <User size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No Evaluation Found</h3>
                  <p className="text-gray-500 mb-6">We couldn't find any recent performance records for "{searchName}".</p>
                  <button 
                    onClick={() => {
                      if (type === 'security') setView('dashboard');
                      else setView('categories');
                    }}
                    className="text-indigo-600 font-bold hover:underline"
                  >
                    Try another name
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
