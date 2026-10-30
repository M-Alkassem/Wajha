/** Zoom levels the zoom menu offers directly. */
export const ZOOM_PRESETS: readonly number[] = [0.5, 1, 2];

/** "Fit" while the stage fits the slides, else the zoom as a percentage. */
export function zoomLabel(zoom: number, fit: boolean): string {
  if (fit) return 'Fit';
  return `${Math.round((Number.isFinite(zoom) ? zoom : 1) * 100)}%`;
}

/** The radio value for the current zoom: "fit", a preset, or "" for any other level. */
export function zoomChoice(zoom: number, fit: boolean): string {
  if (fit) return 'fit';
  const preset = ZOOM_PRESETS.find((p) => Math.abs(p - zoom) < 0.001);
  return preset === undefined ? '' : String(preset);
}
