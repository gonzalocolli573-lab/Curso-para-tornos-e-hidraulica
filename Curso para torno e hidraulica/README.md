# Kiosco Tornería e Hidráulica (100% Dockerizado)

## 1. Qué se hizo
- **Aplicación 100% Dockerizada**: Django y PostgreSQL se ejecutan juntos dentro de contenedores Docker.
- **Sin necesidad de instalar Python o paquetes en Windows**: Todo corre aislado en Docker.
- **Migraciones automáticas**: Al iniciar el contenedor `web`, espera a que PostgreSQL esté listo y aplica automáticamente todas las migraciones.
- **Volúmenes persistentes**:
  - `postgres_datos`: La base de datos nunca se borra al reiniciar o apagar los contenedores.
  - `media_datos`: Las fotos subidas desde el panel de administración se conservan permanentemente.
  - El código está montado en vivo (`.:/app`): Cualquier cambio en HTML, CSS o Python se refleja de inmediato sin reconstruir la imagen.

---

## 2. Cómo encender todo con un solo comando

Abre tu terminal (PowerShell o CMD) y corre:

```bash
docker compose -f "C:\Users\gonza\.antigravity-ide\kiosco_django\docker-compose.yml" up --build -d
```

*(Si ya estás parado dentro de la carpeta `kiosco_django`, simplemente usa `docker compose up --build -d`).*

---

## 3. Crear usuario administrador (Solo la primera vez)

Para poder entrar al panel de administración y cargar las fotos de los trabajos:

```bash
docker compose -f "C:\Users\gonza\.antigravity-ide\kiosco_django\docker-compose.yml" exec web python manage.py createsuperuser
```

Te pedirá ingresar un nombre de usuario, email (opcional) y contraseña.

---

## 4. Direcciones de acceso
- **Pantalla Kiosco (fotos rotando cada 5 min):** [http://localhost:8000/](http://localhost:8000/)
- **Panel de Administrador (para subir fotos):** [http://localhost:8000/admin/](http://localhost:8000/admin/)

---

## 5. Comandos útiles

- **Ver los registros (logs) en tiempo real:**
  ```bash
  docker compose -f "C:\Users\gonza\.antigravity-ide\kiosco_django\docker-compose.yml" logs -f
  ```
- **Detener la aplicación:**
  ```bash
  docker compose -f "C:\Users\gonza\.antigravity-ide\kiosco_django\docker-compose.yml" down
  ```
- **Reiniciar los contenedores:**
  ```bash
  docker compose -f "C:\Users\gonza\.antigravity-ide\kiosco_django\docker-compose.yml" restart
  ```
