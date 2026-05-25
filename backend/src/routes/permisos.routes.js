const express = require('express');
const db = require('../db.js');
const { audit } = require('../utils/audit.js');
const { requireAuth } = require('../middlewares/auth.js');
const { ensureActor } = require('../middlewares/actor.js');
const router = express.Router();

// MODELO - Tipos de Permiso

class TiposPermisoModel {
  static async getAll() {
    const [rows] = await db.query(`
      SELECT id, nombre, dias_permitidos, mensaje_carta, activo, creado_en, actualizado_en
      FROM tipos_permiso
      WHERE activo = 1
      ORDER BY nombre ASC
    `);
    return rows;
  }

  static async getById(id) {
    const [rows] = await db.query(`
      SELECT id, nombre, dias_permitidos, mensaje_carta, activo
      FROM tipos_permiso
      WHERE id = ?
    `, [id]);
    return rows.length ? rows[0] : null;
  }

  static async existeNombre(nombre, excludeId = null) {
    const sql = excludeId
      ? `SELECT id FROM tipos_permiso WHERE LOWER(nombre) = LOWER(?) AND id != ? AND activo = 1`
      : `SELECT id FROM tipos_permiso WHERE LOWER(nombre) = LOWER(?) AND activo = 1`;
    const params = excludeId ? [nombre, excludeId] : [nombre];
    const [rows] = await db.query(sql, params);
    return rows.length > 0;
  }

  static async create({ nombre, dias_permitidos, mensaje_carta }) {
    const [result] = await db.query(`
      INSERT INTO tipos_permiso (nombre, dias_permitidos, mensaje_carta)
      VALUES (?, ?, ?)
    `, [nombre, dias_permitidos, mensaje_carta || null]);

    return {
      id: result.insertId,
      nombre,
      dias_permitidos,
      mensaje_carta
    };
  }

  static async update(id, { nombre, dias_permitidos, mensaje_carta }) {
    const [result] = await db.query(`
      UPDATE tipos_permiso
      SET nombre = ?, dias_permitidos = ?, mensaje_carta = ?
      WHERE id = ?
    `, [nombre, dias_permitidos, mensaje_carta || null, id]);

    if (result.affectedRows === 0) throw new Error('Tipo de permiso no encontrado');
    return this.getById(id);
  }

  static async delete(id) {
    // Verificar si está siendo usado en algún permiso
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM permisos WHERE tipo_permiso_id = ?`, [id]
    );
    if (total > 0) throw new Error(`No se puede eliminar: está siendo usado en ${total} permiso(s)`);

    const [result] = await db.query(`UPDATE tipos_permiso SET activo = 0 WHERE id = ?`, [id]);
    if (result.affectedRows === 0) throw new Error('Tipo de permiso no encontrado');
    return true;
  }
}

// ============================================
// MODELO - Permisos
// ============================================
class PermisosModel {
  static async getAll(filtro = 'todos') {
    let sql = `
      SELECT 
        p.id,
        p.empleado_id,
        e.numero_empleado,
        e.nombre_completo,
        e.rol_id,
        e.area_id,
        r.nombre_rol AS rol_nombre,
        a.nombre_area AS area_nombre,
        p.tipo_permiso_id,
        tp.nombre AS tipo_permiso_nombre,
        p.tipo_permiso_otro,
        p.mensaje_otro,
        DATE_FORMAT(p.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
        DATE_FORMAT(p.fecha_fin,    '%Y-%m-%d') AS fecha_fin,
        p.dias_solicitados,
        p.estado,
        p.observaciones,
        p.creado_en,
        p.actualizado_en,
        p.autorizado_en,
        p.firmas_config,
        uc.username AS creado_por_usuario,
        ua.username AS autorizado_por_usuario
      FROM permisos p
      INNER JOIN empleados e ON p.empleado_id = e.id
      LEFT JOIN roles_empleado r ON e.rol_id = r.id
      LEFT JOIN areas a ON e.area_id = a.id
      LEFT JOIN tipos_permiso tp ON p.tipo_permiso_id = tp.id
      LEFT JOIN usuarios_sistema uc ON p.creado_por = uc.id
      LEFT JOIN usuarios_sistema ua ON p.autorizado_por = ua.id
    `;

    if (filtro === 'permiso') {
      sql += ` WHERE p.fecha_inicio <= CURDATE() AND p.fecha_fin >= CURDATE()`;
    }

    sql += ` ORDER BY p.creado_en DESC, e.nombre_completo ASC`;

    const [rows] = await db.query(sql);
    // Parsear firmas_config si viene como string
    return rows.map((r) => ({
      ...r,
      firmas_config: r.firmas_config
        ? (typeof r.firmas_config === 'string' ? JSON.parse(r.firmas_config) : r.firmas_config)
        : null
    }));
  }

  static async getById(id) {
    const [rows] = await db.query(`
      SELECT 
        p.*,
        e.nombre_completo,
        e.numero_empleado,
        e.rol_id,
        e.area_id,
        tp.nombre AS tipo_permiso_nombre,
        p.firmas_config
      FROM permisos p
      INNER JOIN empleados e ON p.empleado_id = e.id
      LEFT JOIN tipos_permiso tp ON p.tipo_permiso_id = tp.id
      WHERE p.id = ?
    `, [id]);
    return rows.length ? rows[0] : null;
  }

  static async create(data) {
    const {
      empleado_id,
      tipo_permiso_id,
      tipo_permiso_otro,
      mensaje_otro,
      fecha_inicio,
      fecha_fin,
      dias_solicitados,
      estado = 'PENDIENTE',
      creado_por,
      firmas_config = null
    } = data;

    const [result] = await db.query(`
      INSERT INTO permisos (
        empleado_id, tipo_permiso_id, tipo_permiso_otro, mensaje_otro,
        fecha_inicio, fecha_fin, dias_solicitados, estado, creado_por, firmas_config
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      empleado_id,
      tipo_permiso_id || null,
      tipo_permiso_otro || null,
      mensaje_otro || null,
      fecha_inicio,
      fecha_fin,
      dias_solicitados,
      estado,
      creado_por || null,
      firmas_config ? JSON.stringify(firmas_config) : null
    ]);

    return { id: result.insertId, ...data };
  }

  static async update(id, data) {
    const {
      tipo_permiso_id,
      tipo_permiso_otro,
      mensaje_otro,
      fecha_inicio,
      fecha_fin,
      dias_solicitados,
      estado,
      observaciones,
      firmas_config = null
    } = data;

    const [result] = await db.query(`
      UPDATE permisos
      SET tipo_permiso_id = ?, tipo_permiso_otro = ?, mensaje_otro = ?,
          fecha_inicio = ?, fecha_fin = ?, dias_solicitados = ?,
          estado = ?, observaciones = ?, firmas_config = ?
      WHERE id = ?
    `, [
      tipo_permiso_id || null,
      tipo_permiso_otro || null,
      mensaje_otro || null,
      fecha_inicio,
      fecha_fin,
      dias_solicitados,
      estado,
      observaciones || null,
      firmas_config ? JSON.stringify(firmas_config) : null,
      id
    ]);

    if (result.affectedRows === 0) throw new Error('Permiso no encontrado');
    return this.getById(id);
  }

  static async updateEstado(id, estado, autorizado_por = null) {
    const [result] = await db.query(`
      UPDATE permisos
      SET estado = ?, autorizado_por = ?, autorizado_en = NOW()
      WHERE id = ?
    `, [estado, autorizado_por, id]);

    if (result.affectedRows === 0) throw new Error('Permiso no encontrado');
    return this.getById(id);
  }

  static async delete(id) {
    const [result] = await db.query(`DELETE FROM permisos WHERE id = ?`, [id]);
    if (result.affectedRows === 0) throw new Error('Permiso no encontrado');
    return true;
  }
}

// ============================================
// CONTROLADORES - Tipos de Permiso
// ============================================
class TiposPermisoController {
  static async getAll(_req, res) {
    try {
      const tipos = await TiposPermisoModel.getAll();
      return res.json({ success: true, data: tipos });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async create(req, res) {
    try {
      const { nombre, dias_permitidos, mensaje_carta } = req.body;

      if (!nombre || !dias_permitidos) {
        return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
      }

      // Verificar duplicado case-insensitive antes de insertar
      if (await TiposPermisoModel.existeNombre(nombre)) {
        return res.status(409).json({ success: false, error: 'Ya existe un tipo de permiso con ese nombre.' });
      }

      const nuevo = await TiposPermisoModel.create({ nombre, dias_permitidos, mensaje_carta });
      await audit({ evento: 'CREATE', entidad: 'tipos_permiso', entidad_id: nuevo.id, antes: null, despues: nuevo, req });

      return res.status(201).json({ success: true, data: nuevo });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, error: `Ya existe un tipo de permiso con ese nombre.` });
      }
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async update(req, res) {                
    try {
      const { id } = req.params;
      const { nombre, dias_permitidos, mensaje_carta } = req.body;

      const antes = await TiposPermisoModel.getById(id);
      if (!antes) return res.status(404).json({ success: false, error: 'Tipo de permiso no encontrado' });

      // Verificar duplicado case-insensitive excluyendo el registro actual
      if (await TiposPermisoModel.existeNombre(nombre, id)) {
        return res.status(409).json({ success: false, error: 'Ya existe un tipo de permiso con ese nombre.' });
      }

      const actualizado = await TiposPermisoModel.update(id, { nombre, dias_permitidos, mensaje_carta });
      await audit({ evento: 'UPDATE', entidad: 'tipos_permiso', entidad_id: id, antes, despues: actualizado, req });

      return res.json({ success: true, data: actualizado });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, error: `Ya existe un tipo de permiso con ese nombre.` });
      }
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;

      const antes = await TiposPermisoModel.getById(id);
      if (!antes) return res.status(404).json({ success: false, error: 'Tipo de permiso no encontrado' });

      await TiposPermisoModel.delete(id);
      await audit({ evento: 'DELETE', entidad: 'tipos_permiso', entidad_id: id, antes, despues: null, req });

      return res.json({ success: true, message: 'Tipo de permiso eliminado' });
    } catch (error) {
      // Si está en uso, devolver 409 para que el frontend lo maneje como aviso
      if (error.message.includes('está siendo usado')) {
        return res.status(409).json({ success: false, error: error.message });
      }
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

// ============================================
// CONTROLADORES - Permisos
// ============================================
class PermisosController {
  static async getAll(req, res) {
    try {
      const { filtro = 'todos' } = req.query;
      const permisos = await PermisosModel.getAll(filtro);
      return res.json({ success: true, data: permisos });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getById(req, res) {
    try {
      const { id } = req.params;
      const permiso = await PermisosModel.getById(id);

      if (!permiso) return res.status(404).json({ success: false, error: 'Permiso no encontrado' });

      return res.json({ success: true, data: permiso });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async create(req, res) {
    try {
      const data = req.body;

      if (!data.empleado_id || !data.fecha_inicio || !data.fecha_fin) {
        return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
      }

      // Pasar el ID del usuario logueado como creado_por
      data.creado_por = req.actorId ?? null;

      const nuevo = await PermisosModel.create(data);
      await audit({ evento: 'CREATE', entidad: 'permisos', entidad_id: nuevo.id, antes: null, despues: nuevo, req });

      return res.status(201).json({ success: true, data: nuevo });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      const antes = await PermisosModel.getById(id);
      if (!antes) return res.status(404).json({ success: false, error: 'Permiso no encontrado' });

      const actualizado = await PermisosModel.update(id, data);
      await audit({ evento: 'UPDATE', entidad: 'permisos', entidad_id: id, antes, despues: actualizado, req });

      return res.json({ success: true, data: actualizado });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado } = req.body;

      if (!['PENDIENTE', 'AUTORIZADO', 'RECHAZADO'].includes(estado)) {
        return res.status(400).json({ success: false, error: 'Estado inválido' });
      }

      const antes = await PermisosModel.getById(id);
      if (!antes) return res.status(404).json({ success: false, error: 'Permiso no encontrado' });

      const actualizado = await PermisosModel.updateEstado(id, estado, req.actorId ?? null);
      await audit({ evento: 'UPDATE', entidad: 'permisos', entidad_id: id, antes, despues: actualizado, req });

      return res.json({ success: true, data: actualizado });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async delete(req, res) {
    try {
      const { id } = req.params;

      const antes = await PermisosModel.getById(id);
      if (!antes) return res.status(404).json({ success: false, error: 'Permiso no encontrado' });

      await PermisosModel.delete(id);
      await audit({ evento: 'DELETE', entidad: 'permisos', entidad_id: id, antes, despues: null, req });

      return res.json({ success: true, message: 'Permiso eliminado' });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

// ============================================
// RUTAS
// ============================================

// Todos los permisos vigentes hoy para vista empleados
router.get('/vigentes-hoy', requireAuth, async (req, res) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const [rows] = await db.query(`
      SELECT p.empleado_id, p.estado, p.fecha_inicio, p.fecha_fin
      FROM permisos p
      WHERE p.estado = 'AUTORIZADO'
        AND p.fecha_inicio <= ? AND p.fecha_fin >= ?
    `, [hoy, hoy]);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verificar permisos vigentes de un empleado en un rango de fechas
router.get('/empleado/:id/vigente', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { desde, hasta } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ success: false, error: 'Se requieren desde y hasta' });
    }

    const [rows] = await db.query(`
      SELECT p.id, p.fecha_inicio, p.fecha_fin, p.dias_solicitados, p.estado,
             tp.nombre AS tipo_permiso_nombre, p.tipo_permiso_otro
      FROM permisos p
      LEFT JOIN tipos_permiso tp ON p.tipo_permiso_id = tp.id
      WHERE p.empleado_id = ?
        AND p.estado IN ('AUTORIZADO', 'PENDIENTE')
        AND p.fecha_inicio <= ? AND p.fecha_fin >= ?
      ORDER BY p.fecha_inicio ASC
    `, [id, hasta, desde]);

    const autorizado = rows.filter(r => r.estado === 'AUTORIZADO');
    const pendiente = rows.filter(r => r.estado === 'PENDIENTE');

    res.json({
      success: true,
      tienePermisoAutorizado: autorizado.length > 0,
      tienePermisoPendiente: pendiente.length > 0,
      permisos: rows
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verificar si un empleado tiene turnos asignados en un rango de fechas
router.get('/empleado/:id/turnos-en-rango', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { desde, hasta } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ success: false, error: 'Se requieren desde y hasta' });
    }

    const [rows] = await db.query(`
      SELECT at.id, at.fecha_inicio, at.fecha_fin, t.nombre_turno
      FROM asignacion_turnos at
      JOIN turnos t ON t.id = at.turno_id
      WHERE at.empleado_id = ?
        AND at.eliminado_en IS NULL
        AND at.fecha_inicio <= ? AND at.fecha_fin >= ?
      ORDER BY at.fecha_inicio ASC
      LIMIT 5
    `, [id, hasta, desde]);

    res.json({ success: true, tieneTurnos: rows.length > 0, turnos: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reporte de permisos (para módulo de reportes)
router.get('/reporte', requireAuth, async (req, res) => {
  try {
    const { area_id, empleado_id, desde, hasta, estado } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ success: false, error: 'Se requieren desde y hasta' });
    }

    let sql = `
      SELECT
        p.id, p.fecha_inicio, p.fecha_fin, p.dias_solicitados, p.estado,
        p.observaciones, p.creado_en, p.autorizado_en,
        e.nombre_completo, e.numero_empleado, e.renglon,
        r.nombre_rol AS rol_nombre,
        a.nombre_area AS area_nombre,
        tp.nombre AS tipo_permiso_nombre,
        p.tipo_permiso_otro
      FROM permisos p
      INNER JOIN empleados e ON p.empleado_id = e.id
      LEFT JOIN roles_empleado r ON e.rol_id = r.id
      LEFT JOIN areas a ON e.area_id = a.id
      LEFT JOIN tipos_permiso tp ON p.tipo_permiso_id = tp.id
      WHERE p.fecha_inicio <= ? AND p.fecha_fin >= ?
    `;

    const params = [hasta, desde];

    if (area_id === 'sin_area') {
      sql += ` AND e.area_id IS NULL`;
    } else if (area_id) {
      sql += ` AND e.area_id = ?`; params.push(area_id);
    }
    if (empleado_id) { sql += ` AND p.empleado_id = ?`; params.push(empleado_id); }
    if (estado && estado !== 'todos') { sql += ` AND p.estado = ?`; params.push(estado); }

    sql += ` ORDER BY a.nombre_area, e.nombre_completo, p.fecha_inicio`;

    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tipos de permiso
router.get('/tipos', TiposPermisoController.getAll);
router.post('/tipos', TiposPermisoController.create);
router.put('/tipos/:id', TiposPermisoController.update);
router.delete('/tipos/:id', TiposPermisoController.delete);

// Permisos
router.get('/', requireAuth, PermisosController.getAll);
router.get('/:id', requireAuth, PermisosController.getById);
router.post('/', requireAuth, ensureActor, PermisosController.create);
router.put('/:id', requireAuth, ensureActor, PermisosController.update);
router.patch('/:id/estado', requireAuth, ensureActor, PermisosController.updateEstado);
router.delete('/:id', requireAuth, ensureActor, PermisosController.delete);

module.exports = router;
