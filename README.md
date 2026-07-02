# Sistema de Asistencia de Recursos Humanos (RH-Asistencia)

Este proyecto es un sistema para la gestión y control de asistencia del personal de Recursos Humanos. Está estructurado en un backend en Node.js, un frontend en Angular, y utiliza Keycloak para la gestión de identidad y accesos.

---

## Tabla de Contenido

- [Requisitos Previos](#requisitos-previos)
- [Instalación de Dependencias](#instalación-de-dependencias)
  - [Backend](#backend)
  - [Frontend](#frontend)
- [Ejecución en Entorno de Desarrollo](#ejecución-en-entorno-de-desarrollo)
  - [1. Iniciar Keycloak](#1-iniciar-keycloak)
  - [2. Levantar el Backend](#2-levantar-el-backend)
  - [3. Levantar el Frontend](#3-levantar-el-frontend)
- [Monitoreo y Tareas Programadas (PM2)](#monitoreo-y-tareas-programadas-pm2)
- [Ejecución de Pruebas Unitarias](#ejecución-de-pruebas-unitarias)
- [Ejecución con Docker](#ejecución-con-docker)

---

## Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:
* [Node.js](https://nodejs.org/) (versión LTS recomendada)
* [Angular CLI](https://angular.dev/tools/cli) (instalable globalmente vía `npm install -g @angular/cli`)
* [Keycloak](https://www.keycloak.org/) para la autenticación
* [PM2](https://pm2.keymetrics.io/) (opcional, para persistir procesos en producción/desarrollo)
* [Docker](https://www.docker.com/) y [Docker Compose](https://docs.docker.com/compose/) (opcional, para ejecución en contenedores)

---

## Instalación de Dependencias

Se requiere instalar las dependencias locales en ambas carpetas principales.

### Backend

Navega a la carpeta del backend e instala las dependencias necesarias:
```bash
cd backend
npm install
```

*Nota: Esto instalará paquetes esenciales como Express, CORS, MySQL2, Nodemailer (para envío de correos), Node-cron (para tareas programadas), Zod, Helmet, Morgan, entre otros.*

### Frontend

Navega a la carpeta del frontend e instala las dependencias de Angular:
```bash
cd frontend
npm install
```

*Nota: Esto instalará paquetes para la UI y generación de reportes como Angular Material, Chart.js (para gráficos), jsPDF y jsPDF-autotable (para reportes en PDF), XLSX (para exportaciones a Excel), y Keycloak-angular.*

---

## Ejecución en Entorno de Desarrollo

Para ejecutar el proyecto de forma local y manual en tu máquina de desarrollo, sigue este orden:

### 1. Iniciar Keycloak
Asegúrate de levantar el servidor de Keycloak:
```bash
cd bin
kc.bat start-dev
```

### 2. Levantar el Backend
En una terminal, desde la raíz del backend, ejecuta el servidor en modo desarrollo:
```bash
cd backend
npm run dev
```

### 3. Levantar el Frontend
En otra terminal, desde la raíz del frontend, arranca el servidor de desarrollo de Angular:
```bash
cd frontend
npm run start
```
*O usando directamente Angular CLI:*
```bash
ng serve
```

---

## Monitoreo y Tareas Programadas (PM2)

Para la ejecución automática y monitoreo de los scripts del backend en producción o segundo plano, se recomienda usar **PM2**:

1. Instala PM2 de manera global (si no lo has hecho):
   ```bash
   npm install -g pm2
   ```
2. Inicia el servidor del backend con PM2:
   ```bash
   cd backend
   pm2 start server.js --name hospital_biometric
   ```
3. Inicia las tareas programadas (sincronizador de biométricos):
   ```bash
   pm2 start scripts/scheduler.js --name sync-biometric
   ```
4. Guarda la configuración actual de PM2 para que se mantenga al reiniciar el servidor:
   ```bash
   pm2 save
   ```

---

## Ejecución de Pruebas Unitarias

El proyecto cuenta con pruebas unitarias para validar el correcto funcionamiento del sistema tanto en el backend como en el frontend.

### Backend (Vitest)
Las pruebas del backend utilizan **Vitest**. Para ejecutarlas:

1. Navega al directorio del backend:
   ```bash
   cd backend
   ```
2. Ejecuta las pruebas una sola vez:
   ```bash
   npm run test
   ```
3. O ejecuta las pruebas en modo observador (*watch mode*):
   ```bash
   npm run test:watch
   ```

### Frontend (Karma + Jasmine)
Las pruebas del frontend utilizan **Karma** y **Jasmine**. Para ejecutarlas:

1. Navega al directorio del frontend:
   ```bash
   cd frontend
   ```
2. Ejecuta las pruebas una sola vez en segundo plano (*headless Chrome*):
   ```bash
   npx ng test --watch=false --browsers=ChromeHeadless
   ```
3. O ejecuta las pruebas de forma interactiva (abrirá una ventana del navegador Chrome y se actualizará automáticamente con los cambios):
   ```bash
   npm run test
   ```

---

## Ejecución con Docker

Para levantar todo el entorno de desarrollo de forma automatizada (frontend, backend, y base de datos MariaDB), puedes utilizar Docker Compose.

### Prerrequisitos
* Tener instalado [Docker](https://docs.docker.com/get-docker/).
* Tener instalado [Docker Compose](https://docs.docker.com/compose/install/).

### Pasos para levantar el entorno:

1. **Configurar variables de entorno:**
   Crea un archivo llamado `.env` en la raíz del proyecto (al mismo nivel que `docker-compose.yml`) y define las contraseñas para la base de datos:
   ```env
   # Contraseñas de Base de Datos
   DB_PASSWORD=tu_contraseña_segura
   DB_ROOT_PASSWORD=tu_contraseña_de_root_segura
   ```
   *Nota: El archivo de volcado `Hospital.sql` en la raíz se utilizará automáticamente para inicializar la base de datos la primera vez que se levanten los contenedores.*

2. **Levantar los servicios:**
   Abre una terminal en la raíz del proyecto y ejecuta:
   ```bash
   docker-compose up -d
   ```
   *Esto compilará las imágenes de desarrollo del frontend (Nginx) y backend, e inicializará la base de datos MariaDB en segundo plano.*

3. **Acceder a la aplicación:**
   Una vez listos los servicios, abre tu navegador e ingresa a:
   [http://localhost:8020](http://localhost:8020)

### Comandos útiles de Docker Compose:

* **Ver logs de los contenedores en tiempo real:**
  ```bash
  docker-compose logs -f
  ```
  O para ver los logs de un servicio específico (ej. `backend`):
  ```bash
  docker-compose logs -f backend
  ```
* **Detener y eliminar los contenedores levantados:**
  ```bash
  docker-compose down
  ```
* **Forzar la reconstrucción de las imágenes (en caso de cambios en el Dockerfile o código):**
  ```bash
  docker-compose up -d --build
  ```
