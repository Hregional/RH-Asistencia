-- liquibase formatted sql

-- changeset adolfo:02_actualizar_descripcion_vacaciones
-- comment: Actualizar mensaje base de vacaciones y permitir descripción personalizada
UPDATE `tipos_permiso` 
SET `mensaje_carta` = 'A cuenta de vacaciones' 
WHERE `nombre` = 'Vacaciones';

ALTER TABLE `permisos` 
MODIFY COLUMN `mensaje_otro` TEXT NULL COMMENT 'Mensaje personalizado o comentario adicional';
