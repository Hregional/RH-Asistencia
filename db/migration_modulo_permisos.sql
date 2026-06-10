-- liquibase formatted sql

-- changeset adolfo:01_crear_modulo_permisos
-- comment: Creación de tablas para el módulo de permisos
CREATE TABLE IF NOT EXISTS `tipos_permiso` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(100) NOT NULL,
  `dias_permitidos` INT NOT NULL DEFAULT 1,
  `mensaje_carta` TEXT,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tipo_permiso_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permisos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `empleado_id` INT NOT NULL,
  `tipo_permiso_id` INT NULL,
  `tipo_permiso_otro` VARCHAR(100) NULL COMMENT 'Cuando selecciona "Otro"',
  `mensaje_otro` TEXT NULL COMMENT 'Mensaje personalizado cuando es "Otro"',
  `fecha_inicio` DATE NOT NULL,
  `fecha_fin` DATE NOT NULL,
  `dias_solicitados` INT NOT NULL,
  `estado` ENUM('PENDIENTE', 'AUTORIZADO', 'RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
  `observaciones` TEXT NULL,
  `firmas_config` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Configuracion de firmas visibles en la carta' CHECK (json_valid(`firmas_config`)),
  `dias_adicionales` INT NULL COMMENT 'Dias habiles adicionales de extension',
  `motivo_extension` TEXT NULL COMMENT 'Motivo obligatorio para la extension',
  `fecha_fin_extendida` DATE NULL COMMENT 'Fecha fin real incluyendo dias adicionales',
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `creado_por` INT NULL,
  `autorizado_por` INT NULL,
  `autorizado_en` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `fk_permiso_empleado` (`empleado_id`),
  KEY `fk_permiso_tipo` (`tipo_permiso_id`),
  KEY `fk_permiso_creado` (`creado_por`),
  KEY `fk_permiso_autorizado` (`autorizado_por`),
  KEY `idx_permiso_estado` (`estado`),
  KEY `idx_permiso_fechas` (`fecha_inicio`, `fecha_fin`),
  CONSTRAINT `fk_permiso_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `empleados` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_permiso_tipo` FOREIGN KEY (`tipo_permiso_id`) REFERENCES `tipos_permiso` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_permiso_creado` FOREIGN KEY (`creado_por`) REFERENCES `usuarios_sistema` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_permiso_autorizado` FOREIGN KEY (`autorizado_por`) REFERENCES `usuarios_sistema` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `tipos_permiso` (`nombre`, `dias_permitidos`, `mensaje_carta`) VALUES
('Vacaciones', 30, 'A cuenta de vacaciones del presente período'),
('Cumpleaños', 1, 'A razon de celebración de cumpleaños'),
('Cita al IGGS', 3, 'Por motivo de cita al Instituto Nacional de Seguridad Social'),
('Suspensión médica', 5, 'Por motivo de problema de salud que requiere reposo/tratamiento');