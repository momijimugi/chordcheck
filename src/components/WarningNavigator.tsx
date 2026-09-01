import React from 'react';
import { useApp } from '../state/AppContext';
import { FilterType } from '../types/state';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight,
  Filter
} from 'lucide-react';

export const WarningNavigator: React.FC = () => {
  const {
    statusCounts,
    activeFilter,
    setFilter,
    navigateWarning,
    workingMidi,
  } = useApp();

  const filterOptions: { id: FilterType; label: string; count: number; color: string; activeClass: string }[] = [
    {
      id: 'ALL',
      label: 'All Notes',
      count: statusCounts.TOTAL,
      color: 'text-slate-300',
      activeClass: 'bg-slate-700 text-white border-slate-500',
    },
    {
      id: 'WARNING_ONLY',
      label: 'WARNING ONLY',
      count: statusCounts.WARNING,
      color: 'text-rose-400',
      activeClass: 'bg-rose-500/25 text-rose-300 border-rose-500/80 shadow-sm shadow-rose-950/40 font-bold',
    },
    {
      id: 'CHECK',
      label: 'CHECK',
      count: statusCounts.CHECK,
      color: 'text-amber-400',
      activeClass: 'bg-amber-500/25 text-amber-300 border-amber-500/80 shadow-sm shadow-amber-950/40',
    },
    {
      id: 'INFO',
      label: 'INFO',
      count: statusCounts.INFO,
      color: 'text-sky-400',
      activeClass: 'bg-sky-500/25 text-sky-300 border-sky-500/80 shadow-sm shadow-sky-950/40',
    },
    {
      id: 'SAFE',
      label: 'SAFE',
      count: statusCounts.SAFE,
      color: 'text-emerald-400',
      activeClass: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/80 shadow-sm shadow-emerald-950/40',
    },
  ];

  const totalFlagged = statusCounts.WARNING + statusCounts.CHECK;

  return (
    <div className="h-11 bg-[#1c1e22] border-b border-[#2e3238] flex items-center justify-between px-4 select-none shrink-0 z-20">
      {/* Filter Chips */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Filter:</span>
        </div>

        <div className="flex items-center gap-1.5 bg-[#141518] p-0.5 rounded-lg border border-[#2e3238]">
          {filterOptions.map(opt => {
            const isActive = activeFilter === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setFilter(opt.id)}
                className={`px-2.5 py-1 rounded-md text-xs transition flex items-center gap-1.5 border border-transparent ${
                  isActive
                    ? opt.activeClass
                    : 'hover:bg-[#272a30] text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.id === 'WARNING_ONLY' && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                {opt.id === 'CHECK' && <AlertCircle className="w-3 h-3 text-amber-400" />}
                {opt.id === 'INFO' && <Info className="w-3 h-3 text-sky-400" />}
                {opt.id === 'SAFE' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                <span>{opt.label}</span>
                <span className={`text-[10px] font-mono px-1 rounded ${
                  isActive ? 'bg-black/30 font-bold' : 'bg-[#272a30] text-slate-400'
                }`}>
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Warning Stepper Navigator */}
      <div className="flex items-center gap-2">
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span>Suspicious Notes:</span>
          <span className="font-semibold text-rose-400 bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 rounded-md text-xs font-mono">
            {totalFlagged} flagged
          </span>
        </div>

        <div className="flex items-center bg-[#272a30] rounded-md border border-[#3c404a] overflow-hidden">
          <button
            onClick={() => navigateWarning('prev')}
            disabled={totalFlagged === 0}
            className="px-2.5 py-1 text-xs text-slate-300 hover:bg-[#32363e] disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition"
            title="Navigate to Previous Warning / Check Note (Shortcut: [ or J)"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev [</span>
          </button>
          <div className="w-[1px] h-4 bg-[#3c404a]" />
          <button
            onClick={() => navigateWarning('next')}
            disabled={totalFlagged === 0}
            className="px-2.5 py-1 text-xs text-slate-300 hover:bg-[#32363e] disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition"
            title="Navigate to Next Warning / Check Note (Shortcut: ] or K)"
          >
            <span>Next ]</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
