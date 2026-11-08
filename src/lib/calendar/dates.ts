/**
 * Motor de datas do Calendário de Mesa Tenda (Task 28).
 *
 * Tudo aqui é puro (sem DOM) para poder ser verificado por script Node.
 * Semana começa no DOMINGO (padrão BR) e feriados são os nacionais + datas
 * móveis universalmente observadas (Carnaval, Sexta-feira Santa, Corpus Christi).
 *
 * Fonte de conferência das datas móveis 2027: ANBIMA (fer_nacionais/2027) —
 * Paixão de Cristo 26/03 (sexta) e Corpus Christi 27/05 (quinta) batem com o
 * algoritmo da Páscoa implementado abaixo (Páscoa 28/03/2027).
 */

export const CALENDAR_YEAR = 2027;

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

/** Rótulos curtos das colunas da grade, domingo → sábado. */
export const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export interface Holiday {
  /** 1–31 */
  day: number;
  /** 1–12 */
  month: number;
  name: string;
}

/**
 * Domingo de Páscoa (algoritmo anônimo gregoriano / Meeus–Jones–Butcher).
 * Retorna mês (1–12) e dia.
 */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Desloca uma data UTC em N dias. */
function shiftUTC(year: number, month: number, day: number, deltaDays: number): { month: number; day: number } {
  const dt = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return { month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

/**
 * Feriados impressos no calendário: os nacionais fixos (incluindo o Dia Nacional
 * de Zumbi e da Consciência Negra, nacional desde a Lei 14.759/2023) + Carnaval,
 * Sexta-feira Santa e Corpus Christi derivados da Páscoa.
 */
export function holidaysBR(year: number): Holiday[] {
  const easter = easterSunday(year);
  const carnaval = shiftUTC(year, easter.month, easter.day, -47);
  const sextaSanta = shiftUTC(year, easter.month, easter.day, -2);
  const corpus = shiftUTC(year, easter.month, easter.day, 60);
  const fixed: Holiday[] = [
    { day: 1, month: 1, name: "Confraternização Universal" },
    { day: 21, month: 4, name: "Tiradentes" },
    { day: 1, month: 5, name: "Dia do Trabalho" },
    { day: 7, month: 9, name: "Independência" },
    { day: 12, month: 10, name: "N. Sra. Aparecida" },
    { day: 2, month: 11, name: "Finados" },
    { day: 15, month: 11, name: "Proclamação da República" },
    { day: 20, month: 11, name: "Consciência Negra" },
    { day: 25, month: 12, name: "Natal" },
  ];
  const moveis: Holiday[] = [
    { day: carnaval.day, month: carnaval.month, name: "Carnaval" },
    { day: sextaSanta.day, month: sextaSanta.month, name: "Sexta-feira Santa" },
    { day: corpus.day, month: corpus.month, name: "Corpus Christi" },
  ];
  return [...fixed, ...moveis].sort((x, y) => x.month - y.month || x.day - y.day);
}

/** Feriados do ano do calendário, pré-calculados. */
export const HOLIDAYS: Holiday[] = holidaysBR(CALENDAR_YEAR);

const holidayCache = new Map<number, Holiday[]>();

/** Feriados de um ano qualquer (com cache) — o seletor de ano usa isto. */
export function holidaysForYear(year: number): Holiday[] {
  let list = holidayCache.get(year);
  if (!list) {
    list = holidaysBR(year);
    holidayCache.set(year, list);
  }
  return list;
}

/** Dia da semana (0 = domingo … 6 = sábado) — UTC para não sofrer fuso. */
export function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isSunday(year: number, month: number, day: number): boolean {
  return weekdayOf(year, month, day) === 0;
}

export function holidayOf(year: number, month: number, day: number): Holiday | null {
  return holidaysForYear(year).find((h) => h.month === month && h.day === day) ?? null;
}

export interface CalendarCell {
  day: number;
  /** 0 = domingo … 6 = sábado */
  weekday: number;
  sunday: boolean;
  holiday: Holiday | null;
}

/**
 * Grade do mês em semanas (7 colunas, domingo primeiro). Células vazias (antes do
 * dia 1 e depois do último dia) vêm como null para o compositor pular.
 */
export function buildMonthGrid(year: number, month: number): (CalendarCell | null)[][] {
  const total = daysInMonth(year, month);
  const first = weekdayOf(year, month, 1);
  const weeks: (CalendarCell | null)[][] = [];
  let week: (CalendarCell | null)[] = new Array(first).fill(null);
  for (let day = 1; day <= total; day++) {
    week.push({
      day,
      weekday: (first + day - 1) % 7,
      sunday: (first + day - 1) % 7 === 0,
      holiday: holidayOf(year, month, day),
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

/** Lista de feriados de um mês, "dd/mm nome", para a legenda sob a grade. */
export function holidayLegend(year: number, month: number): string[] {
  return holidaysForYear(year).filter((h) => h.month === month).map(
    (h) => `${String(h.day).padStart(2, "0")}/${String(h.month).padStart(2, "0")} ${h.name}`,
  );
}
