require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { requireAuth, requireRRHHorJefe } = require('./src/middlewares/auth.js');
const { testConnectionAll } = require('./src/services/biometric/hikvision.service.js');


const biometricRouter = require('./src/routes/biometric.routes.js');
const healthRouter = require('./src/routes/health.routes.js');
const empleadosRouter = require('./src/routes/empleados.routes.js');
const rolesRoutes = require('./src/routes/roles.routes.js');
const areasRoutes = require('./src/routes/areas.routes.js');
const dashboardRouter = require('./src/routes/dashboard.routes.js');
const turnosRoutes = require('./src/routes/turnos.routes.js');
const asignacionesRoutes = require('./src/routes/asignaciones.routes.js');
const attachActor = require('./src/middlewares/actor.js');
const auditRouter = require('./src/routes/audit.routes.js');
const reportesRouter = require('./src/routes/reportes.routes.js');
const permisosRouter = require('./src/routes/permisos.routes.js');
const biometricPushRoutes = require('./src/routes/biometric.push.routes.js');
require('./src/scripts/scheduler.js');


const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas publicas
app.use('/api/health', healthRouter);

// Rutas protegidas
app.use('/api/biometric', requireAuth, requireRRHHorJefe, biometricRouter);
app.use('/api/empleados', requireAuth, requireRRHHorJefe, empleadosRouter);
app.use('/api/roles', requireAuth, requireRRHHorJefe, rolesRoutes);
app.use('/api/areas', requireAuth, requireRRHHorJefe, areasRoutes);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/turnos', requireAuth, requireRRHHorJefe, turnosRoutes);
app.use('/api/asignaciones', requireAuth, requireRRHHorJefe, asignacionesRoutes);
app.use('/api/audit', requireAuth, attachActor, auditRouter);
app.use('/api/reportes', requireAuth, requireRRHHorJefe, reportesRouter);
app.use('/api/permisos', requireAuth, requireRRHHorJefe, permisosRouter);
app.use('/api', biometricPushRoutes);


// 404 JSON para /api/*
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log('[KC cfg]', {
    KEYCLOAK_URL: process.env.KEYCLOAK_URL,
    KEYCLOAK_REALM: process.env.KEYCLOAK_REALM,
    KEYCLOAK_ISSUER: process.env.KEYCLOAK_ISSUER,
  });

  // --- Verificación de Biométricos ---
  console.log('\nVerificando conexión con dispositivos biométricos...');
  const results = await testConnectionAll();
  if (results.length === 0) {
    console.log('-> No hay dispositivos biométricos configurados en el .env (ej. HIK1_HOST, HIK2_HOST).');
  } else {
    results.forEach(r => {
      if (r.ok) {
        console.log(`✅ Conexión exitosa con ${r.host}`);
      } else {
        console.error(`❌ Error de conexión con ${r.host}: ${r.error}`);
      }
    });
  }
  console.log('--- Fin de la verificación ---\n');
});
