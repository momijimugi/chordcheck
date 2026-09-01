// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AppProvider, useApp } from '../../state/AppContext';
import { HarmonyTimeline } from '../HarmonyTimeline';
import { createDemoMidi } from '../../utils/demoMidi';

// Mock Web Worker & Audio for testing environment
vi.mock('../../engine/audioSynth', () => ({
  audioSynth: {
    playNote: vi.fn(),
    stopAll: vi.fn(),
  },
}));

describe('HarmonyTimeline React Hooks Regression Test Suite (PHASE L & M)', () => {
  it('Test A & B: Transitions smoothly from empty MIDI to loaded MIDI without React Hook order errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const TestHarness: React.FC = () => {
      const { loadDemo, workingMidi, segments } = useApp();

      return (
        <div>
          <button onClick={() => loadDemo('test1')} data-testid="load-demo-btn">
            Load Demo
          </button>
          <div data-testid="state-status">
            {workingMidi ? `Loaded: ${segments.length} segments` : 'Empty'}
          </div>
          <HarmonyTimeline />
        </div>
      );
    };

    const { getByTestId, findByText } = render(
      <AppProvider>
        <TestHarness />
      </AppProvider>
    );

    // Initial state: Empty
    expect(getByTestId('state-status').textContent).toBe('Empty');

    // Load Demo: triggers state transition workingMidi = null -> workingMidi = demo
    await act(async () => {
      getByTestId('load-demo-btn').click();
    });

    // Verify Chord Timeline rendered without throwing Hook order errors
    const chordHeader = await findByText('コード進行');
    expect(chordHeader).toBeDefined();

    // Verify console.error was not called with React Hook mismatch
    const hookErrors = errorSpy.mock.calls.filter(call =>
      call.some(arg => typeof arg === 'string' && arg.includes('Rendered more hooks than during previous render'))
    );
    expect(hookErrors.length).toBe(0);

    errorSpy.mockRestore();
  });
});
