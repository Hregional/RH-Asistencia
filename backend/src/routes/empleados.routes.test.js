import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

process.env.KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || 'http://localhost/test';
process.env.KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'test';

const require = createRequire(import.meta.url);
const dbQuery = vi.fn();
const auditMock = vi.fn();
const requireAuthMock = vi.fn((_req, _res, next) => next());
const requireAnyRoleMock = vi.fn(() => (_req, _res, next) => next());

const dbPath = require.resolve('../db.js');
const auditPath = require.resolve('../utils/audit.js');
const authPath = require.resolve('../middlewares/auth.js');

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: dbQuery } };
require.cache[auditPath] = { id: auditPath, filename: auditPath, loaded: true, exports: { audit: auditMock } };
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireAuth: requireAuthMock, requireAnyRole: requireAnyRoleMock } };

const COLEGIOS = [
    { id: 1, nombre: 'Colegio de Médicos y Cirujanos de Guatemala', siglas: 'Médicos', activo: 1 },
    { id: 2, nombre: 'Colegio de Profesionales de Enfermería de Guatemala', siglas: 'Enfermería', activo: 1 },
    { id: 3, nombre: 'Colegio Inactivo', siglas: 'Inactivo', activo: 0 },
];

/** BD en memoria: responde según el SQL que ejecuta empleados.routes.js */
let empleados;
let nextId;

function fakeQuery(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q.startsWith('SELECT id, nombre, siglas, activo FROM colegios_profesionales')) {
        return [COLEGIOS.filter(c => c.id === params[0])];
    }
    if (q.startsWith('SELECT id, nombre, siglas FROM colegios_profesionales')) {
        return [COLEGIOS.filter(c => c.activo)];
    }
    if (q.includes('WHERE numero_empleado = ?')) return [empleados.filter(e => e.numero_empleado === params[0])];
    if (q.includes('WHERE dpi = ?')) return [empleados.filter(e => e.dpi === params[0])];
    if (q.includes('WHERE email = ?')) return [empleados.filter(e => e.email === params[0])];
    if (q.includes('WHERE codigo_expediente = ?')) return [empleados.filter(e => e.codigo_expediente === params[0])];
    if (q.includes('WHERE colegio_id = ? AND numero_colegiado = ?')) {
        return [empleados.filter(e => e.colegio_id === params[0] && e.numero_colegiado === params[1])];
    }
    if (q.includes('WHERE e.id = ?')) return [empleados.filter(e => e.id === params[0])];
    if (q.startsWith('INSERT INTO empleados')) {
        const [numero_empleado, codigo_expediente, renglon, nombre_completo, dpi, email, colegio_id, numero_colegiado] = params;
        const id = nextId++;
        empleados.push({ id, numero_empleado, codigo_expediente, renglon, nombre_completo, dpi, email, colegio_id, numero_colegiado, activo: 1, datos_actualizados: 1 });
        return [{ insertId: id }];
    }
    if (q.startsWith('UPDATE empleados SET nombre_completo')) {
        const id = params[params.length - 1];
        const emp = empleados.find(e => e.id === id);
        if (!emp) return [{ affectedRows: 0 }];
        const [nombre_completo, dpi, email] = params;
        const [codigo_expediente, colegio_id, numero_colegiado] = params.slice(8, 11);
        Object.assign(emp, { nombre_completo, dpi, email, codigo_expediente, colegio_id, numero_colegiado });
        return [{ affectedRows: 1 }];
    }
    throw new Error('SQL no esperado en el test: ' + q);
}

async function createApp() {
    delete require.cache[require.resolve('./empleados.routes.js')];
    const router = require('./empleados.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/empleados', router);
    return app;
}

const base = { renglon: '011', rol_id: 1 };

describe('empleados routes — código de expediente y colegiado', () => {
    beforeEach(() => {
        empleados = [];
        nextId = 1;
        dbQuery.mockReset();
        dbQuery.mockImplementation(async (sql, params) => fakeQuery(sql, params));
        auditMock.mockReset();
    });

    it('permite el mismo número de colegiado en colegios distintos', async () => {
        const app = await createApp();

        const a = await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '1', nombre_completo: 'Ana Médica', colegio_id: 1, numero_colegiado: '100' });
        const b = await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '2', nombre_completo: 'Beto Enfermero', colegio_id: 2, numero_colegiado: '100' });

        expect(a.status).toBe(201);
        expect(b.status).toBe(201);
        expect(empleados.map(e => [e.colegio_id, e.numero_colegiado])).toEqual([[1, '100'], [2, '100']]);
    });

    it('rechaza el mismo colegio + número e indica a quién pertenece', async () => {
        const app = await createApp();
        await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '1', nombre_completo: 'Ana Médica', colegio_id: 1, numero_colegiado: '100' });

        const res = await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '2', nombre_completo: 'Carlos', colegio_id: '1', numero_colegiado: ' 100 ' });

        expect(res.status).toBe(409);
        expect(res.body.field).toBe('numero_colegiado');
        expect(res.body.error).toContain('Ana Médica');
        expect(empleados).toHaveLength(1);
    });

    it('exige colegio y número juntos', async () => {
        const app = await createApp();

        const sinColegio = await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '1', nombre_completo: 'Ana', numero_colegiado: '100' });
        const sinNumero = await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '2', nombre_completo: 'Beto', colegio_id: 1, numero_colegiado: '' });
        const noNumerico = await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '3', nombre_completo: 'Caro', colegio_id: 1, numero_colegiado: 'A-1' });
        const inactivo = await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '4', nombre_completo: 'Dani', colegio_id: 3, numero_colegiado: '5' });

        expect([sinColegio.status, sinColegio.body.field]).toEqual([400, 'colegio_id']);
        expect([sinNumero.status, sinNumero.body.field]).toEqual([400, 'numero_colegiado']);
        expect([noNumerico.status, noNumerico.body.field]).toEqual([400, 'numero_colegiado']);
        expect([inactivo.status, inactivo.body.field]).toEqual([400, 'colegio_id']);
        expect(empleados).toHaveLength(0);
    });

    it('normaliza el código de expediente y rechaza duplicados', async () => {
        const app = await createApp();

        const a = await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '1', nombre_completo: 'Ana', codigo_expediente: ' exp-001 ' });
        const dup = await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '2', nombre_completo: 'Beto', codigo_expediente: 'EXP-001' });
        const invalido = await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '3', nombre_completo: 'Caro', codigo_expediente: 'EXP 001' });

        expect(a.status).toBe(201);
        expect(empleados[0].codigo_expediente).toBe('EXP-001');
        expect([dup.status, dup.body.field]).toEqual([409, 'codigo_expediente']);
        expect(dup.body.error).toContain('Ana');
        expect([invalido.status, invalido.body.field]).toEqual([400, 'codigo_expediente']);
    });

    it('al editar conserva su propio código y colegiado sin marcarlos como duplicados', async () => {
        const app = await createApp();
        await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '1', nombre_completo: 'Ana', codigo_expediente: 'EXP-1', colegio_id: 1, numero_colegiado: '100' });

        const mismo = await request(app).put('/empleados/1')
            .send({ ...base, nombre_completo: 'Ana María', codigo_expediente: 'EXP-1', colegio_id: 1, numero_colegiado: '100' });
        const sinCampos = await request(app).put('/empleados/1')
            .send({ ...base, nombre_completo: 'Ana María López' });

        expect(mismo.status).toBe(200);
        expect(sinCampos.status).toBe(200);
        expect(empleados[0]).toMatchObject({ nombre_completo: 'Ana María López', codigo_expediente: 'EXP-1', colegio_id: 1, numero_colegiado: '100' });
    });

    it('al editar rechaza tomar el colegiado de otro empleado y permite quitarlo', async () => {
        const app = await createApp();
        await request(app).post('/empleados').send({ ...base, numero_empleado: '1', nombre_completo: 'Ana', colegio_id: 1, numero_colegiado: '100' });
        await request(app).post('/empleados').send({ ...base, numero_empleado: '2', nombre_completo: 'Beto' });

        const robo = await request(app).put('/empleados/2').send({ ...base, nombre_completo: 'Beto', colegio_id: 1, numero_colegiado: '100' });
        const quitar = await request(app).put('/empleados/1').send({ ...base, nombre_completo: 'Ana', colegio_id: null, numero_colegiado: '' });

        expect([robo.status, robo.body.field]).toEqual([409, 'numero_colegiado']);
        expect(quitar.status).toBe(200);
        expect(empleados[0]).toMatchObject({ colegio_id: null, numero_colegiado: null });
    });

    it('traduce ER_DUP_ENTRY del índice único (carrera) a 409', async () => {
        dbQuery.mockImplementation(async (sql, params) => {
            if (sql.includes('INSERT INTO empleados')) {
                throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry '1-100' for key 'uk_colegio_numero'" });
            }
            return fakeQuery(sql, params);
        });
        const app = await createApp();

        const res = await request(app).post('/empleados')
            .send({ ...base, numero_empleado: '1', nombre_completo: 'Ana', colegio_id: 1, numero_colegiado: '100' });

        expect([res.status, res.body.field]).toEqual([409, 'numero_colegiado']);
    });

    it('lista solo los colegios activos', async () => {
        const app = await createApp();
        const res = await request(app).get('/empleados/catalogos/colegios');
        expect(res.status).toBe(200);
        expect(res.body.data.map(c => c.id)).toEqual([1, 2]);
    });
});
