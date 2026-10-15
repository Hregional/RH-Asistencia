import { calcularDiasPermiso, calcularFechaExtendida, parseFechaLocal } from './feriados';

describe('feriados utils — conteo de días de permisos', () => {
    it('cuenta los feriados como días normales (20 de octubre)', () => {
        // Lunes 19 a viernes 30 de octubre de 2026: 10 días de lunes a viernes, incluye el feriado del 20
        expect(calcularDiasPermiso(parseFechaLocal('2026-10-19'), parseFechaLocal('2026-10-30'), false)).toBe(10);
    });

    it('omite fines de semana solo cuando el toggle FDS está desactivado', () => {
        const inicio = parseFechaLocal('2026-10-16'); // viernes
        const fin = parseFechaLocal('2026-10-19');    // lunes
        expect(calcularDiasPermiso(inicio, fin, false)).toBe(2);
        expect(calcularDiasPermiso(inicio, fin, true)).toBe(4);
    });

    it('la fecha extendida no salta feriados', () => {
        // Viernes 16 + 2 días hábiles = lunes 19 y martes 20 (feriado incluido)
        expect(calcularFechaExtendida('2026-10-16', 2, false)).toBe('2026-10-20');
        // Con FDS hábiles: sábado 17 y domingo 18
        expect(calcularFechaExtendida('2026-10-16', 2, true)).toBe('2026-10-18');
    });

    it('la fecha extendida es nula con valores inválidos', () => {
        expect(calcularFechaExtendida('', 2, false)).toBeNull();
        expect(calcularFechaExtendida('2026-10-16', 0, false)).toBeNull();
        expect(calcularFechaExtendida('2026-10-16', 31, false)).toBeNull();
    });
});
