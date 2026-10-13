import type { ISODateTime, Milk, TwinSlot } from '@/data/types';
import type { LogDraft, Who } from './logic';

/**
 * Quick text logging: short phrases in Macedonian or English turned into entries, offline and by rules
 * only ("Ема 90 мл адаптирано", "A 90 B 70 formula", "двете мокра", "Ана лева дојка 15 мин", "спие",
 * "Ема 37,8 во 14:30"). It never guesses: words it does not know are returned in `unknown`, and a
 * bottle without a known milk asks for it.
 */

/** One understood entry (for one twin or both), or "awake": stop the sleep timer(s). */
export type QuickItem = { kind: 'log'; who: Who; draft: LogDraft } | { kind: 'wake'; who: Who; at: ISODateTime };

/** Something the phrase needs before it can be saved. */
export type QuickHint = 'milk' | 'who' | 'side' | 'duration' | 'alreadyAsleep' | 'notAsleep';

export interface QuickParse {
  items: QuickItem[];
  /** Words that were not understood, as typed. */
  unknown: string[];
  hints: QuickHint[];
}

export interface QuickContext {
  /** The twins' names as the parents set them (Cyrillic or Latin). */
  names: Partial<Record<TwinSlot, string>>;
  /** Medicine names the family uses (from medicine routines), matched ignoring case. */
  medNames: readonly string[];
  now: Date;
  /** The twin(s) chosen on Today, used when the phrase names nobody. */
  who: Who;
  /** Each twin's milk on their last bottle, for "Ема 90 мл" without a milk word. */
  lastMilk?: Partial<Record<TwinSlot, Milk>>;
  /** Twins with a sleep timer running (absent: not checked). */
  asleep?: readonly TwinSlot[];
}

// ---------- Words ----------

const BOTH = new Set(['both', 'двете', 'двајцата', 'двајца', 'обајцата', 'обете']);
// "a" / "а" are words too ("had a wet diaper", "мокра а полна"): only an uppercase letter, or one first in the phrase, names a twin.
const FILLER = new Set([
  'и',
  'and',
  'the',
  'a',
  'а',
  'of',
  'на',
  'за',
  'for',
  'е',
  'is',
  'go',
  'ја',
  'ги',
  'по',
  'with',
  'со',
  'се',
  '+',
  '&',
  'had',
  'has',
  'имаше',
  'има',
]);
const FORMULA = new Set(['formula', 'адаптирано', 'адаптирана', 'адаптирано-млеко', 'формула', 'вештачко']);
const BREAST_MILK = new Set(['мајчино', 'breastmilk', 'изцедено']);
const BOTTLE = new Set(['bottle', 'шише', 'шишенце', 'шишето']);
const FEED = new Set(['feed', 'fed', 'хранење', 'храна', 'јаде', 'јадеше', 'нахрана', 'нахранета', 'нахранет']);
const BREAST = new Set(['breast', 'breastfeed', 'breastfed', 'nursing', 'дојка', 'дојење', 'доеше', 'дои', 'цицаше', 'цица']);
const LEFT = new Set(['left', 'лева', 'лево', 'левата']);
const RIGHT = new Set(['right', 'десна', 'десно', 'десната']);
const SIDES = new Set(['sides', 'страни', 'дојки']);
const MILK_WORD = new Set(['milk', 'млеко']);
const DIAPER = new Set(['diaper', 'nappy', 'пелена', 'пелени', 'пелената']);
const WET = new Set(['wet', 'pee', 'мокра', 'мокро', 'мокри', 'пишка', 'пишкано']);
const DIRTY = new Set(['dirty', 'poo', 'poop', 'полна', 'валкана', 'кака', 'какано']);
const SLEEP = new Set(['sleep', 'sleeping', 'asleep', 'спие', 'спијат', 'заспа', 'заспаа', 'спиење']);
const AWAKE = new Set(['awake', 'woke', 'wake', 'буден', 'будна', 'будни', 'разбуди', 'разбудија', 'стана']);
const SLEPT = new Set(['slept', 'спиеше', 'спиеја', 'спиела', 'спиел', 'спал', 'спала']);
const TEMP = new Set(['temp', 'temperature', 'температура', 'темп', '°c', '°', 'c', 'степени']);
const MED = new Set(['med', 'medicine', 'лек', 'лекот', 'капки', 'сируп']);
const AT = new Set(['at', 'во', 'у', 'од', 'from', 'since']);
const AGO_BEFORE = new Set(['пред']);
const AGO_AFTER = new Set(['ago']);
const MIN_UNIT = new Set(['min', 'mins', 'minutes', 'minute', 'мин', 'минути', 'минута', "'"]);
const HOUR_UNIT = new Set(['h', 'hr', 'hrs', 'hour', 'hours', 'ч', 'час', 'часа', 'саат', 'саати']);
/** "во 14 часот", "at 2 o'clock": a time of day, not a duration. */
const CLOCK = new Set(['часот', "o'clock", 'oclock']);
const ML_UNIT = new Set(['ml', 'мл', 'ml.', 'мл.']);

/** Every word the parser knows: none of them is ever taken for a twin's name. */
const KNOWN = new Set(
  [
    FORMULA,
    BREAST_MILK,
    BOTTLE,
    FEED,
    BREAST,
    LEFT,
    RIGHT,
    SIDES,
    MILK_WORD,
    DIAPER,
    WET,
    DIRTY,
    SLEEP,
    AWAKE,
    SLEPT,
    TEMP,
    MED,
    AT,
    AGO_BEFORE,
    AGO_AFTER,
    MIN_UNIT,
    HOUR_UNIT,
    CLOCK,
    ML_UNIT,
  ].flatMap((s) => [...s]),
);

const LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  ѓ: 'gj',
  е: 'e',
  ж: 'zh',
  з: 'z',
  ѕ: 'dz',
  и: 'i',
  ј: 'j',
  к: 'k',
  л: 'l',
  љ: 'lj',
  м: 'm',
  н: 'n',
  њ: 'nj',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  ќ: 'kj',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  џ: 'dz',
  ш: 'sh',
  š: 'sh',
  č: 'ch',
  ž: 'zh',
  ć: 'kj',
  đ: 'gj',
  y: 'i',
  w: 'v',
  x: 'ks',
  q: 'k',
};
/** "Ема", "Ema", "Emma" → comparable Latin letters ("ema", "ema", "emma"). */
export function latinize(word: string): string {
  return [...word.toLocaleLowerCase()]
    .map((c) => LATIN[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]/g, '');
}

// ---------- Tokens ----------

interface Token {
  raw: string;
  word: string;
  used: boolean;
}

/** Splits a phrase into words: "37,8" stays a number, "90мл" and "15мин" become number + unit, "14:30" stays a time. */
function tokenize(text: string): Token[] {
  const spaced = text
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[;,!?]+/g, ' ')
    .replace(/(\d)(ml|мл|min|мин|h|ч|°c|°)(?=\s|$|\.)/gi, '$1 $2');
  return spaced
    .split(/\s+/)
    .map((w) => w.replace(/^[(."“„]+|[)."”“]+$/g, ''))
    .filter(Boolean)
    .map((w) => ({ raw: w, word: w.toLocaleLowerCase(), used: false }));
}

const isNumber = (w: string) => /^\d+(\.\d+)?$/.test(w);
const num = (w: string) => Number(w);

// ---------- Twins ----------

/** A name compared loosely: either script, "Emma" = "Ема", "Yana" = "Јана". */
export function nameKey(word: string): string {
  const lower = word.toLocaleLowerCase();
  return latinize(lower.startsWith('y') ? `j${lower.slice(1)}` : lower).replace(/(.)\1+/g, '$1');
}

/**
 * Which twin a word names: a name (either script; a small typo is fine when the first three letters and
 * about the length match one twin only), an uppercase "A"/"Б" (or a lowercase one first in the phrase), or both.
 */
function twinOf(token: Token, first: boolean, names: QuickContext['names']): Who | null {
  const { raw, word } = token;
  if (BOTH.has(word)) return 'both';
  if (raw === 'A' || raw === 'А' || (first && (raw === 'a' || raw === 'а'))) return 'A';
  if (raw === 'B' || raw === 'Б' || (first && (raw === 'b' || raw === 'б'))) return 'B';
  if (KNOWN.has(word) || FILLER.has(word)) return null;
  const w = nameKey(word);
  if (w.length < 3) return null;
  const keys = { A: nameKey(names.A ?? ''), B: nameKey(names.B ?? '') };
  const exact = (['A', 'B'] as const).filter((slot) => keys[slot].length >= 2 && keys[slot] === w);
  if (exact.length === 1) return exact[0];
  const close = (['A', 'B'] as const).filter((slot) => keys[slot].length >= 3 && w.slice(0, 3) === keys[slot].slice(0, 3));
  // A prefix that fits both twins is not a guess we make, nor a word much longer or shorter than the name.
  return close.length === 1 && Math.abs(w.length - keys[close[0]].length) <= 2 ? close[0] : null;
}

// ---------- Time ----------

/** "at 14:30" / "во 14:30" / "14:30", "20 min ago" / "пред 20 мин", "1h ago" / "пред 1 ч". Marks the words used. */
function findTime(tokens: Token[], now: Date): Date | null {
  for (let i = 0; i < tokens.length; i++) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(tokens[i].word);
    if (m && num(m[1]) < 24 && num(m[2]) < 60) {
      tokens[i].used = true;
      if (i > 0 && AT.has(tokens[i - 1].word)) tokens[i - 1].used = true;
      const at = new Date(now);
      at.setHours(num(m[1]), num(m[2]), 0, 0);
      // A time later than now means yesterday (logging after midnight).
      if (at.getTime() > now.getTime() + 60_000) at.setDate(at.getDate() - 1);
      return at;
    }
  }
  // "во 14ч", "во 14 часот", "at 2 o'clock", "14 часот": a time of day.
  for (let i = 0; i + 1 < tokens.length; i++) {
    const [n, unit] = [tokens[i], tokens[i + 1]];
    if (n.used || !/^\d{1,2}$/.test(n.word) || num(n.word) > 23) continue;
    const afterAt = i > 0 && AT.has(tokens[i - 1].word);
    if (CLOCK.has(unit.word) || (afterAt && HOUR_UNIT.has(unit.word))) {
      n.used = unit.used = true;
      if (afterAt) tokens[i - 1].used = true;
      const at = new Date(now);
      at.setHours(num(n.word), 0, 0, 0);
      if (at.getTime() > now.getTime() + 60_000) at.setDate(at.getDate() - 1);
      return at;
    }
  }
  const back = (amount: number, unit: string) => {
    const minutes = HOUR_UNIT.has(unit) ? amount * 60 : amount;
    return new Date(now.getTime() - minutes * 60_000);
  };
  for (let i = 0; i + 2 < tokens.length + 1; i++) {
    // "пред 20 мин"
    if (AGO_BEFORE.has(tokens[i].word) && tokens[i + 1] && isNumber(tokens[i + 1].word) && tokens[i + 2]) {
      const unit = tokens[i + 2].word;
      if (MIN_UNIT.has(unit) || HOUR_UNIT.has(unit)) {
        [tokens[i], tokens[i + 1], tokens[i + 2]].forEach((t) => (t.used = true));
        return back(num(tokens[i + 1].word), unit);
      }
    }
    // "20 min ago"
    if (isNumber(tokens[i].word) && tokens[i + 1] && tokens[i + 2] && AGO_AFTER.has(tokens[i + 2].word)) {
      const unit = tokens[i + 1].word;
      if (MIN_UNIT.has(unit) || HOUR_UNIT.has(unit)) {
        [tokens[i], tokens[i + 1], tokens[i + 2]].forEach((t) => (t.used = true));
        return back(num(tokens[i].word), unit);
      }
    }
  }
  return null;
}

// ---------- One twin's part of the phrase ----------

interface Found {
  bottle?: { ml: number | null; milk: Milk | null };
  breast?: { side: 'left' | 'right' | 'both' | null; minutes: number | null };
  diaper?: { wet: boolean; dirty: boolean };
  sleep?: 'start' | 'stop' | 'noDuration' | { minutes: number };
  temp?: number;
  med?: string;
  /** "5 мл" next to a medicine: its dose, never a bottle. */
  medDose?: string;
}

/** Durations in a segment: "15 мин", "2 h", "2ч", "1 час и 30 мин". Marks the words used (`release` gives them back). */
function takeMinutes(tokens: Token[]): { minutes: number | null; release: () => void } {
  let total = 0;
  const taken: Token[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    const [a, b] = [tokens[i], tokens[i + 1]];
    if (a.used || b.used || !isNumber(a.word)) continue;
    if (MIN_UNIT.has(b.word)) total += num(a.word);
    else if (HOUR_UNIT.has(b.word)) total += num(a.word) * 60;
    else continue;
    a.used = b.used = true;
    taken.push(a, b);
  }
  return { minutes: taken.length ? Math.round(total) : null, release: () => taken.forEach((t) => (t.used = false)) };
}

/** A known medicine name inside the segment (longest first, several words allowed). */
function takeMed(tokens: Token[], medNames: readonly string[]): string | null {
  const words = tokens.map((t) => t.word);
  const sorted = [...medNames].filter((n) => n.trim()).sort((a, b) => b.length - a.length);
  // Same letters first ("vitamin d" is Vitamin D), then across scripts ("витамин д" also finds Vitamin D).
  const matchers = [(a: string, b: string) => a === b, (a: string, b: string) => latinize(a) === latinize(b)];
  for (const same of matchers) {
    for (const name of sorted) {
      const parts = name.toLocaleLowerCase().split(/\s+/);
      for (let i = 0; i + parts.length <= words.length; i++) {
        if (tokens.slice(i, i + parts.length).some((t) => t.used)) continue;
        if (words.slice(i, i + parts.length).every((w, j) => same(w, parts[j]))) {
          for (let j = i; j < i + parts.length; j++) tokens[j].used = true;
          return name.trim();
        }
      }
    }
  }
  // "лек Пробиотик", "med Calpol": an unknown name after a medicine word becomes that name.
  const at = tokens.findIndex((t) => !t.used && MED.has(t.word));
  if (at >= 0) {
    // The name is the words after it that are not numbers, units or other known words ("лек Пробиотик 5 мл").
    const rest = tokens.slice(at + 1).filter((t) => !t.used && !isNumber(t.word) && !FILLER.has(t.word) && !KNOWN.has(t.word));
    if (!rest.length) return null;
    tokens[at].used = true;
    rest.forEach((t) => (t.used = true));
    return rest.map((t) => t.raw).join(' ');
  }
  return null;
}

function readSegment(tokens: Token[], medNames: readonly string[]): Found {
  const found: Found = {};
  const has = (set: Set<string>) => tokens.some((t) => !t.used && set.has(t.word));
  const use = (set: Set<string>) => tokens.forEach((t) => !t.used && set.has(t.word) && (t.used = true));

  const med = takeMed(tokens, medNames);
  if (med) {
    found.med = med;
    const doseAt = tokens.findIndex((t, i) => !t.used && isNumber(t.word) && tokens[i + 1] && ML_UNIT.has(tokens[i + 1].word));
    if (doseAt >= 0) {
      found.medDose = `${tokens[doseAt].raw} ${tokens[doseAt + 1].raw}`;
      tokens[doseAt].used = tokens[doseAt + 1].used = true;
    }
  }

  const { minutes, release } = takeMinutes(tokens);

  // Temperature: "37.8", "37,8", "38 °C" (a plausible body temperature, or a number with a temperature word).
  const tempWord = has(TEMP);
  const tempToken = tokens.find(
    (t) => !t.used && isNumber(t.word) && num(t.word) >= 34 && num(t.word) <= 43 && (tempWord || t.word.includes('.')),
  );
  if (tempToken) {
    found.temp = Math.round(num(tempToken.word) * 10) / 10;
    tempToken.used = true;
    use(TEMP);
  }

  if (has(SLEPT)) {
    use(SLEPT);
    found.sleep = minutes ? { minutes } : 'noDuration';
  } else if (has(AWAKE)) {
    use(AWAKE);
    found.sleep = 'stop';
  } else if (has(SLEEP)) {
    use(SLEEP);
    found.sleep = minutes ? { minutes } : 'start';
  }

  // Diapers: "мокра", "полна", "мокра и полна", "пелена двете" (wet and dirty).
  if (has(WET) || has(DIRTY) || has(DIAPER)) {
    const diaperAt = tokens.findIndex((t) => !t.used && DIAPER.has(t.word));
    const both = diaperAt >= 0 && tokens[diaperAt + 1] && BOTH.has(tokens[diaperAt + 1].word);
    const wet = has(WET) || Boolean(both);
    const dirty = has(DIRTY) || Boolean(both);
    if (both) tokens[diaperAt + 1].used = true;
    use(WET);
    use(DIRTY);
    use(DIAPER);
    if (wet || dirty) found.diaper = { wet, dirty };
  }

  // Breastfeeding: "дојка", "лева", "двете страни" (a side alone means the breast), with minutes or as a timer.
  const left = has(LEFT);
  const right = has(RIGHT);
  const bothSides = tokens.some((t, i) => !t.used && BOTH.has(t.word) && tokens[i + 1] && SIDES.has(tokens[i + 1].word));
  const breastMilk = tokens.some((t, i) => !t.used && t.word === 'breast' && tokens[i + 1]?.word === 'milk') || has(BREAST_MILK);
  if (!breastMilk && (has(BREAST) || left || right || bothSides)) {
    use(BREAST);
    use(LEFT);
    use(RIGHT);
    if (bothSides) {
      tokens.forEach((t, i) => {
        if (BOTH.has(t.word) && tokens[i + 1] && SIDES.has(tokens[i + 1].word)) t.used = tokens[i + 1].used = true;
      });
    }
    use(SIDES);
    found.breast = { side: bothSides || (left && right) ? 'both' : left ? 'left' : right ? 'right' : null, minutes };
  }

  // Minutes that neither a sleep nor a breastfeed took are not understood (shown, not dropped).
  if (minutes !== null && !found.breast && !(found.sleep && typeof found.sleep === 'object')) release();

  // A segment with a medicine has no bottle in it ("Ема витамин Д 5 мл").
  if (found.med || has(MED)) return found;

  // Bottles: "90 мл", "80 мајчино", "90 formula", "шише 120".
  let milk: Milk | null = null;
  if (breastMilk) {
    milk = 'breast';
    tokens.forEach((t, i) => {
      if (t.word === 'breast' && tokens[i + 1]?.word === 'milk') t.used = tokens[i + 1].used = true;
    });
    use(BREAST_MILK);
    use(MILK_WORD);
  } else if (has(FORMULA)) {
    milk = 'formula';
    use(FORMULA);
    use(MILK_WORD);
  }
  const mlAt = tokens.findIndex((t, i) => !t.used && isNumber(t.word) && tokens[i + 1] && ML_UNIT.has(tokens[i + 1].word));
  const bottleWord = has(BOTTLE) || has(FEED);
  let ml: number | null = null;
  if (mlAt >= 0) {
    ml = num(tokens[mlAt].word);
    tokens[mlAt].used = tokens[mlAt + 1].used = true;
  } else if (milk || bottleWord) {
    const amount = tokens.find((t) => !t.used && isNumber(t.word) && num(t.word) >= 5 && num(t.word) <= 500);
    if (amount) {
      ml = num(amount.word);
      amount.used = true;
    }
  }
  if (ml !== null || milk || has(BOTTLE)) {
    use(BOTTLE);
    use(FEED);
    found.bottle = { ml, milk };
  } else if (has(FEED) && !found.breast) {
    use(FEED);
    found.bottle = { ml: null, milk: null };
  }

  // A number left alone with only a feed elsewhere in the phrase is filled in later ("A 90 B 70 formula").
  return found;
}

/**
 * Splits a phrase at each twin mentioned. Usually a name starts its part ("A 90 B 70 formula" → [A: 90] [B: 70 formula],
 * and words before the first name are that twin's: "мокра Ана полна"). When the phrase starts with words and ends
 * with a name, each name ends its part instead ("wet Ana dirty Ema" → [Ana: wet] [Ema: dirty]).
 */
function splitByTwin(tokens: Token[], names: QuickContext['names']): { who: Who | null; tokens: Token[] }[] {
  const groups: { who: Who; before: Token[] }[] = [];
  let pending: Token[] = [];
  let first = true;
  const content = (ts: Token[]) => ts.some((x) => !FILLER.has(x.word));
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.used) continue;
    // "двете страни" is a side, and "пелена двете" a wet and dirty diaper; "и двете" is the twins.
    const notTwins = BOTH.has(t.word) && (SIDES.has(tokens[i + 1]?.word ?? '') || DIAPER.has(tokens[i - 1]?.word ?? ''));
    const twin = notTwins ? null : twinOf(t, first, names);
    first = false;
    if (!twin) {
      pending.push(t);
      continue;
    }
    t.used = true;
    const last = groups[groups.length - 1];
    if (last && !content(pending)) {
      // "Ема и Ана мокра", "Ema + Ana": both twins named together.
      if (last.who !== twin) last.who = 'both';
      continue;
    }
    groups.push({ who: twin, before: pending });
    pending = [];
  }
  if (!groups.length) return [{ who: null, tokens: pending }];
  if (groups.length > 1 && content(groups[0].before) && !content(pending)) {
    return groups.map((g) => ({ who: g.who, tokens: g.before }));
  }
  return groups.map((g, i) => ({ who: g.who, tokens: [...(i === 0 ? g.before : []), ...(groups[i + 1]?.before ?? pending)] }));
}

// ---------- The whole phrase ----------

/** Turns a short phrase into entries; anything it cannot read is in `unknown`, and nothing is guessed. */
export function parseQuickLog(text: string, ctx: QuickContext): QuickParse {
  const tokens = tokenize(text);
  const at = findTime(tokens, ctx.now) ?? ctx.now;
  const start = at.toISOString();

  const segments = splitByTwin(tokens, ctx.names);

  const parts = segments.map((s) => ({ who: s.who, found: readSegment(s.tokens, ctx.medNames), tokens: s.tokens }));

  // Phrase-level details shared by all twins: the milk ("A 90 B 70 formula") and a bottle with a bare number.
  const sharedMilk = parts.map((p) => p.found.bottle?.milk).find((m): m is Milk => Boolean(m)) ?? null;
  const anyBottle = parts.some((p) => p.found.bottle);
  for (const p of parts) {
    if (anyBottle && !p.found.bottle && !p.found.med && !p.tokens.some((t) => MED.has(t.word))) {
      const amount = p.tokens.find((t) => !t.used && isNumber(t.word) && num(t.word) >= 5 && num(t.word) <= 500);
      if (amount) {
        amount.used = true;
        p.found.bottle = { ml: num(amount.word), milk: null };
      }
    }
    if (p.found.bottle && !p.found.bottle.milk) p.found.bottle.milk = sharedMilk;
  }

  const items: QuickItem[] = [];
  const hints = new Set<QuickHint>();
  const unknown: string[] = [];
  const named = parts.some((p) => p.who !== null);

  for (const p of parts) {
    const leftovers = p.tokens.filter((t) => !t.used && !FILLER.has(t.word) && !AT.has(t.word));
    const f = p.found;
    const anything = Object.keys(f).length > 0;
    const who: Who | null = p.who ?? (named ? null : ctx.who);
    if (anything && !who) {
      hints.add('who');
      unknown.push(...p.tokens.filter((t) => !FILLER.has(t.word)).map((t) => t.raw));
      continue;
    }
    unknown.push(...leftovers.map((t) => t.raw));
    if (!who) continue;

    if (f.med) items.push({ kind: 'log', who, draft: { type: 'med', data: { name: f.med, dose: f.medDose ?? '' }, start, end: null } });
    if (f.temp !== undefined) items.push({ kind: 'log', who, draft: { type: 'temp', data: { celsius: f.temp }, start, end: null } });
    if (f.diaper) {
      const kind = f.diaper.wet && f.diaper.dirty ? 'both' : f.diaper.dirty ? 'dirty' : 'wet';
      items.push({ kind: 'log', who, draft: { type: 'diaper', data: { kind }, start, end: null } });
    }
    if (f.sleep === 'noDuration') hints.add('duration');
    else if (f.sleep === 'start' || f.sleep === 'stop') {
      // Only twins who are awake can fall asleep, and only sleeping ones wake (as the sleep button does).
      const slots: TwinSlot[] = who === 'both' ? ['A', 'B'] : [who];
      const asleep = new Set(ctx.asleep ?? []);
      const fits = slots.filter((s) => (f.sleep === 'start' ? !asleep.has(s) : ctx.asleep === undefined || asleep.has(s)));
      if (!fits.length) hints.add(f.sleep === 'start' ? 'alreadyAsleep' : 'notAsleep');
      else {
        const target: Who = fits.length === 2 ? 'both' : fits[0];
        if (f.sleep === 'start') items.push({ kind: 'log', who: target, draft: { type: 'sleep', data: {}, start, end: null } });
        else items.push({ kind: 'wake', who: target, at: start });
      }
    } else if (f.sleep) {
      const end = at.getTime();
      items.push({
        kind: 'log',
        who,
        draft: { type: 'sleep', data: {}, start: new Date(end - f.sleep.minutes * 60_000).toISOString(), end: new Date(end).toISOString() },
      });
    }
    // The side is never guessed: without one, it is asked for.
    if (f.breast && !f.breast.side) hints.add('side');
    else if (f.breast?.side) {
      const side = f.breast.side;
      const data = { method: 'breast' as const, side };
      if (f.breast.minutes) {
        const end = at.getTime();
        items.push({
          kind: 'log',
          who,
          draft: { type: 'feed', data, start: new Date(end - f.breast.minutes * 60_000).toISOString(), end: new Date(end).toISOString() },
        });
      } else items.push({ kind: 'log', who, draft: { type: 'feed', data, start, end: null } });
    }
    if (f.bottle) {
      const slots: TwinSlot[] = who === 'both' ? ['A', 'B'] : [who];
      const remembered = slots.map((s) => ctx.lastMilk?.[s]);
      const milk = f.bottle.milk ?? (remembered.every((m) => m && m === remembered[0]) ? remembered[0]! : null);
      if (f.bottle.ml === null || !milk) {
        if (!milk) hints.add('milk');
        if (f.bottle.ml === null) unknown.push(...p.tokens.filter((t) => BOTTLE.has(t.word) || FEED.has(t.word)).map((t) => t.raw));
        continue;
      }
      items.push({ kind: 'log', who, draft: { type: 'feed', data: { method: 'bottle', ml: f.bottle.ml, milk }, start, end: null } });
    }
  }
  return { items, unknown: [...new Set(unknown)], hints: [...hints] };
}
