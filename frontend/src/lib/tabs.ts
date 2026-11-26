/** Single source of truth for the telemetry tabs and their short help text. */
export const TABS = [
  { id: 'delta', label: 'Delta-T', icon: 'Δ', hint: 'Where the reference lap gains or loses time' },
  { id: 'speed', label: 'Speed', icon: '↗', hint: 'Speed comparison over lap distance' },
  { id: 'pedals', label: 'Pedals', icon: '⇅', hint: 'Throttle and braking comparison' },
  { id: 'trajectory', label: 'GPS map', icon: '◉', hint: 'Driving lines on the selected circuit' },
  { id: 'corners', label: 'Corners', icon: '⌁', hint: 'Apex speed and braking points per corner' },
  { id: 'verifier', label: 'Verifier', icon: '✓', hint: 'Data quality checks and results' },
] as const;

export type TabId = typeof TABS[number]['id'];

export function isTabId(value: string): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

export function tabFromHash(hash: string): TabId | null {
  const value = hash.replace(/^#/, '').split('/')[0];
  return isTabId(value) ? value : null;
}
