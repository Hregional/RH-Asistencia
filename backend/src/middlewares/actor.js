const db = require('../db.js');

async function ensureActor(req, res, next) {
  try {
    const parsed = req.user?.raw || {}; 
    const sub = parsed.sub || null;
    const username = parsed.preferred_username || parsed.email || null;

    if (!sub && !username) {
      return res.status(401).json({ success: false, error: 'Actor no identificable' });
    }

    // buscar usuario_sistema por sub o username
    const [rows] = await db.query(
      `SELECT id, username FROM usuarios_sistema WHERE keycloak_sub = ? OR username = ? LIMIT 1`,
      [sub, username]
    );

    let usuarioId;
    if (rows.length) {
      usuarioId = rows[0].id;
    } else {
      // opcional: autocrear registro mínimo
      const nombre = parsed.name || username || 'Desconocido';
      const email = parsed.email || null;
      const [ins] = await db.query(
        `INSERT INTO usuarios_sistema (username, keycloak_sub, nombre_completo, email, activo)
         VALUES (?, ?, ?, ?, 1)`,
        [username, sub, nombre, email]
      );
      usuarioId = ins.insertId;
    }

    req.actorId = usuarioId;
    req.actorUsername = username || 'unknown';
    next();
  } catch (e) {
    console.error('ensureActor error', e);
    res.status(500).json({ success:false, error:'No se pudo resolver actor' });
  }
}

// src/middlewares/actor.js (CommonJS)
module.exports = function attachActor(req, _res, next) {
  try {
    const tok = req.kauth?.grant?.access_token?.content || req.user || {};
    req.actor = {
      id: tok.sub || null, 
      username: tok.preferred_username || tok.email || null,
      ip: req.ip || null,
      user_agent: req.headers['user-agent'] || null,
    };
  } catch {
    req.actor = { id: null, username: null, ip: null, user_agent: null };
  }
  next();
};

module.exports.ensureActor = ensureActor;


