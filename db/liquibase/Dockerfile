FROM liquibase/liquibase:4.29

# Usamos un directorio personalizado para evitar conflictos con carpetas preexistentes en la imagen
WORKDIR /liquibase/migrations

# Copiamos los archivos SQL desde la raíz del contexto (db/)
COPY --chown=liquibase:liquibase *.sql ./

# Copiamos el archivo maestro desde la subcarpeta changelog
COPY --chown=liquibase:liquibase changelog/db.changelog-master.yaml ./
