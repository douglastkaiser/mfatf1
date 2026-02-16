// F1 Fantasy App Configuration
// All scoring rules, driver data, race calendar, and API configuration.

export const API = {
  BASE_URL: 'https://api.jolpi.ca/ergast/f1',
  SEASON: '2026',
  POLL_INTERVAL_MS: 5 * 60 * 1000,
  CACHE_TTL_MS: 10 * 60 * 1000,
};

export const SCORING = {
  RACE_FINISH: {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
    6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
  },
  DNF_PENALTY: -20,
  DSQ_PENALTY_DRIVER: 0,
  DSQ_PENALTY_CONSTRUCTOR: -20,
  POSITION_GAINED: 1,
  POSITION_LOST: -1,
  OVERTAKE_BONUS: 1,
  FASTEST_LAP: 10,
  DRIVER_OF_THE_DAY: 10,
  SPRINT: { 1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1 },
  SPRINT_FASTEST_LAP: 5,
  CONSTRUCTOR_QUALIFYING: {
    NEITHER_Q2: -1, ONE_Q2: 1, BOTH_Q2: 3, ONE_Q3: 5, BOTH_Q3: 10,
  },
  PIT_STOP: {
    FASTEST_OVERALL: 5, UNDER_2_0: 20, UNDER_2_2: 10,
    UNDER_2_5: 5, UNDER_3_0: 2, RECORD_BONUS: 15, RECORD_TIME: 1.80,
  },
  STREAKS: {
    DRIVER_QUALI_TOP10_5: 5, DRIVER_FINISH_TOP10_5: 10,
    CONSTRUCTOR_QUALI_TOP10_3: 5, CONSTRUCTOR_FINISH_TOP10_3: 10,
  },
  TRANSFER_PENALTY: -10,
  FREE_TRANSFERS: 2,
  MAX_CARRYOVER: 1,
};

export const BUDGET = { STARTING: 100.0 };

export const DRIVERS = [
  { id: 'norris', code: 'NOR', firstName: 'Lando', lastName: 'Norris', number: 4, team: 'mclaren', nationality: 'GBR', price: 30.0 },
  { id: 'max_verstappen', code: 'VER', firstName: 'Max', lastName: 'Verstappen', number: 1, team: 'red_bull', nationality: 'NED', price: 28.0 },
  { id: 'russell', code: 'RUS', firstName: 'George', lastName: 'Russell', number: 63, team: 'mercedes', nationality: 'GBR', price: 25.0 },
  { id: 'leclerc', code: 'LEC', firstName: 'Charles', lastName: 'Leclerc', number: 16, team: 'ferrari', nationality: 'MON', price: 24.0 },
  { id: 'piastri', code: 'PIA', firstName: 'Oscar', lastName: 'Piastri', number: 81, team: 'mclaren', nationality: 'AUS', price: 23.0 },
  { id: 'hamilton', code: 'HAM', firstName: 'Lewis', lastName: 'Hamilton', number: 44, team: 'ferrari', nationality: 'GBR', price: 21.0 },
  { id: 'antonelli', code: 'ANT', firstName: 'Kimi', lastName: 'Antonelli', number: 12, team: 'mercedes', nationality: 'ITA', price: 17.0 },
  { id: 'sainz', code: 'SAI', firstName: 'Carlos', lastName: 'Sainz', number: 55, team: 'williams', nationality: 'ESP', price: 16.0 },
  { id: 'alonso', code: 'ALO', firstName: 'Fernando', lastName: 'Alonso', number: 14, team: 'aston_martin', nationality: 'ESP', price: 13.0 },
  { id: 'gasly', code: 'GAS', firstName: 'Pierre', lastName: 'Gasly', number: 10, team: 'alpine', nationality: 'FRA', price: 12.0 },
  { id: 'hadjar', code: 'HAD', firstName: 'Isack', lastName: 'Hadjar', number: 6, team: 'red_bull', nationality: 'FRA', price: 12.0 },
  { id: 'lawson', code: 'LAW', firstName: 'Liam', lastName: 'Lawson', number: 30, team: 'racing_bulls', nationality: 'NZL', price: 11.0 },
  { id: 'albon', code: 'ALB', firstName: 'Alexander', lastName: 'Albon', number: 23, team: 'williams', nationality: 'THA', price: 11.0 },
  { id: 'ocon', code: 'OCO', firstName: 'Esteban', lastName: 'Ocon', number: 31, team: 'haas', nationality: 'FRA', price: 10.0 },
  { id: 'hulkenberg', code: 'HUL', firstName: 'Nico', lastName: 'Hulkenberg', number: 27, team: 'audi', nationality: 'DEU', price: 9.0 },
  { id: 'stroll', code: 'STR', firstName: 'Lance', lastName: 'Stroll', number: 18, team: 'aston_martin', nationality: 'CAN', price: 9.0 },
  { id: 'bearman', code: 'BEA', firstName: 'Oliver', lastName: 'Bearman', number: 87, team: 'haas', nationality: 'GBR', price: 8.0 },
  { id: 'colapinto', code: 'COL', firstName: 'Franco', lastName: 'Colapinto', number: 43, team: 'alpine', nationality: 'ARG', price: 7.0 },
  { id: 'perez', code: 'PER', firstName: 'Sergio', lastName: 'Perez', number: 11, team: 'cadillac', nationality: 'MEX', price: 7.0 },
  { id: 'bortoleto', code: 'BOR', firstName: 'Gabriel', lastName: 'Bortoleto', number: 5, team: 'audi', nationality: 'BRA', price: 6.0 },
  { id: 'bottas', code: 'BOT', firstName: 'Valtteri', lastName: 'Bottas', number: 77, team: 'cadillac', nationality: 'FIN', price: 6.0 },
  { id: 'lindblad', code: 'LIN', firstName: 'Arvid', lastName: 'Lindblad', number: 41, team: 'racing_bulls', nationality: 'GBR', price: 5.0 },
];

export const CONSTRUCTORS = [
  { id: 'mclaren', name: 'McLaren', shortName: 'McLaren', color: '#FF8000', price: 30.0, drivers: ['norris', 'piastri'] },
  { id: 'mercedes', name: 'Mercedes-AMG Petronas', shortName: 'Mercedes', color: '#27F4D2', price: 27.0, drivers: ['russell', 'antonelli'] },
  { id: 'red_bull', name: 'Red Bull Racing', shortName: 'Red Bull', color: '#3671C6', price: 24.0, drivers: ['max_verstappen', 'hadjar'] },
  { id: 'ferrari', name: 'Scuderia Ferrari', shortName: 'Ferrari', color: '#E8002D', price: 23.0, drivers: ['leclerc', 'hamilton'] },
  { id: 'aston_martin', name: 'Aston Martin', shortName: 'Aston Martin', color: '#229971', price: 15.0, drivers: ['alonso', 'stroll'] },
  { id: 'williams', name: 'Williams Racing', shortName: 'Williams', color: '#1868DB', price: 14.0, drivers: ['sainz', 'albon'] },
  { id: 'racing_bulls', name: 'Racing Bulls', shortName: 'Racing Bulls', color: '#6692FF', price: 10.0, drivers: ['lawson', 'lindblad'] },
  { id: 'alpine', name: 'BWT Alpine', shortName: 'Alpine', color: '#00A1E8', price: 10.0, drivers: ['gasly', 'colapinto'] },
  { id: 'haas', name: 'MoneyGram Haas', shortName: 'Haas', color: '#B6BABD', price: 9.0, drivers: ['ocon', 'bearman'] },
  { id: 'audi', name: 'Audi', shortName: 'Audi', color: '#FF2D00', price: 8.0, drivers: ['hulkenberg', 'bortoleto'] },
  { id: 'cadillac', name: 'Cadillac', shortName: 'Cadillac', color: '#AAAAAD', price: 5.0, drivers: ['perez', 'bottas'] },
];

export const TEAM_COLORS = {
  red_bull: '#3671C6', ferrari: '#E8002D', mclaren: '#FF8000',
  mercedes: '#27F4D2', aston_martin: '#229971', alpine: '#00A1E8',
  haas: '#B6BABD', racing_bulls: '#6692FF', audi: '#FF2D00',
  williams: '#1868DB', cadillac: '#AAAAAD',
};

// Full 2026 race calendar for offline rendering
export const RACE_CALENDAR = [
  { round: 1, name: 'Australian Grand Prix', circuit: 'Albert Park Circuit', location: 'Melbourne', country: 'Australia', flag: 'AU', date: '2026-03-08', sprint: false },
  { round: 2, name: 'Chinese Grand Prix', circuit: 'Shanghai International Circuit', location: 'Shanghai', country: 'China', flag: 'CN', date: '2026-03-15', sprint: true },
  { round: 3, name: 'Japanese Grand Prix', circuit: 'Suzuka International Racing Course', location: 'Suzuka', country: 'Japan', flag: 'JP', date: '2026-03-29', sprint: false },
  { round: 4, name: 'Bahrain Grand Prix', circuit: 'Bahrain International Circuit', location: 'Sakhir', country: 'Bahrain', flag: 'BH', date: '2026-04-12', sprint: false },
  { round: 5, name: 'Saudi Arabian Grand Prix', circuit: 'Jeddah Corniche Circuit', location: 'Jeddah', country: 'Saudi Arabia', flag: 'SA', date: '2026-04-19', sprint: false },
  { round: 6, name: 'Miami Grand Prix', circuit: 'Miami International Autodrome', location: 'Miami', country: 'USA', flag: 'US', date: '2026-05-03', sprint: true },
  { round: 7, name: 'Canadian Grand Prix', circuit: 'Circuit Gilles Villeneuve', location: 'Montreal', country: 'Canada', flag: 'CA', date: '2026-05-24', sprint: true },
  { round: 8, name: 'Monaco Grand Prix', circuit: 'Circuit de Monaco', location: 'Monte Carlo', country: 'Monaco', flag: 'MC', date: '2026-06-07', sprint: false },
  { round: 9, name: 'Barcelona-Catalunya Grand Prix', circuit: 'Circuit de Barcelona-Catalunya', location: 'Barcelona', country: 'Spain', flag: 'ES', date: '2026-06-14', sprint: false },
  { round: 10, name: 'Austrian Grand Prix', circuit: 'Red Bull Ring', location: 'Spielberg', country: 'Austria', flag: 'AT', date: '2026-06-28', sprint: false },
  { round: 11, name: 'British Grand Prix', circuit: 'Silverstone Circuit', location: 'Silverstone', country: 'United Kingdom', flag: 'GB', date: '2026-07-05', sprint: true },
  { round: 12, name: 'Belgian Grand Prix', circuit: 'Circuit de Spa-Francorchamps', location: 'Spa', country: 'Belgium', flag: 'BE', date: '2026-07-19', sprint: false },
  { round: 13, name: 'Hungarian Grand Prix', circuit: 'Hungaroring', location: 'Budapest', country: 'Hungary', flag: 'HU', date: '2026-07-26', sprint: false },
  { round: 14, name: 'Dutch Grand Prix', circuit: 'Circuit Zandvoort', location: 'Zandvoort', country: 'Netherlands', flag: 'NL', date: '2026-08-23', sprint: true },
  { round: 15, name: 'Italian Grand Prix', circuit: 'Autodromo Nazionale di Monza', location: 'Monza', country: 'Italy', flag: 'IT', date: '2026-09-06', sprint: false },
  { round: 16, name: 'Spanish Grand Prix', circuit: 'Madring', location: 'Madrid', country: 'Spain', flag: 'ES', date: '2026-09-13', sprint: false },
  { round: 17, name: 'Azerbaijan Grand Prix', circuit: 'Baku City Circuit', location: 'Baku', country: 'Azerbaijan', flag: 'AZ', date: '2026-09-26', sprint: false },
  { round: 18, name: 'Singapore Grand Prix', circuit: 'Marina Bay Street Circuit', location: 'Singapore', country: 'Singapore', flag: 'SG', date: '2026-10-11', sprint: true },
  { round: 19, name: 'United States Grand Prix', circuit: 'Circuit of The Americas', location: 'Austin', country: 'USA', flag: 'US', date: '2026-10-25', sprint: false },
  { round: 20, name: 'Mexico City Grand Prix', circuit: 'Autodromo Hermanos Rodriguez', location: 'Mexico City', country: 'Mexico', flag: 'MX', date: '2026-11-01', sprint: false },
  { round: 21, name: 'Sao Paulo Grand Prix', circuit: 'Autodromo Jose Carlos Pace', location: 'Sao Paulo', country: 'Brazil', flag: 'BR', date: '2026-11-08', sprint: false },
  { round: 22, name: 'Las Vegas Grand Prix', circuit: 'Las Vegas Strip Street Circuit', location: 'Las Vegas', country: 'USA', flag: 'US', date: '2026-11-21', sprint: false },
  { round: 23, name: 'Qatar Grand Prix', circuit: 'Losail International Circuit', location: 'Lusail', country: 'Qatar', flag: 'QA', date: '2026-11-29', sprint: false },
  { round: 24, name: 'Abu Dhabi Grand Prix', circuit: 'Yas Marina Circuit', location: 'Abu Dhabi', country: 'UAE', flag: 'AE', date: '2026-12-06', sprint: false },
];

// Country code to flag emoji
export function getFlag(code) {
  if (!code) return '';
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
  );
}
