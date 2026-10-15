const express = require('express');
const db = require('../db.js');
const { audit } = require('../utils/audit.js');
const router = express.Router();
const path = require('path');
const { exec } = require('child_process');
const { requireAuth } = require('../middlewares/auth');


//  helpers 
function isISODate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d||'')); }

class ValidationError extends Error {
  constructor(status, field, message) { super(message); this.status = status; this.field = field; }
}

/**
 * Normaliza y valida código de expediente y colegiado.
 * El colegiado se identifica por colegio + número: el mismo número puede existir en otro colegio.
 * `existente` (en update) permite conservar valores cuando el campo no viene en el body.
 */
async function validarExpedienteYColegiado(body, idActual = null, existente = null) {
  const tiene = (k) => Object.prototype.hasOwnProperty.call(body, k);

  let codigo = tiene('codigo_expediente') ? body.codigo_expediente : existente?.codigo_expediente;
  codigo = codigo == null ? '' : String(codigo).trim().toUpperCase();
  if (codigo && !/^[A-Z0-9-]{1,20}$/.test(codigo)) {
    throw new ValidationError(400, 'codigo_expediente', 'El código de expediente solo admite letras, números y guiones (máx. 20)');
  }

  const sinColegiado = !tiene('colegio_id') && !tiene('numero_colegiado');
  let colegioId = sinColegiado ? existente?.colegio_id : body.colegio_id;
  colegioId = (colegioId === '' || colegioId == null || Number.isNaN(Number(colegioId))) ? null : Number(colegioId);
  let numero = sinColegiado ? existente?.numero_colegiado : body.numero_colegiado;
  numero = numero == null ? '' : String(numero).trim();

  if (numero && !/^\d{1,20}$/.test(numero)) {
    throw new ValidationError(400, 'numero_colegiado', 'El número de colegiado solo admite dígitos (máx. 20)');
  }
  if (colegioId && !numero) {
    throw new ValidationError(400, 'numero_colegiado', 'Ingrese el número de colegiado del colegio seleccionado');
  }
  if (numero && !colegioId) {
    throw new ValidationError(400, 'colegio_id', 'Seleccione el colegio al que pertenece el número de colegiado');
  }

  let colegio = null;
  if (colegioId) {
    colegio = await EmpleadosModel.getColegio(colegioId);
    const mismoQueAntes = existente && Number(existente.colegio_id) === colegioId;
    if (!colegio || (!colegio.activo && !mismoQueAntes)) {
      throw new ValidationError(400, 'colegio_id', 'El colegio seleccionado no es válido');
    }
  }

  if (codigo) {
    const dup = await EmpleadosModel.getByCodigoExpediente(codigo);
    if (dup && dup.id !== idActual) {
      throw new ValidationError(409, 'codigo_expediente', `El código de expediente ya está asignado a ${dup.nombre_completo}`);
    }
  }
  if (colegioId && numero) {
    const dup = await EmpleadosModel.getByColegiado(colegioId, numero);
    if (dup && dup.id !== idActual) {
      throw new ValidationError(409, 'numero_colegiado',
        `El colegiado N° ${numero} del ${colegio.nombre} ya está registrado a ${dup.nombre_completo}`);
    }
  }

  return { codigo_expediente: codigo || null, colegio_id: colegioId, numero_colegiado: numero || null };
}

/** Traduce errores de validación y de índices únicos (carrera entre dos guardados) a respuestas HTTP */
function responderErrorValidacion(res, error) {
  if (error instanceof ValidationError) {
    return res.status(error.status).json({ success: false, field: error.field, error: error.message });
  }
  if (error?.code === 'ER_DUP_ENTRY') {
    const msg = String(error.sqlMessage || error.message || '');
    if (msg.includes('uk_codigo_expediente')) {
      return res.status(409).json({ success: false, field: 'codigo_expediente', error: 'El código de expediente ya está asignado a otro empleado' });
    }
    if (msg.includes('uk_colegio_numero')) {
      return res.status(409).json({ success: false, field: 'numero_colegiado', error: 'El número de colegiado ya está registrado en ese colegio' });
    }
    if (msg.includes('uk_dpi')) {
      return res.status(409).json({ success: false, field: 'dpi', error: 'El DPI ya está registrado' });
    }
    if (msg.includes('numero_empleado')) {
      return res.status(409).json({ success: false, field: 'numero_empleado', error: 'El número de empleado ya existe' });
    }
  }
  return null;
}

// MODELO 
class EmpleadosModel {
    static async getAll() {
      const [rows] = await db.query(`
        SELECT e.id, e.numero_empleado, e.codigo_expediente, e.renglon, e.nombre_completo, e.dpi, e.email,
               e.colegio_id, e.numero_colegiado, c.nombre AS colegio_nombre, c.siglas AS colegio_siglas,
               e.rol_id, e.area_id, e.activo, e.datos_actualizados, e.creado_en, e.actualizado_en
        FROM empleados e
        LEFT JOIN colegios_profesionales c ON c.id = e.colegio_id
        ORDER BY e.nombre_completo ASC
      `);
      return rows;
    }


    static async getById(id) {
      const [rows] = await db.query(`
        SELECT e.id, e.numero_empleado, e.codigo_expediente, e.renglon, e.nombre_completo, e.dpi, e.email,
               e.colegio_id, e.numero_colegiado, c.nombre AS colegio_nombre, c.siglas AS colegio_siglas,
               e.rol_id, e.area_id, e.activo, e.datos_actualizados, e.creado_en, e.actualizado_en
        FROM empleados e
        LEFT JOIN colegios_profesionales c ON c.id = e.colegio_id
        WHERE e.id = ?
      `, [id]);
      return rows.length ? rows[0] : null;
    }


    static async getByNumeroEmpleado(numero_empleado) {
      const [rows] = await db.query(`SELECT id FROM empleados WHERE numero_empleado = ?`, [numero_empleado]);
      return rows.length ? rows[0] : null;
    }

    static async getByDpi(dpi) {
      if (!dpi) return null;
      const [rows] = await db.query(`SELECT id FROM empleados WHERE dpi = ?`, [dpi]);
      return rows.length ? rows[0] : null;
    }

    static async getByEmail(email) {
      if (!email) return null;
      const [rows] = await db.query(`SELECT id FROM empleados WHERE email = ?`, [email]);
      return rows.length ? rows[0] : null;
    }

    static async getByCodigoExpediente(codigo) {
      if (!codigo) return null;
      const [rows] = await db.query(`SELECT id, nombre_completo FROM empleados WHERE codigo_expediente = ?`, [codigo]);
      return rows.length ? rows[0] : null;
    }

    static async getByColegiado(colegio_id, numero_colegiado) {
      if (!colegio_id || !numero_colegiado) return null;
      const [rows] = await db.query(
        `SELECT id, nombre_completo FROM empleados WHERE colegio_id = ? AND numero_colegiado = ?`,
        [colegio_id, numero_colegiado]
      );
      return rows.length ? rows[0] : null;
    }

    static async getColegio(id) {
      const [rows] = await db.query(`SELECT id, nombre, siglas, activo FROM colegios_profesionales WHERE id = ?`, [id]);
      return rows.length ? rows[0] : null;
    }

    static async getColegios() {
      const [rows] = await db.query(`
        SELECT id, nombre, siglas FROM colegios_profesionales WHERE activo = 1 ORDER BY nombre ASC
      `);
      return rows;
    }

  static async create({ numero_empleado, codigo_expediente = null, renglon, nombre_completo, dpi, email, colegio_id = null, numero_colegiado = null, rol_id, area_id, activo = 1, datos_actualizados = 1 }) {
    let normalizedAreaId = (area_id === '' || area_id === undefined || area_id === null || Number.isNaN(Number(area_id)))
      ? null : Number(area_id);
    const normalizedRolId = (rol_id === '' || rol_id === undefined || rol_id === null || Number.isNaN(Number(rol_id)))
      ? null : Number(rol_id);

    const [result] = await db.query(`
      INSERT INTO empleados (numero_empleado, codigo_expediente, renglon, nombre_completo, dpi, email, colegio_id, numero_colegiado, rol_id, area_id, activo, datos_actualizados)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [numero_empleado, codigo_expediente, renglon || null, nombre_completo, dpi || null, email || null, colegio_id, numero_colegiado, normalizedRolId, normalizedAreaId, activo, datos_actualizados ? 1 : 0]);

    return { 
      id: result.insertId, 
      numero_empleado, 
      codigo_expediente,
      renglon, 
      nombre_completo,
      dpi: dpi || null,
      email: email || null,
      colegio_id,
      numero_colegiado,
      rol_id, 
      area_id: normalizedAreaId, 
      activo,
      datos_actualizados: datos_actualizados ? 1 : 0
    };
  }

  static async update(id, { nombre_completo, dpi, email, rol_id, area_id, activo, renglon, datos_actualizados, codigo_expediente, colegio_id, numero_colegiado }) {
    let normalizedAreaId = (area_id === '' || area_id === undefined || area_id === null || Number.isNaN(Number(area_id)))
      ? null : Number(area_id);
    const normalizedRolId = (rol_id === '' || rol_id === undefined || rol_id === null || Number.isNaN(Number(rol_id)))
      ? null : Number(rol_id);

    const [result] = await db.query(`
      UPDATE empleados 
      SET nombre_completo=?, dpi=?, email=?, rol_id=?, area_id=?, activo=?, renglon=?, datos_actualizados=?,
          codigo_expediente=?, colegio_id=?, numero_colegiado=?
      WHERE id=?
    `, [nombre_completo, dpi || null, email || null, normalizedRolId, normalizedAreaId, activo, renglon || null, datos_actualizados ? 1 : 0,
        codigo_expediente, colegio_id, numero_colegiado, id]);

    if (result.affectedRows === 0) throw new Error('Empleado no encontrado');
    return this.getById(id);
  }


    static async softDelete(id) {
      const [result] = await db.query(`UPDATE empleados SET activo=0 WHERE id=?`, [id]);
      if (result.affectedRows === 0) throw new Error('Empleado no encontrado');
      return true;
    }

    static async delete(id) {
      const [result] = await db.query(`DELETE FROM empleados WHERE id=?`, [id]);
      if (result.affectedRows === 0) throw new Error('Empleado no encontrado');
      return true;
    }

    static async getActive() {
      const [rows] = await db.query(`
        SELECT e.id, e.numero_empleado, e.nombre_completo, e.email, e.rol_id, 
              e.area_id, e.activo, e.creado_en, e.actualizado_en,
              at.turno_id, at.fecha_inicio, at.fecha_fin
        FROM empleados e
        LEFT JOIN asignacion_turnos at 
          ON at.empleado_id = e.id 
        AND CURDATE() BETWEEN at.fecha_inicio AND at.fecha_fin
        WHERE fecha_inicio <= ? AND fecha_fin >= ?
        ORDER BY e.nombre_completo ASC
      `);
      return rows;
    }
  }

  //  CONTROLADOR
  class EmpleadosController {
    static async getAllEmpleados(_req, res) {
      try {
        const empleados = await EmpleadosModel.getAll();
        return res.json({ success: true, data: empleados, count: empleados.length });
      } catch (error) {
        return res.status(500).json({ success: false, error: 'Error obteniendo empleados', message: error.message });
      }
    }

    static async getEmpleadosActivos(_req, res) {
      try {
        const empleados = await EmpleadosModel.getActive();
        return res.json({ success: true, data: empleados, count: empleados.length });
      } catch (error) {
        return res.status(500).json({ success: false, error: 'Error obteniendo empleados activos', message: error.message });
      }
    }

    static async getEmpleadoById(req, res) {
      try {
        const { id } = req.params;
        if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID invalido' });
        const empleado = await EmpleadosModel.getById(parseInt(id, 10));
        if (!empleado) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });
        return res.json({ success: true, data: empleado });
      } catch (error) {
        return res.status(500).json({ success: false, error: 'Error obteniendo empleado', message: error.message });
      }
    }

    static async createEmpleado(req, res) {
      try {
        const { numero_empleado, renglon, nombre_completo, dpi, email, rol_id, area_id, activo, datos_actualizados } = req.body;
        const required = [];
        if (!numero_empleado) required.push('numero_empleado');
        if (!nombre_completo) required.push('nombre_completo');
        if (!rol_id) required.push('rol_id');

        if (required.length) {
          return res.status(400).json({ success: false, error: 'Faltan campos requeridos', required });
        }

        if (await EmpleadosModel.getByNumeroEmpleado(numero_empleado)) {
          return res.status(409).json({ success: false, field: 'numero_empleado', error: 'El número de empleado ya existe' });
        }

        // Validar DPI: solo dígitos, exactamente 13 caracteres, único
        if (dpi) {
          if (!/^\d{13}$/.test(dpi)) {
            return res.status(400).json({ success: false, field: 'dpi', error: 'El DPI debe tener exactamente 13 dígitos numéricos' });
          }
          if (await EmpleadosModel.getByDpi(dpi)) {
            return res.status(409).json({ success: false, field: 'dpi', error: 'El DPI ya está registrado' });
          }
        }

        if (email) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            return res.status(400).json({ success: false, field: 'email', error: 'Correo inválido' });
          }
          if (await EmpleadosModel.getByEmail(email)) {
            return res.status(409).json({ success: false, field: 'email', error: 'El correo ya existe' });
          }
        }

        const extra = await validarExpedienteYColegiado(req.body);

        const nuevo = await EmpleadosModel.create({
          numero_empleado,
          ...extra,
          renglon,
          nombre_completo,
          dpi: dpi || null,
          email: email || null,
          rol_id: rol_id != null && !isNaN(parseInt(rol_id, 10)) ? parseInt(rol_id, 10) : null,
          area_id,
          activo: activo !== undefined ? Boolean(activo) : true,
          datos_actualizados: datos_actualizados !== undefined ? Boolean(datos_actualizados) : true,
        });

        await audit({ evento: 'CREATE', entidad: 'empleados', entidad_id: nuevo.id, antes: null, despues: nuevo, req });
        return res.status(201).json({ success: true, message: 'Empleado creado', data: nuevo });
      } catch (error) {
        if (responderErrorValidacion(res, error)) return;
        return res.status(500).json({ success: false, error: 'Error creando empleado', message: error.message });
      }
    }

    static async updateEmpleado(req, res) {
      try {
        const { id } = req.params;
        const { nombre_completo, dpi, email, rol_id, area_id, activo, renglon, datos_actualizados } = req.body;
        if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID invalido' });

        const existente = await EmpleadosModel.getById(parseInt(id, 10));
        if (!existente) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });

        // Validar DPI si se envía y cambió
        if (dpi && dpi !== existente.dpi) {
          if (!/^\d{13}$/.test(dpi)) {
            return res.status(400).json({ success: false, field: 'dpi', error: 'El DPI debe tener exactamente 13 dígitos numéricos' });
          }
          const duplicado = await EmpleadosModel.getByDpi(dpi);
          if (duplicado && duplicado.id !== parseInt(id, 10)) {
            return res.status(409).json({ success: false, field: 'dpi', error: 'El DPI ya está registrado' });
          }
        }

        if (email && email !== existente.email) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            return res.status(400).json({ success: false, field: 'email', error: 'Correo inválido' });
          }
          const duplicado = await EmpleadosModel.getByEmail(email);
          if (duplicado && duplicado.id !== parseInt(id, 10)) {
            return res.status(409).json({ success: false, field: 'email', error: 'El correo ya existe' });
          }
        }

        const extra = await validarExpedienteYColegiado(req.body, parseInt(id, 10), existente);

        const actualizado = await EmpleadosModel.update(parseInt(id, 10), {
          ...extra,
          nombre_completo,
          dpi: dpi || null,
          email: email || null,
          rol_id: rol_id != null && !isNaN(parseInt(rol_id, 10)) ? parseInt(rol_id, 10) : null,
          area_id,
          activo: activo !== undefined ? Boolean(activo) : existente.activo,
          renglon,
          datos_actualizados: datos_actualizados !== undefined ? Boolean(datos_actualizados) : existente.datos_actualizados
        });

        await audit({ evento: 'UPDATE', entidad: 'empleados', entidad_id: parseInt(id, 10), antes: existente, despues: actualizado, req });
        return res.json({ success: true, message: 'Empleado actualizado', data: actualizado });
      } catch (error) {
        if (responderErrorValidacion(res, error)) return;
        return res.status(500).json({ success: false, error: 'Error actualizando empleado', message: error.message });
      }
    }

    static async deactivateEmpleado(req, res) {
      try {
        const { id } = req.params;
        if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });

        const antes = await EmpleadosModel.getById(parseInt(id, 10));
        if (!antes) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });

        await EmpleadosModel.softDelete(parseInt(id, 10));
        await audit({ evento: 'UPDATE', entidad: 'empleados', entidad_id: parseInt(id, 10), antes, despues: { ...antes, activo: 0 }, req });
        return res.json({ success: true, message: 'Empleado desactivado' });
      } catch (error) {
        return res.status(500).json({ success: false, error: 'Error desactivando empleado', message: error.message });
      }
    }

    static async activateEmpleado(req, res) {
      try {
        const { id } = req.params;
        if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });

        const antes = await EmpleadosModel.getById(parseInt(id, 10));
        if (!antes) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });

        await db.query(`UPDATE empleados SET activo = 1 WHERE id = ?`, [id]);
        await audit({
          evento: 'UPDATE',
          entidad: 'empleados',
          entidad_id: parseInt(id, 10),
          antes,
          despues: { ...antes, activo: 1 },
          req
        });

        return res.json({ success: true, message: 'Empleado activado correctamente' });
      } catch (error) {
        return res.status(500).json({ success: false, error: 'Error activando empleado', message: error.message });
      }
    }


    static async deleteEmpleado(req, res) {
      try {
        const { id } = req.params;
        if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido' });

        const antes = await EmpleadosModel.getById(parseInt(id, 10));
        if (!antes) return res.status(404).json({ success: false, error: 'Empleado no encontrado' });

        await EmpleadosModel.delete(parseInt(id, 10));
        await audit({ evento: 'DELETE', entidad: 'empleados', entidad_id: parseInt(id, 10), antes, despues: null, req });
        return res.json({ success: true, message: 'Empleado eliminado permanentemente' });
      } catch (error) {
        return res.status(500).json({ success: false, error: 'Error eliminando empleado', message: error.message });
      }
    }
  }

  router.get('/asignados', async (req, res) => {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ success: false, error: "Faltan fechas desde/hasta" });
    }

    try {
      const [rows] = await db.query(`
        SELECT e.id, e.nombre_completo, e.rol_id, e.area_id, 
              a.turno_id, a.fecha_inicio, a.fecha_fin
        FROM empleados e
        JOIN asignacion_turnos a ON a.empleado_id = e.id
        WHERE a.fecha_inicio <= ? AND a.fecha_fin >= ?
        ORDER BY e.nombre_completo ASC
      `, [desde, hasta]);
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post('/importar-biometrico', async (_req, res) => {
    try {
      const users = await biometricSvc.getUserNames();
      const importados = [];
      
      for (const u of users) {
        // Verificamos si ya existe en DB
        const existente = await EmpleadosModel.getByNumeroEmpleado(u.employeeNo);
        if (!existente) {
          const nuevo = await EmpleadosModel.create({
            numero_empleado: u.employeeNo,
            nombre_completo: u.name,
            email: null,
            rol_id: null,
            area_id: null,
            activo: 1
          });
          importados.push(nuevo);
        }
      }
      
      res.json({ success: true, importados, count: importados.length });
    } catch (err) {
      console.error("Error importando empleados:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  //  RUTA DISPONIBLES 
  router.get('/disponibles', async (req, res) => {
    try {
      const { desde, hasta, area_id, rol } = req.query;
      if (!desde || !hasta) {
        return res.status(400).json({ success: false, error: "Parámetros requeridos: desde, hasta" });
      }

      let sql = `
        SELECT e.id, e.numero_empleado, e.nombre_completo, e.rol_id, e.area_id
        FROM empleados e
        WHERE e.activo=1
          AND e.id NOT IN (
            SELECT empleado_id
            FROM asignacion_turnos
            WHERE fecha_inicio <= ? AND fecha_fin >= ?
          )
      `;
      const params = [desde, hasta];
      if (area_id) { sql += " AND e.area_id=?"; params.push(area_id); }
      if (rol) { sql += " AND e.rol_id IN (SELECT id FROM roles_empleado WHERE LOWER(nombre_rol) LIKE ?)"; params.push(`%${rol.toLowerCase()}%`); }
      sql += " ORDER BY e.nombre_completo ASC";

      const [rows] = await db.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (e) {
      res.status(500).json({ success: false, error: "Error consultando empleados disponibles", message: e.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { area_id } = req.body;

    try {
      const areaIdValue = area_id === '' || area_id === undefined ? null : area_id;
      const [result] = await db.query(
        `UPDATE empleados SET area_id = ? WHERE id = ?`,
        [areaIdValue, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Empleado no encontrado' });
      }

      const [rows] = await db.query(
        `SELECT id, numero_empleado, nombre_completo, email, rol_id, area_id, activo 
        FROM empleados WHERE id = ?`,
        [id]
      );

      res.json({ 
        success: true, 
        message: 'Área actualizada correctamente',
        data: rows[0]
      });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error actualizando área', error: err.message });
    }
  });
  
    function showToast(type, message) {
    // Puedes usar cualquier librería como Toastr, PrimeNG o Angular Material.
    switch (type) {
      case 'success':
        (' Éxito:', message);
        alert(' ' + message);
        break;
      case 'error':
        console.error(' Error:', message);
        alert(' ' + message);
        break;
      case 'info':
      default:
        console.info('ℹInfo:', message);
        alert('ℹ ' + message);
        break;
    }






  }

  // Liberar empleados cuyo turno expiró
  router.post('/liberar-expirados', async (_req, res) => {
    try {
      // Obtener empleados con asignaciones expiradas
      const [expirados] = await db.query(`
        SELECT e.id 
        FROM empleados e
        JOIN asignacion_turnos a ON a.empleado_id = e.id
        WHERE a.fecha_fin < CURDATE()
      `);

      if (expirados.length === 0) {
        return res.json({ success: true, message: 'No hay empleados por liberar' });
      }

      // Liberar (area_id -> NULL)
      const ids = expirados.map(e => e.id);
      await db.query(`UPDATE empleados SET area_id = NULL WHERE id IN (?)`, [ids]);

      res.json({ success: true, message: 'Empleados liberados', liberados: ids.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

    // Ruta para ejecutar manualmente la sincronización de empleados desde biométricos
  router.post('/sync-biometric', requireAuth, async (req, res) => {

    try {
      const scriptPath = path.join(__dirname, '../scripts/sync_biometric_users.js');
      
      // Ejecutar el script
      exec(`node "${scriptPath}"`, { 
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, NODE_PATH: '.' }
      }, (error, stdout, stderr) => {
        if (error) {
          console.error('Error ejecutando sync_biometric_users:', error);
          return res.status(500).json({ 
            success: false, 
            message: 'Error ejecutando la sincronización',
            error: error.message 
          });
        }
        
        if (stderr) {
          console.warn('Advertencias en sincronización:', stderr);
        }

        // Contar empleados recién insertados (opcional)
        db.query(`
          SELECT COUNT(*) as total 
          FROM empleados 
          WHERE DATE(creado_en) = CURDATE()
        `).then(([rows]) => {
          const totalEmpleados = rows[0]?.total || 0;
          
          res.json({ 
            success: true, 
            message: 'Sincronización de empleados completada correctamente',
            totalEmpleados: totalEmpleados,
            output: stdout
          });
        }).catch(countError => {
          console.error('Error contando empleados:', countError);
          res.json({ 
            success: true, 
            message: 'Sincronización completada (error contando empleados)',
            output: stdout
          });
        });
      });

    } catch (err) {
      console.error('Error en ruta de sincronización de empleados:', err);
      res.status(500).json({ 
        success: false, 
        message: 'Error interno del servidor',
        error: err.message 
      });
    }
  });

  //  CATÁLOGO DE COLEGIOS (antes de '/:id')
  router.get('/catalogos/colegios', async (_req, res) => {
    try {
      const colegios = await EmpleadosModel.getColegios();
      res.json({ success: true, data: colegios, count: colegios.length });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Error obteniendo colegios', message: err.message });
    }
  });

  //  RUTAS CRUD
  router.get('/', EmpleadosController.getAllEmpleados);
  router.get('/activos', EmpleadosController.getEmpleadosActivos);
  router.get('/:id', EmpleadosController.getEmpleadoById);
  router.post('/', EmpleadosController.createEmpleado);
  router.put('/:id', EmpleadosController.updateEmpleado);
  router.delete('/:id', EmpleadosController.deactivateEmpleado);
  router.delete('/:id/permanent', EmpleadosController.deleteEmpleado);
  router.patch('/:id/activate', EmpleadosController.activateEmpleado);
  module.exports = router;