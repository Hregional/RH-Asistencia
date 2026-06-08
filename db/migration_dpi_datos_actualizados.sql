-- ============================================================
-- Migración: Agregar DPI y datos_actualizados a empleados
-- Base de datos: sigsa_db
-- Ejecutar una sola vez contra la BD existente
-- ============================================================

-- 1. Agregar columna DPI (después de nombre_completo)
ALTER TABLE `empleados`
  ADD COLUMN `dpi` varchar(13) COLLATE utf8mb4_unicode_ci DEFAULT NULL
    COMMENT 'DPI Guatemala, 13 dígitos'
  AFTER `nombre_completo`;

-- 2. Agregar índice único para DPI
ALTER TABLE `empleados`
  ADD UNIQUE KEY `uk_dpi` (`dpi`);

-- 3. Agregar columna datos_actualizados (después de activo)
ALTER TABLE `empleados`
  ADD COLUMN `datos_actualizados` tinyint(1) NOT NULL DEFAULT 1
    COMMENT 'Indica si el empleado actualizó sus datos este ciclo (1=SÍ, 0=NO)'
  AFTER `activo`;
