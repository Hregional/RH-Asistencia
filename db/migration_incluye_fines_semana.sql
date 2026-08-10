-- liquibase formatted sql

-- changeset edvin:04_agregar_incluye_fines_semana_permisos
-- comment: Agrega columna incluye_fines_semana a la tabla permisos para considerar FDS como dias habiles
-- preconditions onFail:MARK_RAN
-- precondition-sql-check expectedResult:0 SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='permisos' AND COLUMN_NAME='incluye_fines_semana';

ALTER TABLE permisos
  ADD COLUMN `incluye_fines_semana` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Si 1, los fines de semana se consideran dias habiles en el calculo'
    AFTER `fecha_fin_extendida`;
