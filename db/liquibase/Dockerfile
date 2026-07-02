FROM liquibase/liquibase:4.29

# Usamos un directorio personalizado para evitar conflictos con carpetas preexistentes en la imagen
WORKDIR /liquibase/migrations

# Copiamos todo el contenido del contexto (db/) manteniendo la estructura
COPY --chown=liquibase:liquibase . ./

