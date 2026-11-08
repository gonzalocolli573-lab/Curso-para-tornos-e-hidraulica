#!/bin/sh
set -e

echo "==> Verificando conexión con la base de datos PostgreSQL..."
python << 'EOF'
import socket
import os
import time

host = os.environ.get('DB_HOST', 'db')
port = int(os.environ.get('DB_PORT', 5432))

conectado = False
for i in range(60):
    try:
        with socket.create_connection((host, port), timeout=2):
            print("==> ¡Base de datos PostgreSQL disponible!")
            conectado = True
            break
    except (socket.error, OSError):
        time.sleep(1)

if not conectado:
    print("==> Error: No se pudo conectar a PostgreSQL después de 60 segundos.")
EOF

echo "==> Verificando y aplicando migraciones..."
python manage.py makemigrations --noinput
python manage.py migrate --noinput

echo "==> Ejecutando comando del servidor..."
exec "$@"
