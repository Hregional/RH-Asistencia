#!/bin/sh

# Directorio donde se encuentran los archivos compilados de Angular
ROOT_DIR=/usr/share/nginx/html

# --- DEBUGGING START ---
echo "--- Running entrypoint.sh script ---"
echo "--- Listing files in $ROOT_DIR ---"
ls -l $ROOT_DIR

echo "\n--- Searching for placeholders in $ROOT_DIR before replacement ---"
grep -r "__KEYCLOAK_URL__" $ROOT_DIR || echo "Placeholder __KEYCLOAK_URL__ not found."
# --- DEBUGGING END ---


# Leer las variables de entorno o usar valores por defecto
# Si API_BASE es "AUTO", intentaremos detectarla dinámicamente en el cliente (aunque en prod es mejor fija)
# O mejor, modificamos el script para que si no se provee, se use el placeholder para reemplazo manual posterior
export API_BASE=${API_BASE:-__API_BASE__}
export KEYCLOAK_URL=${KEYCLOAK_URL:-__KEYCLOAK_URL__}
export KEYCLOAK_REALM=${KEYCLOAK_REALM:-__KEYCLOAK_REALM__}
export KEYCLOAK_CLIENT_ID=${KEYCLOAK_CLIENT_ID:-__KEYCLOAK_CLIENT_ID__}

# Mejora: Si API_BASE contiene la palabra "localhost" pero estamos accediendo por IP, 
# podrías tener problemas. Aquí permitimos que el usuario pase la IP real.
echo "\nReplacing environment variables..."
echo "API_BASE: $API_BASE"
echo "KEYCLOAK_URL: $KEYCLOAK_URL"
echo "KEYCLOAK_REALM: $KEYCLOAK_REALM"
echo "KEYCLOAK_CLIENT_ID: $KEYCLOAK_CLIENT_ID"

# Recorrer todos los archivos .js en el directorio de la aplicación
# Usamos un patron mas amplio para incluir todos los archivos JS
for file in $ROOT_DIR/*.js
do
  if [ -f "$file" ]; then
    echo "Processing file: $file"
    # Usar sed para reemplazar los marcadores de posición con los valores de las variables de entorno
    sed -i "s|__API_BASE__|$API_BASE|g" "$file"
    sed -i "s|__KEYCLOAK_URL__|$KEYCLOAK_URL|g" "$file"
    sed -i "s|__KEYCLOAK_REALM__|$KEYCLOAK_REALM|g" "$file"
    sed -i "s|__KEYCLOAK_CLIENT_ID__|$KEYCLOAK_CLIENT_ID|g" "$file"
  fi
done

echo "\nEnvironment variables replaced."

# --- DEBUGGING START ---
echo "\n--- Searching for placeholders in $ROOT_DIR after replacement ---"
grep -r "__KEYCLOAK_URL__" $ROOT_DIR || echo "Placeholder __KEYCLOAK_URL__ not found (SUCCESS)."
echo "--- Finished entrypoint.sh script ---\n"
# --- DEBUGGING END ---


# Ejecutar el comando original del Dockerfile (iniciar Nginx)
exec "$@"
