import { TimeSignatureInfo } from '../types/midi';

export interface MeterPosition {
  bar: number; // 1-indexed
  beat: number; // 1-indexed
  tickInBeat: number;
  fractionInBeat: number; // 0.0 to 0.999
  isDownbeat: boolean; // Bar 1 Beat 1
  isStrongBeat: boolean; // Beat 1 or Beat 3 in 4/4
  isBeatHead: boolean; // Exact beat start
  isOffbeat: boolean; // 8th note division
  isOffgrid: boolean; // 16th/32nd or micro timing
  metricWeight: number; // 1.3, 1.15, 1.0, 0.8, 0.5
  description: string;
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

export function getMeterPosition(
  ticks: number,
  ppq: number,
  timeSignatures: TimeSignatureInfo[] = []
): MeterPosition {
  const { numerator, denominator } = getTimeSignatureAtTicks(ticks, timeSignatures);
  
  // Ticks per beat (quarter note = ppq, denominator adjusted)
  const ticksPerBeat = ppq * (4 / denominator);
  const ticksPerBar = ticksPerBeat * numerator;
  
  const bar = Math.floor(ticks / ticksPerBar) + 1;
  const tickInBar = ticks % ticksPerBar;
  const beat = Math.floor(tickInBar / ticksPerBeat) + 1;
  const tickInBeat = tickInBar % ticksPerBeat;
  const fractionInBeat = tickInBeat / ticksPerBeat;
  
  const isDownbeat = beat === 1 && tickInBeat === 0;
  const isStrongBeat = (numerator === 4 && (beat === 1 || beat === 3) && tickInBeat === 0) ||
                       (numerator === 3 && beat === 1 && tickInBeat === 0) ||
                       (numerator === 6 && (beat === 1 || beat === 4) && tickInBeat === 0) ||
                       (beat === 1 && tickInBeat === 0);
                       
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
    isDownbeat,
    isStrongBeat,
    isBeatHead,
    isOffbeat,
    isOffgrid,
    metricWeight,
    description: posText,
  };
}
