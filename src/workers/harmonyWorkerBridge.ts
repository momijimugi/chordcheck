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
  public isBusy: boolean = false;

  // Stored for automatic main thread fallback on runtime worker error
  private lastMidiData: MidiData | null = null;
  private lastSettings: AnalysisSettings | null = null;
  private lastExistingSegments: ChordSegment[] = [];

  constructor() {
    this.initWorker();
  }

  public initWorker() {
    if (!this.isWorkerSupported) return;

    try {
      this.worker = new Worker(
        new URL('./harmonyWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent<WorkerProgress | WorkerResponse>) => {
        const msg = e.data;

        // Discard messages from outdated/cancelled requests (Phase E)
        if (msg.requestId !== this.currentRequestId) {
          return;
        }

        if (msg.type === 'PROGRESS') {
          this.currentCallbacks?.onProgress?.(msg.progress, msg.stage);
        } else if (msg.type === 'RESULT') {
          this.isBusy = false;
          if (msg.success && msg.result) {
            const analysesMap = new Map<string, NoteAnalysis>(msg.result.analyses);
            this.currentCallbacks?.onSuccess?.({
              segments: msg.result.segments,
              analyses: analysesMap,
              statusCounts: msg.result.statusCounts,
            });
          } else {
            console.warn('[HarmonyWorkerBridge] Worker reported error, falling back to Main Thread:', msg.error);
            this.fallbackToMainThread(msg.error || 'Worker runtime error');
          }
        }
      };

      this.worker.onerror = (err) => {
        console.warn('[HarmonyWorkerBridge] Worker uncaught error, falling back to Main Thread:', err);
        this.fallbackToMainThread(err.message || 'Worker runtime error');
      };
    } catch (err) {
      console.warn('[HarmonyWorkerBridge] Failed to create Worker, fallback enabled:', err);
      this.worker = null;
      this.isWorkerSupported = false;
    }
  }

  public cancelCurrentAnalysis() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isBusy = false;
    this.currentRequestId = '';
    this.currentCallbacks = null;
    this.initWorker();
  }

  private fallbackToMainThread(reason: string) {
    if (!this.lastMidiData || !this.lastSettings || !this.currentCallbacks) {
      this.currentCallbacks?.onError?.(reason);
      this.isBusy = false;
      return;
    }

    const callbacks = this.currentCallbacks;
    const midi = this.lastMidiData;
    const settings = this.lastSettings;
    const segments = this.lastExistingSegments;
    const reqId = this.currentRequestId;

    // Reset worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.initWorker();
    }
    this.isBusy = false;

    callbacks.onProgress?.(20, 'Worker解析に失敗したため互換モードで解析中...');
    setTimeout(() => {
      if (this.currentRequestId !== reqId) return;
      try {
        const result = analyzeMidi(midi, settings, segments);
        callbacks.onProgress?.(100, '解析完了 (互換モード)');
        callbacks.onSuccess?.(result);
      } catch (err: any) {
        console.error('[HarmonyWorkerBridge] Main thread fallback failed:', err);
        callbacks.onError?.(err?.message || 'Main thread analysis failed');
      }
    }, 0);
  }

  public analyze(
    midi: MidiData,
    settings: AnalysisSettings,
    existingSegments: ChordSegment[] = [],
    callbacks: WorkerAnalysisCallbacks
  ): string {
    // Phase E: Cancel previous analysis if worker is busy or currently running
    if (this.isBusy || this.currentRequestId) {
      this.cancelCurrentAnalysis();
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.currentRequestId = requestId;
    this.currentCallbacks = callbacks;
    this.isBusy = true;
    this.lastMidiData = midi;
    this.lastSettings = settings;
    this.lastExistingSegments = existingSegments;

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
      // Fallback to Main Thread
      console.warn('[HarmonyWorkerBridge] Executing analysis on Main Thread (Worker unavailable)');
      callbacks.onProgress?.(10, '和声を解析中 (Main Thread)...');
      setTimeout(() => {
        if (this.currentRequestId !== requestId) return;
        try {
          const result = analyzeMidi(midi, settings, existingSegments);
          this.isBusy = false;
          callbacks.onProgress?.(100, '解析完了');
          callbacks.onSuccess?.(result);
        } catch (err: any) {
          this.isBusy = false;
          callbacks.onError?.(err?.message || 'Main thread analysis failed');
        }
      }, 0);
    }

    return requestId;
  }

  public terminate() {
    this.cancelCurrentAnalysis();
  }
}

export const harmonyWorkerBridge = new HarmonyWorkerBridge();
