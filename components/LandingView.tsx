
import React from 'react';

const LandingView: React.FC<{ onProceed: () => void }> = ({ onProceed }) => {
  const videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-space-shuttle-launch-on-a-starry-night-43542-large.mp4";

  return (
    <div className="h-full w-full bg-[#030712] relative overflow-hidden flex flex-col items-center justify-center text-center">
      <div className="absolute inset-0 z-0">
        <video autoPlay loop muted playsInline className="w-full h-full object-cover opacity-30 grayscale blur-[1px]"><source src={videoUrl} type="video/mp4" /></video>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/70 to-slate-950"></div>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="rocket-flight-container">
           <div className="rocket-vessel">
              <div className="flex flex-col items-center">
                 <div className="w-[1px] h-40 bg-gradient-to-t from-transparent via-indigo-500/50 to-indigo-500 mb-6"></div>
                 <i className="fas fa-rocket text-white text-3xl shadow-[0_0_20px_#6366f1]"></i>
                 <div className="mt-8 space-y-2">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[1em] block opacity-30 italic">DISRUPT FM HUB</span>
                    <span className="text-[7px] font-bold text-white uppercase tracking-[0.5em] block opacity-10 italic">SYSTEMS STANDBY</span>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <div className="relative z-20 px-8 max-w-4xl w-full flex flex-col items-center">
        <header className="mb-20 animate-heroFadeIn">
          <p className="text-[11px] font-black text-indigo-500 uppercase tracking-[1em] mb-12 opacity-80 italic">Facility Operations Control v8.0</p>
          <h1 className="text-8xl md:text-[140px] font-extrabold text-white leading-none tracking-tighter mb-12 italic">DISRUPT</h1>
          <div className="max-w-2xl mx-auto">
            <p className="text-xl md:text-2xl font-medium text-white/50 leading-relaxed tracking-wide italic">Enterprise-grade Facilities Management. Precision logistics and synchronized maintenance workflows.</p>
          </div>
        </header>
        <div className="w-full max-w-md animate-slideUp" style={{ animationDelay: '0.6s' }}>
          <button onClick={onProceed} className="w-full h-24 px-12 bg-white/5 backdrop-blur-3xl hover:bg-white/10 text-white rounded-[3rem] font-black text-lg transition-all duration-700 border border-white/10 group flex items-center justify-between shadow-2xl active:scale-95">
            <span className="tracking-[0.6em] uppercase italic">Initialize Access</span>
            <div className="w-14 h-14 bg-white text-slate-950 rounded-2xl flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all duration-500 shadow-xl"><i className="fas fa-bolt"></i></div>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes heroFadeIn { from { opacity: 0; transform: translateY(50px); } to { opacity: 1; transform: translateY(0); } }
        .animate-heroFadeIn { animation: heroFadeIn 2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes slideUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slideUp { animation: slideUp 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .rocket-vessel { position: absolute; left: 50%; bottom: -400px; transform: translateX(-50%); animation: ascent 20s infinite linear; }
        @keyframes ascent { 0% { bottom: -400px; opacity: 0; } 5% { opacity: 0.8; } 95% { opacity: 0.8; } 100% { bottom: 120%; opacity: 0; } }
      `}</style>
    </div>
  );
};

export default LandingView;
