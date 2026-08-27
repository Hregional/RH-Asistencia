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
  '10-07': 'Fiesta Patronal Virgen del Rosario',
  '10-20': 'Revolución de Octubre',
  '11-01': 'Día de Todos los Santos',
  '12-25': 'Navidad',
  '12-31': 'Fin de Año',
};

// Feriados que varían por año (agregar según sea necesario)
// Formato: 'YYYY-MM-DD': 'Nombre'
// Día de la Madre (10 mayo) y Día del Padre (17 junio): se agregan
// aquí cada año según autorización del hospital.
// Primer viernes de septiembre (Día del Salubrista): se calcula en
// getSalubrista() y se agrega automáticamente.
const FERIADOS_VARIABLES: Record<string, string> = {
  '2026-05-10': 'Día de la Madre',
  '2026-06-17': 'Día del Padre',
};

/**
 * Opciones para cálculo de feriados condicionales
 */
export interface OpcionesFeriados {
  aplicaMadre?: boolean; // Default true if not specified
  aplicaPadre?: boolean; // Default true if not specified
}

/**
 * Devuelve el primer viernes de septiembre de un año (Día del Salubrista)
 */
function getPrimerViernesSeptiembre(year: number): string {
  const d = new Date(year, 8, 1); // 1 de septiembre
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

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
 * Detecta si una fecha dada corresponde a Día de la Madre (10 de mayo) o Día del Padre (17 de junio)
 */
export function esFeriadoMadreOPadre(fecha: Date): 'MADRE' | 'PADRE' | null {
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  if (mm === '05' && dd === '10') return 'MADRE';
  if (mm === '06' && dd === '17') return 'PADRE';
  return null;
}

/**
 * Verifica si un rango de fechas incluye 10 de Mayo o 17 de Junio
 */
export function rangoIncluyeMadreOPadre(inicio: Date, fin: Date): { incluyeMadre: boolean; incluyePadre: boolean } {
  let incluyeMadre = false;
  let incluyePadre = false;
  const cur = new Date(inicio);
  while (cur <= fin) {
    const tipo = esFeriadoMadreOPadre(cur);
    if (tipo === 'MADRE') incluyeMadre = true;
    if (tipo === 'PADRE') incluyePadre = true;
    cur.setDate(cur.getDate() + 1);
  }
  return { incluyeMadre, incluyePadre };
}

/**
 * Verifica si una fecha es feriado en Guatemala
 */
export function esFeriado(fecha: Date, opciones?: OpcionesFeriados): boolean {
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;
  const isoKey = `${fecha.getFullYear()}-${mm}-${dd}`;

  const tipoCondicional = esFeriadoMadreOPadre(fecha);
  if (tipoCondicional === 'MADRE') {
    return opciones?.aplicaMadre !== false;
  }
  if (tipoCondicional === 'PADRE') {
    return opciones?.aplicaPadre !== false;
  }

  if (FERIADOS_FIJOS[key]) return true;
  if (FERIADOS_VARIABLES[isoKey]) return true;
  if (isoKey === getPrimerViernesSeptiembre(fecha.getFullYear())) return true;

  const semSanta = getSemSanta(fecha.getFullYear());
  return !!semSanta[key];
}

/**
 * Devuelve el nombre del feriado o null si no es feriado
 */
export function getNombreFeriado(fecha: Date, opciones?: OpcionesFeriados): string | null {
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;
  const isoKey = `${fecha.getFullYear()}-${mm}-${dd}`;

  const tipoCondicional = esFeriadoMadreOPadre(fecha);
  if (tipoCondicional === 'MADRE') {
    return opciones?.aplicaMadre !== false ? 'Día de la Madre' : null;
  }
  if (tipoCondicional === 'PADRE') {
    return opciones?.aplicaPadre !== false ? 'Día del Padre' : null;
  }

  if (FERIADOS_FIJOS[key]) return FERIADOS_FIJOS[key];
  if (FERIADOS_VARIABLES[isoKey]) return FERIADOS_VARIABLES[isoKey];
  if (isoKey === getPrimerViernesSeptiembre(fecha.getFullYear())) return 'Día del Salubrista';

  const semSanta = getSemSanta(fecha.getFullYear());
  return semSanta[key] || null;
}

/**
 * Devuelve todos los feriados de un mes/año para marcar puntos de color en el calendario
 */
export function getFeriadosDelMes(year: number, month: number, opciones?: OpcionesFeriados): Record<number, { nombre: string; esCondicional?: boolean }> {
  const result: Record<number, { nombre: string; esCondicional?: boolean }> = {};
  const diasEnMes = new Date(year, month + 1, 0).getDate();

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fecha = new Date(year, month, dia);
    const cond = esFeriadoMadreOPadre(fecha);
    const nombre = getNombreFeriado(fecha, opciones);
    if (nombre) {
      result[dia] = {
        nombre,
        esCondicional: !!cond
      };
    }
  }
  return result;
}

/**
 * Verifica si una fecha es día hábil (lunes-viernes y no feriado)
 */
export function esDiaHabil(fecha: Date, opciones?: OpcionesFeriados): boolean {
  const diaSemana = fecha.getDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  return !esFeriado(fecha, opciones);
}

/** Parsea 'YYYY-MM-DD' sin conversión de zona horaria */
export function parseFechaLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Calcula días hábiles GT entre dos fechas (inclusive) */
export function calcularDiasHabilesGT(inicio: Date, fin: Date, opciones?: OpcionesFeriados): number {
  let dias = 0;
  const cur = new Date(inicio);
  while (cur <= fin) {
    if (esDiaHabil(cur, opciones)) dias++;
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

/** Devuelve lista de feriados que caen en el rango (incluye FDS si incluyeFDS=true) */
export function feriadosEnRango(inicio: Date, fin: Date, opciones?: OpcionesFeriados & { incluyeFDS?: boolean }): string[] {
  const lista: string[] = [];
  const cur = new Date(inicio);
  while (cur <= fin) {
    const d = cur.getDay();
    const esFinSemana = d === 0 || d === 6;
    if ((!esFinSemana || opciones?.incluyeFDS) && esFeriado(cur, opciones)) {
      const dd = String(cur.getDate()).padStart(2, '0');
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      lista.push(`${dd}/${mm} ${getNombreFeriado(cur, opciones)}`);
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

/** Calcula días considerando fines de semana como hábiles (solo omite feriados GT) */
export function calcularDiasConFDS(inicio: Date, fin: Date, opciones?: OpcionesFeriados): number {
  let dias = 0;
  const cur = new Date(inicio);
  while (cur <= fin) {
    if (!esFeriado(cur, opciones)) dias++;
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

/**
 * Suma N días desde fecha_base omitiendo solo feriados GT.
 */
export function calcularFechaExtendida(
  fechaBase: string,
  dias: number,
  incluyeFDS: boolean,
  opciones?: OpcionesFeriados
): string | null {
  if (!fechaBase || !dias || dias <= 0 || dias > 30) return null;

  let fecha = parseFechaLocal(fechaBase);
  let contados = 0;
  let iteraciones = 0;
  const MAX_ITER = 500;

  while (contados < dias && iteraciones < MAX_ITER) {
    iteraciones++;
    fecha = new Date(fecha.getTime() + 24 * 60 * 60 * 1000);
    const dia = fecha.getDay();
    if (!incluyeFDS && (dia === 0 || dia === 6)) continue;
    if (esFeriado(fecha, opciones)) continue;
    contados++;
  }

  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
