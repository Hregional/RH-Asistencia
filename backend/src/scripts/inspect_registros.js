require('dotenv').config();
const db = require('../db');

async function inspect() {
    try {
        const start = '2025-12-01';
        const end = '2025-12-02';
        console.log(`Inspecting for dates: ${start} to ${end}`);

        // Check distinct types
        const [types] = await db.query(`
      SELECT DATE(fecha_hora) as fecha, tipo_evento, COUNT(*) as count 
      FROM registros_asistencia
      WHERE DATE(fecha_hora) BETWEEN ? AND ?
      GROUP BY DATE(fecha_hora), tipo_evento
      ORDER BY fecha
    `, [start, end]);

        console.log('Event Types Summary:', JSON.stringify(types, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

inspect();
