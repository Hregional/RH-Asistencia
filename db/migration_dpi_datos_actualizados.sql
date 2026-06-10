-- liquibase formatted sql

-- changeset adolfo:02_agregar_dpi_datos_empleados
-- comment: Se agrega DPI y bandera de actualización de datos a la tabla empleados
-- preconditions onFail:MARK_RAN
-- precondition-sql-check expectedResult:0 SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empleados' AND COLUMN_NAME='dpi';

ALTER TABLE empleados
  ADD COLUMN `dpi` varchar(13) COLLATE utf8mb4_unicode_ci DEFAULT NULL 
    COMMENT 'DPI Guatemala, 13 dígitos' 
    AFTER `nombre_completo`,
  ADD UNIQUE KEY `uk_dpi` (`dpi`),
  ADD COLUMN `datos_actualizados` tinyint(1) NOT NULL DEFAULT 0 
    COMMENT 'Indica si el empleado actualizó sus datos este ciclo (1=SÍ, 0=NO)' 
    AFTER `activo`;