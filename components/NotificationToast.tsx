
import React from 'react';

const NotificationToast: React.FC<{ message: string }> = ({ message }) => (
  <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-slideDown">
    <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
    <span className="text-xs font-bold tracking-wide">{message}</span>
  </div>
);

export default NotificationToast;
