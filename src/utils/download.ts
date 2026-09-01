export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadMidiFile(uint8Array: Uint8Array, filename: string) {
  const copy = new Uint8Array(uint8Array.byteLength);
  copy.set(uint8Array);
  const blob = new Blob([copy.buffer as ArrayBuffer], { type: 'audio/midi' });
  downloadBlob(blob, filename);
}
