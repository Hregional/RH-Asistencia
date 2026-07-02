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
const ensureActorMock = vi.fn((_req, _res, next) => next());

const dbPath = require.resolve('../db.js');
const auditPath = require.resolve('../utils/audit.js');
const authPath = require.resolve('../middlewares/auth.js');
const actorPath = require.resolve('../middlewares/actor.js');

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: dbQuery } };
require.cache[auditPath] = { id: auditPath, filename: auditPath, loaded: true, exports: { audit: auditMock } };
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireAuth: requireAuthMock } };
require.cache[actorPath] = { id: actorPath, filename: actorPath, loaded: true, exports: { ensureActor: ensureActorMock } };

async function createApp() {
    delete require.cache[require.resolve('./permisos.routes.js')];
    const permisosRouter = require('./permisos.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/permisos', permisosRouter);
    return app;
}

describe('permisos routes', () => {
    beforeEach(() => {
        dbQuery.mockReset();
        auditMock.mockReset();
        requireAuthMock.mockClear();
        ensureActorMock.mockClear();
    });

    it('rechaza la creación de tipos de permiso sin campos requeridos', async () => {
        const app = await createApp();

        const response = await request(app)
            .post('/permisos/tipos')
            .send({ nombre: 'Permiso especial' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            success: false,
            error: 'Faltan campos requeridos'
        });
        expect(dbQuery).not.toHaveBeenCalled();
        expect(auditMock).not.toHaveBeenCalled();
    });

    it('rechaza nombres duplicados al crear tipos de permiso', async () => {
        dbQuery.mockResolvedValueOnce([[{ id: 1 }]]);
        const app = await createApp();

        const response = await request(app)
            .post('/permisos/tipos')
            .send({ nombre: 'Vacaciones', dias_permitidos: 1, mensaje_carta: '' });

        expect(response.status).toBe(409);
        expect(response.body.error).toContain('Ya existe un tipo de permiso');
        expect(auditMock).not.toHaveBeenCalled();
    });

    it('bloquea cambios de nombre para el tipo Vacaciones', async () => {
        dbQuery.mockResolvedValueOnce([[{ id: 1, nombre: 'Vacaciones' }]]);
        const app = await createApp();

        const response = await request(app)
            .put('/permisos/tipos/1')
            .send({ nombre: 'Descanso', dias_permitidos: 1, mensaje_carta: '' });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('El tipo "Vacaciones" no puede cambiar de nombre.');
        expect(dbQuery).toHaveBeenCalledTimes(1);
        expect(auditMock).not.toHaveBeenCalled();
    });

    it('valida estados inválidos al actualizar permisos', async () => {
        const app = await createApp();

        const response = await request(app)
            .patch('/permisos/123/estado')
            .send({ estado: 'APROBADO' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            success: false,
            error: 'Estado inválido'
        });
        expect(dbQuery).not.toHaveBeenCalled();
    });

    it('bloquea autorizaciones traslapadas', async () => {
        dbQuery
            .mockResolvedValueOnce([[{
                id: 123,
                empleado_id: 7,
                fecha_inicio: '2026-07-01',
                fecha_fin: '2026-07-05',
                fecha_fin_extendida: null
            }]])
            .mockResolvedValueOnce([[{ id: 999 }]]);

        const app = await createApp();

        const response = await request(app)
            .patch('/permisos/123/estado')
            .send({ estado: 'AUTORIZADO' });

        expect(response.status).toBe(409);
        expect(response.body.error).toContain('se traslapa');
        expect(auditMock).not.toHaveBeenCalled();
    });
});