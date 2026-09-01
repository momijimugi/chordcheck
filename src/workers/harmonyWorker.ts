import { analyzeMidi } from '../engine/noteAnalyzer';
import { WorkerProgress, WorkerRequest, WorkerResponse } from './harmonyWorkerTypes';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { type, requestId, midiData, settings, existingSegments } = e.data;
  if (type !== 'ANALYZE') return;

  const postProgress = (progress: number, stage: string) => {
    const progMsg: WorkerProgress = {
      type: 'PROGRESS',
      requestId,
      progress,
      stage,
    };
    self.postMessage(progMsg);
  };

  try {
    postProgress(5, '解析データを準備中...');
    postProgress(20, '和声・ノート解析中...');

    const analysisResult = analyzeMidi(
      midiData as any,
      settings,
      existingSegments
    );

    postProgress(90, '解析結果を整理中...');

    const response: WorkerResponse = {
      type: 'RESULT',
      requestId,
      success: true,
      result: {
        segments: analysisResult.segments,
        analyses: Array.from(analysisResult.analyses.entries()),
        statusCounts: analysisResult.statusCounts,
      },
    };

    postProgress(100, '解析完了');
    self.postMessage(response);
  } catch (err: any) {
    console.error('[HarmonyWorker] Analysis error:', err);
    const errorResponse: WorkerResponse = {
      type: 'RESULT',
      requestId,
      success: false,
      error: err?.message || 'Worker analysis failed',
    };
    self.postMessage(errorResponse);
  }
};
