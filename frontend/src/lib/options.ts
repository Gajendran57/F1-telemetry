import type { OptionItem, OptionsResponse } from '../types/telemetry';

/**
 * Used when the API is unavailable so the selectors stay usable in the
 * synthetic-only frontend mode. The backend serves the same shape from
 * GET /api/v1/options (including the values from backend/.env).
 */
export const SESSION_SOURCES: OptionItem[] = [
  { value: 'mock', label: 'Synthetic (mock)' },
  { value: 'fastf1', label: 'FastF1' },
];

const SESSIONS: OptionItem[] = [
  { value: 'FP1', label: 'Practice 1' },
  { value: 'FP2', label: 'Practice 2' },
  { value: 'FP3', label: 'Practice 3' },
  { value: 'Q', label: 'Qualifying' },
  { value: 'S', label: 'Sprint' },
  { value: 'S1', label: 'Sprint Qualifying 1' },
  { value: 'S2', label: 'Sprint Qualifying 2' },
  { value: 'S3', label: 'Sprint Qualifying 3' },
  { value: 'R', label: 'Race' },
];

const DRIVERS: OptionItem[] = [
  { value: 'VER', label: 'Max Verstappen' },
  { value: 'NOR', label: 'Lando Norris' },
  { value: 'PIA', label: 'Oscar Piastri' },
  { value: 'LEC', label: 'Charles Leclerc' },
  { value: 'HAM', label: 'Lewis Hamilton' },
  { value: 'RUS', label: 'George Russell' },
  { value: 'SAI', label: 'Carlos Sainz' },
  { value: 'ALO', label: 'Fernando Alonso' },
  { value: 'PER', label: 'Sergio Perez' },
  { value: 'GAS', label: 'Pierre Gasly' },
  { value: 'STR', label: 'Lance Stroll' },
  { value: 'RIC', label: 'Daniel Ricciardo' },
  { value: 'BOT', label: 'Valtteri Bottas' },
  { value: 'OCO', label: 'Esteban Ocon' },
  { value: 'MAG', label: 'Kevin Magnussen' },
  { value: 'HUL', label: 'Nico Hulkenberg' },
  { value: 'TSU', label: 'Yuki Tsunoda' },
  { value: 'ALB', label: 'Alexander Albon' },
  { value: 'ZHO', label: 'Guanyu Zhou' },
  { value: 'LAR', label: 'Liam Lawson' },
  { value: 'VET', label: 'Sebastian Vettel' },
];

const EVENTS: OptionItem[] = [
  { value: 'Bahrain', label: 'Bahrain Grand Prix' },
  { value: 'Saudi Arabian', label: 'Saudi Arabian Grand Prix' },
  { value: 'Australian', label: 'Australian Grand Prix' },
  { value: 'Chinese', label: 'Chinese Grand Prix' },
  { value: 'Miami', label: 'Miami Grand Prix' },
  { value: 'Emilia Romagna', label: 'Emilia Romagna Grand Prix' },
  { value: 'Monaco', label: 'Monaco Grand Prix' },
  { value: 'Spanish', label: 'Spanish Grand Prix' },
  { value: 'Canadian', label: 'Canadian Grand Prix' },
  { value: 'Austrian', label: 'Austrian Grand Prix' },
  { value: 'British', label: 'British Grand Prix' },
  { value: 'Hungarian', label: 'Hungarian Grand Prix' },
  { value: 'Belgian', label: 'Belgian Grand Prix' },
  { value: 'Dutch', label: 'Dutch Grand Prix' },
  { value: 'Italian', label: 'Italian Grand Prix' },
  { value: 'Singapore', label: 'Singapore Grand Prix' },
  { value: 'United States', label: 'United States Grand Prix' },
  { value: 'Mexico', label: 'Mexico City Grand Prix' },
  { value: 'Brazilian', label: 'Sao Paulo Grand Prix' },
  { value: 'Las Vegas', label: 'Las Vegas Grand Prix' },
  { value: 'Qatar', label: 'Qatar Grand Prix' },
  { value: 'Abu Dhabi', label: 'Abu Dhabi Grand Prix' },
];

export function localOptions(year = 2024): OptionsResponse {
  const current = new Date().getFullYear();
  const years = Array.from({ length: current - 2018 + 1 }, (_, i) => 2018 + i);
  return {
    year: years.includes(year) ? year : current,
    years,
    events: EVENTS,
    sessions: SESSIONS,
    drivers: DRIVERS,
    defaults: {
      source: 'mock',
      year: years.includes(year) ? year : current,
      gp: 'Bahrain',
      session: 'R',
      drivers: ['VER', 'NOR'],
      cacheDir: '.fastf1_cache',
      liveFile: null,
      laps: null,
      allowMockFallback: true,
    },
    fastf1Available: false,
    corsOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  };
}
