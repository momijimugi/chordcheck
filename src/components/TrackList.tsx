import React from 'react';
import { useApp } from '../state/AppContext';
import { RangePreset, TrackRole } from '../types/midi';
import { 
  Eye, 
  EyeOff, 
  Volume2, 
  VolumeX, 
  ShieldAlert, 
  Sliders, 
  Layers,
  ChevronDown
} from 'lucide-react';

export const TrackList: React.FC = () => {
  const {
    workingMidi,
    updateTrackRole,
    updateTrackRange,
    toggleTrackMute,
    toggleTrackSolo,
    toggleTrackVisibility,
    toggleTrackIgnore,
  } = useApp();

  if (!workingMidi) return null;

  return (
    <aside className="w-56 bg-[#18191c] border-r border-[#2e3238] flex flex-col h-full select-none shrink-0 overflow-hidden">
      {/* Track List Header */}
      <div className="h-10 bg-[#1c1e22] border-b border-[#2e3238] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span>Tracks ({workingMidi.tracks.length})</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          {workingMidi.notes.length} notes
        </span>
      </div>

      {/* Tracks Container */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#272a30]">
        {workingMidi.tracks.map((track) => {
          const { settings } = track;
          const isIgnored = settings.ignore || settings.role === 'ignore';

          return (
            <div
              key={track.id}
              className={`p-2.5 transition ${
                isIgnored
                  ? 'opacity-60 bg-[#141518]'
                  : 'bg-[#18191c] hover:bg-[#202226]'
              }`}
            >
              {/* Top Row: Color indicator, Name, Channel, Mute/Solo/Vis */}
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: settings.color }}
                  />
                  <span className="font-semibold text-xs text-slate-200 truncate" title={track.name}>
                    {track.name}
                  </span>
                </div>

                {/* Controls: Mute, Solo, Eye */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => toggleTrackMute(track.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold transition ${
                      settings.muted
                        ? 'bg-rose-500 text-white'
                        : 'bg-[#272a30] text-slate-400 hover:text-slate-200'
                    }`}
                    title="Mute Track"
                  >
                    M
                  </button>
                  <button
                    onClick={() => toggleTrackSolo(track.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold transition ${
                      settings.solo
                        ? 'bg-amber-500 text-black'
                        : 'bg-[#272a30] text-slate-400 hover:text-slate-200'
                    }`}
                    title="Solo Track"
                  >
                    S
                  </button>
                  <button
                    onClick={() => toggleTrackVisibility(track.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 transition ${
                      !settings.visible ? 'text-slate-600' : ''
                    }`}
                    title="Toggle Visibility in Piano Roll"
                  >
                    {settings.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Second Row: Track Role Selector */}
              <div className="flex items-center justify-between gap-1 mt-1">
                <span className="text-[10px] text-slate-400">Role:</span>
                <select
                  value={settings.role}
                  onChange={(e) => updateTrackRole(track.id, e.target.value as TrackRole)}
                  className="bg-[#202226] border border-[#3c404a] rounded px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer flex-1 max-w-[135px] truncate"
                >
                  <option value="auto">Auto ({settings.detectedRole || 'auto'})</option>
                  <option value="melody">Melody</option>
                  <option value="harmony">Harmony</option>
                  <option value="bass">Bass</option>
                  <option value="percussion">Percussion</option>
                  <option value="keyswitch">Keyswitch / Ignore</option>
                  <option value="ignore">Ignore</option>
                </select>
              </div>

              {/* Third Row: Analysis Range Preset */}
              <div className="flex items-center justify-between gap-1 mt-1">
                <span className="text-[10px] text-slate-400">Range:</span>
                <select
                  value={settings.rangePreset}
                  onChange={(e) => updateTrackRange(track.id, e.target.value as RangePreset)}
                  className="bg-[#202226] border border-[#3c404a] rounded px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer flex-1 max-w-[135px] truncate"
                >
                  <option value="all">Full Range (0-127)</option>
                  <option value="ignore_below_c0">Ignore &lt; C0 (12-127)</option>
                  <option value="ignore_below_c1">Ignore &lt; C1 (24-127)</option>
                  <option value="ignore_below_c2">Ignore &lt; C2 (36-127)</option>
                </select>
              </div>

              {/* Keyswitch Warning Alert Banner */}
              {settings.hasKeyswitchWarning && (
                <div className="mt-2 p-1.5 rounded bg-amber-950/40 border border-amber-500/40 text-amber-300 text-[10px]">
                  <div className="flex items-center gap-1 font-semibold">
                    <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>Keyswitch Detected</span>
                  </div>
                  <p className="text-[9px] text-amber-200/80 mt-0.5">
                    {settings.keyswitchPitchCount} low notes found with large register gap.
                  </p>
                  <button
                    onClick={() => updateTrackRange(track.id, 'ignore_below_c1')}
                    className="mt-1 w-full py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-[10px] font-semibold text-amber-200 transition text-center"
                  >
                    Ignore &lt; C1 (Exclude KS)
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
