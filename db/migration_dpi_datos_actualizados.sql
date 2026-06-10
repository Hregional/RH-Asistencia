-- ============================================================
-- Migración: Agregar DPI y datos_actualizados a empleados
-- Base de datos: sigsa_db
-- Ejecutar una sola vez contra la BD existente
-- ============================================================

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS `dpi` varchar(13) COLLATE utf8mb4_unicode_ci DEFAULT NULL 
    COMMENT 'DPI Guatemala, 13 dígitos' 
    AFTER `nombre_completo`,
  ADD COLUMN IF NOT EXISTS `datos_actualizados` tinyint(1) NOT NULL DEFAULT 0 
    COMMENT 'Indica si el empleado actualizó sus datos este ciclo (1=SÍ, 0=NO)' 
    AFTER `activo`;

CREATE UNIQUE INDEX IF NOT EXISTS `uk_dpi` ON `empleados` (`dpi`);