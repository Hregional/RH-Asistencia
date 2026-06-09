-- ============================================================
-- Migración: Agregar DPI y datos_actualizados a empleados
-- Ejecutar una sola vez contra la BD existente
-- ============================================================
ALTER TABLE empleados
  ADD COLUMN `dpi` varchar(13) COLLATE utf8mb4_unicode_ci DEFAULT NULL 
    COMMENT 'DPI Guatemala, 13 dígitos' 
    AFTER `nombre_completo`,
  ADD UNIQUE KEY `uk_dpi` (`dpi`),
  ADD COLUMN `datos_actualizados` tinyint(1) NOT NULL DEFAULT 0 
    COMMENT 'Indica si el empleado actualizó sus datos este ciclo (1=SÍ, 0=NO)' 
    AFTER `activo`;