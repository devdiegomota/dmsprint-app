/**
 * Verificação do motor de datas 2027 — roda em Node puro (sem DOM).
 * Conferência humana cruzada: ANBIMA 2027 (26/03 sexta, 21/04 quarta,
 * 01/05 sábado, 27/05 quinta) + Carnaval 09/02 (terça) e Páscoa 28/03.
 */
import {
  CALENDAR_YEAR,
  MONTH_NAMES,
  HOLIDAYS,
  easterSunday,
  buildMonthGrid,
  holidayLegend,
  weekdayOf,
} from "../src/lib/calendar/dates.ts";

const WD = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
let ok = true;

const expect = (cond: boolean, msg: string) => {
  console.log(`${cond ? "OK " : "FALHOU"} — ${msg}`);
  if (!cond) ok = false;
};

console.log(`=== Calendário ${CALENDAR_YEAR} ===`);
const easter = easterSunday(CALENDAR_YEAR);
console.log(`Páscoa: ${String(easter.day).padStart(2, "0")}/${String(easter.month).padStart(2, "0")}`);

expect(easter.month === 3 && easter.day === 28, "Páscoa 28/03/2027 (algoritmo Meeus)");
expect(weekdayOf(2027, 3, 26) === 5, "Paixão de Cristo 26/03 = sexta (ANBIMA)");
expect(weekdayOf(2027, 5, 27) === 4, "Corpus Christi 27/05 = quinta (ANBIMA)");
expect(weekdayOf(2027, 2, 9) === 2, "Carnaval 09/02 = terça");
expect(weekdayOf(2027, 1, 1) === 5, "01/01/2027 = sexta");

console.log("\n--- Feriados impressos ---");
for (const h of HOLIDAYS) {
  const wd = WD[weekdayOf(CALENDAR_YEAR, h.month, h.day)];
  console.log(
    `${String(h.day).padStart(2, "0")}/${String(h.month).padStart(2, "0")} (${wd}) — ${h.name}`,
  );
}

console.log("\n--- Grade por mês ---");
for (let m = 1; m <= 12; m++) {
  const weeks = buildMonthGrid(CALENDAR_YEAR, m);
  const dias = weeks.flat().filter(Boolean).length;
  const first = weeks[0].findIndex((c) => c !== null);
  console.log(
    `${MONTH_NAMES[m - 1]}: ${dias} dias, ${weeks.length} semanas, dia 1 na coluna ${first} (${WD[first]})`,
  );
  if (m === 11) {
    const legend = holidayLegend(CALENDAR_YEAR, m);
    expect(
      legend.length === 3 &&
        legend[0].includes("Finados") &&
        legend[1].includes("República") &&
        legend[2].includes("Consciência Negra"),
      "legenda de novembro: Finados + República + Consciência Negra (3 feriados)",
    );
    expect(weeks.flat().some((c) => c?.holiday?.name === "Consciência Negra"), "20/11 Consciência Negra presente na grade");
  }
  if (m === 12) expect(weeks.flat().some((c) => c?.day === 25 && c.holiday?.name === "Natal"), "25/12 Natal na grade de dezembro");
}

console.log(ok ? "\nTODAS AS VERIFICAÇÕES PASSARAM ✅" : "\nHÁ FALHAS ❌");
if (!ok) process.exit(1);
