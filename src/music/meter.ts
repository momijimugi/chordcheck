import { TimeSignatureInfo } from '../types/midi';

export interface MeterRegion {
  startTicks: number;
  endTicks: number;
  startBar: number; // 1-indexed
  numerator: number;
  denominator: number;
  ticksPerBeat: number;
  ticksPerBar: number;
}

export interface MusicalPosition {
  bar: number; // 1-indexed
  beat: number; // 1-indexed
  tickInBeat: number;
  fractionInBeat: number; // 0.0 to 0.999
  numerator: number;
  denominator: number;
  isDownbeat: boolean; // Bar start beat 1
  isStrongBeat: boolean; // Beat 1 or Beat 3 in 4/4, Beat 1 & 4 in 6/8
  isBeatHead: boolean; // Exact beat start
  isOffbeat: boolean; // 8th note offbeat
  isOffgrid: boolean; // 16th/32nd or micro timing
  metricWeight: number;
  description: string;
}

export function buildMeterMap(
  timeSignatures: TimeSignatureInfo[],
  ppq: number,
  totalDurationTicks: number
): MeterRegion[] {
  const sorted = [...(timeSignatures || [])].sort((a, b) => a.ticks - b.ticks);

  // Ensure at least one entry at tick 0
  const normalizedSigs: TimeSignatureInfo[] = [];
  if (sorted.length === 0 || sorted[0].ticks > 0) {
    normalizedSigs.push({ ticks: 0, time: 0, numerator: 4, denominator: 4 });
  }
  sorted.forEach(s => {
    if (s.ticks === 0 && normalizedSigs.length > 0) {
      normalizedSigs[0] = s;
    } else {
      normalizedSigs.push(s);
    }
  });

  const regions: MeterRegion[] = [];
  let currentBar = 1;

  for (let i = 0; i < normalizedSigs.length; i++) {
    const current = normalizedSigs[i];
    const nextTicks = (i < normalizedSigs.length - 1)
      ? normalizedSigs[i + 1].ticks
      : Math.max(totalDurationTicks + ppq * 16, current.ticks + ppq * 16);

    const num = current.numerator || 4;
    const den = current.denominator || 4;
    const ticksPerBeat = ppq * (4 / den);
    const ticksPerBar = ticksPerBeat * num;

    regions.push({
      startTicks: current.ticks,
      endTicks: nextTicks,
      startBar: currentBar,
      numerator: num,
      denominator: den,
      ticksPerBeat,
      ticksPerBar,
    });

    const elapsedTicks = nextTicks - current.ticks;
    const elapsedBars = Math.ceil(elapsedTicks / ticksPerBar);
    currentBar += elapsedBars;
  }

  return regions;
}

export function ticksToMusicalPosition(
  ticks: number,
  meterMap: MeterRegion[],
  ppq: number
): MusicalPosition {
  if (!meterMap || meterMap.length === 0) {
    meterMap = buildMeterMap([], ppq, ticks + ppq * 4);
  }

  // Find active region
  let region = meterMap[0];
  for (let i = 0; i < meterMap.length; i++) {
    if (ticks >= meterMap[i].startTicks) {
      region = meterMap[i];
    } else {
      break;
    }
  }

  const ticksIntoRegion = Math.max(0, ticks - region.startTicks);
  const barsIntoRegion = Math.floor(ticksIntoRegion / region.ticksPerBar);
  const bar = region.startBar + barsIntoRegion;

  const tickInBar = ticksIntoRegion % region.ticksPerBar;
  const beat = Math.floor(tickInBar / region.ticksPerBeat) + 1;
  const tickInBeat = tickInBar % region.ticksPerBeat;
  const fractionInBeat = tickInBeat / region.ticksPerBeat;

  const isDownbeat = beat === 1 && tickInBeat === 0;
  const isStrongBeat = (
    (region.numerator === 4 && (beat === 1 || beat === 3) && tickInBeat === 0) ||
    (region.numerator === 3 && beat === 1 && tickInBeat === 0) ||
    (region.numerator === 6 && (beat === 1 || beat === 4) && tickInBeat === 0) ||
    (beat === 1 && tickInBeat === 0)
  );

  const isBeatHead = tickInBeat === 0;
  const is8thOffbeat = Math.abs(fractionInBeat - 0.5) < 0.05;
  const isOffbeat = is8thOffbeat;
  const isOffgrid = !isBeatHead && !is8thOffbeat;

  let metricWeight = 1.0;
  let posText = '';

  if (isDownbeat) {
    metricWeight = 1.3;
    posText = `第${bar}小節 第${beat}拍 (小節頭拍)`;
  } else if (isStrongBeat) {
    metricWeight = 1.15;
    posText = `第${bar}小節 第${beat}拍 (強拍)`;
  } else if (isBeatHead) {
    metricWeight = 1.0;
    posText = `第${bar}小節 第${beat}拍 (拍頭)`;
  } else if (isOffbeat) {
    metricWeight = 0.8;
    posText = `第${bar}小節 第${beat}拍 裏 (8分裏拍)`;
  } else {
    metricWeight = 0.5;
    posText = `第${bar}小節 第${(beat + fractionInBeat).toFixed(2)}拍 (弱拍/グリッド外)`;
  }

  return {
    bar,
    beat,
    tickInBeat,
    fractionInBeat,
    numerator: region.numerator,
    denominator: region.denominator,
    isDownbeat,
    isStrongBeat,
    isBeatHead,
    isOffbeat,
    isOffgrid,
    metricWeight,
    description: posText,
  };
}

export function calculateTotalBars(
  durationTicks: number,
  meterMap: MeterRegion[],
  ppq: number
): number {
  if (!meterMap || meterMap.length === 0) return 1;
  const lastPos = ticksToMusicalPosition(durationTicks, meterMap, ppq);
  return Math.max(1, lastPos.bar);
}

// Backward compatibility wrapper for getMeterPosition
export function getMeterPosition(
  ticks: number,
  ppq: number,
  timeSignatures: TimeSignatureInfo[] = []
): MusicalPosition {
  const meterMap = buildMeterMap(timeSignatures, ppq, ticks + ppq * 16);
  return ticksToMusicalPosition(ticks, meterMap, ppq);
}

export function getTimeSignatureAtTicks(
  ticks: number,
  timeSignatures: TimeSignatureInfo[]
): { numerator: number; denominator: number } {
  if (!timeSignatures || timeSignatures.length === 0) {
    return { numerator: 4, denominator: 4 };
  }
  let currentSig = timeSignatures[0];
  for (const sig of timeSignatures) {
    if (sig.ticks <= ticks) {
      currentSig = sig;
    } else {
      break;
    }
  }
  return { numerator: currentSig.numerator || 4, denominator: currentSig.denominator || 4 };
}
