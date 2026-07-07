const express = require('express');
const db = require('../db.js');
const { requireAuth, requireAnyRole } = require('../middlewares/auth.js'); 

const requireAdminOrSuperadmin = requireAnyRole('superadmin', 'admin');

const router = express.Router();

// GET /api/areas
router.get('/', async (_req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nombre_area, descripcion FROM areas ORDER BY nombre_area ASC'
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error obteniendo áreas', message: e.message });
  }
});

router.get('/:id/empleados', async (req, res) => {
  try {
    const areaId = req.params.id;
    const [rows] = await db.query('SELECT * FROM empleados WHERE area_id = ?', [areaId]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error obteniendo empleados del área' });
  }
});



// POST /api/areas
router.post('/', async (req, res) => {
  try {
    const nombre_area = (req.body?.nombre_area || '').trim();
    const descripcion = req.body?.descripcion ?? null;
    if (!nombre_area) {
      return res.status(400).json({ success: false, error: 'nombre_area requerido' });
    }

    const [r] = await db.query(
      'INSERT INTO areas (nombre_area, descripcion) VALUES (?, ?)',
      [nombre_area, descripcion]
    );
    return res.status(201).json({
      success: true,
      message: 'Área creada',
      data: { id: r.insertId, nombre_area, descripcion }
    });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'El área ya existe' });
    }
    return res.status(500).json({ success: false, error: 'Error creando área', message: e.message });
  }
});

// POST /api/areas/:areaId/supervisores marcar empleado como supervisor de un area
router.post('/:areaId/supervisores', requireAuth, requireAdminOrSuperadmin, async (req, res) => {
  try {
    const areaId = Number(req.params.areaId);
    const { empleado_id, es_titular = 0, desde = null, hasta = null } = req.body || {};
    if (!areaId || !empleado_id) {
      return res.status(400).json({ success:false, error:'Datos inválidos' });
    }

    // const [[ok]] = await db.query(
    //   `SELECT COUNT(*) c FROM empleados WHERE id=? AND area_id=? AND activo=1`,
    //   [empleado_id, areaId]
    // );
    // if (!ok?.c) {
    //   return res.status(409).json({ success:false, error:'Empleado no pertenece al área o no está activo' });
    // }
    const [[emp]] = await db.query(
      `SELECT id, activo FROM empleados WHERE id=?`, [empleado_id]
    );
    if (!emp || emp.activo !== 1) {
      return res.status(409).json({ success:false, error:'Empleado no existe o inactivo' });
    }

    await db.query(`
      INSERT INTO area_supervisores (area_id, empleado_id, es_titular, desde, hasta)
      VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE es_titular=VALUES(es_titular), desde=VALUES(desde), hasta=VALUES(hasta)
    `, [areaId, empleado_id, es_titular ? 1 : 0, desde, hasta]);

    res.json({ success:true, message:'Supervisor registrado' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, error:'Error registrando supervisor' });
  }
});

// POST /api/areas/:areaId/empleados/lote
router.post('/:areaId/empleados/lote', requireAuth, requireAdminOrSuperadmin, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const areaId = Number(req.params.areaId);
    let { empleados_ids = [], jefe_empleado_id = null, incluir_jefe = true } = req.body || {};
    if (!areaId) return res.status(400).json({ success:false, error:'areaId inválido' });

    const ids = Array.isArray(empleados_ids) ? empleados_ids.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0) : [];
    if (incluir_jefe && jefe_empleado_id) ids.unshift(Number(jefe_empleado_id));
    const uniques = [...new Set(ids)];
    if (uniques.length === 0) return res.status(400).json({ success:false, error:'Sin empleados' });

    const ph = uniques.map(() => '?').join(',');
    await conn.beginTransaction();

    const [[area]] = await conn.query(`SELECT id FROM areas WHERE id=?`, [areaId]);
    if (!area) throw new Error('Área no existe');

    const [r] = await conn.query(
      `UPDATE empleados SET area_id=? WHERE id IN (${ph})`,
      [areaId, ...uniques]
    );

    await conn.commit();
    res.json({ success:true, message:'Área asignada en lote', area_id: areaId, afectados: r.affectedRows });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ success:false, error:'Error asignando área en lote', message: e.message });
  } finally {
    conn.release();
  }
});


// DELETE /api/areas/:areaId/supervisores/:empleadoId 
router.delete('/:areaId/supervisores/:empleadoId', requireAuth, requireAdminOrSuperadmin, async (req, res) => {
  try {
    const areaId = Number(req.params.areaId);
    const empleadoId = Number(req.params.empleadoId);
    await db.query(`DELETE FROM area_supervisores WHERE area_id=? AND empleado_id=?`, [areaId, empleadoId]);
    res.json({ success:true, message:'Supervisor removido' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, error:'Error removiendo supervisor' });
  }
});

// GET /api/areas/:areaId/candidatos-jefe  lista de candidatos para el combo 
router.get('/:areaId/candidatos-jefe', async (req, res) => {
  try {
    const areaId = Number(req.params.areaId);
    if (!areaId) return res.status(400).json({ success:false, error:'areaId inválido' });

    const [rows] = await db.query(`
      SELECT * FROM (
        -- 1) Titular (prioridad alta)
        SELECT e.id, e.nombre_completo, e.area_id, e.rol_id, e.email, e.activo,
               3 AS prioridad, 'TITULAR' AS fuente
        FROM area_supervisores s
        JOIN empleados e ON e.id = s.empleado_id
        WHERE s.area_id = ?
          AND e.activo = 1
          AND s.es_titular = 1
          AND (s.hasta IS NULL OR s.hasta >= CURDATE())

        UNION
        -- 2) Específicos (no titulares)
        SELECT e.id, e.nombre_completo, e.area_id, e.rol_id, e.email, e.activo,
               2 AS prioridad, 'ESPECIFICO' AS fuente
        FROM area_supervisores s
        JOIN empleados e ON e.id = s.empleado_id
        WHERE s.area_id = ?
          AND e.activo = 1
          AND (s.es_titular = 0 OR s.es_titular IS NULL)
          AND (s.hasta IS NULL OR s.hasta >= CURDATE())

        UNION
        -- 3) Regla (rol/nivel/global)
        SELECT e.id, e.nombre_completo, e.area_id, e.rol_id, e.email, e.activo,
               1 AS prioridad, 'REGLA' AS fuente
        FROM empleados e
        LEFT JOIN roles_empleado r ON r.id = e.rol_id
        WHERE e.activo = 1
          AND e.area_id = ?
          AND (
            COALESCE(r.nivel,1) >= 2
            OR COALESCE(r.supervisa_global,0) = 1
            OR e.rol_id IN (SELECT rol_id FROM area_supervisor_roles WHERE area_id = ?)
          )
      ) t
      ORDER BY prioridad DESC, nombre_completo ASC
    `, [areaId, areaId, areaId, areaId]);

    res.json({ success:true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, error:'Error cargando candidatos de jefe' });
  }
});

module.exports = router;