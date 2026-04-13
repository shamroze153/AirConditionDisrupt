
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Star, Clock, UserCheck, MessageSquare, ArrowLeft, Save, TrendingUp, Award, User } from 'lucide-react';
import { SoftFMEvaluation, SoftFMStaff } from '../types';
import { submitSoftFMEvaluation, fetchSoftFMEvaluations } from '../services/api';
import { SOFT_FM_STAFF } from '../constants';

interface SoftFMViewProps {
  onBack: () => void;
  isAdmin: boolean;
}

const CATEGORIES = ['Janitorial', 'Valet', 'Office Boy', 'Other'];

export const SoftFMView: React.FC<SoftFMViewProps> = ({ onBack, isAdmin }) => {
  const [view, setView] = useState<'categories' | 'staff' | 'form' | 'self-view'>('categories');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<SoftFMEvaluation[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [selfEval, setSelfEval] = useState<SoftFMEvaluation | null>(null);

  const [formData, setFormData] = useState({
    attendance: 10,
    punctuality: 10,
    behavior: 10,
    performance: 10,
    workingDays: 6,
    remarks: ''
  });

  useEffect(() => {
    loadEvaluations();
  }, []);

  const loadEvaluations = async () => {
    try {
      setLoading(true);
      const data = await fetchSoftFMEvaluations();
      setEvaluations(data);
    } catch (error) {
      console.error("Failed to load evaluations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
    setView('staff');
  };

  const handleStaffSelect = (name: string) => {
    setSelectedStaff(name);
    setView('form');
  };

  const calculateScores = () => {
    const supervisorScore = formData.attendance + formData.punctuality + formData.behavior + formData.performance;
    const autoDailyScore = 10 * formData.workingDays;
    const finalScore = supervisorScore + autoDailyScore;
    return { supervisorScore, autoDailyScore, finalScore };
  };

  const handleSubmit = async () => {
    if (!selectedStaff || !selectedCategory) return;
    
    try {
      setSubmitting(true);
      const { supervisorScore, autoDailyScore, finalScore } = calculateScores();
      
      const newEval: Omit<SoftFMEvaluation, 'timestamp'> = {
        week: `Week ${new Date().toLocaleDateString('en-US', { week: 'numeric' } as any)}`, // Simple week string
        name: selectedStaff,
        department: selectedCategory,
        attendance: formData.attendance,
        punctuality: formData.punctuality,
        behavior: formData.behavior,
        performance: formData.performance,
        supervisorScore,
        autoDailyScore,
        finalScore,
        remarks: formData.remarks
      };

      await submitSoftFMEvaluation(newEval);
      alert("Evaluation saved successfully!");
      setView('categories');
      loadEvaluations();
    } catch (error) {
      alert("Failed to save evaluation. Please try again.");
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

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-8 pb-32">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Back to Excellence Hub</span>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Soft FM Scorecard</h1>
        </div>

        <AnimatePresence mode="wait">
          {view === 'categories' && (
            <motion.div 
              key="categories"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div className="col-span-full mb-4">
                <h2 className="text-lg font-semibold text-gray-700">Select Category</h2>
              </div>
              {CATEGORIES.map((cat) => (
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
              <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setView('categories')} className="p-2 hover:bg-gray-100 rounded-full">
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-bold text-gray-900">{selectedCategory} Staff</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(SOFT_FM_STAFF[selectedCategory!] || []).map((name) => (
                  <button
                    key={name}
                    onClick={() => handleStaffSelect(name)}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-indigo-500 transition-all text-left flex items-center gap-4"
                  >
                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                      <User size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{name}</h3>
                      <p className="text-sm text-gray-500">{selectedCategory}</p>
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
                  <span className="text-indigo-100">Weekly Report Card</span>
                  <span className="bg-indigo-500 px-3 py-1 rounded-full text-xs font-bold">Week {new Date().toLocaleDateString('en-US', { week: 'numeric' } as any)}</span>
                </div>
                <h2 className="text-2xl font-bold">{selectedStaff}</h2>
                <p className="text-indigo-100">{selectedCategory} Department</p>
              </div>

              <div className="p-6 space-y-6">
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

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                    Working Days (for Daily Score)
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

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                    <MessageSquare size={18} />
                    Remarks
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
                    <span className="text-gray-600">Daily Base Score (10 pts/day)</span>
                    <span className="font-bold text-gray-900">{calculateScores().autoDailyScore}</span>
                  </div>
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
                    onClick={() => setView('categories')}
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
