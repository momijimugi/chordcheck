import { describe, it, expect } from 'vitest';
import { buildMeterMap, ticksToMusicalPosition, calculateTotalBars } from '../../music/meter';
import { TimeSignatureInfo } from '../../types/midi';

describe('Musical Timebase Engine & Meter Map (β0.3 Step 2)', () => {
  const ppq = 480;

  it('Correctly calculates bar and beat positions across 4/4 -> 3/4 -> 6/8 meter changes', () => {
    // 4/4 (bar 1..4 = 4 * 1920 = 7680 ticks)
    // 3/4 (bar 5..8 = 4 * 1440 = 5760 ticks, total = 13440 ticks)
    // 6/8 (bar 9..12 = 4 * 1440 = 5760 ticks, total = 19200 ticks)
    const timeSignatures: TimeSignatureInfo[] = [
      { ticks: 0, time: 0, numerator: 4, denominator: 4 },
      { ticks: 7680, time: 4, numerator: 3, denominator: 4 },
      { ticks: 13440, time: 7, numerator: 6, denominator: 8 },
    ];

    const meterMap = buildMeterMap(timeSignatures, ppq, 20000);
    expect(meterMap.length).toBe(3);

    // Check Bar 1 Beat 1 (4/4)
    const pos1 = ticksToMusicalPosition(0, meterMap, ppq);
    expect(pos1.bar).toBe(1);
    expect(pos1.beat).toBe(1);
    expect(pos1.isDownbeat).toBe(true);

    // Check Bar 4 Beat 3 (4/4): 3 * 1920 + 2 * 480 = 5760 + 960 = 6720
    const posBar4 = ticksToMusicalPosition(6720, meterMap, ppq);
    expect(posBar4.bar).toBe(4);
    expect(posBar4.beat).toBe(3);
    expect(posBar4.numerator).toBe(4);

    // Check Bar 5 Beat 1 (3/4 change point at tick 7680)
    const posBar5 = ticksToMusicalPosition(7680, meterMap, ppq);
    expect(posBar5.bar).toBe(5);
    expect(posBar5.beat).toBe(1);
    expect(posBar5.numerator).toBe(3);
    expect(posBar5.denominator).toBe(4);
    expect(posBar5.isDownbeat).toBe(true);

    // Check Bar 9 Beat 1 (6/8 change point at tick 13440)
    const posBar9 = ticksToMusicalPosition(13440, meterMap, ppq);
    expect(posBar9.bar).toBe(9);
    expect(posBar9.beat).toBe(1);
    expect(posBar9.numerator).toBe(6);
    expect(posBar9.denominator).toBe(8);
    expect(posBar9.isDownbeat).toBe(true);

    // Check total bars
    const totalBars = calculateTotalBars(19200, meterMap, ppq);
    expect(totalBars).toBeGreaterThanOrEqual(12);
  });
});
