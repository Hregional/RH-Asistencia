const express = require('express');
const router = express.Router();
const db = require('../db.js');
const { requireAuth, requireRRHHorJefe } = require('../middlewares/auth.js');

// Helper: genera ultimos 7 días 
function last7Days() {
  const days = [];
  // Usar hora de Guatemala (UTC-6)
  const now = new Date();
  const gt = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(gt);
    d.setUTCDate(gt.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// Ruta completa de resumen 
router.get('/summary', requireAuth, requireRRHHorJefe, async (_req, res) => {
  try {
    // 1) Personal activo 
    const [[{ c: personalActivo }]] = await db.query(
      'SELECT COUNT(*) AS c FROM empleados WHERE activo = 1 AND eliminado_en IS NULL'
    );

    // 2) Personal inactivo 
    const [[{ c: personalInactivo }]] = await db.query(
      'SELECT COUNT(*) AS c FROM empleados WHERE activo = 0 AND eliminado_en IS NULL'
    );

    // 3) Personal total
    const [[{ c: personalTotal }]] = await db.query(
      'SELECT COUNT(*) AS c FROM empleados WHERE eliminado_en IS NULL'
    );

    // 4) Turnos Hoy - CORREGIDO: Contar asignaciones activas HOY
    const [[{ c: turnosHoy }]] = await db.query(`
      SELECT COUNT(*) AS c 
      FROM asignacion_turnos at 
      WHERE CURDATE() BETWEEN at.fecha_inicio AND IFNULL(at.fecha_fin, CURDATE())
        AND at.eliminado_en IS NULL
        AND EXISTS (
          SELECT 1 FROM empleados e 
          WHERE e.id = at.empleado_id 
          AND e.activo = 1 
          AND e.eliminado_en IS NULL
        )
    `);

    // 5) Turnos Fijos - CORREGIDO: Contar configuraciones activas de tipo FIJO
    const [[{ c: turnosFijos }]] = await db.query(`
      SELECT COUNT(*) AS c 
      FROM configuraciones_turnos ct
      WHERE ct.tipo = 'FIJO'
        AND ct.activo = 1
        AND ct.eliminado_en IS NULL
        AND (ct.fecha_fin IS NULL OR ct.fecha_fin >= CURDATE())
    `);

    // 6) Turnos Rotativos - CORREGIDO: Contar configuraciones activas de tipo ROTATIVO
    const [[{ c: turnosRotativos }]] = await db.query(`
      SELECT COUNT(*) AS c 
      FROM configuraciones_turnos ct
      WHERE ct.tipo = 'ROTATIVO'
        AND ct.activo = 1
        AND ct.eliminado_en IS NULL
        AND (ct.fecha_fin IS NULL OR ct.fecha_fin >= CURDATE())
    `);

    // 7) Personal sin turno (SIN ÁREA ASIGNADA) - CORREGIDO
    const [[{ c: personalSinTurno }]] = await db.query(`
      SELECT COUNT(*) AS c 
      FROM empleados e
      WHERE e.activo = 1 
        AND e.eliminado_en IS NULL
        AND e.area_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM asignacion_turnos at 
          WHERE at.empleado_id = e.id 
          AND at.eliminado_en IS NULL
          AND CURDATE() BETWEEN at.fecha_inicio AND IFNULL(at.fecha_fin, CURDATE())
        )
    `);

    // 8) Próximos turnos
    const [prox] = await db.query(`
      SELECT
        t.nombre_turno AS turno,
        LOWER(IFNULL(re.nombre_rol, '')) AS nombre_rol
      FROM asignacion_turnos at
      JOIN turnos t ON t.id = at.turno_id
      JOIN empleados e ON e.id = at.empleado_id
      LEFT JOIN roles_empleado re ON re.id = e.rol_id
      WHERE DATE_ADD(CURDATE(), INTERVAL 1 DAY) BETWEEN at.fecha_inicio AND at.fecha_fin
        AND at.eliminado_en IS NULL
        AND e.eliminado_en IS NULL
    `);

    const bucket = {
      manana: { enfermeros: 0, medicos: 0 },
      tarde:  { enfermeros: 0, medicos: 0 },
      noche:  { enfermeros: 0, medicos: 0 },
    };

    for (const r of prox) {
      const name = (r.turno || '').toLowerCase();
      const role = r.nombre_rol;
      let slot = null;
      
      if (name.includes('mañana') || name.includes('manana')) slot = 'manana';
      else if (name.includes('tarde')) slot = 'tarde';
      else if (name.includes('noche')) slot = 'noche';
      if (!slot) continue;

      if (role.includes('enfermer')) bucket[slot].enfermeros += 1;
      else if (role.includes('medic')) bucket[slot].medicos += 1;
    }

    // 9) Asistencia semanal
    const days = last7Days();
    const [asistRaw] = await db.query(`
      SELECT DATE(fecha_hora) AS dia, COUNT(*) AS entradas
      FROM registros_asistencia
      WHERE fecha_hora >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND tipo_evento = 'ENTRADA'
      GROUP BY DATE(fecha_hora)
    `);

    // 10) Distribución de personal por área
    const [distribucionArea] = await db.query(`
      SELECT 
        IFNULL(a.nombre_area, 'Sin área') AS area,
        COUNT(e.id) AS cantidad
      FROM empleados e
      LEFT JOIN areas a ON a.id = e.area_id
      WHERE e.eliminado_en IS NULL
      GROUP BY a.nombre_area
      ORDER BY cantidad DESC
    `);

    const map = new Map(asistRaw.map(r => [r.dia.toISOString?.() ? r.dia.toISOString().slice(0,10) : String(r.dia), r.entradas]));
    const asistenciaSemanal = days.map(d => ({ fecha: d, entradas: map.get(d) || 0 }));

    // 11) MODA de hora de entrada por día (últimos 7 días)
    // Cálculo: agrupamos entradas en bloques de 30 minutos (1800 seg * 1800 seg),
    // contamos cuántas entradas hay por día,
    // y se toma el bloque con mayor frecuencia (ROW_NUMBER ORDER BY COUNT DESC).
    // Resultado: la franja horaria donde más empleados registraron entrada ese día.
    const [modaRaw] = await db.query(`
      SELECT 
        dia,
        hora_bloque AS moda_segundos
      FROM (
        SELECT 
          DATE(fecha_hora) AS dia,
          TIME_TO_SEC(TIME(fecha_hora)) DIV 1800 * 1800 AS hora_bloque,
          COUNT(*) AS frecuencia,
          ROW_NUMBER() OVER (PARTITION BY DATE(fecha_hora) ORDER BY COUNT(*) DESC) AS rn
        FROM registros_asistencia
        WHERE fecha_hora >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
          AND tipo_evento = 'ENTRADA'
        GROUP BY DATE(fecha_hora), hora_bloque
      ) ranked
      WHERE rn = 1
      ORDER BY dia ASC
    `);

    // Convertir segundos a decimal (ej: 27000 seg → 7.5 → 7:30 AM)
    const modaMap = new Map(modaRaw.map((r) => {
      const dia = r.dia.toISOString?.() ? r.dia.toISOString().slice(0,10) : String(r.dia);
      const horaDecimal = Math.round((Number(r.moda_segundos) / 3600) * 100) / 100;
      return [dia, horaDecimal];
    }));

    // Alinear con los 7 días del dashboard (null si no hay datos ese día)
    const modaEntrada = days.map(d => ({ fecha: d, hora: modaMap.get(d) ?? null }));

    res.json({
      success: true,
      data: {
        personalActivo,
        personalInactivo,
        personalTotal,
        turnosHoy,
        turnosFijos,
        turnosRotativos,
        personalSinTurno,
        proximosTurnos: bucket,
        asistenciaSemanal,
        distribucionArea,
        modaEntrada
      }
    });

  } catch (e) {
    console.error('Dashboard summary error:', e);
    res.status(500).json({ success: false, error: 'Error generando resumen' });
  }
});

module.exports = router;