import React, { useMemo } from 'react';
import { useApp } from '../state/AppContext';
import { FilterType } from '../types/state';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  ShieldAlert,
  CheckCheck
} from 'lucide-react';

export const WarningNavigator: React.FC = () => {
  const {
    workingMidi,
    analyses,
    reviewedNoteIds,
    statusCounts: rawStatusCounts,
    activeFilter,
    setFilter,
    navigateWarning,
    showLowConfidenceOnly,
    setShowLowConfidenceOnly,
  } = useApp();

  // Dynamically compute effective status counts excluding reviewed notes (Phase L / Section 34)
  const statusCounts = useMemo(() => {
    if (!workingMidi || analyses.size === 0) return rawStatusCounts;
    let safe = 0, info = 0, check = 0, warning = 0, total = 0;
    workingMidi.notes.forEach(note => {
      total++;
      if (reviewedNoteIds.has(note.id)) return;
      const a = analyses.get(note.id);
      if (!a) return;
      if (a.status === 'SAFE') safe++;
      else if (a.status === 'INFO') info++;
      else if (a.status === 'CHECK') check++;
      else if (a.status === 'WARNING') warning++;
    });
    return { SAFE: safe, INFO: info, CHECK: check, WARNING: warning, TOTAL: total };
  }, [workingMidi, analyses, reviewedNoteIds, rawStatusCounts]);

  const filterOptions: { id: FilterType; label: string; count: number; activeClass: string }[] = [
    {
      id: 'ALL',
      label: 'すべてのノート',
      count: statusCounts.TOTAL,
      activeClass: 'bg-slate-700 text-white border-slate-500',
    },
    {
      id: 'WARNING_ONLY',
      label: 'WARNINGのみ',
      count: statusCounts.WARNING,
      activeClass: 'bg-rose-500/25 text-rose-300 border-rose-500/80 shadow-sm shadow-rose-950/40 font-bold',
    },
    {
      id: 'CHECK',
      label: 'CHECK以上',
      count: statusCounts.CHECK,
      activeClass: 'bg-amber-500/25 text-amber-300 border-amber-500/80 shadow-sm shadow-amber-950/40',
    },
    {
      id: 'INFO',
      label: 'INFO',
      count: statusCounts.INFO,
      activeClass: 'bg-sky-500/25 text-sky-300 border-sky-500/80 shadow-sm shadow-sky-950/40',
    },
    {
      id: 'SAFE',
      label: 'SAFE',
      count: statusCounts.SAFE,
      activeClass: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/80 shadow-sm shadow-emerald-950/40',
    },
  ];

  const totalFlagged = statusCounts.WARNING + statusCounts.CHECK;
  const totalReviewed = reviewedNoteIds.size;

  return (
    <div className="h-11 bg-[#1c1e22] border-b border-[#2e3238] flex items-center justify-between px-4 select-none shrink-0 z-20 overflow-x-auto gap-4">
      {/* Filter Chips */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mr-1 shrink-0">
          <Filter className="w-3.5 h-3.5" />
          <span>絞り込み:</span>
        </div>

        <div className="flex items-center gap-1 bg-[#141518] p-0.5 rounded-lg border border-[#2e3238]">
          {filterOptions.map(opt => {
            const isActive = activeFilter === opt.id && !showLowConfidenceOnly;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  setShowLowConfidenceOnly(false);
                  setFilter(opt.id);
                }}
                className={`px-2.5 py-1 rounded-md text-xs transition flex items-center gap-1.5 border border-transparent whitespace-nowrap ${
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

          {/* Low Confidence Chord Filter Button */}
          <button
            onClick={() => setShowLowConfidenceOnly(!showLowConfidenceOnly)}
            className={`px-2.5 py-1 rounded-md text-xs transition flex items-center gap-1 border whitespace-nowrap ${
              showLowConfidenceOnly
                ? 'bg-rose-950/60 text-rose-300 border-rose-500 font-semibold'
                : 'hover:bg-[#272a30] text-slate-400 hover:text-slate-200 border-transparent'
            }`}
            title="コード推定の確信度が60%未満の区間のみを抽出"
          >
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            <span>低確信度 (&lt;60%)</span>
          </button>
        </div>

        {/* Reviewed Count Badge (Phase L) */}
        {totalReviewed > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-teal-950/60 text-teal-300 border border-teal-500/40">
            <CheckCheck className="w-3 h-3 text-teal-400" />
            <span>{totalReviewed} 件確認済み（除外）</span>
          </div>
        )}
      </div>

      {/* Warning Stepper Navigator */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span>要確認ノート:</span>
          <span className={`font-semibold px-2 py-0.5 rounded-md text-xs font-mono border ${
            totalFlagged > 0 
              ? 'text-rose-400 bg-rose-950/40 border-rose-500/30' 
              : 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30'
          }`}>
            {totalFlagged} 件検出
          </span>
        </div>

        <div className="flex items-center bg-[#272a30] rounded-md border border-[#3c404a] overflow-hidden">
          <button
            onClick={() => navigateWarning('prev')}
            disabled={totalFlagged === 0}
            className="px-2.5 py-1 text-xs text-slate-300 hover:bg-[#32363e] disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition"
            title="前の警告/要確認ノートへジャンプ (ショートカット: [ または J)"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>前へ [</span>
          </button>
          <div className="w-[1px] h-4 bg-[#3c404a]" />
          <button
            onClick={() => navigateWarning('next')}
            disabled={totalFlagged === 0}
            className="px-2.5 py-1 text-xs text-slate-300 hover:bg-[#32363e] disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition"
            title="次の警告/要確認ノートへジャンプ (ショートカット: ] または K)"
          >
            <span>次へ ]</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
