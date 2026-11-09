# Método Kiosco – Sistema de Gestión de Inscripciones y Asistencia

## 1. Descripción del proyecto

El proyecto consiste en el desarrollo de una aplicación web denominada Método Kiosco, destinada a gestionar las inscripciones y el control de asistencia de los participantes del curso de formación profesional "Curso de Torno e Hidráulica".

El sistema permite que los alumnos realicen su inscripción y registren su asistencia mediante una computadora, utilizando una interfaz sencilla y automatizada.

El objetivo principal es mejorar la organización administrativa del curso, centralizar la información y reducir los errores que pueden producirse mediante registros manuales.

## 2. Objetivos

- Digitalizar las inscripciones de los alumnos.
- Registrar y organizar los datos personales.
- Automatizar el control de asistencia.
- Realizar el seguimiento individual de los participantes.
- Calcular porcentajes de asistencia.
- Facilitar la finalización del curso y la generación de certificados.

## 3. Funcionalidades principales

### Inscripción
Permite ingresar los siguientes datos:
- Nombre completo.
- DNI.
- Fecha de nacimiento.
- Localidad.
- Ocupación.

El sistema verifica la existencia de inscripciones anteriores para evitar duplicaciones.

### Control de asistencia
Permite identificar al alumno mediante su DNI y registrar su ingreso a cada una de las 10 clases del curso.

Se controla que no existan registros duplicados para una misma clase.

### Seguimiento
El sistema actualiza:
- Cantidad de clases asistidas.
- Porcentaje de asistencia.
- Estado del alumno.

### Finalización y certificados
Al completar las 10 clases, el sistema procesa la finalización y genera un certificado en formato PDF, que se almacena en Google Drive.

## 4. Tecnologías utilizadas

- Antigravity: entorno utilizado para desarrollar el proyecto.
- Google Apps Script: programación y lógica del sistema.
- HTML: desarrollo de la interfaz.
- Google Sheets: almacenamiento de información.
- Google Drive: almacenamiento de certificados.
- Docker: contenerización y configuración del entorno del proyecto.
- GitHub: almacenamiento y documentación del código fuente.

## 5. Estructura del proyecto

El repositorio contiene la carpeta principal del proyecto y sus archivos correspondientes.

Dentro de la estructura se incluyen:
- Archivos de programación y lógica.
- Archivos HTML de la interfaz.
- Archivos de configuración.
- Componentes y extensiones utilizados.
- Configuración relacionada con Docker.
- Este documento README.md.

## 6. Requisitos necesarios

- Una computadora con conexión a Internet.
- Navegador web actualizado.
- Cuenta de Google.
- Acceso a Google Apps Script.
- Hoja de cálculo de Google Sheets.
- Google Drive para almacenar los certificados.
- Docker, para trabajar con los componentes configurados para ese entorno.

## 7. Pasos para la configuración y puesta en funcionamiento

1. Acceder a Google Apps Script.
2. Crear o configurar el proyecto con los archivos correspondientes.
3. Incorporar el código fuente y los archivos HTML.
4. Configurar la conexión con Google Sheets.
5. Preparar las hojas necesarias para inscripciones, asistencia y seguimiento.
6. Autorizar los permisos solicitados por Google.
7. Configurar Google Drive para almacenar los certificados.
8. Implementar la aplicación como aplicación web.
9. Obtener la URL de acceso.
10. Abrir la aplicación desde la computadora destinada al uso del kiosco.

## 8. Funcionamiento del sistema

Una vez implementada la aplicación, el usuario puede:

1. Ingresar a la aplicación web.
2. Seleccionar la opción de inscripción.
3. Completar sus datos personales.
4. Guardar la inscripción.
5. Ingresar a la opción de asistencia.
6. Identificarse mediante su DNI.
7. Seleccionar la clase correspondiente para registrar su ingreso.

El sistema procesa la información y actualiza los registros de seguimiento.

## 9. Docker

El proyecto cuenta con una configuración de Docker para contenerizar los componentes preparados para ese entorno.

La configuración permite organizar el entorno de ejecución y facilitar la reproducción de los componentes contenerizados.

Los pasos específicos de construcción y ejecución deben realizarse de acuerdo con los archivos Dockerfile y docker-compose.yml incluidos en el proyecto, si corresponde.

## 10. Resultado esperado

El resultado es una herramienta digital que permite administrar de manera más eficiente las inscripciones y asistencias de un curso de formación profesional.

El Método Kiosco busca simplificar las tareas administrativas, automatizar procesos y mejorar el seguimiento de los alumnos durante el desarrollo de la capacitación.

---

**Proyecto académico: Método Kiosco**

**Curso: Torno e Hidráulica**
