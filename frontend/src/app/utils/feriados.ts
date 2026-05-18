/**
 * feriados.ts — Feriados oficiales de Guatemala
 *
 * ─── PARA AGREGAR O QUITAR FERIADOS ───────────────────────────────────────
 * Feriados fijos: editar el objeto FERIADOS_FIJOS con formato 'MM-DD'
 * Feriados variables por año: editar FERIADOS_VARIABLES con formato 'YYYY-MM-DD'
 * Semana Santa: se calcula automáticamente (Jueves, Viernes y Sábado Santo)
 * ──────────────────────────────────────────────────────────────────────────
 */

// Feriados que caen siempre en la misma fecha cada año
const FERIADOS_FIJOS: Record<string, string> = {
  '01-01': 'Año Nuevo',
  '05-01': 'Día del Trabajo',
  '06-30': 'Día del Ejército',
  '09-15': 'Independencia de Guatemala',
  '10-20': 'Revolución de Octubre',
  '11-01': 'Día de Todos los Santos',
  '12-24': 'Nochebuena',
  '12-25': 'Navidad',
  '12-31': 'Fin de Año',
};

// Feriados que varían por año (agregar según sea necesario)
// Formato: 'YYYY-MM-DD': 'Nombre'
const FERIADOS_VARIABLES: Record<string, string> = {
  // Ejemplo: '2025-10-20': 'Feriado especial'
};

/**
 * Calcula la fecha de Pascua para un año dado (algoritmo de Butcher)
 */
export function getPascua(year: number): Date {
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
  return new Date(year, month - 1, day);
}

/**
 * Devuelve los días de Semana Santa para un año (Jueves, Viernes y Sábado Santo)
 */
export function getSemSanta(year: number): Record<string, string> {
  const pascua = getPascua(year);
  const dias: Record<string, string> = {};
  const nombres: Record<number, string> = { [-3]: 'Jueves Santo', [-2]: 'Viernes Santo', [-1]: 'Sábado Santo' };

  for (const offset of [-3, -2, -1]) {
    const d = new Date(pascua);
    d.setDate(d.getDate() + offset);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dias[`${mm}-${dd}`] = nombres[offset];
  }
  return dias;
}

/**
 * Verifica si una fecha es feriado en Guatemala
 */
export function esFeriado(fecha: Date): boolean {
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;
  const isoKey = `${fecha.getFullYear()}-${mm}-${dd}`;

  if (FERIADOS_FIJOS[key]) return true;
  if (FERIADOS_VARIABLES[isoKey]) return true;

  const semSanta = getSemSanta(fecha.getFullYear());
  return !!semSanta[key];
}

/**
 * Devuelve el nombre del feriado o null si no es feriado
 */
export function getNombreFeriado(fecha: Date): string | null {
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;
  const isoKey = `${fecha.getFullYear()}-${mm}-${dd}`;

  if (FERIADOS_FIJOS[key]) return FERIADOS_FIJOS[key];
  if (FERIADOS_VARIABLES[isoKey]) return FERIADOS_VARIABLES[isoKey];

  const semSanta = getSemSanta(fecha.getFullYear());
  return semSanta[key] || null;
}

/**
 * Verifica si una fecha es día hábil (lunes-viernes y no feriado)
 */
export function esDiaHabil(fecha: Date): boolean {
  const diaSemana = fecha.getDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  return !esFeriado(fecha);
}

/** Parsea 'YYYY-MM-DD' sin conversión de zona horaria */
export function parseFechaLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Calcula días hábiles GT entre dos fechas (inclusive) */
export function calcularDiasHabilesGT(inicio: Date, fin: Date): number {
  let dias = 0;
  const cur = new Date(inicio);
  while (cur <= fin) {
    if (esDiaHabil(cur)) dias++;
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

/** Devuelve lista de feriados hábiles que caen en el rango */
export function feriadosEnRango(inicio: Date, fin: Date): string[] {
  const lista: string[] = [];
  const cur = new Date(inicio);
  while (cur <= fin) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6 && esFeriado(cur)) {
      const dd = String(cur.getDate()).padStart(2, '0');
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      lista.push(`${dd}/${mm} ${getNombreFeriado(cur)}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return lista;
}

/** Cuenta fines de semana en el rango */
export function finesDeSemanaEnRango(inicio: Date, fin: Date): number {
  let count = 0;
  const cur = new Date(inicio);
  while (cur <= fin) {
    const d = cur.getDay();
    if (d === 0 || d === 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
