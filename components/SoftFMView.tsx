
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Star, Clock, UserCheck, MessageSquare, ArrowLeft, Save, TrendingUp, Award, User, Bike, Car, CheckCircle2, XCircle, Calculator, Trophy, Medal, BarChart3, Search, Activity, ShieldCheck, Zap } from 'lucide-react';
import { SoftFMEvaluation, SoftFMStaff, ValetLogEntry } from '../types';
import { submitSoftFMEvaluation, submitSecurityEvaluation, fetchSoftFMEvaluations, fetchSecurityEvaluations, fetchValetData } from '../services/api';
import { SOFT_FM_STAFF } from '../constants';

import { generateSecurityInsights } from '../services/aiService';

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
          className={`p-1.5 rounded-lg transition-all ${star <= value ? 'text-amber-400 bg-amber-50' : 'text-gray-300 bg-white border border-gray-100 hover:bg-gray-50'}`}
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
  const [editingStaff, setEditingStaff] = useState<{ name: string, dept: string, months: string[] } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [adjustmentPoints, setAdjustmentPoints] = useState(0);
  const [adjustmentRemarks, setAdjustmentRemarks] = useState('');

  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const [formData, setFormData] = useState({
    attendance: 0,
    punctuality: 0,
    behavior: 0,
    performance: 0,
    manualAdjustment: 0,
    workingDays: 26, // Default to a standard month
    remarks: '',
    extraHours: 0,
    // Security specific KPIs (1-5 stars)
    accessControl: 0,
    visitorManagement: 0,
    materialMovement: 0,
    securityAwareness: 0,
    discipline: 0,
    communication: 0,
    // Security Supervisor KPIs
    teamManagement: 0,
    inspection: 0,
    incidentHandling: 0,
    reporting: 0,
    weaponHandling: 0,
    training: 0,
    fleetHandling: 0,
    liaison: 0,
    riskIdentification: 0,
    // Paramedic KPIs
    emergencyResponse: 0,
    firstAidCases: 0,
    equipmentReadiness: 0,
    medicineControl: 0,
    healthMonitoring: 0,
    hygieneClinic: 0,
    // Soft FM specific KPIs
    visitorLog: 0,
    riderLog: 0,
    pettyCash: 0,
    courierLog: 0,
    consumableLog: 0,
    numberOfRides: 0,
    kmConsumed: 0,
    petrolConsumed: 0,
    kitchenHygiene: 0,
    meetingRoomReadiness: 0,
    utilityManagement: 0,
    cleaningQuality: 0,
    restroomHygiene: 0,
    wasteManagement: 0
  });

  useEffect(() => {
    loadEvaluations();
    // Polling for "Live" feel
    const interval = setInterval(loadEvaluations, 10000); // Every 10 seconds
    return () => clearInterval(interval);
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
    const getWeightedPoints = (stars: number, weight: number) => (stars / 5) * weight;
    
    // Monthly Attendance Score: (Working Days * 9 + Extra Hours) / (Standard 234h) * 15
    const totalHours = (formData.workingDays * 9) + formData.extraHours;
    const attendanceScore = Math.min(15, (totalHours / 234) * 15);

    if (type === 'security') {
      if (selectedCategory === 'Gate keeper') {
        const materialWeight = selectedSubCategory === 'Parking' ? 20 : 10;
        const visitorWeight = selectedSubCategory === 'Parking' ? 0 : 10;

        supervisorScore = attendanceScore;
        supervisorScore += getWeightedPoints(formData.accessControl, 30);
        supervisorScore += getWeightedPoints(formData.visitorManagement, visitorWeight);
        supervisorScore += getWeightedPoints(formData.materialMovement, materialWeight);
        supervisorScore += getWeightedPoints(formData.training, 5);
        supervisorScore += getWeightedPoints(formData.securityAwareness, 5);
        supervisorScore += getWeightedPoints(formData.discipline, 15);
        supervisorScore += getWeightedPoints(formData.communication, 10);
      } else if (selectedCategory === 'Security Supervisor') {
        supervisorScore = attendanceScore;
        supervisorScore += getWeightedPoints(formData.teamManagement, 10);
        supervisorScore += getWeightedPoints(formData.inspection, 10);
        supervisorScore += getWeightedPoints(formData.incidentHandling, 10);
        supervisorScore += getWeightedPoints(formData.reporting, 5);
        supervisorScore += getWeightedPoints(formData.weaponHandling, 10);
        supervisorScore += getWeightedPoints(formData.training, 5);
        supervisorScore += getWeightedPoints(formData.fleetHandling, 10);
        supervisorScore += getWeightedPoints(formData.liaison, 10);
        supervisorScore += getWeightedPoints(formData.riskIdentification, 15);
      } else if (selectedCategory === 'Paramedic Staff') {
        supervisorScore = attendanceScore;
        supervisorScore += getWeightedPoints(formData.emergencyResponse, 15);
        supervisorScore += getWeightedPoints(formData.firstAidCases, 10);
        supervisorScore += getWeightedPoints(formData.equipmentReadiness, 10);
        supervisorScore += getWeightedPoints(formData.medicineControl, 10);
        supervisorScore += getWeightedPoints(formData.healthMonitoring, 10);
        supervisorScore += getWeightedPoints(formData.training, 10);
        supervisorScore += getWeightedPoints(formData.reporting, 10);
        supervisorScore += getWeightedPoints(formData.hygieneClinic, 10);
      }
    } else {
      // Soft FM Logic
      if (selectedCategory === 'Receptionist') {
        supervisorScore = attendanceScore;
        supervisorScore += getWeightedPoints(formData.behavior, 15);
        supervisorScore += getWeightedPoints(formData.visitorLog, 15);
        supervisorScore += getWeightedPoints(formData.riderLog, 15);
        supervisorScore += getWeightedPoints(formData.pettyCash, 10);
        supervisorScore += getWeightedPoints(formData.courierLog, 15);
        supervisorScore += getWeightedPoints(formData.consumableLog, 15);
      } else if (selectedCategory === 'Rider') {
        supervisorScore = attendanceScore;
        // For Rider, we have some numerical inputs. We'll treat them as direct points for now or normalized.
        // User said: rides (nos), behavior (stars), km (nos), petrol (nos)
        // Let's assume the user enters a score out of 100 for the numerical ones, or we just use them.
        // To keep it consistent with 100% weightage, we'll treat the numerical inputs as "Score out of 100"
        supervisorScore += (formData.numberOfRides / 100) * 25;
        supervisorScore += getWeightedPoints(formData.behavior, 15);
        supervisorScore += (formData.kmConsumed / 100) * 20;
        supervisorScore += (formData.petrolConsumed / 100) * 25;
      } else if (selectedCategory === 'Office Boy') {
        supervisorScore = attendanceScore;
        supervisorScore += getWeightedPoints(formData.behavior, 20);
        supervisorScore += getWeightedPoints(formData.kitchenHygiene, 25);
        supervisorScore += getWeightedPoints(formData.meetingRoomReadiness, 20);
        supervisorScore += getWeightedPoints(formData.utilityManagement, 20);
      } else if (selectedCategory === 'Janitorial') {
        supervisorScore = attendanceScore;
        supervisorScore += getWeightedPoints(formData.behavior, 20);
        supervisorScore += getWeightedPoints(formData.cleaningQuality, 25);
        supervisorScore += getWeightedPoints(formData.restroomHygiene, 20);
        supervisorScore += getWeightedPoints(formData.wasteManagement, 20);
      } else if (selectedCategory === 'Valet') {
        supervisorScore = attendanceScore;
        supervisorScore += getWeightedPoints(formData.behavior, 25);
        supervisorScore += getWeightedPoints(formData.performance, 60);
      } else {
        supervisorScore = formData.attendance + formData.punctuality + formData.behavior + formData.performance;
      }
    }

    const valetPoints = selectedStaff ? calculateValetPoints(selectedStaff.name) : 0;
    const autoDailyScore = (type === 'security' ? 0 : (2 * formData.workingDays)); 
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

      const totalHours = (formData.workingDays * 9) + formData.extraHours;
      const attendanceScore = type === 'security' ? Math.min(15, (totalHours / 234) * 15) : formData.attendance;

      const newEval: Omit<SoftFMEvaluation, 'timestamp'> = {
        week: `Monthly Log ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`,
        name: selectedStaff.name,
        department: selectedCategory,
        subCategory: selectedSubCategory || undefined,
        attendance: attendanceScore,
        punctuality: formData.punctuality,
        behavior: formData.behavior,
        performance: formData.performance,
        supervisorScore,
        autoDailyScore,
        finalScore,
        remarks: finalRemarks,
        extraHours: type === 'security' ? formData.extraHours : undefined,
        weeklyAttendance: type === 'security' ? String(formData.workingDays) : undefined,
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

  const handleAdjustmentSubmit = async () => {
    if (!editingStaff) return;
    try {
      setSubmitting(true);
      const newEval: Omit<SoftFMEvaluation, 'timestamp'> = {
        week: type === 'security' ? (selectedMonth || `Monthly Log ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`) : `Manual Adjustment ${new Date().toLocaleDateString()}`,
        name: editingStaff.name,
        department: editingStaff.dept,
        attendance: 0,
        punctuality: 0,
        behavior: 0,
        performance: 0,
        supervisorScore: 0,
        autoDailyScore: 0,
        finalScore: adjustmentPoints,
        remarks: `[Manual Adjustment] ${adjustmentRemarks}`,
        extraHours: 0,
        weeklyAttendance: JSON.stringify([false, false, false, false, false, false, false])
      };

      if (type === 'security') {
        await submitSecurityEvaluation(newEval);
      } else {
        await submitSoftFMEvaluation(newEval);
      }
      
      setEditingStaff(null);
      setAdjustmentPoints(0);
      setAdjustmentRemarks('');
      loadEvaluations();
      alert("Adjustment applied successfully!");
    } catch (error) {
      alert("Failed to apply adjustment.");
    } finally {
      setSubmitting(false);
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
          {editingStaff && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
              >
                <div className="bg-indigo-600 p-6 text-white">
                  <h3 className="text-xl font-bold">Adjust Points</h3>
                  <p className="text-indigo-100 text-sm">Managing ranking for {editingStaff.name}</p>
                </div>
                <div className="p-6 space-y-4">
                  {type === 'security' && (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700">Select Month to Adjust</label>
                      <select 
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold text-gray-700"
                      >
                        {editingStaff.months.length > 0 ? (
                          editingStaff.months.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))
                        ) : (
                          <option value={`Monthly Log ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`}>
                            {`Monthly Log ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`}
                          </option>
                        )}
                        {!editingStaff.months.includes(`Monthly Log ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`) && (
                          <option value={`Monthly Log ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`}>
                            New Month: {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
                          </option>
                        )}
                      </select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">Point Adjustment (e.g. +50 or -20)</label>
                    <input 
                      type="number"
                      value={adjustmentPoints}
                      onChange={(e) => setAdjustmentPoints(parseInt(e.target.value) || 0)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-black text-xl text-indigo-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">Reason / Remarks</label>
                    <textarea 
                      value={adjustmentRemarks}
                      onChange={(e) => setAdjustmentRemarks(e.target.value)}
                      placeholder="Why are you adjusting these points?"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none h-24"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => setEditingStaff(null)}
                      className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleAdjustmentSubmit}
                      disabled={submitting}
                      className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                    >
                      {submitting ? 'Applying...' : 'Apply Adjustment'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

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
                  <span className="text-sm font-bold text-gray-600 uppercase tracking-wider">Security and HSE Metric</span>
                  <button 
                    onClick={() => loadEvaluations()}
                    disabled={loading}
                    className={`p-1.5 rounded-lg hover:bg-gray-100 transition-all ${loading ? 'animate-spin text-indigo-600' : 'text-gray-400'}`}
                  >
                    <Activity size={14} />
                  </button>
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

              <div className="grid grid-cols-1 gap-6">
                {/* Leaderboard */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
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
                          <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
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
                                <div className="text-lg font-black text-indigo-600">{staff.points.toFixed(1)}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <button
                                  onClick={() => {
                                    const staffEvals = evaluations.filter(e => e.name === staff.name);
                                    const months = Array.from(new Set(staffEvals.map(e => e.week)));
                                    setEditingStaff({ name: staff.name, dept: staff.dept, months });
                                    setSelectedMonth(months[0] || `Monthly Log ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`);
                                  }}
                                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                  title="Edit Points"
                                >
                                  <MessageSquare size={16} />
                                </button>
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
              </div>

              {/* Self View Shortcut */}
              {type !== 'security' && (
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
              )}
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
              
              {type !== 'security' && (
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
              )}
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
                  <span className="text-indigo-100">Excellence Hub: Security and HSE Metric</span>
                  <span className="bg-indigo-500 px-3 py-1 rounded-full text-xs font-bold">{new Date().toLocaleDateString()}</span>
                </div>
                <h2 className="text-2xl font-bold">{selectedStaff?.name} <span className="text-indigo-200 text-lg font-normal">({selectedStaff?.code})</span></h2>
                <p className="text-indigo-100">{selectedCategory} Department</p>
              </div>

              <div className="p-6 space-y-6">
                <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                  <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Clock size={18} />
                    Monthly Attendance Log (15%)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                        <UserCheck size={18} className="text-emerald-500" />
                        Working Days (Monthly)
                      </label>
                      <input 
                        type="number" 
                        min="0" 
                        max="31"
                        value={formData.workingDays}
                        onChange={(e) => setFormData({...formData, workingDays: parseInt(e.target.value) || 0})}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold text-lg"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                        <Clock size={18} className="text-amber-500" />
                        Extra Hours (Monthly)
                      </label>
                      <input 
                        type="number" 
                        min="0"
                        value={formData.extraHours}
                        onChange={(e) => setFormData({...formData, extraHours: parseInt(e.target.value) || 0})}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold text-lg"
                      />
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-white rounded-xl border border-gray-100 flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-400 uppercase">Total Monthly Hours</span>
                    <span className="text-lg font-black text-indigo-600">{(formData.workingDays * 9) + formData.extraHours}h</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {type === 'security' ? (
                    <>
                      <div className="col-span-full bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                          <ShieldCheck className="text-indigo-500" size={20} />
                          Security Performance Metrics: {selectedCategory}
                        </h3>
                        <p className="text-xs text-indigo-700 mt-1">Rate each KPI from 1 to 5 stars (5★ = 100% weightage).</p>
                      </div>
                      
                      {selectedCategory === 'Gate keeper' && (
                        <>
                          {selectedSubCategory === 'Office' ? (
                            <>
                              <StarRating label="Access Management (30%) (Proper entry/exit log maintained)" value={formData.accessControl} onChange={(val) => setFormData({...formData, accessControl: val})} />
                              <StarRating label="Visitor Management (10%) (Visitor verification & pass issuance)" value={formData.visitorManagement} onChange={(val) => setFormData({...formData, visitorManagement: val})} />
                              <StarRating label="Material Movement (10%) (Proper gate pass verification)" value={formData.materialMovement} onChange={(val) => setFormData({...formData, materialMovement: val})} />
                            </>
                          ) : (
                            <>
                              <StarRating label="Access Management (30%) (Parking)" value={formData.accessControl} onChange={(val) => setFormData({...formData, accessControl: val})} />
                              <StarRating label="Proper vehicle Verification (20%)" value={formData.materialMovement} onChange={(val) => setFormData({...formData, materialMovement: val})} />
                            </>
                          )}
                          <StarRating label="Training (5%) (Quarterly Monitoring)" value={formData.training} onChange={(val) => setFormData({...formData, training: val})} />
                          <StarRating label="Security observation (5%)" value={formData.securityAwareness} onChange={(val) => setFormData({...formData, securityAwareness: val})} />
                          <StarRating label="Discipline (15%) (Uniform & conduct)" value={formData.discipline} onChange={(val) => setFormData({...formData, discipline: val})} />
                          <StarRating label="Communication (10%) (Coordination with control room)" value={formData.communication} onChange={(val) => setFormData({...formData, communication: val})} />
                        </>
                      )}

                      {selectedCategory === 'Security Supervisor' && (
                        <>
                          <StarRating label="Team Management (10%) (Guard deployment as per plan)" value={formData.teamManagement} onChange={(val) => setFormData({...formData, teamManagement: val})} />
                          <StarRating label="Inspection (10%) (Routine site patrols conducted)" value={formData.inspection} onChange={(val) => setFormData({...formData, inspection: val})} />
                          <StarRating label="Incident Handling (10%) (Response time to incidents)" value={formData.incidentHandling} onChange={(val) => setFormData({...formData, incidentHandling: val})} />
                          <StarRating label="Reporting (5%) (Daily/weekly reports submission)" value={formData.reporting} onChange={(val) => setFormData({...formData, reporting: val})} />
                          <StarRating label="Weapon Handling (10%) (Maintenance & SOP compliance)" value={formData.weaponHandling} onChange={(val) => setFormData({...formData, weaponHandling: val})} />
                          <StarRating label="Training (5%) (Quarterly Monitoring)" value={formData.training} onChange={(val) => setFormData({...formData, training: val})} />
                          <StarRating label="Fleet handling (10%) (Liaison with drivers)" value={formData.fleetHandling} onChange={(val) => setFormData({...formData, fleetHandling: val})} />
                          <StarRating label="Liaison (10%) (Neighboring/Law enforcement)" value={formData.liaison} onChange={(val) => setFormData({...formData, liaison: val})} />
                          <StarRating label="Risk Identification (15%) (Hazards/security gaps reported)" value={formData.riskIdentification} onChange={(val) => setFormData({...formData, riskIdentification: val})} />
                        </>
                      )}

                      {selectedCategory === 'Paramedic Staff' && (
                        <>
                          <StarRating label="Emergency Response (15%) (Response time to incidents)" value={formData.emergencyResponse} onChange={(val) => setFormData({...formData, emergencyResponse: val})} />
                          <StarRating label="First Aid Cases (10%) (Proper treatment & documentation)" value={formData.firstAidCases} onChange={(val) => setFormData({...formData, firstAidCases: val})} />
                          <StarRating label="Equipment Readiness (10%) (First aid kits readiness)" value={formData.equipmentReadiness} onChange={(val) => setFormData({...formData, equipmentReadiness: val})} />
                          <StarRating label="Medicine Control (10%) (Stock availability)" value={formData.medicineControl} onChange={(val) => setFormData({...formData, medicineControl: val})} />
                          <StarRating label="Health Monitoring (10%) (Routine employee checks)" value={formData.healthMonitoring} onChange={(val) => setFormData({...formData, healthMonitoring: val})} />
                          <StarRating label="Training (10%) (Quarterly Monitoring)" value={formData.training} onChange={(val) => setFormData({...formData, training: val})} />
                          <StarRating label="Reporting (10%) (Incident/medical reports)" value={formData.reporting} onChange={(val) => setFormData({...formData, reporting: val})} />
                          <StarRating label="Hygiene & Clinic (10%) (Cleanliness & infection control)" value={formData.hygieneClinic} onChange={(val) => setFormData({...formData, hygieneClinic: val})} />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="col-span-full bg-emerald-50 p-6 rounded-2xl border border-emerald-100 relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-200/30 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
                        <h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2 mb-1">
                          <Zap className="text-emerald-500 fill-emerald-500" size={20} />
                          Soft FM Performance Hub: {selectedCategory}
                        </h3>
                        <p className="text-xs text-emerald-700 font-medium opacity-80">Precision evaluation based on role-specific intelligence.</p>
                      </div>

                      {selectedCategory === 'Receptionist' && (
                        <>
                          <StarRating label="Interpersonal & Professional Behavior (15%)" value={formData.behavior} onChange={(val) => setFormData({...formData, behavior: val})} />
                          <StarRating label="Visitor Management Log Precision (15%)" value={formData.visitorLog} onChange={(val) => setFormData({...formData, visitorLog: val})} />
                          <StarRating label="Rider Coordination & Log (15%)" value={formData.riderLog} onChange={(val) => setFormData({...formData, riderLog: val})} />
                          <StarRating label="Petty Cash Accountability (10%)" value={formData.pettyCash} onChange={(val) => setFormData({...formData, pettyCash: val})} />
                          <StarRating label="Courier & Dispatch Management (15%)" value={formData.courierLog} onChange={(val) => setFormData({...formData, courierLog: val})} />
                          <StarRating label="Consumables Inventory Control (15%)" value={formData.consumableLog} onChange={(val) => setFormData({...formData, consumableLog: val})} />
                        </>
                      )}

                      {selectedCategory === 'Rider' && (
                        <>
                          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-500 transition-colors">
                            <label className="block text-sm font-black text-gray-800 mb-3 flex items-center justify-between">
                              Total Monthly Deliveries (25%)
                              <Bike size={18} className="text-emerald-500" />
                            </label>
                            <input 
                              type="number" 
                              value={formData.numberOfRides}
                              onChange={(e) => setFormData({...formData, numberOfRides: parseInt(e.target.value) || 0})}
                              className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-bold text-lg"
                              placeholder="0"
                            />
                          </div>
                          <StarRating label="Road Discipline & Behavior (15%)" value={formData.behavior} onChange={(val) => setFormData({...formData, behavior: val})} />
                          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-500 transition-colors">
                            <label className="block text-sm font-black text-gray-800 mb-3">Mileage / KM Log (20%)</label>
                            <input 
                              type="number" 
                              value={formData.kmConsumed}
                              onChange={(e) => setFormData({...formData, kmConsumed: parseInt(e.target.value) || 0})}
                              className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-bold text-lg"
                              placeholder="0"
                            />
                          </div>
                          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-500 transition-colors">
                            <label className="block text-sm font-black text-gray-800 mb-3">Fuel Consumption Control (25%)</label>
                            <input 
                              type="number" 
                              value={formData.petrolConsumed}
                              onChange={(e) => setFormData({...formData, petrolConsumed: parseInt(e.target.value) || 0})}
                              className="w-full px-4 py-3 rounded-xl bg-gray-50 border-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-bold text-lg"
                              placeholder="0"
                            />
                          </div>
                        </>
                      )}

                      {selectedCategory === 'Office Boy' && (
                        <>
                          <StarRating label="Professional Mannerism (20%)" value={formData.behavior} onChange={(val) => setFormData({...formData, behavior: val})} />
                          <StarRating label="Kitchen & Pantry Standard (25%)" value={formData.kitchenHygiene} onChange={(val) => setFormData({...formData, kitchenHygiene: val})} />
                          <StarRating label="Collaboration Space Readiness (20%)" value={formData.meetingRoomReadiness} onChange={(val) => setFormData({...formData, meetingRoomReadiness: val})} />
                          <StarRating label="Smart utility Management (Energy conservation/AC/Lights) (20%)" value={formData.utilityManagement} onChange={(val) => setFormData({...formData, utilityManagement: val})} />
                        </>
                      )}

                      {selectedCategory === 'Janitorial' && (
                        <>
                          <StarRating label="Hygiene Protocol Compliance (20%)" value={formData.behavior} onChange={(val) => setFormData({...formData, behavior: val})} />
                          <StarRating label="Deep Cleaning Precision (25%)" value={formData.cleaningQuality} onChange={(val) => setFormData({...formData, cleaningQuality: val})} />
                          <StarRating label="Restroom Sanitization Score (20%)" value={formData.restroomHygiene} onChange={(val) => setFormData({...formData, restroomHygiene: val})} />
                          <StarRating label="Eco-Waste Management (20%)" value={formData.wasteManagement} onChange={(val) => setFormData({...formData, wasteManagement: val})} />
                        </>
                      )}

                      {selectedCategory === 'Valet' && (
                        <>
                          <StarRating label="Customer Interaction & Behavior (25%)" value={formData.behavior} onChange={(val) => setFormData({...formData, behavior: val})} />
                          <StarRating label="Fleet Management Efficiency (60%)" value={formData.performance} onChange={(val) => setFormData({...formData, performance: val})} />
                        </>
                      )}
                    </>
                  )}
                </div>

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
                    <MessageSquare size={18} className="text-indigo-500" />
                    Remarks (Mention reason for manual points here)
                  </label>
                  <div className="relative">
                    <textarea 
                      value={formData.remarks}
                      onChange={(e) => setFormData({...formData, remarks: e.target.value})}
                      placeholder="Add performance notes..."
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[100px]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        setIsGeneratingAI(true);
                        const insight = await generateSecurityInsights(
                          selectedStaff?.name || '',
                          selectedCategory || '',
                          formData,
                          formData.remarks
                        );
                        setAiInsight(insight || "Unable to generate insight.");
                        setIsGeneratingAI(false);
                      }}
                      disabled={isGeneratingAI}
                      className="absolute bottom-3 right-3 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg disabled:opacity-50"
                    >
                      {isGeneratingAI ? <Activity size={12} className="animate-spin" /> : <Zap size={12} />}
                      AI Insight
                    </button>
                  </div>
                  {aiInsight && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl mt-2"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Zap size={14} className="text-indigo-600" />
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Smart AI Analysis</span>
                      </div>
                      <p className="text-xs text-indigo-900 leading-relaxed italic">"{aiInsight}"</p>
                    </motion.div>
                  )}
                </div>

                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-gray-600">{type === 'security' ? 'Weighted Score (Max 100)' : 'Supervisor Score (Max 40)'}</span>
                    <span className="font-bold text-gray-900">{calculateScores().supervisorScore.toFixed(1)}</span>
                  </div>
                  {type !== 'security' && (
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-gray-600">Attendance Base (10 pts/day)</span>
                      <span className="font-bold text-gray-900">{10 * formData.workingDays}</span>
                    </div>
                  )}
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
