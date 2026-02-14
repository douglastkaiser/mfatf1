// F1 Fantasy App Configuration
// All scoring rules, driver data, and API configuration in one place.

export const API = {
  BASE_URL: 'https://api.jolpi.ca/ergast/f1',
  SEASON: '2025',
  POLL_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  CACHE_TTL_MS: 10 * 60 * 1000,    // 10 minutes
};

// Official F1 Fantasy scoring rules (2025 season)
export const SCORING = {
  RACE_FINISH: {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
    6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
  },
  DNF_PENALTY: -20,
  DSQ_PENALTY_DRIVER: 0,     // 2025: drivers no longer penalized for DSQ
  DSQ_PENALTY_CONSTRUCTOR: -20,
  POSITION_GAINED: 1,         // +1 per position gained from grid to finish
  POSITION_LOST: -1,          // -1 per position lost
  OVERTAKE_BONUS: 1,          // +1 per overtake
  FASTEST_LAP: 10,
  DRIVER_OF_THE_DAY: 10,

  SPRINT: {
    1: 8, 2: 7, 3: 6, 4: 5, 5: 4,
    6: 3, 7: 2, 8: 1,
  },
  SPRINT_FASTEST_LAP: 5,

  CONSTRUCTOR_QUALIFYING: {
    NEITHER_Q2: -1,
    ONE_Q2: 1,
    BOTH_Q2: 3,
    ONE_Q3: 5,
    BOTH_Q3: 10,
  },

  PIT_STOP: {
    FASTEST_OVERALL: 5,
    UNDER_2_0: 20,
    UNDER_2_2: 10,
    UNDER_2_5: 5,
    UNDER_3_0: 2,
    RECORD_BONUS: 15,         // Break all-time record (1.80s)
    RECORD_TIME: 1.80,
  },

  STREAKS: {
    DRIVER_QUALI_TOP10_5: 5,    // Driver qualifies top 10, 5 races running
    DRIVER_FINISH_TOP10_5: 10,  // Driver finishes top 10, 5 races running
    CONSTRUCTOR_QUALI_TOP10_3: 5,  // Both drivers qualify top 10, 3 races
    CONSTRUCTOR_FINISH_TOP10_3: 10, // Both drivers finish top 10, 3 races
  },

  TRANSFER_PENALTY: -10,       // Cost per extra transfer beyond free ones
  FREE_TRANSFERS: 2,
  MAX_CARRYOVER: 1,            // Can carry over 1 unused free transfer
};

export const BUDGET = {
  STARTING: 100.0, // $100M
};

// 2025 Driver data with team assignments and fantasy prices
export const DRIVERS = [
  { id: 'max_verstappen', code: 'VER', firstName: 'Max', lastName: 'Verstappen', number: 1, team: 'red_bull', nationality: 'Dutch', price: 30.0 },
  { id: 'norris', code: 'NOR', firstName: 'Lando', lastName: 'Norris', number: 4, team: 'mclaren', nationality: 'British', price: 26.0 },
  { id: 'leclerc', code: 'LEC', firstName: 'Charles', lastName: 'Leclerc', number: 16, team: 'ferrari', nationality: 'Monegasque', price: 24.0 },
  { id: 'hamilton', code: 'HAM', firstName: 'Lewis', lastName: 'Hamilton', number: 44, team: 'ferrari', nationality: 'British', price: 23.0 },
  { id: 'piastri', code: 'PIA', firstName: 'Oscar', lastName: 'Piastri', number: 81, team: 'mclaren', nationality: 'Australian', price: 22.0 },
  { id: 'russell', code: 'RUS', firstName: 'George', lastName: 'Russell', number: 63, team: 'mercedes', nationality: 'British', price: 21.0 },
  { id: 'sainz', code: 'SAI', firstName: 'Carlos', lastName: 'Sainz', number: 55, team: 'williams', nationality: 'Spanish', price: 18.0 },
  { id: 'gasly', code: 'GAS', firstName: 'Pierre', lastName: 'Gasly', number: 10, team: 'alpine', nationality: 'French', price: 14.0 },
  { id: 'alonso', code: 'ALO', firstName: 'Fernando', lastName: 'Alonso', number: 14, team: 'aston_martin', nationality: 'Spanish', price: 15.0 },
  { id: 'tsunoda', code: 'TSU', firstName: 'Yuki', lastName: 'Tsunoda', number: 22, team: 'rb', nationality: 'Japanese', price: 12.0 },
  { id: 'stroll', code: 'STR', firstName: 'Lance', lastName: 'Stroll', number: 18, team: 'aston_martin', nationality: 'Canadian', price: 10.0 },
  { id: 'hulkenberg', code: 'HUL', firstName: 'Nico', lastName: 'Hulkenberg', number: 27, team: 'sauber', nationality: 'German', price: 10.0 },
  { id: 'ocon', code: 'OCO', firstName: 'Esteban', lastName: 'Ocon', number: 31, team: 'haas', nationality: 'French', price: 11.0 },
  { id: 'albon', code: 'ALB', firstName: 'Alexander', lastName: 'Albon', number: 23, team: 'williams', nationality: 'Thai', price: 12.0 },
  { id: 'lawson', code: 'LAW', firstName: 'Liam', lastName: 'Lawson', number: 30, team: 'red_bull', nationality: 'New Zealander', price: 13.0 },
  { id: 'antonelli', code: 'ANT', firstName: 'Kimi', lastName: 'Antonelli', number: 12, team: 'mercedes', nationality: 'Italian', price: 14.0 },
  { id: 'bearman', code: 'BEA', firstName: 'Oliver', lastName: 'Bearman', number: 87, team: 'haas', nationality: 'British', price: 8.0 },
  { id: 'doohan', code: 'DOO', firstName: 'Jack', lastName: 'Doohan', number: 7, team: 'alpine', nationality: 'Australian', price: 7.0 },
  { id: 'hadjar', code: 'HAD', firstName: 'Isack', lastName: 'Hadjar', number: 6, team: 'rb', nationality: 'French', price: 7.0 },
  { id: 'bortoleto', code: 'BOR', firstName: 'Gabriel', lastName: 'Bortoleto', number: 5, team: 'sauber', nationality: 'Brazilian', price: 6.0 },
];

export const CONSTRUCTORS = [
  { id: 'red_bull', name: 'Red Bull', color: '#3671C6', price: 28.0, drivers: ['max_verstappen', 'lawson'] },
  { id: 'ferrari', name: 'Ferrari', color: '#E8002D', price: 26.0, drivers: ['leclerc', 'hamilton'] },
  { id: 'mclaren', name: 'McLaren', color: '#FF8000', price: 27.0, drivers: ['norris', 'piastri'] },
  { id: 'mercedes', name: 'Mercedes', color: '#27F4D2', price: 22.0, drivers: ['russell', 'antonelli'] },
  { id: 'aston_martin', name: 'Aston Martin', color: '#229971', price: 14.0, drivers: ['alonso', 'stroll'] },
  { id: 'alpine', name: 'Alpine', color: '#FF87BC', price: 10.0, drivers: ['gasly', 'doohan'] },
  { id: 'haas', name: 'Haas', color: '#B6BABD', price: 9.0, drivers: ['ocon', 'bearman'] },
  { id: 'rb', name: 'RB', color: '#6692FF', price: 11.0, drivers: ['tsunoda', 'hadjar'] },
  { id: 'sauber', name: 'Sauber', color: '#52E252', price: 8.0, drivers: ['hulkenberg', 'bortoleto'] },
  { id: 'williams', name: 'Williams', color: '#64C4FF', price: 16.0, drivers: ['albon', 'sainz'] },
];

// Map team id to CSS color variable name
export const TEAM_COLORS = {
  red_bull: 'var(--team-red-bull)',
  ferrari: 'var(--team-ferrari)',
  mclaren: 'var(--team-mclaren)',
  mercedes: 'var(--team-mercedes)',
  aston_martin: 'var(--team-aston)',
  alpine: 'var(--team-alpine)',
  haas: 'var(--team-haas)',
  rb: 'var(--team-rb)',
  sauber: 'var(--team-sauber)',
  williams: 'var(--team-williams)',
};
