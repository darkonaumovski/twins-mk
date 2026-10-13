import { describe, expect, it } from 'vitest';
import { latinize, parseQuickLog, type QuickContext, type QuickItem } from './parse';

// Tuesday 13 October 2026, 16:00 local time.
const now = new Date(2026, 9, 13, 16, 0);
const ctx: QuickContext = {
  names: { A: 'Ема', B: 'Ана' },
  medNames: ['Витамин Д', 'Vitamin D'],
  now,
  who: 'A',
  lastMilk: { A: 'formula', B: 'breast' },
};

const hhmm = (iso: string) => {
  const d = new Date(iso);
  const day = d.getDate() === now.getDate() ? '' : '-1d ';
  return `${day}${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** "A bottle 90 formula", "both diaper wet @15:40", "B wake", "A sleep 120m", "A breast left timer". */
function show(item: QuickItem): string {
  if (item.kind === 'wake') return `${item.who} wake${item.at === now.toISOString() ? '' : ` @${hhmm(item.at)}`}`;
  const d = item.draft;
  const when = d.start === now.toISOString() ? '' : ` @${hhmm(d.start)}`;
  const minutes = d.end ? `${Math.round((Date.parse(d.end) - Date.parse(d.start)) / 60_000)}m` : 'timer';
  switch (d.type) {
    case 'feed':
      return d.data.method === 'bottle'
        ? `${item.who} bottle ${d.data.ml} ${d.data.milk}${when}`
        : `${item.who} breast ${d.data.side} ${minutes}${d.end ? '' : when}`;
    case 'diaper':
      return `${item.who} diaper ${d.data.kind}${when}`;
    case 'sleep':
      return d.end ? `${item.who} sleep ${minutes}` : `${item.who} sleep start${when}`;
    case 'med':
      return `${item.who} med ${d.data.name}${d.data.dose ? ` ${d.data.dose}` : ''}${when}`;
    case 'temp':
      return `${item.who} temp ${d.data.celsius}${when}`;
    default:
      return `${item.who} ${d.type}`;
  }
}

const parse = (text: string, over: Partial<QuickContext> = {}) => {
  const r = parseQuickLog(text, { ...ctx, ...over });
  return { items: r.items.map(show), unknown: r.unknown, hints: r.hints };
};

// [phrase, understood entries]; every phrase here is fully understood (no unknown words, no hints).
const UNDERSTOOD: [string, string[]][] = [
  // Feeds, English and Macedonian, one twin, both, and different amounts.
  ['A 90 B 70 formula', ['A bottle 90 formula', 'B bottle 70 formula']],
  ['Ема 90 мл адаптирано', ['A bottle 90 formula']],
  ['both 80 breast milk', ['both bottle 80 breast']],
  ['двете 80 мајчино', ['both bottle 80 breast']],
  ['Ema 90 ml', ['A bottle 90 formula']],
  ['Ана 90 мл', ['B bottle 90 breast']],
  ['Ана 90мл', ['B bottle 90 breast']],
  ['Ana 80 formula', ['B bottle 80 formula']],
  ['A bottle 120 formula', ['A bottle 120 formula']],
  ['шише 120 адаптирано', ['A bottle 120 formula']],
  ['feed 90 breast milk', ['A bottle 90 breast']],
  ['Ема 90 адаптирано Ана 70 мајчино', ['A bottle 90 formula', 'B bottle 70 breast']],
  ['двајцата по 100 мл адаптирано', ['both bottle 100 formula']],
  ['Ема 60 мл мајчино млеко', ['A bottle 60 breast']],
  ['b 150 formula', ['B bottle 150 formula']],
  // Breastfeeding: a side, minutes or a timer.
  ['left breast Ana', ['B breast left timer']],
  ['Ана лева дојка 15 мин', ['B breast left 15m']],
  ['Ана лева 15мин', ['B breast left 15m']],
  ['Ема десна', ['A breast right timer']],
  ['Ана двете страни 10 мин', ['B breast both 10m']],
  ['Ema right breast 20 min', ['A breast right 20m']],
  // Diapers.
  ['wet', ['A diaper wet']],
  ['dirty', ['A diaper dirty']],
  ['Ема мокра', ['A diaper wet']],
  ['Ана полна', ['B diaper dirty']],
  ['двете мокра', ['both diaper wet']],
  ['both wet', ['both diaper wet']],
  ['мокра и полна', ['A diaper both']],
  ['пелена двете', ['A diaper both']],
  ['Ема пелена двете', ['A diaper both']],
  ['A wet B dirty', ['A diaper wet', 'B diaper dirty']],
  ['и двете мокра', ['both diaper wet']],
  ['Ема и Ана мокра', ['both diaper wet']],
  ['ANA WET', ['B diaper wet']],
  ['а мокра', ['A diaper wet']],
  ['б полна', ['B diaper dirty']],
  ['wet dirty', ['A diaper both']],
  // Sleep: start, stop, and a finished sleep ending now.
  ['sleep', ['A sleep start']],
  ['спие', ['A sleep start']],
  ['двете спијат', ['both sleep start']],
  ['двајцата спијат', ['both sleep start']],
  ['awake', ['A wake']],
  ['буден', ['A wake']],
  ['Ана будна', ['B wake']],
  ['both awake', ['both wake']],
  ['slept 2h', ['A sleep 120m']],
  ['спиеше 2ч', ['A sleep 120m']],
  ['Ема спиеше 1 час и 30 мин', ['A sleep 90m']],
  ['Ana slept 45 min', ['B sleep 45m']],
  // Medicines: names from the medicine routines, or after a medicine word.
  ['Ema vitamin D', ['A med Vitamin D']],
  ['Ана витамин Д', ['B med Витамин Д']],
  ['двете витамин д', ['both med Витамин Д']],
  ['Ема лек Пробиотик', ['A med Пробиотик']],
  ['Ana med Calpol', ['B med Calpol']],
  // Temperature, with a comma or a dot.
  ['Ема 37,8', ['A temp 37.8']],
  ['Ема 37.8', ['A temp 37.8']],
  ['Ана температура 38', ['B temp 38']],
  ['temp 37', ['A temp 37']],
  ['A 37,5 B 38,2', ['A temp 37.5', 'B temp 38.2']],
  // Time: "at", "во", "ago", "пред"; a time later than now means yesterday.
  ['A 90 formula at 14:30', ['A bottle 90 formula @14:30']],
  ['Ема 90 мл адаптирано во 14:30', ['A bottle 90 formula @14:30']],
  ['B wet 20 min ago', ['B diaper wet @15:40']],
  ['Ана мокра пред 20 мин', ['B diaper wet @15:40']],
  ['Ана мокра пред 1 ч', ['B diaper wet @15:00']],
  ['двете 80 мајчино пред 1 час', ['both bottle 80 breast @15:00']],
  ['A 90 formula at 23:30', ['A bottle 90 formula @-1d 23:30']],
  ['Ана 37,8 во 14:30', ['B temp 37.8 @14:30']],
  ['спие од 15:30', ['A sleep start @15:30']],
  // Mixed scripts and small typos in names (the first three letters).
  ['ana sleep emа wet', ['B sleep start', 'A diaper wet']],
  ['Emaa 90 ml formula', ['A bottle 90 formula']],
  ['Анаа мокра', ['B diaper wet']],
  // Two kinds of entry for one twin.
  ['Ема 90 мл адаптирано мокра', ['A diaper wet', 'A bottle 90 formula']],
];

describe('quick text logging', () => {
  it.each(UNDERSTOOD)('understands "%s"', (phrase, expected) => {
    const r = parse(phrase);
    expect(r.items).toEqual(expected);
    expect(r.unknown).toEqual([]);
    expect(r.hints).toEqual([]);
  });

  it('covers at least 60 phrases', () => {
    expect(UNDERSTOOD.length).toBeGreaterThanOrEqual(60);
  });

  it('shows what it did not understand, and never guesses', () => {
    expect(parse('Ема ракета')).toEqual({ items: [], unknown: ['ракета'], hints: [] });
    expect(parse('hello')).toEqual({ items: [], unknown: ['hello'], hints: [] });
    // A bare number is not an amount.
    expect(parse('Ема 90')).toEqual({ items: [], unknown: ['90'], hints: [] });
    // An unknown word next to something it knows: the entry is shown, and the word too.
    expect(parse('Марко мокра')).toEqual({ items: ['A diaper wet'], unknown: ['Марко'], hints: [] });
  });

  it('asks for the milk when neither the phrase nor the twin’s last bottle says', () => {
    expect(parse('двете 90 мл')).toEqual({ items: [], unknown: [], hints: ['milk'] });
    expect(parse('Ема 90 мл', { lastMilk: {} })).toEqual({ items: [], unknown: [], hints: ['milk'] });
  });

  it('asks for the side of a breastfeed instead of picking one', () => {
    expect(parse('Ема дојка')).toEqual({ items: [], unknown: [], hints: ['side'] });
    expect(parse('Ана дојење 15 мин')).toEqual({ items: [], unknown: [], hints: ['side'] });
  });

  it('gives words before the first name to that twin', () => {
    expect(parse('мокра Ана полна').items).toEqual(['B diaper both']);
  });

  it('uses the twin chosen on Today when the phrase names nobody', () => {
    expect(parse('wet', { who: 'both' }).items).toEqual(['both diaper wet']);
    expect(parse('спие', { who: 'B' }).items).toEqual(['B sleep start']);
  });

  it('does not take a prefix that fits both twins', () => {
    expect(parse('Mar wet', { names: { A: 'Марија', B: 'Марта' } }).items).toEqual(['A diaper wet']);
    expect(parse('Марија мокра', { names: { A: 'Марија', B: 'Марта' } }).items).toEqual(['A diaper wet']);
    expect(parse('Марта мокра', { names: { A: 'Марија', B: 'Марта' } }).items).toEqual(['B diaper wet']);
  });

  it('reads "a" / "а" as a word unless it is uppercase or first', () => {
    expect(parse('Ема мокра а Ана полна').items).toEqual(['A diaper wet', 'B diaper dirty']);
    expect(parse('Ana had a wet diaper')).toEqual({ items: ['B diaper wet'], unknown: [], hints: [] });
    expect(parse('a мокра', { who: 'B' }).items).toEqual(['A diaper wet']);
  });

  it('never takes a known word for a twin, and matches names loosely', () => {
    const names = { A: 'Мила', B: 'Деса' };
    expect(parse('Деса десна дојка 10 мин', { names }).items).toEqual(['B breast right 10m']);
    expect(parse('Мила 90 milk formula', { names }).items).toEqual(['A bottle 90 formula']);
    expect(parse('Emma wet', { names: { A: 'Ема', B: 'Јана' } }).items).toEqual(['A diaper wet']);
    expect(parse('Yana wet', { names: { A: 'Ема', B: 'Јана' } }).items).toEqual(['B diaper wet']);
    expect(parse('Anna dirty').items).toEqual(['B diaper dirty']);
    // Much longer than the name: not a typo of it.
    expect(parse('Emanuela wet', { who: 'B' }).unknown).toEqual(['Emanuela']);
  });

  it('lets each name end its part when the phrase ends with a name', () => {
    expect(parse('wet Ana dirty Ema').items).toEqual(['B diaper wet', 'A diaper dirty']);
    expect(parse('left breast Ana right breast Ema').items).toEqual(['B breast left timer', 'A breast right timer']);
    expect(parse('Ема + Ана мокра').items).toEqual(['both diaper wet']);
    expect(parse('Ema & Ana wet').items).toEqual(['both diaper wet']);
  });

  it('takes millilitres next to a medicine as its dose, never as a bottle', () => {
    expect(parse('Ема витамин Д 5 мл').items).toEqual(['A med Витамин Д 5 мл']);
    expect(parse('Ема лек Пробиотик 5 мл').items).toEqual(['A med Пробиотик 5 мл']);
    expect(parse('Ема лек 5 мл')).toEqual({ items: [], unknown: ['лек', '5', 'мл'], hints: [] });
    expect(parse('А 90 формула Б витамин Д').items).toEqual(['A bottle 90 formula', 'B med Витамин Д']);
    // A milk word in the medicine's part is not shared: the bare 90 is not understood, not guessed.
    expect(parse('А 90 Б витамин Д формула').unknown).toEqual(['90', 'формула']);
  });

  it('reads an hour as a time of day after "во" / "at" or before "часот"', () => {
    expect(parse('Ема мокра во 14ч').items).toEqual(['A diaper wet @14:00']);
    expect(parse('Ема мокра во 14 часот').items).toEqual(['A diaper wet @14:00']);
    expect(parse('Ема мокра 14 часот').items).toEqual(['A diaper wet @14:00']);
    // Later than now: yesterday.
    expect(parse('Ема мокра во 18ч').items).toEqual(['A diaper wet @-1d 18:00']);
    expect(parse('Ема мокра во 23:30').items).toEqual(['A diaper wet @-1d 23:30']);
  });

  it('does not drop minutes that nothing took', () => {
    expect(parse('Ема мокра 15 мин').unknown).toEqual(['15', 'мин']);
    expect(parse('Ема спиеше')).toEqual({ items: [], unknown: [], hints: ['duration'] });
  });

  it('starts a sleep only for an awake twin and wakes only a sleeping one', () => {
    expect(parse('двете спијат', { asleep: ['A'] }).items).toEqual(['B sleep start']);
    expect(parse('Ема спие', { asleep: ['A'] })).toEqual({ items: [], unknown: [], hints: ['alreadyAsleep'] });
    expect(parse('двете будни', { asleep: ['B'] }).items).toEqual(['B wake']);
    expect(parse('Ема буден', { asleep: [] })).toEqual({ items: [], unknown: [], hints: ['notAsleep'] });
  });

  it('refuses nonsense quietly', () => {
    expect(parse('')).toEqual({ items: [], unknown: [], hints: [] });
    expect(parse('A')).toEqual({ items: [], unknown: [], hints: [] });
    expect(parse('37 мачки').unknown).toEqual(['37', 'мачки']);
  });

  it('compares names across scripts', () => {
    expect(latinize('Ема')).toBe('ema');
    expect(latinize('Ema')).toBe('ema');
    expect(latinize('Ѓорѓи')).toBe('gjorgji');
    expect(latinize('Đorđi')).toBe('gjorgji');
  });
});
