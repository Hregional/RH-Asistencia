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
        // 1. Try to connect without DB to list them
        conn = await mysql.createConnection({ ...dbConfig });
        const [dbs] = await conn.query('SHOW DATABASES');
        console.log('Databases found:', dbs.map(d => d.Database).join(', '));

        // 2. Find the correct DB
        let targetDb = process.env.DB_NAME;
        let foundDb = dbs.find(d => d.Database.toLowerCase() === targetDb.toLowerCase());

        if (!foundDb) {
            console.error(`Database ${targetDb} not found!`);
            process.exit(1);
        }

        console.log(`Connecting to ${foundDb.Database}...`);
        await conn.changeUser({ database: foundDb.Database });

        // 3. Inspect schema
        console.log(`Inspeccionando esquema de asignacion_turnos...`);
        const [columns] = await conn.query('DESCRIBE asignacion_turnos');
        console.log('Columnas:', columns.map(c => c.Field).join(', '));

        await conn.end();
    } catch (err) {
        console.error('Error:', err);
        if (conn) await conn.end();
    }
})();
