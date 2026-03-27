import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, ArrowRight, ArrowLeft, CheckCircle2, XCircle, MapPin, User, Hash, MessageSquare, Loader2 } from 'lucide-react';
import { fetchValetData, logValetAction } from '../services/api';
import { ValetLogEntry } from '../types';

const PARKING_LOCATIONS = ['Parking 1', 'Parking 2', 'Parking 3', 'Street'];
const VALET_DRIVERS = ['Owais', 'Kashif', 'Farooq', 'Salah Uddin'];

interface CarData {
  number: string;
  model: string;
  color: string;
}

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

const REAL_CARS: CarData[] = [
  { number: 'BYK 825', model: 'CHINGCHI', color: CAR_COLORS[0] },
  { number: 'BYA 853', model: 'COROLLA', color: CAR_COLORS[1] },
  { number: 'CEN 761', model: 'ALTO', color: CAR_COLORS[2] },
  { number: 'AVH 384', model: 'SWIFT', color: CAR_COLORS[3] },
  { number: 'BAF 386', model: 'SWIFT', color: CAR_COLORS[4] },
  { number: 'BWA 854', model: 'CHINGCHI', color: CAR_COLORS[5] },
  { number: 'AUR 796', model: 'ALTO', color: CAR_COLORS[6] },
  { number: 'BXW 990', model: 'ALTO', color: CAR_COLORS[7] },
  { number: 'BSM 897', model: 'ALTO', color: CAR_COLORS[8] },
  { number: 'BK 7815', model: 'ALTO', color: CAR_COLORS[9] },
  { number: 'BPN-065', model: 'SPOT', color: CAR_COLORS[0] },
  { number: 'BAF-386', model: 'COROLLA', color: CAR_COLORS[1] },
  { number: 'BXP-886', model: 'CULTUS', color: CAR_COLORS[2] },
  { number: 'ABA 081', model: 'PICANTO', color: CAR_COLORS[3] },
  { number: 'BYU 106', model: 'ALTO', color: CAR_COLORS[4] },
  { number: 'BAF 672', model: 'PASSO', color: CAR_COLORS[5] },
  { number: 'BXP 672', model: 'PASSO', color: CAR_COLORS[6] },
  { number: 'BYB-611', model: 'YARIS', color: CAR_COLORS[7] },
  { number: 'BOK 490', model: 'ALTO', color: CAR_COLORS[8] },
  { number: 'ADW 550', model: 'ALTO', color: CAR_COLORS[9] },
  { number: 'APH-693', model: 'CULTUS', color: CAR_COLORS[0] },
  { number: 'BVR 183', model: 'PASSO', color: CAR_COLORS[1] },
  { number: 'BZH 189', model: 'PASSO', color: CAR_COLORS[2] },
  { number: 'BNP-432', model: 'MIRA', color: CAR_COLORS[3] },
  { number: 'AWY 093', model: 'ALTO', color: CAR_COLORS[4] },
  { number: 'AUY 624', model: 'ALTO', color: CAR_COLORS[5] },
  { number: 'BPG 535', model: 'VITZ', color: CAR_COLORS[6] },
  { number: 'CBL 336', model: 'CITY', color: CAR_COLORS[7] },
  { number: 'BJL 893', model: 'CIVIC', color: CAR_COLORS[8] },
  { number: 'BN 1535', model: 'ISTIG', color: CAR_COLORS[9] },
  { number: 'BUY 228', model: 'YARIS', color: CAR_COLORS[0] },
  { number: 'AWM 340', model: 'LANT', color: CAR_COLORS[1] },
  { number: 'BAT 942', model: 'CULTUS', color: CAR_COLORS[2] },
  { number: 'BLU 294', model: 'CULTUS', color: CAR_COLORS[3] },
  { number: 'CEN 651', model: 'UNKNOWN', color: CAR_COLORS[4] },
  { number: 'BXG 190', model: 'CITY', color: CAR_COLORS[5] },
  { number: 'BH 7703', model: 'ISTIG', color: CAR_COLORS[6] },
  { number: 'BUE-709', model: 'UNKNOWN', color: CAR_COLORS[7] },
  { number: 'BF 2275', model: 'JP', color: CAR_COLORS[8] },
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

export const ValetView: React.FC = () => {
  const [logs, setLogs] = useState<ValetLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'main' | 'drive-in' | 'drive-out'>('main');
  const [selectedCar, setSelectedCar] = useState<CarData | null>(null);
  const [outCar, setOutCar] = useState<ValetLogEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
      const data = await fetchValetData();
      setLogs(data);
    } catch (error) {
      console.error('Failed to fetch valet data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const filteredCars = REAL_CARS.filter(car => 
    car.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    car.model.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      await loadData();
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
      await loadData();
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
      <div className="grid grid-cols-3 gap-4">
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
                <div className="relative group">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2 hide-scroll">
                  {filteredCars.map(car => (
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
                          remarks: car.model
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
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{car.model}</div>
                        <div className="text-2xl font-black text-gray-800 tracking-tight group-hover:text-blue-600 transition-colors">{car.number}</div>
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
                  ))}
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
      </AnimatePresence>
    </div>
  );
};
