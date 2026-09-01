import { ChordAnalysisRole, InstrumentFamily, NoteData, TrackClassification, TrackData, TrackRole } from '../types/midi';

// Word-boundary / substring helper for clean matching
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[-_]/g, ' ')
    .trim();
}

const DRUM_KEYWORDS = [
  'drum', 'drums', 'dr', 'kit', 'drumkit', 'perc', 'percussion',
  'rhythm', 'beat', 'kick', 'snare', 'hat', 'hihat', 'hi-hat',
  'tom', 'cymbal', 'cym', 'ride', 'crash', 'clap', 'rim', 'shaker',
  'tamb', 'tambourine', 'conga', 'bongo', 'timpani', 'cowbell',
  'ドラム', 'ドラムス', 'パーカッション', 'パーカス', 'キック',
  'スネア', 'ハイハット', 'シンバル', 'タム', 'クラップ', 'シェイカー',
  'タンバリン', 'カウベル', 'コンガ', 'ボンゴ', 'ティンパニ', '打楽器', '太鼓'
];

const BASS_KEYWORDS = [
  'bass', 'bs', 'e.bass', 'e bass', 'electric bass', 'ac bass',
  'upright bass', 'contrabass', 'sub bass', 'synth bass', 'slap bass',
  'fretless', 'ベース', 'コントラバス', '低音'
];

const PIANO_KEYWORDS = [
  'piano', 'pno', 'pf', 'grand', 'upright', 'keys', 'keyboard',
  'rhodes', 'wurli', 'wurlitzer', 'ep', 'electric piano', 'clav', 'clavi',
  'organ', 'harpsichord', 'pianoforte', 'ピアノ', '鍵盤', 'オルガン', 'クラビ'
];

const GUITAR_KEYWORDS = [
  'guitar', 'gtr', 'gt', 'ac gtr', 'agtr', 'egtr', 'electric guitar',
  'acoustic guitar', 'nylon', 'steel', 'clean guitar', 'dist guitar',
  'overdrive', 'ギター', 'アコギ', 'エレキ'
];

const STRINGS_KEYWORDS = [
  'strings', 'string', 'str', 'violin', 'vln', 'vn', 'viola', 'vla',
  'cello', 'vc', 'violoncello', 'double bass', 'ensemble strings',
  'quartet', 'orch strings', 'pizz', 'pizzicato', 'arco', 'spiccato',
  'ストリングス', '弦', 'バイオリン', 'ヴァイオリン', 'ビオラ', 'ヴィオラ', 'チェロ'
];

const BRASS_KEYWORDS = [
  'brass', 'trumpet', 'tpt', 'tp', 'trombone', 'tbn', 'tb', 'horn',
  'french horn', 'fh', 'tuba', 'flugel', 'cornet', 'brass section',
  'ブラス', 'トランペット', 'トロンボーン', 'ホルン', 'チューバ'
];

const WOODWIND_KEYWORDS = [
  'flute', 'fl', 'piccolo', 'picc', 'oboe', 'ob', 'clarinet', 'cl',
  'bassoon', 'bn', 'fagott', 'sax', 'saxophone', 'alto sax', 'tenor sax',
  'baritone sax', 'recorder', 'フルート', 'オーボエ', 'クラリネット',
  'ファゴット', 'サックス'
];

const SYNTH_KEYWORDS = [
  'synth', 'syn', 'lead', 'pad', 'pluck', 'arp', 'arpeggio',
  'sequence', 'seq', 'texture', 'fx', 'saw', 'square', 'supersaw',
  'シンセ', 'パッド', 'リード', 'アルペジオ', 'プラック'
];

const VOCAL_KEYWORDS = [
  'vocal', 'vox', 'vo', 'voice', 'choir', 'chorus', 'singer',
  'lead vocal', 'backing vocal', 'ボーカル', 'コーラス', '声', '歌'
];

const CHORD_GUIDE_KEYWORDS = [
  'chord', 'chords', 'chord guide', 'harmony guide', 'guide track',
  'chord track', 'コード', 'コードガイド', 'コードトラック', '和音ガイド'
];

function hasAnyKeyword(name: string, keywords: string[]): boolean {
  const norm = normalizeText(name);
  const words = norm.split(/\s+/);
  return keywords.some(kw => {
    const normKw = normalizeText(kw);
    if (normKw.includes(' ')) {
      return norm.includes(normKw);
    }
    return words.includes(normKw) || norm.includes(normKw);
  });
}

/**
 * Classify a single MIDI track by its channel, name, and notes distribution
 */
export function classifyTrack(
  track: { id: number; name: string; channel: number; notes: NoteData[] },
  ppq: number = 480
): TrackClassification {
  const name = track.name || '';
  const normName = normalizeText(name);
  const channel = track.channel;
  const notes = track.notes || [];
  const reasons: string[] = [];

  // Special Handling: "Bass Drum" / "バスドラム" is strictly DRUM, not Bass!
  const isBassDrum = normName.includes('bass drum') || normName.includes('バスドラム') || normName.includes('kick');

  // --- 1. Drum Detection & Confidence Calculation ---
  let drumScore = 0;
  if (channel === 9) { // Channel 10 (0-origin 9)
    drumScore += 70;
    reasons.push('MIDI Channel 10 (Standard Drum Channel)');
  }

  if (isBassDrum || hasAnyKeyword(name, DRUM_KEYWORDS)) {
    drumScore += 60;
    reasons.push(`ドラム系キーワードに一致 (${name})`);
  }

  if (notes.length > 0) {
    const inGmDrumRange = notes.filter(n => n.pitch >= 35 && n.pitch <= 81).length;
    const gmRatio = inGmDrumRange / notes.length;
    if (gmRatio >= 0.8 && notes.length >= 4) {
      drumScore += 20;
      reasons.push('GMドラム標準音域 (MIDI 35-81) に集中');
    }

    const shortNotes = notes.filter(n => n.durationTicks <= ppq * 0.75).length;
    const shortRatio = shortNotes / notes.length;
    if (shortRatio >= 0.7 && notes.length >= 8) {
      drumScore += 10;
      reasons.push('打楽器特有の短いノート比率が高い');
    }
  }

  const drumConfidence = Math.min(100, Math.max(0, drumScore));

  if (drumConfidence >= 55) {
    return {
      suggestedRole: 'percussion',
      instrumentFamily: 'drums',
      instrumentName: isBassDrum ? 'Bass Drum' : (name || 'Drums'),
      confidence: drumConfidence,
      drumConfidence,
      reasons,
    };
  }

  // --- 2. Chord Guide Detection ---
  if (hasAnyKeyword(name, CHORD_GUIDE_KEYWORDS)) {
    return {
      suggestedRole: 'chord_guide',
      instrumentFamily: 'keyboard',
      instrumentName: name || 'Chord Guide',
      confidence: 90,
      drumConfidence,
      reasons: [`コードガイドキーワードに一致 (${name})`],
    };
  }

  // --- 3. Bass Detection (Excluding Bass Drum) ---
  if (!isBassDrum && hasAnyKeyword(name, BASS_KEYWORDS)) {
    return {
      suggestedRole: 'bass',
      instrumentFamily: 'bass',
      instrumentName: name || 'Bass',
      confidence: 92,
      drumConfidence,
      reasons: [`ベース系キーワードに一致 (${name})`],
    };
  }

  // --- 4. Other Instrument Families by Keywords ---
  let family: InstrumentFamily = 'unknown';
  let familyConfidence = 70;

  if (hasAnyKeyword(name, STRINGS_KEYWORDS)) {
    family = 'strings';
    familyConfidence = 88;
    reasons.push(`ストリングス系キーワードに一致 (${name})`);
  } else if (hasAnyKeyword(name, PIANO_KEYWORDS)) {
    family = 'piano';
    familyConfidence = 85;
    reasons.push(`ピアノ・鍵盤系キーワードに一致 (${name})`);
  } else if (hasAnyKeyword(name, GUITAR_KEYWORDS)) {
    family = 'guitar';
    familyConfidence = 85;
    reasons.push(`ギター系キーワードに一致 (${name})`);
  } else if (hasAnyKeyword(name, BRASS_KEYWORDS)) {
    family = 'brass';
    familyConfidence = 85;
    reasons.push(`ブラス系キーワードに一致 (${name})`);
  } else if (hasAnyKeyword(name, WOODWIND_KEYWORDS)) {
    family = 'woodwind';
    familyConfidence = 85;
    reasons.push(`木管系キーワードに一致 (${name})`);
  } else if (hasAnyKeyword(name, VOCAL_KEYWORDS)) {
    family = 'vocal';
    familyConfidence = 85;
    reasons.push(`ボーカル系キーワードに一致 (${name})`);
  } else if (hasAnyKeyword(name, SYNTH_KEYWORDS)) {
    family = 'synth';
    familyConfidence = 80;
    reasons.push(`シンセ系キーワードに一致 (${name})`);
  }

  // --- 5. Role Deduction from Polyphony / Pitch / Name ---
  let suggestedRole: TrackRole = 'auto';

  // Check pitch average if notes exist
  if (notes.length > 0) {
    const avgPitch = notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length;
    if (avgPitch < 45) {
      suggestedRole = 'bass';
      if (family === 'unknown') family = 'bass';
      reasons.push(`平均音高が極めて低い (${Math.round(avgPitch)})`);
    }
  }

  if (suggestedRole === 'auto') {
    if (family === 'bass') {
      suggestedRole = 'bass';
    } else if (family === 'vocal' || normName.includes('lead') || normName.includes('solo') || normName.includes('melody')) {
      suggestedRole = 'melody';
      reasons.push('メロディ/リード系キーワードまたはボーカル');
    } else if (family === 'piano' || family === 'guitar' || family === 'strings' || normName.includes('pad') || normName.includes('comp') || normName.includes('harmony')) {
      suggestedRole = 'harmony';
      reasons.push('和音/バッキング系楽器');
    }
  }

  // --- 6. Chord Analysis Role Deduction (β0.4.2 Phase A & B) ---
  let suggestedChordRole: ChordAnalysisRole = 'supporting_harmony';
  let chordRoleConfidence = 60;

  if (drumConfidence >= 55 || isBassDrum) {
    suggestedChordRole = 'exclude';
    chordRoleConfidence = Math.max(80, drumConfidence);
  } else if (hasAnyKeyword(name, CHORD_GUIDE_KEYWORDS)) {
    suggestedChordRole = 'primary_harmony';
    chordRoleConfidence = 95;
  } else if (suggestedRole === 'bass') {
    suggestedChordRole = 'bass_anchor';
    chordRoleConfidence = 92;
  } else if (family === 'piano' || family === 'guitar' || (family as string) === 'keyboard' || normName.includes('piano') || normName.includes('guitar') || normName.includes('keys')) {
    suggestedChordRole = 'primary_harmony';
    chordRoleConfidence = 88;
  } else if (family === 'vocal' || suggestedRole === 'melody' || normName.includes('lead') || normName.includes('solo') || normName.includes('melody') || normName.includes('vocal')) {
    suggestedChordRole = 'melody';
    chordRoleConfidence = 90;
  } else if (family === 'strings' || family === 'brass' || family === 'woodwind' || family === 'synth') {
    suggestedChordRole = 'supporting_harmony';
    chordRoleConfidence = 78;
  }

  return {
    suggestedRole,
    suggestedChordRole,
    chordRoleConfidence,
    instrumentFamily: family,
    instrumentName: name || family,
    confidence: family !== 'unknown' ? familyConfidence : 50,
    drumConfidence,
    reasons: reasons.length > 0 ? reasons : ['標準トラック'],
  };
}

/**
 * Classify all tracks in a MIDI project and update track settings metadata
 */
export function classifyAllTracks(tracks: TrackData[], ppq: number = 480): TrackData[] {
  return tracks.map(track => {
    const classification = classifyTrack(track, ppq);
    const prevSettings = track.settings;

    // Respect existing manual role and instrument override (Phase E / Section 21)
    const isManualRole = prevSettings.roleSource === 'manual';
    const finalRole = isManualRole ? prevSettings.role : (classification.suggestedRole || 'auto');
    const finalFamily = prevSettings.manualInstrumentFamily || classification.instrumentFamily;

    // Respect existing manual chord analysis role override (β0.4.2 Phase B & N)
    const isManualChordRole = prevSettings.chordAnalysisRoleSource === 'manual';
    const finalChordRole = isManualChordRole 
      ? (prevSettings.chordAnalysisRole || 'auto') 
      : (prevSettings.chordAnalysisRole || 'auto');

    return {
      ...track,
      settings: {
        ...prevSettings,
        detectedRole: classification.suggestedRole,
        role: finalRole,
        roleSource: isManualRole ? 'manual' : 'automatic',
        chordAnalysisRole: finalChordRole,
        detectedChordAnalysisRole: classification.suggestedChordRole || 'supporting_harmony',
        chordAnalysisRoleSource: isManualChordRole ? 'manual' : 'automatic',
        chordRoleConfidence: classification.chordRoleConfidence || 70,
        instrumentFamily: finalFamily,
        classification,
        ignore: finalRole === 'ignore' || finalRole === 'keyswitch' || finalRole === 'percussion',
      },
    };
  });
}
