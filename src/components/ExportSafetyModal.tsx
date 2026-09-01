import React from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';
import { ExportDiagnosticInfo } from '../engine/midiExporter';

interface ExportSafetyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  diagnostic: ExportDiagnosticInfo | null;
}

export const ExportSafetyModal: React.FC<ExportSafetyModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  diagnostic,
}) => {
  if (!isOpen || !diagnostic) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#202226] border border-amber-500/40 rounded-xl w-full max-w-md shadow-2xl p-6 text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2e3238]">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3 className="font-bold text-sm text-slate-100">互換Exportの確認</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-[#2e3238] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="mt-4 space-y-3 text-xs text-slate-300">
          <p className="leading-relaxed">
            一部の変更ノート（<strong className="text-amber-400">{diagnostic.modifiedUnsafePatchCount}音</strong>）を元MIDIイベントへ一意に対応付けできませんでした。
          </p>
          <p className="text-[11px] text-slate-400 bg-[#18191c] p-3 rounded-lg border border-[#2e3238] leading-relaxed">
            ※ 重複した同時同音ノートや未照合イベントが含まれるため、Direct Raw Byte Patchを行わず <strong>Tone.js 互換Export</strong> で書き出します。SysExやDAW固有メタデータの一部が保持されない可能性があります。
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg bg-[#272a30] hover:bg-[#32363e] text-xs font-semibold text-slate-300 transition"
          >
            キャンセル
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white shadow-md shadow-amber-950/40 flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>互換Exportを続行</span>
          </button>
        </div>
      </div>
    </div>
  );
};
