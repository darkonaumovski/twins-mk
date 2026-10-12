import type { DevicePrefs, Entity, SharedSettings } from './types';

export const DEFAULT_SETTINGS: Omit<SharedSettings, Exclude<keyof Entity, 'id'>> = {
  id: 'shared',
  currency: 'MKD',
  dueDate: null,
  expectedDelivery: null,
  parent1Name: '',
  parent2Name: '',
  phase: 'prep',
  feedNudgeMin: 45,
  stashUseWithinDays: { fridge: null, freezer: null },
  nightShifts: [],
  rhythmTogetherMin: 20,
  nightHours: { from: '19:00', to: '07:00' },
};

export const DEFAULT_DEVICE_PREFS: Omit<DevicePrefs, 'deviceId'> = {
  id: 'device',
  language: 'mk',
  theme: 'system',
  parent: 'p1',
  notifications: false,
  seedVersion: 0,
};

export const CURRENCIES = [
  'MKD',
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'RSD',
  'BGN',
  'ALL',
  'TRY',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'AUD',
  'CAD',
] as const;
