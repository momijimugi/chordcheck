import React, { useState } from 'react';
import { TrackData } from '../types/midi';
import { Drum, Check, X, ShieldAlert } from 'lucide-react';

interface DrumConfirmModalProps {
  isOpen: boolean;
  drumTracks: TrackData[];
  onConfirm: (selectedTrackIds: number[]) => void;
  onDismiss: () => void;
}

export const DrumConfirmModal: React.FC<DrumConfirmModalProps> = ({
  isOpen,
  drumTracks,
  onConfirm,
  onDismiss,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(drumTracks.map(t => t.id))
  );

  if (!isOpen || drumTracks.length === 0) return null;

  const toggleTrack = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleApply = () => {
    onConfirm(Array.from(selectedIds));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e2025] border border-[#3c404a] rounded-xl w-full max-w-md shadow-2xl p-5 text-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-[#2e3238]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Drum className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">
                ドラム・打楽器トラックの検出
              </h3>
              <p className="text-[11px] text-slate-400">
                和声解析の精度向上のための確認
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-[#2e3238] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-300 leading-relaxed">
          以下のトラックをドラムまたはパーカッションとして検出しました。
          ドラム音を和声判定（コード推定・不協和音警告）から除外しますか？
        </div>

        <div className="mt-3.5 space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {drumTracks.map((track) => {
            const isChecked = selectedIds.has(track.id);
            const conf = track.settings.classification?.drumConfidence ?? 80;
            return (
              <label
                key={track.id}
                className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition ${
                  isChecked
                    ? 'bg-amber-950/30 border-amber-500/60 text-amber-200'
                    : 'bg-[#272a30] border-[#3c404a] text-slate-400 hover:bg-[#32363e]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleTrack(track.id)}
                    className="w-4 h-4 rounded text-amber-500 bg-[#18191c] border-[#3c404a] focus:ring-0 focus:outline-none cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className="font-semibold text-xs text-slate-200">
                      {track.name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Channel {track.channel + 1} • {track.notes.length} 音
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-amber-300 font-semibold border border-amber-500/30">
                    🥁 確信度 {conf}%
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        <div className="mt-5 pt-3 border-t border-[#2e3238] flex items-center justify-end gap-2">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-md bg-[#272a30] hover:bg-[#32363e] text-xs font-medium text-slate-300 transition"
          >
            通常トラックとして扱う
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-black flex items-center gap-1.5 shadow-md shadow-amber-950/40 transition"
          >
            <Check className="w-3.5 h-3.5" />
            <span>選択したトラックをドラムに設定</span>
          </button>
        </div>
      </div>
    </div>
  );
};
