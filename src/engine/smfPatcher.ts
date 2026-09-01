/**
 * Standard MIDI File (SMF) Low-level Byte Patcher
 * Scans raw MIDI bytes and extracts exact byte offsets of Note On / Note Off pitch bytes,
 * enabling zero-reconstruction, 100% byte-identical non-destructive export.
 */

export interface SMFNoteOffset {
  trackIndex: number;
  channel: number;
  pitch: number;
  startTicks: number;
  durationTicks: number;
  noteOnPitchByteOffset: number;
  noteOffPitchByteOffset: number;
}

export function parseSMFNoteOffsets(bytes: Uint8Array): SMFNoteOffset[] {
  const noteOffsets: SMFNoteOffset[] = [];
  if (bytes.length < 14) return noteOffsets;

  // Header chunk check: "MThd"
  const headerTag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (headerTag !== 'MThd') {
    return noteOffsets;
  }

  const headerLen = (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
  let pos = 8 + headerLen;

  let trackIndex = 0;
  while (pos + 8 <= bytes.length) {
    const trackTag = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    if (trackTag !== 'MTrk') {
      break;
    }

    const trackLen = (bytes[pos + 4] << 24) | (bytes[pos + 5] << 16) | (bytes[pos + 6] << 8) | bytes[pos + 7];
    const trackEnd = pos + 8 + trackLen;
    let p = pos + 8;
    let runningStatus = 0;
    let trackTicks = 0;

    // Active NoteOn stack per channel + pitch: Map<`${channel}_${pitch}`, Array<{ ticks, keyByteOffset }>>
    const activeNoteOns = new Map<string, Array<{ ticks: number; keyByteOffset: number; pitch: number }>>();

    while (p < trackEnd && p < bytes.length) {
      // Read Variable Length Quantity (delta-time)
      let delta = 0;
      while (p < trackEnd && p < bytes.length) {
        const b = bytes[p++];
        delta = (delta << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      trackTicks += delta;

      if (p >= trackEnd || p >= bytes.length) break;

      let status = bytes[p];
      if (status >= 0x80) {
        p++;
        if (status < 0xf0) {
          runningStatus = status;
        }
      } else {
        status = runningStatus;
      }

      const messageType = status & 0xf0;
      const channel = status & 0x0f;

      if (messageType === 0x90) { // Note On
        const keyByteOffset = p;
        const key = bytes[p++];
        const vel = bytes[p++];

        if (vel > 0) {
          const mapKey = `${channel}_${key}`;
          if (!activeNoteOns.has(mapKey)) {
            activeNoteOns.set(mapKey, []);
          }
          activeNoteOns.get(mapKey)!.push({
            ticks: trackTicks,
            keyByteOffset,
            pitch: key,
          });
        } else {
          // Note On with velocity 0 is Note Off
          const mapKey = `${channel}_${key}`;
          const list = activeNoteOns.get(mapKey);
          if (list && list.length > 0) {
            const on = list.shift()!;
            noteOffsets.push({
              trackIndex,
              channel,
              pitch: key,
              startTicks: on.ticks,
              durationTicks: Math.max(1, trackTicks - on.ticks),
              noteOnPitchByteOffset: on.keyByteOffset,
              noteOffPitchByteOffset: keyByteOffset,
            });
          }
        }
      } else if (messageType === 0x80) { // Note Off
        const keyByteOffset = p;
        const key = bytes[p++];
        p++; // vel

        const mapKey = `${channel}_${key}`;
        const list = activeNoteOns.get(mapKey);
        if (list && list.length > 0) {
          const on = list.shift()!;
          noteOffsets.push({
            trackIndex,
            channel,
            pitch: key,
            startTicks: on.ticks,
            durationTicks: Math.max(1, trackTicks - on.ticks),
            noteOnPitchByteOffset: on.keyByteOffset,
            noteOffPitchByteOffset: keyByteOffset,
          });
        }
      } else if (messageType === 0xa0 || messageType === 0xb0 || messageType === 0xe0) {
        p += 2;
      } else if (messageType === 0xc0 || messageType === 0xd0) {
        p += 1;
      } else if (status === 0xff) { // Meta Event
        p++; // meta type
        let len = 0;
        while (p < trackEnd && p < bytes.length) {
          const b = bytes[p++];
          len = (len << 7) | (b & 0x7f);
          if (!(b & 0x80)) break;
        }
        p += len;
      } else if (status === 0xf0 || status === 0xf7) { // SysEx
        let len = 0;
        while (p < trackEnd && p < bytes.length) {
          const b = bytes[p++];
          len = (len << 7) | (b & 0x7f);
          if (!(b & 0x80)) break;
        }
        p += len;
      }
    }

    pos = trackEnd;
    trackIndex++;
  }

  return noteOffsets;
}
