import { AnalysisSettings, ChordSegment, NoteAnalysis } from '../types/analysis';
import { MidiData } from '../types/midi';
import { analyzeMidi, FullAnalysisResult } from '../engine/noteAnalyzer';
import { AnalysisMidiDTO, WorkerProgress, WorkerRequest, WorkerResponse } from './harmonyWorkerTypes';

export interface WorkerAnalysisCallbacks {
  onProgress?: (progress: number, stage: string) => void;
  onSuccess?: (result: FullAnalysisResult) => void;
  onError?: (error: string) => void;
}

class HarmonyWorkerBridge {
  private worker: Worker | null = null;
  private currentRequestId: string = '';
  private currentCallbacks: WorkerAnalysisCallbacks | null = null;
  private isWorkerSupported: boolean = typeof Worker !== 'undefined';

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (!this.isWorkerSupported) return;

    try {
      this.worker = new Worker(
        new URL('./harmonyWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent<WorkerProgress | WorkerResponse>) => {
        const msg = e.data;

        // Discard messages from outdated requests (Phase A / Section 8)
        if (msg.requestId !== this.currentRequestId) {
          return;
        }

        if (msg.type === 'PROGRESS') {
          this.currentCallbacks?.onProgress?.(msg.progress, msg.stage);
        } else if (msg.type === 'RESULT') {
          if (msg.success && msg.result) {
            const analysesMap = new Map<string, NoteAnalysis>(msg.result.analyses);
            this.currentCallbacks?.onSuccess?.({
              segments: msg.result.segments,
              analyses: analysesMap,
              statusCounts: msg.result.statusCounts,
            });
          } else {
            this.currentCallbacks?.onError?.(msg.error || 'Unknown analysis error');
          }
        }
      };

      this.worker.onerror = (err) => {
        console.warn('[HarmonyWorkerBridge] Worker error, will fall back to main thread:', err);
        this.currentCallbacks?.onError?.(err.message || 'Worker runtime error');
      };
    } catch (err) {
      console.warn('[HarmonyWorkerBridge] Failed to create Worker, fallback enabled:', err);
      this.worker = null;
      this.isWorkerSupported = false;
    }
  }

  public analyze(
    midi: MidiData,
    settings: AnalysisSettings,
    existingSegments: ChordSegment[] = [],
    callbacks: WorkerAnalysisCallbacks
  ): string {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.currentRequestId = requestId;
    this.currentCallbacks = callbacks;

    // Structured Clone DTO (no raw bytes or class instances)
    const dto: AnalysisMidiDTO = {
      name: midi.name,
      ppq: midi.ppq,
      durationTicks: midi.durationTicks,
      durationSeconds: midi.durationSeconds,
      totalBars: midi.totalBars,
      tempos: midi.tempos,
      timeSignatures: midi.timeSignatures,
      tracks: midi.tracks,
      notes: midi.notes,
    };

    // If worker is available, send to worker
    if (this.worker) {
      callbacks.onProgress?.(5, '解析タスクを開始中...');
      const request: WorkerRequest = {
        type: 'ANALYZE',
        requestId,
        midiData: dto,
        settings,
        existingSegments,
      };
      this.worker.postMessage(request);
    } else {
      // Fallback to Main Thread (Phase A / Section 9)
      console.warn('[HarmonyWorkerBridge] Executing analysis on Main Thread (Worker unavailable)');
      callbacks.onProgress?.(10, '和声を解析中 (Main Thread)...');
      setTimeout(() => {
        if (this.currentRequestId !== requestId) return;
        try {
          const result = analyzeMidi(midi, settings, existingSegments);
          callbacks.onProgress?.(100, '解析完了');
          callbacks.onSuccess?.(result);
        } catch (err: any) {
          callbacks.onError?.(err?.message || 'Main thread analysis failed');
        }
      }, 0);
    }

    return requestId;
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.initWorker();
    }
  }
}

export const harmonyWorkerBridge = new HarmonyWorkerBridge();
