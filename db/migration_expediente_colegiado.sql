-- liquibase formatted sql

-- changeset adolfo:05a_crear_colegios_profesionales
-- comment: Catalogo de colegios profesionales de Guatemala para el numero de colegiado
-- preconditions onFail:MARK_RAN
-- precondition-sql-check expectedResult:0 SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='colegios_profesionales';

CREATE TABLE `colegios_profesionales` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `siglas` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_colegio_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- rollback DROP TABLE IF EXISTS `colegios_profesionales`;

-- changeset adolfo:05b_seed_colegios_profesionales
-- comment: Carga inicial de colegios profesionales
INSERT IGNORE INTO `colegios_profesionales` (`nombre`, `siglas`) VALUES
  ('Colegio de Médicos y Cirujanos de Guatemala', 'Médicos'),
  ('Colegio de Profesionales de Enfermería de Guatemala', 'Enfermería'),
  ('Colegio de Químicos y Farmacéuticos de Guatemala', 'Químicos'),
  ('Colegio Estomatológico de Guatemala', 'Estomatológico'),
  ('Colegio de Psicólogos de Guatemala', 'Psicólogos'),
  ('Colegio de Médicos Veterinarios y Zootecnistas', 'Veterinarios'),
  ('Colegio de Abogados y Notarios de Guatemala', 'Abogados'),
  ('Colegio de Ingenieros de Guatemala', 'Ingenieros'),
  ('Colegio de Ingenieros Químicos de Guatemala', 'Ing. Químicos'),
  ('Colegio de Profesionales de las Ciencias Económicas', 'C. Económicas'),
  ('Colegio de Humanidades de Guatemala', 'Humanidades'),
  ('Colegio de Arquitectos de Guatemala', 'Arquitectos');

-- rollback DELETE FROM `colegios_profesionales` WHERE `nombre` IN (
-- rollback   'Colegio de Médicos y Cirujanos de Guatemala',
-- rollback   'Colegio de Profesionales de Enfermería de Guatemala',
-- rollback   'Colegio de Químicos y Farmacéuticos de Guatemala',
-- rollback   'Colegio Estomatológico de Guatemala',
-- rollback   'Colegio de Psicólogos de Guatemala',
-- rollback   'Colegio de Médicos Veterinarios y Zootecnistas',
-- rollback   'Colegio de Abogados y Notarios de Guatemala',
-- rollback   'Colegio de Ingenieros de Guatemala',
-- rollback   'Colegio de Ingenieros Químicos de Guatemala',
-- rollback   'Colegio de Profesionales de las Ciencias Económicas',
-- rollback   'Colegio de Humanidades de Guatemala',
-- rollback   'Colegio de Arquitectos de Guatemala'
-- rollback );

-- changeset adolfo:05c_agregar_expediente_colegiado_empleados
-- comment: Codigo interno de expediente fisico y numero de colegiado (unico por colegio)
-- preconditions onFail:MARK_RAN
-- precondition-sql-check expectedResult:0 SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='empleados' AND COLUMN_NAME='codigo_expediente';

ALTER TABLE empleados
  ADD COLUMN `codigo_expediente` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL
    COMMENT 'Codigo interno de RH para ubicar el expediente fisico'
    AFTER `numero_empleado`,
  ADD COLUMN `colegio_id` int(11) DEFAULT NULL
    COMMENT 'Colegio profesional al que pertenece el numero de colegiado'
    AFTER `email`,
  ADD COLUMN `numero_colegiado` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL
    COMMENT 'Numero de colegiado; unico dentro de cada colegio'
    AFTER `colegio_id`,
  ADD UNIQUE KEY `uk_codigo_expediente` (`codigo_expediente`),
  ADD UNIQUE KEY `uk_colegio_numero` (`colegio_id`, `numero_colegiado`),
  ADD CONSTRAINT `fk_emp_colegio` FOREIGN KEY (`colegio_id`) REFERENCES `colegios_profesionales` (`id`);

-- rollback ALTER TABLE empleados
-- rollback   DROP FOREIGN KEY `fk_emp_colegio`,
-- rollback   DROP INDEX `uk_colegio_numero`,
-- rollback   DROP INDEX `uk_codigo_expediente`,
-- rollback   DROP COLUMN `numero_colegiado`,
-- rollback   DROP COLUMN `colegio_id`,
-- rollback   DROP COLUMN `codigo_expediente`;
