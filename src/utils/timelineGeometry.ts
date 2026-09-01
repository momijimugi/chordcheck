/**
 * Shared Timeline Geometry & Coordinate Helpers
 * Provides single source of truth for time-to-pixel coordinate conversions
 * across Chord Timeline, Piano Roll, Bar Grid, and Playhead.
 */

export const LEFT_GUTTER_WIDTH = 56; // 56px sticky piano key width

export interface TimelineGeometry {
  leftGutterWidth: number;
  zoomX: number;
  tickToX: (ticks: number) => number;
  xToTick: (x: number) => number;
}

export function tickToX(ticks: number, zoomX: number): number {
  return Math.round(ticks * zoomX * 100) / 100;
}

export function xToTick(x: number, zoomX: number): number {
  if (zoomX <= 0) return 0;
  return Math.round(x / zoomX);
}

/**
 * Calculates exact chord block positioning.
 * Strict rule: Block width must be exactly tickToX(end) - tickToX(start).
 * Do NOT use Math.max(48, ...) as it breaks time-alignment with the bar grid.
 */
export function calculateChordBlockGeometry(
  startTicks: number,
  endTicks: number,
  zoomX: number
): { left: number; width: number } {
  const left = tickToX(startTicks, zoomX);
  const rawWidth = tickToX(endTicks, zoomX) - left;
  const width = Math.max(2, rawWidth);
  return { left, width };
}

/**
 * Calculate optimal zoom to fit entire project within available container width
 */
export function calculateFitZoom(
  containerWidth: number,
  durationTicks: number,
  minZoom: number = 0.02,
  maxZoom: number = 0.5
): number {
  if (durationTicks <= 0 || containerWidth <= 0) return 0.1;
  const availableWidth = Math.max(200, containerWidth - LEFT_GUTTER_WIDTH - 40);
  const optimal = availableWidth / durationTicks;
  return Math.max(minZoom, Math.min(maxZoom, optimal));
}
