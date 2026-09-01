import { ChordType } from '../types/analysis';
import { CHORD_DEFINITIONS } from '../music/chords';

export interface ChordTemplate {
  type: ChordType;
  weights: number[]; // 12-element array of weights for intervals 0..11
}

// Generate template vectors for each chord type
export function generateChordTemplates(): Record<ChordType, ChordTemplate> {
  const templates: Partial<Record<ChordType, ChordTemplate>> = {};

  for (const [key, def] of Object.entries(CHORD_DEFINITIONS)) {
    const type = key as ChordType;
    const weights = new Array(12).fill(-0.5); // Default negative weight for outside tones
    
    // Root has highest weight
    weights[0] = 1.2;
    
    // Chord tones have strong positive weights
    for (const interval of def.intervals) {
      if (interval === 0) continue;
      if (interval === 3 || interval === 4) {
        // 3rd is critical for major/minor identity
        weights[interval] = 1.0;
      } else if (interval === 7) {
        // 5th is standard
        weights[interval] = 0.8;
      } else if (interval === 10 || interval === 11 || interval === 9) {
        // 7th / 6th
        weights[interval] = 0.9;
      } else {
        weights[interval] = 0.75;
      }
    }
    
    // Natural tensions have slight positive or neutral weight
    for (const tension of def.tensions) {
      weights[tension] = 0.2;
    }
    
    // Avoid tones have extra negative weight
    if (def.avoidTones) {
      for (const avoid of def.avoidTones) {
        weights[avoid] = -0.8;
      }
    }
    
    templates[type] = {
      type,
      weights,
    };
  }

  return templates as Record<ChordType, ChordTemplate>;
}

export const CHORD_TEMPLATES = generateChordTemplates();
