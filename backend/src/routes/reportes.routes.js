const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { exec } = require('child_process');
const path = require('path');
const { esFeriado, getNombreFeriado } = require('../utils/feriados');


// Listar todas las áreas
router.get('/areas', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
        SELECT id, nombre_area FROM areas WHERE eliminado_en IS NULL ORDER BY nombre_area
      `);
    res.json({ success: true, areas: rows });
  } catch (err) {
    console.error('Error obteniendo áreas:', err);
    res.status(500).json({ success: false, message: 'Error al obtener áreas' });
  }
});

// GENERAR REPORTE POR ÁREA Y RANGO DE FECHAS
router.get('/asistencia', requireAuth, async (req, res) => {
  try {
    const { area_id, desde, hasta, tipo_reporte = 'semana' } = req.query;

    if (!area_id || !desde || !hasta) {
      return res.status(400).json({ success: false, message: 'Faltan parámetros: área, desde y hasta son obligatorios.' });
    }

    console.log(`[DEBUG] Generando reporte asistencia. Area: ${area_id}, Desde: ${desde}, Hasta: ${hasta}`);

    // ==================== CONSULTA BASE (ROTATIVOS) - VERSIÓN COMPLETA ====================
    const [rotativos] = await db.query(`
        SELECT 
          ar.nombre_area AS area,
          jefe.nombre_completo AS jefe_area,
          e.nombre_completo AS empleado,
          e.renglon,
          re.nombre_rol AS cargo,
          at.fecha_inicio AS fecha,
          t.nombre_turno AS turno_asignado,
          t.tipo_turno,
          DATE_FORMAT(t.hora_inicio, '%H:%i') AS hora_entrada_programada,
          DATE_FORMAT(t.hora_fin, '%H:%i') AS hora_salida_programada,
          a.entrada_real,
          a.salida_real,
          a.estado,
          CASE 
            WHEN e.renglon IN ('182', '189', '186', '183') THEN 'No aplica marcaje'
            WHEN EXISTS (
              SELECT 1 FROM permisos p 
              WHERE p.empleado_id = e.id AND p.estado = 'AUTORIZADO'
                AND at.fecha_inicio BETWEEN p.fecha_inicio AND p.fecha_fin
            ) THEN 'Con Permiso'
            WHEN a.estado = 'COMPLETO' THEN 'Cumple horario'
            WHEN a.estado = 'TARDE' THEN 'Retraso'
            WHEN a.estado = 'FALTA' OR a.id IS NULL THEN 'Ausente'
            ELSE 'Ausente'
          END AS cumplimiento,
          CASE 
            WHEN e.renglon IN ('182', '189', '186', '183') THEN 'Presente (No obligatorio)'
            WHEN EXISTS (
              SELECT 1 FROM permisos p 
              WHERE p.empleado_id = e.id AND p.estado = 'AUTORIZADO'
                AND at.fecha_inicio BETWEEN p.fecha_inicio AND p.fecha_fin
            ) THEN 'Con Permiso'
            WHEN a.estado IN ('COMPLETO','TARDE') THEN 'Presente'
            WHEN a.estado = 'FALTA' OR a.id IS NULL THEN 'Ausente'
            ELSE 'Ausente'
          END AS estado_dia
        FROM empleados e
        INNER JOIN areas ar ON ar.id = e.area_id
        INNER JOIN roles_empleado re ON re.id = e.rol_id
        LEFT JOIN area_supervisores sup ON sup.area_id = ar.id AND sup.es_titular = 1
        LEFT JOIN empleados jefe ON jefe.id = sup.empleado_id
        LEFT JOIN asignacion_turnos at ON at.empleado_id = e.id AND at.eliminado_en IS NULL
        LEFT JOIN turnos t ON t.id = at.turno_id
        LEFT JOIN asistencias a ON a.empleado_id = e.id AND a.fecha = at.fecha_inicio
        WHERE e.eliminado_en IS NULL
          AND e.activo = 1
          AND ar.id = ?
          AND at.fecha_inicio BETWEEN ? AND ?
        ORDER BY e.nombre_completo, at.fecha_inicio;
      `, [area_id, desde, hasta]);

    // console.log(`[DEBUG] Rotativos encontrados: ${rotativos.length}`);
    let registros = [...rotativos].map(r => {
      const fecha = r.fecha instanceof Date ? r.fecha : new Date(r.fecha + 'T00:00:00');
      if (esFeriado(fecha) && r.estado_dia === 'Ausente') {
        return {
          ...r,
          cumplimiento: `Feriado (${getNombreFeriado(fecha)})`,
          estado_dia: 'Feriado'
        };
      }
      return r;
    });

    // ==================== CONSULTA TURNOS FIJOS ====================
    const [fijos] = await db.query(`
        SELECT 
          ar.nombre_area AS area,
          jefe.nombre_completo AS jefe_area,
          e.id AS empleado_id,
          e.nombre_completo AS empleado,
          re.nombre_rol AS cargo,
          t.nombre_turno AS turno_asignado,
          t.tipo_turno,
          DATE_FORMAT(t.hora_inicio, '%H:%i') AS hora_entrada_programada,
          DATE_FORMAT(t.hora_fin, '%H:%i') AS hora_salida_programada,
          c.configuracion,
          c.fecha_inicio
        FROM asignacion_turnos af
        JOIN turnos t ON af.turno_id = t.id
        JOIN empleados e ON af.empleado_id = e.id
        JOIN areas ar ON e.area_id = ar.id
        LEFT JOIN roles_empleado re ON re.id = e.rol_id
        LEFT JOIN area_supervisores sup ON sup.area_id = ar.id AND sup.es_titular = 1
        LEFT JOIN empleados jefe ON jefe.id = sup.empleado_id
        LEFT JOIN configuraciones_turnos c ON c.turno_id = t.id AND c.area_id = ar.id
        WHERE ar.id = ? 
          AND t.tipo_turno = 'FIJO'
          AND af.eliminado_en IS NULL;
      `, [area_id]);

    // console.log(`[DEBUG] Turnos fijos encontrados: ${fijos.length}`);

    // ==================== EXPANDIR FECHAS DE FIJOS ====================
    if (fijos.length > 0) {
      const inicio = new Date(desde);
      const fin = new Date(hasta);

      for (const f of fijos) {
        if (!f.empleado_id) continue;

        let diasDescanso = [];
        if (f.configuracion) {
          try {
            const conf = typeof f.configuracion === 'string' ? JSON.parse(f.configuracion) : f.configuracion;
            if (conf.dias_descanso) {
              diasDescanso = conf.dias_descanso.map(Number);
            }
          } catch (e) {
            console.warn('Error parsing configuracion for fixed shift:', e);
          }
        }

        const fechaInicioLote = f.fecha_inicio ? new Date(f.fecha_inicio) : null;

        for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
          const diaSemana = d.getUTCDay(); // Use UTC day to avoid timezone issues

          if (fechaInicioLote && d < fechaInicioLote) continue;
          if (diasDescanso.includes(diaSemana)) continue;

          const fechaStr = d.toISOString().split('T')[0];

          // Si es feriado, marcar como tal y continuar
          if (esFeriado(d)) {
            registros.push({
              area: f.area,
              jefe_area: f.jefe_area,
              empleado: f.empleado,
              cargo: f.cargo,
              fecha: fechaStr,
              turno_asignado: f.turno_asignado,
              tipo_turno: f.tipo_turno,
              hora_entrada_programada: f.hora_entrada_programada,
              hora_salida_programada: f.hora_salida_programada,
              entrada_real: null,
              salida_real: null,
              cumplimiento: `Feriado (${getNombreFeriado(d)})`,
              estado_dia: 'Feriado'
            });
            continue;
          }

          const [asist] = await db.query(`
              SELECT entrada_real, salida_real, estado 
              FROM asistencias 
              WHERE empleado_id = ? AND fecha = ?`,
            [f.empleado_id, fechaStr]
          );

          // Verificar si tiene permiso autorizado en esta fecha
          const [permiso] = await db.query(`
              SELECT id FROM permisos
              WHERE empleado_id = ? AND estado = 'AUTORIZADO'
                AND ? BETWEEN fecha_inicio AND fecha_fin
              LIMIT 1`,
            [f.empleado_id, fechaStr]
          );

          const tienePermiso = permiso.length > 0;
          let entrada_real = null, salida_real = null, estado = null;
          if (asist.length > 0) {
            entrada_real = asist[0].entrada_real;
            salida_real = asist[0].salida_real;
            estado = asist[0].estado;
          }

          let cumplimiento, estado_dia;
          if (tienePermiso) {
            cumplimiento = 'Con Permiso';
            estado_dia = 'Con Permiso';
          } else if (estado) {
            cumplimiento = estado === 'COMPLETO' ? 'Cumple horario' : estado === 'TARDE' ? 'Retraso' : 'Ausente';
            estado_dia = ['COMPLETO', 'TARDE'].includes(estado) ? 'Presente' : 'Ausente';
          } else {
            cumplimiento = 'No aplica marcaje';
            estado_dia = 'Presente (No obligatorio)';
          }

          registros.push({
            area: f.area,
            jefe_area: f.jefe_area,
            empleado: f.empleado,
            cargo: f.cargo,
            fecha: fechaStr,
            turno_asignado: f.turno_asignado,
            tipo_turno: f.tipo_turno,
            hora_entrada_programada: f.hora_entrada_programada,
            hora_salida_programada: f.hora_salida_programada,
            entrada_real,
            salida_real,
            cumplimiento,
            estado_dia
          });
        }
      }
    }

    // ==================== ORDEN FINAL ====================
    registros.sort((a, b) => {
      if (a.empleado < b.empleado) return -1;
      if (a.empleado > b.empleado) return 1;
      return new Date(a.fecha) - new Date(b.fecha);
    });
    res.json({ success: true, registros });

  } catch (err) {
    console.error('Error generando reporte:', err);
    res.status(500).json({
      success: false,
      message: 'Error al generar reporte',
      error: err.message
    });
  }
});

// En reportes.routes.js - modificar la ruta /eventos-biometricos
router.get('/eventos-biometricos', requireAuth, async (req, res) => {
  try {
    const { mes, dia, empleado_id, desde, hasta } = req.query;
    // Validar que se proporcione al menos un tipo de filtro de fecha
    if (!mes && !dia && !desde) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere al menos un parámetro de fecha: mes, dia o desde/hasta.'
      });
    }

    let fechaDesde, fechaHasta;

    if (desde && hasta) {
      // Filtro por rango de fechas personalizado
      fechaDesde = new Date(desde).toISOString().split('T')[0];
      fechaHasta = new Date(hasta).toISOString().split('T')[0];
    } else if (dia) {
      // Filtro por día específico
      fechaDesde = new Date(dia).toISOString().split('T')[0];
      fechaHasta = fechaDesde;
    } else {
      // Filtro por mes (comportamiento original)
      const [year, month] = mes.split('-').map(Number);
      fechaDesde = new Date(year, month - 1, 1).toISOString().split('T')[0];
      fechaHasta = new Date(year, month, 0).toISOString().split('T')[0];
    }

    // Construir la consulta dinámicamente
    let query = `
        SELECT 
          ra.id,
          ra.empleado_id,
          e.nombre_completo AS empleado,
          ra.fecha_hora,
          DATE_FORMAT(DATE(ra.fecha_hora), '%d-%m-%Y') AS fecha, 
          TIME(ra.fecha_hora) AS hora,
          ra.dispositivo_ip,
          ra.codigo_evento,
          ra.origen,
          CONVERT_TZ(ra.creado_en, '+00:00', '-06:00') AS creado_en
        FROM registros_asistencia ra
        LEFT JOIN empleados e ON e.id = ra.empleado_id
        WHERE ra.fecha_hora BETWEEN ? AND ?
      `;

    const params = [`${fechaDesde} 00:00:00`, `${fechaHasta} 23:59:59`];

    // Agregar filtro por empleado si se especifica
    if (empleado_id && empleado_id !== '') {
      query += ` AND ra.empleado_id = ?`;
      params.push(empleado_id);
    }

    query += ` ORDER BY e.nombre_completo, ra.fecha_hora ASC`;

    const [rawEventos] = await db.query(query, params);

    // Agrupar eventos por empleado y fecha
    const agrupados = {};
    for (const ev of rawEventos) {
      const clave = `${ev.empleado_id || 'sin_id'}_${ev.fecha}`;
      if (!agrupados[clave]) agrupados[clave] = [];
      agrupados[clave].push(ev);
    }

    // Construir el resultado filtrando solo entrada/salida
    const eventos = [];
    for (const [clave, lista] of Object.entries(agrupados)) {
      if (lista.length === 1) {
        eventos.push({
          ...lista[0],
          tipo_evento: 'ENTRADA',
        });
      } else if (lista.length > 1) {
        eventos.push({
          ...lista[0],
          tipo_evento: 'ENTRADA',
        });
        eventos.push({
          ...lista[lista.length - 1],
          tipo_evento: 'SALIDA',
        });
      }
    }

    res.json({
      success: true,
      eventos: eventos.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora)),
      periodo: { desde: fechaDesde, hasta: fechaHasta }
    });

  } catch (err) {
    console.error('Error generando reporte de eventos biométricos:', err);
    res.status(500).json({
      success: false,
      message: 'Error al generar reporte de eventos biométricos',
      error: err.message
    });
  }
});
// En reportes.routes.js - corregir la ruta /buscar-empleados
router.get('/buscar-empleados', requireAuth, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.json({ success: true, empleados: [] });
    }

    // Verificar qué columnas existen en tu tabla empleados
    const [empleados] = await db.query(`
        SELECT e.id, e.nombre_completo, e.renglon, a.nombre_area
        FROM empleados e
        LEFT JOIN areas a ON e.area_id = a.id
        WHERE (e.nombre_completo LIKE ? OR e.renglon LIKE ?) 
          AND e.eliminado_en IS NULL
          AND e.activo = 1
        ORDER BY e.nombre_completo 
        LIMIT 20
      `, [`%${query}%`, `%${query}%`]);

    res.json({ success: true, empleados });
  } catch (err) {
    console.error('Error buscando empleados:', err);
    res.status(500).json({
      success: false,
      message: 'Error al buscar empleados',
      error: err.message
    });
  }
});

// Ruta para ejecutar manualmente la sincronización biométrica
router.post('/actualizar-biometrico', requireAuth, async (req, res) => {
  try {
    // Ruta al script de sincronización
    const scriptPath = path.join(__dirname, '../scripts/sync_biometric_logs.js');

    // Ejecutar el script
    exec(`node "${scriptPath}"`, {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_PATH: '.' }
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('Error ejecutando sync_biometric_logs:', error);
        return res.status(500).json({
          success: false,
          message: 'Error ejecutando la sincronización',
          error: error.message
        });
      }

      if (stderr) {
        console.warn('Advertencias en sincronización:', stderr);
      }

      // Contar eventos recién insertados (opcional)
      db.query(`
          SELECT COUNT(*) as total 
          FROM registros_asistencia 
          WHERE DATE(creado_en) = CURDATE() 
          AND origen = 'BIOMETRICO'
        `).then(([rows]) => {
        const totalEventos = rows[0]?.total || 0;

        res.json({
          success: true,
          message: 'Sincronización completada correctamente',
          totalEventos: totalEventos,
          output: stdout
        });
      }).catch(countError => {
        console.error('Error contando eventos:', countError);
        res.json({
          success: true,
          message: 'Sincronización completada (error contando eventos)',
          output: stdout
        });
      });
    });

  } catch (err) {
    console.error('Error en ruta de actualización biométrica:', err);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: err.message
    });
  }
});

// En reportes.routes.js - agregar esta ruta
router.post('/sincronizar-marcajes-anteriores', requireAuth, async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({
        success: false,
        message: 'Se requieren las fechas desde y hasta'
      });
    }

    // Validar formato de fechas
    const fechaDesde = new Date(desde);
    const fechaHasta = new Date(hasta);

    if (isNaN(fechaDesde.getTime()) || isNaN(fechaHasta.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Formato de fecha inválido. Use YYYY-MM-DD'
      });
    }

    if (fechaDesde > fechaHasta) {
      return res.status(400).json({
        success: false,
        message: 'La fecha desde no puede ser mayor que la fecha hasta'
      });
    }

    // Validar que el rango no sea muy extenso (máximo 31 días)
    const diffTime = Math.abs(fechaHasta - fechaDesde);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 31) {
      return res.status(400).json({
        success: false,
        message: 'El rango máximo permitido es de 31 días'
      });
    }

    // Ruta al script de sincronización histórica
    const scriptPath = path.join(__dirname, '../scripts/sync_biometric_logs_historical.js');

    // Ejecutar el script con los parámetros
    exec(`node "${scriptPath}" "${desde}" "${hasta}"`, {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_PATH: '.' }
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('Error ejecutando sync_biometric_logs_historical:', error);
        return res.status(500).json({
          success: false,
          message: 'Error ejecutando la sincronización histórica',
          error: error.message
        });
      }

      if (stderr) {
        console.warn('Advertencias en sincronización histórica:', stderr);
      }

      // Extraer resultados del output
      const output = stdout.toString();

      // Buscar estadísticas en el output
      const eventosMatch = output.match(/Eventos insertados: (\d+)/);
      const duplicadosMatch = output.match(/Duplicados omitidos: (\d+)/);
      const asistenciasMatch = output.match(/Asistencias procesadas: (\d+)/);

      res.json({
        success: true,
        message: 'Sincronización histórica completada',
        eventos: eventosMatch ? parseInt(eventosMatch[1]) : 0,
        duplicados: duplicadosMatch ? parseInt(duplicadosMatch[1]) : 0,
        asistencias: asistenciasMatch ? parseInt(asistenciasMatch[1]) : 0,
        output: output
      });
    });

  } catch (err) {
    console.error('Error en ruta de sincronización histórica:', err);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: err.message
    });
  }
});

// Endpoint para reporte de horarios (Planificación)
router.get('/horarios', requireAuth, async (req, res) => {
  try {
    const { area_id, desde, hasta } = req.query;

    if (!area_id || !desde || !hasta) {
      return res.status(400).json({ success: false, message: 'Faltan parámetros' });
    }

    // 1. Obtener turnos rotativos asignados en el rango
    const [rotativos] = await db.query(`
      SELECT 
        e.nombre_completo,
        r.nombre_rol,
        t.nombre_turno,
        DATE_FORMAT(t.hora_inicio, '%H:%i') as hora_inicio,
        DATE_FORMAT(t.hora_fin, '%H:%i') as hora_fin,
        at.fecha_inicio,
        al.fecha_inicio as lote_fecha_inicio,
        al.fecha_fin as lote_fecha_fin,
        'ROTATIVO' as tipo,
        al.dias_descanso as dias_descanso_db
      FROM asignacion_turnos at
      JOIN empleados e ON at.empleado_id = e.id
      LEFT JOIN roles_empleado r ON e.rol_id = r.id
      JOIN turnos t ON at.turno_id = t.id
      LEFT JOIN asignaciones_lote al ON at.lote_id = al.id
      WHERE e.area_id = ? 
      AND at.fecha_inicio BETWEEN ? AND ?
      AND at.eliminado_en IS NULL
      AND t.tipo_turno != 'FIJO'
      ORDER BY e.nombre_completo, at.fecha_inicio
    `, [area_id, desde, hasta]);

    // 2. Obtener turnos fijos activos
    // Nota: Los fijos se asignan una vez, hay que proyectarlos en el rango
    const [fijos] = await db.query(`
      SELECT 
        e.id as empleado_id,
        e.nombre_completo,
        r.nombre_rol,
        t.nombre_turno,
        DATE_FORMAT(t.hora_inicio, '%H:%i') as hora_inicio,
        DATE_FORMAT(t.hora_fin, '%H:%i') as hora_fin,
        at.fecha_inicio,
        at.fecha_fin,
        c.configuracion
      FROM asignacion_turnos at
      JOIN empleados e ON at.empleado_id = e.id
      LEFT JOIN roles_empleado r ON e.rol_id = r.id
      JOIN turnos t ON at.turno_id = t.id
      LEFT JOIN configuraciones_turnos c ON c.turno_id = t.id AND c.area_id = e.area_id
      WHERE e.area_id = ?
      AND t.tipo_turno = 'FIJO'
      AND at.eliminado_en IS NULL
      AND at.fecha_inicio <= ?
      AND (at.fecha_fin >= ? OR at.fecha_fin IS NULL)
    `, [area_id, hasta, desde]);

    // Procesar datos para el reporte
    // Queremos una lista de empleados con sus horarios detallados
    const empleadosMap = new Map();

    // Helper para generar rango de fechas
    const getDatesInRange = (startDate, endDate) => {
      const date = new Date(startDate);
      const end = new Date(endDate);
      const dates = [];
      while (date <= end) {
        dates.push(new Date(date).toISOString().split('T')[0]);
        date.setDate(date.getDate() + 1);
      }
      return dates;
    };

    const allDates = getDatesInRange(desde, hasta);
    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    // Procesar rotativos
    rotativos.forEach(r => {
      if (!empleadosMap.has(r.nombre_completo)) {
        empleadosMap.set(r.nombre_completo, {
          nombre_completo: r.nombre_completo,
          rol_nombre: r.nombre_rol,
          horarios: [],
          fechasAsignadas: new Set(), // Para rastrear días trabajados
          dias_descanso: [],
          dias_descanso_db: r.dias_descanso_db, // Guardar valor de DB
          fecha_inicio: r.lote_fecha_inicio ? new Date(r.lote_fecha_inicio).toISOString().split('T')[0] : null,
          fecha_fin: r.lote_fecha_fin ? new Date(r.lote_fecha_fin).toISOString().split('T')[0] : null,
          tipo: r.tipo // 'ROTATIVO'
        });
      }
      const emp = empleadosMap.get(r.nombre_completo);
      // Asegurar que fecha_inicio sea Date
      const fechaObj = new Date(r.fecha_inicio);
      const fechaStr = fechaObj.toISOString().split('T')[0];

      emp.horarios.push(`${fechaStr}: ${r.hora_inicio}-${r.hora_fin}`);
      emp.fechasAsignadas.add(fechaStr);
    });

    // Procesar fijos (proyectar si es necesario, o mostrar resumen)
    // Para el reporte impreso, suele bastar con "Lunes a Viernes 07:00-15:00"
    fijos.forEach(f => {
      if (!empleadosMap.has(f.nombre_completo)) {
        let descanso = '';
        if (f.configuracion) {
          try {
            const conf = typeof f.configuracion === 'string' ? JSON.parse(f.configuracion) : f.configuracion;
            if (conf.dias_descanso) {
              descanso = conf.dias_descanso.map(d => diasSemana[d]).join(', ');
            }
          } catch (e) { }
        }

        empleadosMap.set(f.nombre_completo, {
          nombre_completo: f.nombre_completo,
          rol_nombre: f.nombre_rol,
          detalle_horario: `${f.nombre_turno} (${f.hora_inicio} - ${f.hora_fin})`,
          dias_descanso: descanso,
          fecha_inicio: f.fecha_inicio ? new Date(f.fecha_inicio).toISOString().split('T')[0] : null,
          fecha_fin: f.fecha_fin ? new Date(f.fecha_fin).toISOString().split('T')[0] : null,
          tipo: 'FIJO'
        });
      }
    });

    // Convertir a array y calcular descansos para rotativos
    const data = Array.from(empleadosMap.values()).map(e => {
      if (e.horarios) {
        // Calcular días de descanso para rotativos
        if (!e.tipo || e.tipo !== 'FIJO') {
          // PRIORIDAD 1: Usar lo que viene de asignaciones_lote (si existe)
          if (e.dias_descanso_db) {
            try {
              // Puede venir como string "0,6" o array
              const diasDB = typeof e.dias_descanso_db === 'string'
                ? e.dias_descanso_db.split(',').map(Number)
                : e.dias_descanso_db;

              if (Array.isArray(diasDB) && diasDB.length > 0) {
                e.dias_descanso = diasDB.map(d => diasSemana[d]).join(', ');
              }
            } catch (err) {
              console.warn('Error parseando dias_descanso_db:', err);
            }
          }

          // PRIORIDAD 2: Si no hay dato en DB, inferir por huecos (días sin turno en el rango)
          if (!e.dias_descanso || e.dias_descanso.length === 0) {
            const descansos = [];
            allDates.forEach(date => {
              if (!e.fechasAsignadas.has(date)) {
                const d = new Date(date);
                // Usar UTC day para evitar problemas de zona horaria con fechas YYYY-MM-DD
                const diaIndex = d.getUTCDay();
                const diaNombre = diasSemana[diaIndex];
                const diaNumero = date.split('-')[2];
                descansos.push(`${diaNombre} ${diaNumero}`);
              }
            });
            e.dias_descanso = descansos.join(', ');
          }
        }

        // Formatear horarios rotativos
        const horasUnicas = [...new Set(e.horarios.map(h => h.split(': ')[1]))];
        if (horasUnicas.length === 1) {
          e.detalle_horario = `Todos los días: ${horasUnicas[0]}`;
        } else {
          // Si son muchos, mostrar resumen o rango
          e.detalle_horario = horasUnicas.join(' / ');
        }

        // Limpiar propiedades auxiliares
        delete e.fechasAsignadas;
        delete e.dias_descanso_db;
      }
      return e;
    });

    res.json({ success: true, data });

  } catch (err) {
    console.error('Error en reporte horarios:', err);
    res.status(500).json({ success: false, message: 'Error interno' });
  }
});


module.exports = router;