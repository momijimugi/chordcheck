import { AnalysisSettings, ChordSegment, NoteAnalysis } from '../types/analysis';
import { NoteData, TempoInfo, TimeSignatureInfo, TrackData } from '../types/midi';

/**
 * Plain Object DTO for Structured Clone without Tone.js class instances or large raw byte buffers
 */
export interface AnalysisMidiDTO {
  name: string;
  ppq: number;
  durationTicks: number;
  durationSeconds: number;
  totalBars: number;
  tempos: TempoInfo[];
  timeSignatures: TimeSignatureInfo[];
  tracks: TrackData[];
  notes: NoteData[];
}

export type WorkerRequest = {
  type: 'ANALYZE';
  requestId: string;
  midiData: AnalysisMidiDTO;
  settings: AnalysisSettings;
  existingSegments: ChordSegment[];
};

export type WorkerProgress = {
  type: 'PROGRESS';
  requestId: string;
  progress: number;
  stage: string;
};

export type WorkerResponse = {
  type: 'RESULT';
  requestId: string;
  success: boolean;
  result?: {
    segments: ChordSegment[];
    analyses: Array<[string, NoteAnalysis]>;
    statusCounts: {
      SAFE: number;
      INFO: number;
      CHECK: number;
      WARNING: number;
      TOTAL: number;
    };
  };
  error?: string;
};
