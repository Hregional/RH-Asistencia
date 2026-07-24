const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const db = require('../db.js');
const { requireAuth, requireAnyRole } = require('../middlewares/auth.js');
const { procesarAsistenciaDia } = require('../services/asistencia.service.js');

const router = express.Router();
const requireSuperadmin = requireAnyRole('superadmin');

// ── GET /api/retroactivo/status ──────────────────────────────────────
// Devuelve info útil: último registro de asistencia procesado, total eventos sin procesar, etc.
router.get('/status', requireAuth, requireSuperadmin, async (_req, res) => {
  try {
    const [[{ ultimaAsistencia }]] = await db.query(`
      SELECT MAX(fecha) AS ultimaAsistencia FROM asistencias
    `);

    const [[{ eventosSinProcesar }]] = await db.query(`
      SELECT COUNT(*) AS eventosSinProcesar
      FROM registros_asistencia
      WHERE procesado = 0
    `);

    const [[{ totalEventos }]] = await db.query(`
      SELECT COUNT(*) AS totalEventos FROM registros_asistencia
    `);

    const [[{ primerEvento }]] = await db.query(`
      SELECT MIN(DATE(fecha_hora)) AS primerEvento FROM registros_asistencia
    `);

    res.json({
      success: true,
      data: {
        ultimaAsistencia,
        eventosSinProcesar,
        totalEventos,
        primerEvento
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/retroactivo/reprocesar-asistencia ──────────────────────
// Re-procesa asistencia para un rango de fechas usando los eventos ya en BD
router.post('/reprocesar-asistencia', requireAuth, requireSuperadmin, async (req, res) => {
  const { desde, hasta } = req.body;

  if (!desde || !hasta) {
    return res.status(400).json({ success: false, error: 'Se requieren campos desde y hasta (YYYY-MM-DD)' });
  }

  const start = new Date(desde);
  const end   = new Date(hasta);

  if (isNaN(start) || isNaN(end) || start > end) {
    return res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
  }

  const diffDias = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDias > 90) {
    return res.status(400).json({ success: false, error: 'El rango máximo es 90 días por operación' });
  }

  try {
    let diasProcesados = 0;
    let errores = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      try {
        await procesarAsistenciaDia(dateStr);
        diasProcesados++;
      } catch (err) {
        errores.push({ fecha: dateStr, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Reprocesamiento completado: ${diasProcesados} días procesados`,
      diasProcesados,
      errores: errores.length > 0 ? errores : undefined
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/retroactivo/sincronizar-historico ──────────────────────
// Re-jala eventos del biométrico para fechas pasadas Y re-procesa asistencia
router.post('/sincronizar-historico', requireAuth, requireSuperadmin, async (req, res) => {
  const { desde, hasta } = req.body;

  if (!desde || !hasta) {
    return res.status(400).json({ success: false, error: 'Se requieren campos desde y hasta (YYYY-MM-DD)' });
  }

  const start = new Date(desde);
  const end   = new Date(hasta);

  if (isNaN(start) || isNaN(end) || start > end) {
    return res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
  }

  const diffDias = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDias > 31) {
    return res.status(400).json({ success: false, error: 'El rango máximo para sincronización histórica es 31 días' });
  }

  try {
    const { syncHistoricalBiometricLogs } = require('../scripts/sync_biometric_logs_historical.js');
    const resultado = await syncHistoricalBiometricLogs(desde, hasta);

    res.json({
      success: resultado.success,
      message: resultado.message,
      eventos: resultado.eventos,
      duplicados: resultado.duplicados,
      asistencias: resultado.asistencias
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
