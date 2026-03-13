import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, ArrowRight, ArrowLeft, CheckCircle2, XCircle, MapPin, User, Hash, MessageSquare, Loader2 } from 'lucide-react';
import { fetchValetData, logValetAction } from '../services/api';
import { ValetLogEntry } from '../types';

const PARKING_LOCATIONS = ['Parking 1', 'Parking 2', 'Parking 3', 'Street'];
const VALET_DRIVERS = ['Owais', 'Kashif', 'Farooq', 'Salah Uddin'];
const DEMO_CARS = Array.from({ length: 20 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`);

export const ValetView: React.FC = () => {
  const [logs, setLogs] = useState<ValetLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'main' | 'drive-in' | 'drive-out'>('main');
  const [selectedCar, setSelectedCar] = useState<string | null>(null);
  const [outCar, setOutCar] = useState<ValetLogEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
    // Handle date format from sheet (yyyy-MM-dd)
    const logDate = typeof log.date === 'string' ? log.date.split('T')[0] : '';
    return logDate === today;
  });

  const parkedCars = logs.reduce((acc: Record<string, ValetLogEntry>, log) => {
    // A car is currently parked if it has a timestampIn but no timestampOut
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
        remarks: formData.remarks ? `Owner: ${formData.driverName} | ${formData.remarks}` : `Owner: ${formData.driverName}`
      });
      await loadData();
      setView('main');
      setSelectedCar(null);
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
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Parked Today</p>
          <p className="text-2xl font-bold text-blue-600">{stats.totalParkedToday}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Returned Today</p>
          <p className="text-2xl font-bold text-green-600">{stats.totalReturnedToday}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Current Parked</p>
          <p className="text-2xl font-bold text-orange-600">{stats.currentlyParked}</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === 'main' && (
          <motion.div
            key="main"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4"
          >
            <button
              onClick={() => setView('drive-in')}
              className="group relative h-64 bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl shadow-xl shadow-blue-200 flex flex-col items-center justify-center text-white overflow-hidden transition-transform active:scale-95"
            >
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                <Car size={160} />
              </div>
              <div className="bg-white/20 p-6 rounded-full mb-4 group-hover:scale-110 transition-transform">
                <ArrowRight size={48} strokeWidth={3} />
              </div>
              <span className="text-3xl font-black tracking-tighter uppercase">Drive IN</span>
              <span className="text-blue-100 mt-2 font-medium">Receive Vehicle</span>
            </button>

            <button
              onClick={() => setView('drive-out')}
              className="group relative h-64 bg-gradient-to-br from-green-500 to-green-600 rounded-3xl shadow-xl shadow-green-200 flex flex-col items-center justify-center text-white overflow-hidden transition-transform active:scale-95"
            >
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                <Car size={160} />
              </div>
              <div className="bg-white/20 p-6 rounded-full mb-4 group-hover:scale-110 transition-transform">
                <ArrowLeft size={48} strokeWidth={3} />
              </div>
              <span className="text-3xl font-black tracking-tighter uppercase">Drive OUT</span>
              <span className="text-green-100 mt-2 font-medium">Return Vehicle</span>
            </button>
          </motion.div>
        )}

        {view === 'drive-in' && (
          <motion.div
            key="drive-in"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Car className="text-blue-500" /> Select Vehicle
              </h2>
              <button
                onClick={() => { setView('main'); setSelectedCar(null); }}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>

            {!selectedCar ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {DEMO_CARS.map(carNum => (
                  <button
                    key={carNum}
                    onClick={() => {
                      setSelectedCar(carNum);
                      setFormData(prev => ({ ...prev, carNumber: carNum }));
                    }}
                    className="aspect-square bg-white border-2 border-gray-100 rounded-2xl flex flex-col items-center justify-center gap-1 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                  >
                    <Car className="text-gray-300 group-hover:text-blue-500 transition-colors" size={32} />
                    <span className="text-lg font-black text-gray-700 group-hover:text-blue-700">{carNum}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="bg-blue-500 p-6 text-white flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-2xl">
                      <Car size={32} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">{selectedCar}</h3>
                      <p className="text-blue-100 text-sm">Vehicle Registration</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedCar(null)} className="p-2 hover:bg-white/10 rounded-xl">
                    <XCircle size={24} />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <User size={14} /> Driver Name
                      </label>
                      <input
                        type="text"
                        value={formData.driverName}
                        onChange={e => setFormData({ ...formData, driverName: e.target.value })}
                        placeholder="Enter Driver Name"
                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-xl outline-none transition-all font-medium"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Hash size={14} /> Card Number Issued
                      </label>
                      <input
                        type="text"
                        value={formData.cardNumber}
                        onChange={e => setFormData({ ...formData, cardNumber: e.target.value })}
                        placeholder="e.g. Card 1"
                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-xl outline-none transition-all font-medium"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <MapPin size={14} /> Parking Location
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {PARKING_LOCATIONS.map(loc => (
                          <button
                            key={loc}
                            onClick={() => setFormData({ ...formData, parkingSlot: loc })}
                            className={`py-3 rounded-xl font-bold transition-all ${
                              formData.parkingSlot === loc
                                ? 'bg-blue-500 text-white shadow-lg shadow-blue-200'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                            }`}
                          >
                            {loc}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <User size={14} /> Valet Driver
                      </label>
                      <select
                        value={formData.valetDriver}
                        onChange={e => setFormData({ ...formData, valetDriver: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-xl outline-none transition-all font-bold appearance-none"
                      >
                        {VALET_DRIVERS.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <MessageSquare size={14} /> Remarks (Optional)
                      </label>
                      <textarea
                        value={formData.remarks}
                        onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                        placeholder="Any scratches, fuel level, etc."
                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-xl outline-none transition-all font-medium h-24 resize-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleDriveIn}
                    disabled={submitting}
                    className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-2xl font-black text-xl shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-3"
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 /> SUBMIT DRIVE IN
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {view === 'drive-out' && (
          <motion.div
            key="drive-out"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Car className="text-green-500" /> {outCar ? 'Confirm Exit' : 'Currently Parked'}
              </h2>
              <button
                onClick={() => {
                  if (outCar) setOutCar(null);
                  else setView('main');
                }}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
              >
                {outCar ? 'Back' : 'Home'}
              </button>
            </div>

            {!outCar ? (
              Object.keys(parkedCars).length === 0 ? (
                <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-gray-100 text-center space-y-4">
                  <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                    <Car className="text-gray-300" size={40} />
                  </div>
                  <p className="text-gray-400 font-medium">No cars currently parked</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.values(parkedCars).map((car: ValetLogEntry) => (
                    <button
                      key={car.carNumber}
                      onClick={() => setOutCar(car)}
                      className="bg-white p-6 rounded-3xl border-2 border-gray-100 hover:border-green-500 hover:shadow-lg transition-all text-left flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-green-50 p-4 rounded-2xl group-hover:bg-green-500 group-hover:text-white transition-colors">
                          <Car size={32} />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black text-gray-800">{car.carNumber}</h3>
                          <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
                            <MapPin size={14} /> {car.parkingSlot}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">Card: {car.cardNumber}</div>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-xl group-hover:bg-green-100 transition-colors">
                        <ArrowLeft className="text-gray-400 group-hover:text-green-600" />
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="bg-green-500 p-6 text-white flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-2xl">
                      <Car size={32} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">{outCar.carNumber}</h3>
                      <p className="text-green-100 text-sm">Return Vehicle</p>
                    </div>
                  </div>
                  <button onClick={() => setOutCar(null)} className="p-2 hover:bg-white/10 rounded-xl">
                    <XCircle size={24} />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  <div className="bg-gray-50 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Parking Slot</p>
                      <p className="text-lg font-black text-gray-800">{outCar.parkingSlot}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Card Number</p>
                      <p className="text-lg font-black text-gray-800">{outCar.cardNumber}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <User size={16} className="text-green-500" /> Who is bringing the car?
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {VALET_DRIVERS.map(d => (
                        <button
                          key={d}
                          onClick={() => setFormData({ ...formData, valetDriver: d })}
                          className={`py-4 rounded-2xl font-black text-sm transition-all border-2 ${
                            formData.valetDriver === d
                              ? 'bg-green-500 text-white border-green-500 shadow-lg shadow-green-100'
                              : 'bg-white text-gray-500 border-gray-100 hover:border-green-200'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleDriveOut}
                    disabled={submitting}
                    className="w-full py-5 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-2xl font-black text-xl shadow-xl shadow-green-200 transition-all flex items-center justify-center gap-3"
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 /> CONFIRM DRIVE OUT
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
