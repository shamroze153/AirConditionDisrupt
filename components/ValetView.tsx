import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, ArrowRight, ArrowLeft, CheckCircle2, XCircle, MapPin, User, Hash, MessageSquare, Loader2, Plus, Trash2, Lock, Settings } from 'lucide-react';
import { fetchValetData, logValetAction, fetchCarMaster, addCarMaster, deleteCarMaster, submitSoftFMEvaluation } from '../services/api';
import { ValetLogEntry, CarData } from '../types';
import { SOFT_FM_STAFF, PRE_DEFINED_VEHICLES } from '../constants';

const PARKING_LOCATIONS = ['P1', 'P2', 'P3', 'STREET'];
const VALET_DRIVERS = SOFT_FM_STAFF['Valet'].map(s => s.name);

const CAR_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
];

const CarIcon: React.FC<{ model: string; color: string; className?: string }> = ({ model, color, className }) => {
  const m = model.toUpperCase();
  const iconStyle = { color: color };
  
  return (
    <div className={`relative ${className}`} style={iconStyle}>
      <motion.div
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        {m === 'CHINGCHI' ? <Hash size={48} strokeWidth={2.5} /> : <Car size={48} strokeWidth={2.5} />}
      </motion.div>
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-black/10 blur-sm rounded-full" />
    </div>
  );
};

const CAR_MODELS = ['ALTO', 'COROLLA', 'CULTUS', 'SWIFT', 'YARIS', 'CITY', 'CIVIC', 'PASSO', 'MIRA', 'PICANTO', 'CHINGCHI', 'OTHER'];

const NumberPlate: React.FC<{ number: string; className?: string }> = ({ number, className }) => (
  <div className={`bg-white border-2 border-gray-900 rounded-md px-3 py-1 shadow-sm flex items-center justify-center inline-block ${className}`}>
    <div className="border border-gray-300 rounded px-2 py-0.5 flex items-center gap-2">
      <div className="w-1.5 h-6 bg-blue-600 rounded-sm" />
      <span className="text-xl font-black text-gray-900 tracking-tighter uppercase font-mono">{number}</span>
    </div>
  </div>
);

interface ValetViewProps {
  preLoadedLogs?: ValetLogEntry[];
  preLoadedCars?: CarData[];
  isPreLoaded?: boolean;
  onRefresh?: () => void;
}

export const ValetView: React.FC<ValetViewProps> = ({ preLoadedLogs, preLoadedCars, isPreLoaded, onRefresh }) => {
  const [logs, setLogs] = useState<ValetLogEntry[]>(preLoadedLogs || []);
  const [cars, setCars] = useState<CarData[]>(preLoadedCars || []);
  const [loading, setLoading] = useState(!isPreLoaded);
  const [view, setView] = useState<'main' | 'drive-in' | 'drive-out' | 'admin'>('main');
  const [selectedCar, setSelectedCar] = useState<CarData | null>(null);
  const [outCar, setOutCar] = useState<ValetLogEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddCarForm, setShowAddCarForm] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [newCar, setNewCar] = useState({
    number: '',
    model: CAR_MODELS[0],
    otherModel: '',
    notes: '',
    parkingSlot: PARKING_LOCATIONS[0]
  });
  const [formData, setFormData] = useState({
    carNumber: '',
    driverName: '',
    cardNumber: '',
    parkingSlot: PARKING_LOCATIONS[0],
    valetDriver: VALET_DRIVERS[0],
    remarks: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [valetData, carDataResult] = await Promise.allSettled([
        fetchValetData(),
        fetchCarMaster()
      ]);
      
      const valetDataVal = valetData.status === 'fulfilled' ? valetData.value : [];
      setLogs(valetDataVal);

      if (carDataResult.status === 'fulfilled') {
        // Merge pre-defined vehicles with backend data, avoiding duplicates by number
        const backendCars = carDataResult.value;
        const allCarsMap: Record<string, CarData> = {};
        
        PRE_DEFINED_VEHICLES.forEach(c => {
          allCarsMap[c.number.toUpperCase()] = c;
        });
        
        backendCars.forEach(c => {
          allCarsMap[c.number.toUpperCase()] = c;
        });
        
        setCars(Object.values(allCarsMap));
      } else {
        console.warn('Failed to fetch car master, using pre-defined and deriving from logs:', carDataResult.reason);
        const allCarsMap: Record<string, CarData> = {};
        
        PRE_DEFINED_VEHICLES.forEach(c => {
          allCarsMap[c.number.toUpperCase()] = c;
        });

        valetDataVal.forEach(log => {
          if (log.carNumber && !allCarsMap[log.carNumber.toUpperCase()]) {
            allCarsMap[log.carNumber.toUpperCase()] = {
              number: log.carNumber,
              model: log.remarks || 'Unknown',
              color: '#3b82f6'
            };
          }
        });
        setCars(Object.values(allCarsMap));
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPreLoaded && preLoadedLogs && preLoadedCars) {
      setLogs(preLoadedLogs);
      setCars(preLoadedCars);
      setLoading(false);
    } else {
      loadData();
    }
  }, [isPreLoaded, preLoadedLogs, preLoadedCars]);

  const today = new Date().toISOString().split('T')[0];
  
  const todayLogs = logs.filter(log => {
    const logDate = typeof log.date === 'string' ? log.date.split('T')[0] : '';
    return logDate === today;
  });

  const parkedCars = logs.reduce((acc: Record<string, ValetLogEntry>, log) => {
    if (log.timestampIn && (!log.timestampOut || String(log.timestampOut).trim() === "")) {
      acc[log.carNumber] = log;
    }
    return acc;
  }, {});

  const stats = {
    totalParkedToday: todayLogs.filter(l => l.timestampIn).length,
    totalReturnedToday: todayLogs.filter(l => l.timestampOut && String(l.timestampOut).trim() !== "").length,
    currentlyParked: Object.keys(parkedCars).length
  };

  const filteredCars = cars.filter(car => 
    car.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    car.model.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddCar = async () => {
    if (!newCar.number) {
      alert('Please enter car number');
      return;
    }
    const model = newCar.model === 'OTHER' ? newCar.otherModel : newCar.model;
    if (!model) {
      alert('Please enter car model');
      return;
    }

    setSubmitting(true);
    try {
      const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
      await addCarMaster({
        number: newCar.number.toUpperCase(),
        model: model.toUpperCase(),
        color: color,
        notes: newCar.notes
      });
      await loadData();
      setShowAddCarForm(false);
      setNewCar({
        number: '',
        model: CAR_MODELS[0],
        otherModel: '',
        notes: '',
        parkingSlot: PARKING_LOCATIONS[0]
      });
    } catch (error) {
      alert('Failed to add car');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCar = async (number: string) => {
    if (!confirm(`Are you sure you want to delete car ${number}?`)) return;
    
    setSubmitting(true);
    try {
      await deleteCarMaster(number);
      await loadData();
    } catch (error) {
      alert('Failed to delete car');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminLogin = () => {
    if (adminPassword === '5566') {
      setIsAdminAuthenticated(true);
      setAdminPassword('');
    } else {
      alert('Incorrect password');
    }
  };

  const handleDriveIn = async () => {
    if (!formData.carNumber || !formData.cardNumber) {
      alert('Please fill in required fields');
      return;
    }

    setSubmitting(true);
    try {
      await logValetAction({
        carNumber: formData.carNumber,
        cardNumber: formData.cardNumber,
        parkingSlot: formData.parkingSlot,
        valetAction: 'Drive IN',
        driver: formData.valetDriver,
        remarks: formData.remarks
      });

      // Live Auto Points Submission
      try {
        await submitSoftFMEvaluation({
          week: `Auto ${new Date().toLocaleDateString()}`,
          name: formData.valetDriver,
          department: 'Valet',
          attendance: 0,
          punctuality: 0,
          behavior: 0,
          performance: 0,
          supervisorScore: 0,
          autoDailyScore: 10,
          finalScore: 10,
          remarks: `Auto Valet IN: ${formData.carNumber}`
        });
      } catch (e) {
        console.error("Failed to submit live valet points:", e);
      }

      if (onRefresh) onRefresh();
      else await loadData();
      setView('main');
      setSelectedCar(null);
      setSearchQuery('');
      setFormData({
        carNumber: '',
        driverName: '',
        cardNumber: '',
        parkingSlot: PARKING_LOCATIONS[0],
        valetDriver: VALET_DRIVERS[0],
        remarks: ''
      });
    } catch (error) {
      alert('Failed to log action');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDriveOut = async () => {
    if (!outCar) return;

    setSubmitting(true);
    try {
      await logValetAction({
        carNumber: outCar.carNumber,
        valetAction: 'Drive OUT',
        driver: formData.valetDriver,
        remarks: 'Returned to owner'
      });

      // Live Auto Points Submission
      try {
        await submitSoftFMEvaluation({
          week: `Auto ${new Date().toLocaleDateString()}`,
          name: formData.valetDriver,
          department: 'Valet',
          attendance: 0,
          punctuality: 0,
          behavior: 0,
          performance: 0,
          supervisorScore: 0,
          autoDailyScore: 10,
          finalScore: 10,
          remarks: `Auto Valet OUT: ${outCar.carNumber}`
        });
      } catch (e) {
        console.error("Failed to submit live valet points:", e);
      }

      if (onRefresh) onRefresh();
      else await loadData();
      setView('main');
      setOutCar(null);
    } catch (error) {
      alert('Failed to log action');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading Valet System...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Dashboard Stats */}
      <div className="flex items-center justify-between gap-4">
        <div className="grid grid-cols-3 gap-4 flex-1">
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 text-center"
          >
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black mb-1">Parked Today</p>
            <p className="text-3xl font-black text-blue-600">{stats.totalParkedToday}</p>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 text-center"
          >
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black mb-1">Returned Today</p>
            <p className="text-3xl font-black text-green-600">{stats.totalReturnedToday}</p>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 text-center"
          >
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black mb-1">Current Parked</p>
            <p className="text-3xl font-black text-orange-600">{stats.currentlyParked}</p>
          </motion.div>
        </div>
        <motion.button
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setView('admin')}
          className="p-4 bg-gray-100 text-gray-400 rounded-full hover:bg-gray-200 transition-all"
        >
          <Settings size={24} />
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {view === 'main' && (
          <motion.div
            key="main"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4"
          >
            <motion.button
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setView('drive-in')}
              className="group relative h-72 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 rounded-[40px] shadow-2xl shadow-blue-200 flex flex-col items-center justify-center text-white overflow-hidden"
            >
              <div className="absolute -top-10 -right-10 p-8 opacity-20 group-hover:rotate-12 transition-transform">
                <Car size={240} />
              </div>
              <div className="bg-white/20 backdrop-blur-md p-8 rounded-[32px] mb-6 group-hover:scale-110 transition-transform shadow-inner">
                <ArrowRight size={56} strokeWidth={3} />
              </div>
              <span className="text-4xl font-black tracking-tighter uppercase italic">Drive IN</span>
              <span className="text-blue-100 mt-2 font-bold tracking-widest text-xs uppercase opacity-80">Receive Vehicle</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setView('drive-out')}
              className="group relative h-72 bg-gradient-to-br from-emerald-600 via-green-500 to-teal-600 rounded-[40px] shadow-2xl shadow-green-200 flex flex-col items-center justify-center text-white overflow-hidden"
            >
              <div className="absolute -top-10 -right-10 p-8 opacity-20 group-hover:-rotate-12 transition-transform">
                <Car size={240} />
              </div>
              <div className="bg-white/20 backdrop-blur-md p-8 rounded-[32px] mb-6 group-hover:scale-110 transition-transform shadow-inner">
                <ArrowLeft size={56} strokeWidth={3} />
              </div>
              <span className="text-4xl font-black tracking-tighter uppercase italic">Drive OUT</span>
              <span className="text-green-100 mt-2 font-bold tracking-widest text-xs uppercase opacity-80">Return Vehicle</span>
            </motion.button>
          </motion.div>
        )}

        {view === 'drive-in' && (
          <motion.div
            key="drive-in"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black text-gray-800 tracking-tighter flex items-center gap-3">
                <div className="bg-blue-500 p-2 rounded-xl text-white"><Car size={24} /></div>
                VEHICLE ENTRY
              </h2>
              <button
                onClick={() => { setView('main'); setSelectedCar(null); setSearchQuery(''); }}
                className="px-6 py-3 bg-gray-100 text-gray-500 rounded-2xl font-black text-sm hover:bg-gray-200 transition-all uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>

            {!selectedCar ? (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="relative group flex-1">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                      <Hash size={24} />
                    </div>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Type Car Number Plate (e.g. BYA...)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-16 pr-6 py-6 bg-white border-4 border-gray-50 focus:border-blue-500 rounded-[32px] outline-none transition-all font-black text-2xl shadow-xl shadow-gray-100"
                    />
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowAddCarForm(true)}
                    className="px-8 bg-blue-600 text-white rounded-[32px] font-black flex items-center gap-2 shadow-xl shadow-blue-100"
                  >
                    <Plus size={24} /> Add New Car
                  </motion.button>
                </div>

                <AnimatePresence>
                  {showAddCarForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-blue-50 p-8 rounded-[40px] border-4 border-blue-100 space-y-6 overflow-hidden"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-2">Car Number</label>
                          <input
                            type="text"
                            placeholder="ABC-123"
                            value={newCar.number}
                            onChange={e => setNewCar({ ...newCar, number: e.target.value })}
                            className="w-full px-6 py-4 bg-white rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-black text-xl uppercase"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-2">Car Model</label>
                          <select
                            value={newCar.model}
                            onChange={e => setNewCar({ ...newCar, model: e.target.value })}
                            className="w-full px-6 py-4 bg-white rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-black text-xl"
                          >
                            {CAR_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-2">Parking Slot</label>
                          <select
                            value={newCar.parkingSlot}
                            onChange={e => setNewCar({ ...newCar, parkingSlot: e.target.value })}
                            className="w-full px-6 py-4 bg-white rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-black text-xl"
                          >
                            {PARKING_LOCATIONS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        {newCar.model === 'OTHER' && (
                          <div className="md:col-span-3 space-y-2">
                            <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-2">Specify Model</label>
                            <input
                              type="text"
                              placeholder="Enter Car Model"
                              value={newCar.otherModel}
                              onChange={e => setNewCar({ ...newCar, otherModel: e.target.value })}
                              className="w-full px-6 py-4 bg-white rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-black text-xl uppercase"
                            />
                          </div>
                        )}
                        <div className="md:col-span-3 space-y-2">
                          <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-2">Notes (Driver / Other)</label>
                          <input
                            type="text"
                            placeholder="Optional notes..."
                            value={newCar.notes}
                            onChange={e => setNewCar({ ...newCar, notes: e.target.value })}
                            className="w-full px-6 py-4 bg-white rounded-2xl border-2 border-transparent focus:border-blue-500 outline-none font-black text-xl"
                          />
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <button
                          onClick={handleAddCar}
                          disabled={submitting}
                          className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                        >
                          {submitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Save & Add Car
                        </button>
                        <button
                          onClick={() => setShowAddCarForm(false)}
                          className="px-8 py-4 bg-white text-gray-400 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-100 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2 hide-scroll">
                  {filteredCars.length > 0 ? (
                    filteredCars.map(car => (
                      <motion.button
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={car.number}
                        disabled={!!parkedCars[car.number]}
                        onClick={() => {
                          setSelectedCar(car);
                          setFormData(prev => ({ 
                            ...prev, 
                            carNumber: car.number,
                            remarks: `${car.model}${car.notes && car.notes !== '-' ? ` (${car.notes})` : ''}`
                          }));
                        }}
                        className={`p-6 bg-white border-2 rounded-[32px] flex items-center gap-6 transition-all group relative text-left ${
                          parkedCars[car.number] 
                            ? 'opacity-40 cursor-not-allowed grayscale' 
                            : 'border-gray-100 hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-100'
                        }`}
                      >
                        <CarIcon model={car.model} color={car.color} className="shrink-0" />
                        <div className="flex-1">
                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">
                            {car.model} {car.notes && car.notes !== '-' ? `• ${car.notes}` : ''}
                          </div>
                          <NumberPlate number={car.number} />
                        </div>
                        <div className="bg-gray-50 p-3 rounded-2xl group-hover:bg-blue-50 transition-colors">
                          <ArrowRight className="text-gray-300 group-hover:text-blue-500" />
                        </div>
                        {parkedCars[car.number] && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-[32px]">
                            <span className="bg-orange-500 text-white text-xs font-black px-4 py-2 rounded-full uppercase tracking-widest shadow-lg">Already Parked</span>
                          </div>
                        )}
                      </motion.button>
                    ))
                  ) : (
                    <div className="col-span-full py-12 text-center bg-white rounded-[32px] border-4 border-dashed border-gray-100">
                      <Car className="mx-auto text-gray-200 mb-4" size={48} />
                      <p className="text-gray-400 font-bold uppercase tracking-widest">No cars found</p>
                      <p className="text-gray-300 text-sm">Add a new car or try another search</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[48px] shadow-2xl shadow-blue-100 border-4 border-gray-50 overflow-hidden"
              >
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-10 text-white flex items-center justify-between">
                  <div className="flex items-center gap-8">
                    <div className="bg-white/20 backdrop-blur-md p-6 rounded-[32px] shadow-inner">
                      <CarIcon model={selectedCar.model} color="#ffffff" />
                    </div>
                    <div>
                      <h3 className="text-5xl font-black tracking-tighter mb-2">{selectedCar.number}</h3>
                      <div className="flex items-center gap-3">
                        <span className="bg-white/20 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">{selectedCar.model}</span>
                        <span className="text-blue-100 text-xs font-bold uppercase tracking-widest opacity-80">Vehicle Entry</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedCar(null)} className="p-4 hover:bg-white/10 rounded-3xl transition-colors">
                    <XCircle size={40} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="p-10 space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-3 ml-2">
                        <Hash size={14} className="text-blue-500" /> Card Number Issued
                      </label>
                      <input
                        type="text"
                        autoFocus
                        value={formData.cardNumber}
                        onChange={e => setFormData({ ...formData, cardNumber: e.target.value })}
                        placeholder="000"
                        className="w-full px-8 py-6 bg-gray-50 border-4 border-transparent focus:border-blue-500 focus:bg-white rounded-[32px] outline-none transition-all font-black text-4xl tracking-tighter shadow-inner"
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-3 ml-2">
                        <MapPin size={14} className="text-blue-500" /> Select Parking
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {PARKING_LOCATIONS.map(loc => (
                          <button
                            key={loc}
                            onClick={() => setFormData({ ...formData, parkingSlot: loc })}
                            className={`py-5 rounded-[24px] font-black text-sm transition-all border-4 ${
                              formData.parkingSlot === loc
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-200 scale-105'
                                : 'bg-white text-gray-400 border-gray-50 hover:border-blue-100 hover:text-blue-500'
                            }`}
                          >
                            {loc}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="md:col-span-2 space-y-4">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-3 ml-2">
                        <User size={14} className="text-blue-500" /> Valet Driver
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {VALET_DRIVERS.map(d => (
                          <button
                            key={d}
                            onClick={() => setFormData({ ...formData, valetDriver: d })}
                            className={`py-5 rounded-[24px] font-black text-xs transition-all border-4 ${
                              formData.valetDriver === d
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-200 scale-105'
                                : 'bg-white text-gray-400 border-gray-50 hover:border-indigo-100 hover:text-indigo-500'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleDriveIn}
                    disabled={submitting || !formData.cardNumber}
                    className="w-full py-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-200 disabled:to-gray-300 text-white rounded-[32px] font-black text-2xl shadow-2xl shadow-blue-200 transition-all flex items-center justify-center gap-4 uppercase tracking-widest italic"
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" size={32} />
                    ) : (
                      <>
                        <CheckCircle2 size={32} /> CONFIRM ENTRY
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {view === 'drive-out' && (
          <motion.div
            key="drive-out"
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black text-gray-800 tracking-tighter flex items-center gap-3">
                <div className="bg-emerald-500 p-2 rounded-xl text-white"><Car size={24} /></div>
                {outCar ? 'CONFIRM RETURN' : 'PARKED VEHICLES'}
              </h2>
              <button
                onClick={() => {
                  if (outCar) setOutCar(null);
                  else setView('main');
                }}
                className="px-6 py-3 bg-gray-100 text-gray-500 rounded-2xl font-black text-sm hover:bg-gray-200 transition-all uppercase tracking-widest"
              >
                {outCar ? 'Back' : 'Home'}
              </button>
            </div>

            {!outCar ? (
              Object.keys(parkedCars).length === 0 ? (
                <div className="bg-white p-20 rounded-[48px] border-4 border-dashed border-gray-100 text-center space-y-6">
                  <div className="bg-gray-50 w-32 h-32 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <Car className="text-gray-200" size={64} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-gray-300 uppercase tracking-widest">Parking Empty</p>
                    <p className="text-gray-400 font-medium mt-2">No vehicles currently in valet</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.values(parkedCars).map((car: ValetLogEntry) => (
                    <motion.button
                      whileHover={{ scale: 1.02, x: 5 }}
                      whileTap={{ scale: 0.98 }}
                      key={car.carNumber}
                      onClick={() => setOutCar(car)}
                      className="bg-white p-8 rounded-[40px] border-4 border-gray-50 hover:border-emerald-500 hover:shadow-2xl hover:shadow-emerald-100 transition-all text-left flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-6">
                        <div className="bg-emerald-50 p-5 rounded-[28px] group-hover:bg-emerald-500 group-hover:text-white transition-colors shadow-inner">
                          <Car size={40} strokeWidth={2.5} />
                        </div>
                        <div>
                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{car.remarks || 'Vehicle'}</div>
                          <h3 className="text-3xl font-black text-gray-800 tracking-tight group-hover:text-emerald-600 transition-colors">{car.carNumber}</h3>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="bg-gray-100 px-3 py-1 rounded-full text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
                              <MapPin size={10} /> {car.parkingSlot}
                            </span>
                            <span className="bg-emerald-100 px-3 py-1 rounded-full text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                              Card {car.cardNumber}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-2xl group-hover:bg-emerald-50 transition-colors">
                        <ArrowLeft className="text-gray-300 group-hover:text-emerald-500" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              )
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[48px] shadow-2xl shadow-emerald-100 border-4 border-gray-50 overflow-hidden"
              >
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-10 text-white flex items-center justify-between">
                  <div className="flex items-center gap-8">
                    <div className="bg-white/20 backdrop-blur-md p-6 rounded-[32px] shadow-inner">
                      <Car size={48} strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="text-5xl font-black tracking-tighter mb-2">{outCar.carNumber}</h3>
                      <div className="flex items-center gap-3">
                        <span className="bg-white/20 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">Return Request</span>
                        <span className="text-emerald-100 text-xs font-bold uppercase tracking-widest opacity-80">Slot: {outCar.parkingSlot}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setOutCar(null)} className="p-4 hover:bg-white/10 rounded-3xl transition-colors">
                    <XCircle size={40} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="p-10 space-y-10">
                  <div className="bg-gray-50 p-8 rounded-[40px] flex items-center justify-between shadow-inner">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Parking Location</p>
                      <p className="text-4xl font-black text-gray-800 tracking-tighter italic">{outCar.parkingSlot}</p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Card Number</p>
                      <p className="text-4xl font-black text-emerald-600 tracking-tighter italic">#{outCar.cardNumber}</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-3 ml-2">
                      <User size={16} className="text-emerald-500" /> Who is bringing the car?
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {VALET_DRIVERS.map(d => (
                        <button
                          key={d}
                          onClick={() => setFormData({ ...formData, valetDriver: d })}
                          className={`py-6 rounded-[24px] font-black text-xs transition-all border-4 ${
                            formData.valetDriver === d
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xl shadow-emerald-200 scale-105'
                              : 'bg-white text-gray-500 border-gray-100 hover:border-emerald-100 hover:text-emerald-500'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleDriveOut}
                    disabled={submitting}
                    className="w-full py-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-gray-200 disabled:to-gray-300 text-white rounded-[32px] font-black text-2xl shadow-2xl shadow-emerald-200 transition-all flex items-center justify-center gap-4 uppercase tracking-widest italic"
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" size={32} />
                    ) : (
                      <>
                        <CheckCircle2 size={32} /> CONFIRM RETURN
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {view === 'admin' && (
          <motion.div
            key="admin"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black text-gray-800 tracking-tighter flex items-center gap-3">
                <div className="bg-gray-800 p-2 rounded-xl text-white"><Settings size={24} /></div>
                ADMIN CONTROL
              </h2>
              <button
                onClick={() => { setView('main'); setIsAdminAuthenticated(false); setAdminPassword(''); }}
                className="px-6 py-3 bg-gray-100 text-gray-500 rounded-2xl font-black text-sm hover:bg-gray-200 transition-all uppercase tracking-widest"
              >
                Exit
              </button>
            </div>

            {!isAdminAuthenticated ? (
              <div className="bg-white p-12 rounded-[48px] shadow-2xl shadow-gray-100 border-4 border-gray-50 flex flex-col items-center space-y-8">
                <div className="bg-gray-100 p-8 rounded-full">
                  <Lock size={64} className="text-gray-400" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Restricted Access</h3>
                  <p className="text-gray-400 font-medium">Enter admin password to manage car master list</p>
                </div>
                <div className="w-full max-w-xs space-y-4">
                  <input
                    type="password"
                    placeholder="••••"
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    className="w-full px-8 py-6 bg-gray-50 border-4 border-transparent focus:border-gray-800 rounded-[32px] outline-none text-center font-black text-4xl tracking-[0.5em] transition-all"
                  />
                  <button
                    onClick={handleAdminLogin}
                    className="w-full py-6 bg-gray-800 text-white rounded-[32px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-gray-200"
                  >
                    Unlock
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-white p-8 rounded-[40px] border-4 border-gray-50 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Manage Car Master</h3>
                    <div className="text-xs font-black text-gray-400 uppercase tracking-widest">{cars.length} Total Cars</div>
                  </div>
                  
                  <div className="relative">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400">
                      <Hash size={20} />
                    </div>
                    <input
                      type="text"
                      placeholder="Search car to delete..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-transparent focus:border-gray-800 rounded-2xl outline-none transition-all font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 hide-scroll">
                    {filteredCars.map(car => (
                      <div key={car.number} className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between group hover:bg-white hover:shadow-lg transition-all border-2 border-transparent hover:border-gray-100">
                        <div className="flex items-center gap-4">
                          <CarIcon model={car.model} color={car.color} className="scale-75" />
                          <div>
                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{car.model}</div>
                            <div className="text-lg font-black text-gray-800">{car.number}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteCar(car.number)}
                          disabled={submitting}
                          className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
