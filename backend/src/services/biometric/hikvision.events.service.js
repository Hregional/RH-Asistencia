import xml2js from 'xml2js';
import { makeClient } from './hikvision.client.cjs';
import db from '../../db.js';

// Construye config de dispositivos
function buildConfig(prefix) {
  return {
    host: process.env[`${prefix}_HOST`],
    port: process.env[`${prefix}_PORT`] || '80',
    user: process.env[`${prefix}_USER`],
    pass: process.env[`${prefix}_PASS`],
    proto: process.env[`${prefix}_PROTOCOL`] || 'http'
  };
}

const devices = [buildConfig('HIK1'), buildConfig('HIK2')].filter(d => d.host);

// Formato de fecha para el dispositivo Hikvision (Guatemala UTC-6)
function toHikTime(d) {
  const iso = d.toISOString().split('.')[0];
  return iso + '-06:00';
}

// Extraer eventos de marcaje (entradas y salidas) — últimas 24 horas con paginación
export async function syncEventosDesdeBiometricos() {
  let totalEventos = 0;

  // Rango dinámico: últimas 24 horas
  const ahora = new Date();
  const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);

  for (const dev of devices) {
    try {
      const client = makeClient({
        baseUrl: `${dev.proto}://${dev.host}:${dev.port}`,
        user: dev.user,
        pass: dev.pass
      });

      // Paginación para no perder eventos
      let position = 0;
      let more = true;
      let intento = 1;
      const todosEventos = [];

      while (more) {
        const body = {
          AcsEventCond: {
            searchID: `sync_${Date.now()}_${intento}`,
            maxResults: 100,
            searchResultPosition: position,
            major: 0,
            minor: 0,
            startTime: toHikTime(hace24h),
            endTime: toHikTime(ahora)
          }
        };

        let data;
        try {
          data = await client.post(`/ISAPI/AccessControl/AcsEvent?format=json`, body);
        } catch (jsonErr) {
          // Fallback XML sin rango de fechas (compatibilidad)
          const xmlBody = `
            <AcsEventCond>
              <searchID>${intento}</searchID>
              <maxResults>100</maxResults>
              <searchResultPosition>${position}</searchResultPosition>
            </AcsEventCond>
          `;
          const xmlResp = await client.post(`/ISAPI/AccessControl/AcsEvent`, xmlBody, {
            headers: { 'Content-Type': 'application/xml' }
          });
          data = await xml2js.parseStringPromise(xmlResp, { explicitArray: false });
        }

        const lista = data?.AcsEvent?.InfoList || data?.AcsEventNotificationList || [];
        const status = data?.AcsEvent?.responseStatusStrg || '';
        const arr = Array.isArray(lista) ? lista : (lista ? [lista] : []);

        todosEventos.push(...arr);

        if (status !== 'MORE' || arr.length === 0) {
          more = false;
        } else {
          position += arr.length;
          intento++;
        }

        await new Promise(r => setTimeout(r, 200));
      }

      // Procesar y guardar en la BD
      for (const ev of todosEventos) {
        const empNo = ev?.EmployeeNoString || ev?.employeeNoString || ev?.employeeNo || ev?.EmployeeNo || null;
        const fechaHora = ev?.dateTime || ev?.time || null;
        if (!empNo || !fechaHora) continue;

        const fecha = fechaHora.split('T')[0];
        const hora = new Date(fechaHora);

        // Buscar el empleado en la BD
        const [rows] = await db.query('SELECT id FROM empleados WHERE numero_empleado = ?', [empNo]);
        if (!rows.length) continue;

        const empleado_id = rows[0].id;

        // Buscar turno actual del empleado
        const [[turno]] = await db.query(`
          SELECT t.id, t.hora_inicio, t.hora_fin
          FROM asignacion_turnos a
          INNER JOIN turnos t ON t.id = a.turno_id
          WHERE a.empleado_id = ? AND ? BETWEEN a.fecha_inicio AND a.fecha_fin
          LIMIT 1
        `, [empleado_id, fecha]);

        if (!turno) continue;

        // Verificar si ya existe registro para esa fecha
        const [[existente]] = await db.query(`
          SELECT id, entrada_real, salida_real FROM asistencias
          WHERE empleado_id = ? AND fecha = ?
        `, [empleado_id, fecha]);

        if (!existente) {
          await db.query(`
            INSERT INTO asistencias (empleado_id, fecha, turno_id, entrada_real, estado)
            VALUES (?, ?, ?, ?, 'INCOMPLETO')
          `, [empleado_id, fecha, turno.id, hora]);
        } else if (!existente.salida_real) {
          await db.query(`
            UPDATE asistencias
            SET salida_real = ?, estado = 'COMPLETO'
            WHERE id = ?
          `, [hora, existente.id]);
        }
      }

      totalEventos += todosEventos.length;
    } catch (err) {
      console.error(`Error procesando ${dev.host}:`, err.message);
    }
  }

  return { success: true, total: totalEventos };
}
