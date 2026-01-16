
import React from 'react';

const LandingView: React.FC<{ onProceed: () => void }> = ({ onProceed }) => {
  // Cinematic background video
  const videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-space-shuttle-launch-on-a-starry-night-43542-large.mp4";

  return (
    <div className="h-full w-full bg-[#000000] relative overflow-hidden flex flex-col items-center justify-center text-center">
      {/* Cinematic Background Video */}
      <div className="absolute inset-0 z-0">
        <video 
          autoPlay 
          loop 
          muted 
          playsInline 
          className="w-full h-full object-cover opacity-50 grayscale"
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
        {/* Pure Black Overlay for monochrome depth */}
        <div className="absolute inset-0 bg-black/40"></div>
      </div>

      {/* Rocket Flight Animation Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="rocket-path-container">
          <div className="rocket-entity">
            <div className="flex flex-col items-center">
               <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="rocket-icon">
                <path d="M12 2L14.5 9H18L12 13L6 9H9.5L12 2Z" fill="white" className="drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"/>
                <path d="M12 22L9.5 15H6L12 11L18 15H14.5L12 22Z" fill="white" opacity="0.6"/>
              </svg>
              <span className="trailing-disrupt">DISRUPT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Content Overlay */}
      <div className="relative z-20 px-6 max-w-[1024px] w-[87.5%] flex flex-col items-center">
        <header className="mb-12 animate-heroFade">
          <p className="text-[12px] font-semibold text-white/60 uppercase tracking-[0.6em] mb-4">
            Facilities Management v8.0
          </p>
          <h1 className="text-[56px] md:text-[80px] font-bold text-[#FFFFFF] leading-[1.05] tracking-tighter mb-8">
            DISRUPT <span className="block text-[28px] md:text-[40px] opacity-40 font-light tracking-widest mt-2">INTELLIGENCE</span>
          </h1>
          <div className="max-w-[420px] mx-auto">
            <p className="text-[18px] md:text-[22px] font-medium text-white/80 leading-[1.4] mb-12">
              The premier monochrome ecosystem for technical operations and asset logistics.
            </p>
          </div>
        </header>

        <div className="w-full max-w-[420px] animate-slideUp" style={{ animationDelay: '0.4s' }}>
          <button 
            onClick={onProceed} 
            className="w-full min-h-[64px] px-10 bg-white/10 backdrop-blur-[20px] hover:bg-white/20 text-white rounded-[32px] font-bold text-[16px] transition-all duration-500 border border-white/20 group flex items-center justify-center gap-5 shadow-[0_0_50px_rgba(255,255,255,0.05)] active:scale-95"
          >
            <span className="tracking-[0.2em] uppercase">Initialize Portal</span>
            <i className="fas fa-bolt text-xs group-hover:text-yellow-400 transition-colors"></i>
          </button>
        </div>
      </div>

      {/* Subtle Bottom Muted Info */}
      <div className="absolute bottom-12 left-0 w-full z-20 text-center opacity-20 hover:opacity-100 transition-opacity">
        <p className="text-[10px] font-bold text-white uppercase tracking-[0.4em]">
          Monochrome Core &copy; 2026 Space Dynamics
        </p>
      </div>

      <style>{`
        @keyframes heroFade {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-heroFade {
          animation: heroFade 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slideUp {
          animation: slideUp 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Rocket Flight along an Arc */
        .rocket-path-container {
          position: absolute;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        .rocket-entity {
          position: absolute;
          left: -100px;
          bottom: -100px;
          animation: flightArc 10s infinite cubic-bezier(0.42, 0, 0.58, 1);
          transform-origin: center;
        }

        .rocket-icon {
          transform: rotate(45deg);
          filter: drop-shadow(0 0 12px rgba(255,255,255,0.5));
        }

        .trailing-disrupt {
          color: white;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 2px;
          margin-top: 8px;
          opacity: 0.5;
          text-shadow: 0 0 10px rgba(255,255,255,0.8);
          animation: trailPulse 2s infinite ease-in-out;
        }

        @keyframes flightArc {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translate(calc(100vw + 200px), calc(-100vh - 200px)) rotate(10deg);
            opacity: 0;
          }
        }

        @keyframes trailPulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
};

export default LandingView;
