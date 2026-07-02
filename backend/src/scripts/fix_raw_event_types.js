require('dotenv').config();
const db = require('../db');

async function fixEventTypes(startDate, endDate) {
    console.log(`Fixing event types from ${startDate} to ${endDate}...`);

    try {
        // 1. Get all events in range
        const [events] = await db.query(`
      SELECT * FROM registros_asistencia 
      WHERE DATE(fecha_hora) BETWEEN ? AND ?
      ORDER BY fecha_hora ASC
    `, [startDate, endDate]);

        console.log(`Found ${events.length} events.`);

        // 2. Group by employee
        const eventsByEmp = {};
        for (const ev of events) {
            if (!eventsByEmp[ev.empleado_id]) eventsByEmp[ev.empleado_id] = [];
            eventsByEmp[ev.empleado_id].push(ev);
        }

        let updatedCount = 0;

        // 3. Apply Toggle Logic
        for (const empId in eventsByEmp) {
            const empEvents = eventsByEmp[empId];
            // Sort chronologically (already sorted by query, but good to be safe)
            empEvents.sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));

            for (let i = 0; i < empEvents.length; i++) {
                const ev = empEvents[i];
                const expectedType = (i % 2 === 0) ? 'ENTRADA' : 'SALIDA';

                if (ev.tipo_evento !== expectedType) {
                    await db.query(`
            UPDATE registros_asistencia 
            SET tipo_evento = ?, procesado = 0 
            WHERE id = ?
          `, [expectedType, ev.id]);
                    updatedCount++;
                }
            }
        }

        console.log(`Fixed ${updatedCount} records.`);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

const start = process.argv[2] || '2025-12-01';
const end = process.argv[3] || '2025-12-02';

fixEventTypes(start, end);
