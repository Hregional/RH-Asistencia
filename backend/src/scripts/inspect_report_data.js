require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    const dbConfig = {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT),
    };

    let conn;
    try {
        conn = await mysql.createConnection({ ...dbConfig });
        const [dbs] = await conn.query('SHOW DATABASES');

        let targetDb = process.env.DB_NAME;
        let foundDb = dbs.find(d => d.Database.toLowerCase() === targetDb.toLowerCase());

        if (!foundDb) {
            console.error(`Database ${targetDb} not found!`);
            process.exit(1);
        }

        console.log(`Connecting to ${foundDb.Database}...`);
        await conn.changeUser({ database: foundDb.Database });

        // IDs from user report: Area 6 (Vigilancia), Employees 694, 714
        const areaId = 6;
        const empIds = [694, 714];

        console.log(`\n--- Inspecting Employees ${empIds.join(',')} ---`);
        const [emps] = await conn.query(`
        SELECT id, nombre_completo, area_id, activo, eliminado_en 
        FROM empleados 
        WHERE id IN (?)
    `, [empIds]);
        console.table(emps);

        console.log(`\n--- Inspecting Area ${areaId} ---`);
        const [area] = await conn.query(`SELECT * FROM areas WHERE id = ?`, [areaId]);
        console.table(area);

        console.log(`\n--- Inspecting Assignments for Employees ---`);
        const [asigs] = await conn.query(`
        SELECT at.id, at.empleado_id, at.turno_id, at.eliminado_en, t.nombre_turno, t.tipo_turno
        FROM asignacion_turnos at
        JOIN turnos t ON at.turno_id = t.id
        WHERE at.empleado_id IN (?)
    `, [empIds]);
        console.table(asigs);

        console.log(`\n--- Testing Report Query Logic ---`);
        // Replicating the report query logic for these specific employees
        const [reportTest] = await conn.query(`
        SELECT 
          e.id AS emp_id,
          e.area_id AS emp_area_id,
          ar.id AS area_id_joined,
          t.tipo_turno,
          af.eliminado_en AS asig_deleted
        FROM asignacion_turnos af
        JOIN turnos t ON af.turno_id = t.id
        JOIN empleados e ON af.empleado_id = e.id
        JOIN areas ar ON e.area_id = ar.id
        WHERE e.id IN (?)
    `, [empIds]);
        console.table(reportTest);

        await conn.end();
    } catch (err) {
        console.error('Error:', err);
        if (conn) await conn.end();
    }
})();
