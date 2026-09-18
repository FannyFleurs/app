// Helpers purs des objectifs de CA (utilisables client + serveur + tests).

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** Bornes ISO (aaaa-mm-jj) d'un mois donné (année, mois 1-12) + nb de jours. */
export function monthBounds(year: number, month: number): { start: string; end: string; daysInMonth: number } {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(daysInMonth)}`,
    daysInMonth,
  };
}
