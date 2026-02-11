import React from 'react';

const LandingView: React.FC<{ onProceed: () => void }> = ({ onProceed }) => {
  return (
    <div className="h-full w-full bg-[#020617] relative overflow-hidden flex flex-col items-center justify-center text-center px-4">
      {/* 3D Background Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden perspective-1000">
        {/* Animated Grid Floor */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[200%] h-[100%] bg-[linear-gradient(to_right,#1e1b4b_1px,transparent_1px),linear-gradient(to_bottom,#1e1b4b_1px,transparent_1px)] bg-[size:40px_40px] [transform:rotateX(60deg)_translateY(20%)] opacity-20 animate-gridTravel"></div>
        
        {/* Floating Digital Particles */}
        <div className="absolute inset-0 opacity-30">
          {[...Array(20)].map((_, i) => (
            <div 
              key={i}
              className="absolute bg-indigo-500 rounded-full blur-[1px] animate-particleFloat"
              style={{
                width: Math.random() * 3 + 'px',
                height: Math.random() * 3 + 'px',
                left: Math.random() * 100 + '%',
                top: Math.random() * 100 + '%',
                animationDelay: Math.random() * 5 + 's',
                animationDuration: 10 + Math.random() * 20 + 's'
              }}
            ></div>
          ))}
        </div>

        {/* Cinematic Rocket Streak */}
        <div className="absolute top-1/3 left-[-10%] w-[120%] h-[1px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent rotate-[-15deg] opacity-20 animate-streakPass"></div>
      </div>

      <div className="relative z-20 max-w-4xl w-full flex flex-col items-center">
        <header className="mb-8 animate-heroReveal">
          {/* Version Tag */}
          <div className="inline-flex items-center gap-2 bg-indigo-950/50 border border-indigo-500/30 px-4 py-1.5 rounded-full mb-8 backdrop-blur-md">
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse shadow-[0_0_8px_#818cf8]"></span>
            <p className="text-[8px] font-black text-indigo-300 uppercase tracking-[0.4em] italic">Enterprise Protocol v9.0</p>
          </div>

          {/* Logo Section */}
          <div className="relative group mb-6">
            <h1 className="text-7xl md:text-9xl font-black text-white leading-none tracking-tighter mb-2 italic drop-shadow-[0_20px_50px_rgba(79,70,229,0.3)]">
              DISRUPT
            </h1>
            <h2 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-500 tracking-[0.2em] italic uppercase leading-none mt-2">
              WORKPLACE
            </h2>
          </div>
          
          <div className="max-w-md mx-auto relative mb-12">
            <div className="h-[1px] w-12 bg-indigo-500/50 mx-auto mb-6"></div>
            <p className="text-[10px] md:text-xs font-bold text-slate-400 leading-relaxed tracking-[0.2em] uppercase italic px-4">
              Operations Control <span className="text-white">&</span> Logistics Optimization
            </p>
          </div>
        </header>

        {/* Action Button - Moved above quote */}
        <div className="w-full max-w-[280px] mb-16 animate-btnFadeIn" style={{ animationDelay: '0.4s' }}>
          <button 
            onClick={onProceed} 
            className="w-full group relative h-20 bg-white/5 hover:bg-white/10 text-white rounded-[2rem] font-black text-[11px] transition-all duration-500 border border-white/10 overflow-hidden shadow-2xl active:scale-95"
          >
            <div className="absolute inset-0 bg-indigo-600 opacity-0 group-hover:opacity-10 transition-opacity duration-500"></div>
            
            <div className="relative z-10 flex items-center justify-between px-10 h-full">
              <span className="tracking-[0.4em] uppercase italic">ENTER PORTAL</span>
              <div className="w-12 h-12 bg-white text-slate-950 rounded-2xl flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white group-hover:rotate-[360deg] transition-all duration-700 shadow-xl">
                <i className="fas fa-chevron-right text-xs"></i>
              </div>
            </div>

            <div className="absolute top-0 -left-full w-1/2 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-25deg] group-hover:animate-shimmer"></div>
          </button>
        </div>

        {/* Philosophy Quote Section - Moved below button */}
        <div className="max-w-2xl mx-auto animate-fadeIn" style={{ animationDelay: '0.8s' }}>
          <div className="relative p-8 md:p-10">
            {/* Subtle corner accents */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-indigo-500/20 rounded-tl-2xl"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-indigo-500/20 rounded-br-2xl"></div>
            
            <blockquote className="text-slate-300 font-medium text-sm md:text-lg leading-relaxed italic">
              "Whether it’s a machine, a house, or a relationship,{' '}
              <span className="relative inline-block text-white font-bold not-italic">
                maintenance is always cheaper than repairing
                <span className="absolute -bottom-1 left-0 w-full h-[2px] bg-gradient-to-r from-indigo-500 to-blue-500"></span>
              </span>
              . If you don’t maintain, you eventually lose."
            </blockquote>
            
            <div className="mt-6 flex items-center justify-center gap-3">
              <div className="h-[1px] w-4 bg-indigo-500/30"></div>
              <p className="text-[7px] font-black text-indigo-400 uppercase tracking-[0.5em]">Facility Philosophy</p>
              <div className="h-[1px] w-4 bg-indigo-500/30"></div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .perspective-1000 { perspective: 1000px; }

        @keyframes gridTravel {
          from { transform: rotateX(60deg) translateY(0); }
          to { transform: rotateX(60deg) translateY(40px); }
        }
        .animate-gridTravel {
          animation: gridTravel 2s linear infinite;
        }

        @keyframes particleFloat {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          20% { opacity: 0.5; }
          80% { opacity: 0.5; }
          100% { transform: translateY(-200px) translateX(20px); opacity: 0; }
        }
        .animate-particleFloat {
          animation: particleFloat infinite ease-out;
        }

        @keyframes streakPass {
          0% { transform: translateX(-100%) rotate(-15deg); opacity: 0; }
          10% { opacity: 0.2; }
          90% { opacity: 0.2; }
          100% { transform: translateX(100%) rotate(-15deg); opacity: 0; }
        }
        .animate-streakPass {
          animation: streakPass 8s infinite cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes heroReveal {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-heroReveal {
          animation: heroReveal 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes btnFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-btnFadeIn {
          animation: btnFadeIn 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes shimmer {
          100% { left: 150%; }
        }
        .animate-shimmer {
          animation: shimmer 1.5s infinite;
        }
      `}</style>
    </div>
  );
};

export default LandingView;