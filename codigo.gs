/**
 * ===================================================================
 * KIOSCO INTERACTIVO - CURSO DE TORNERÍA E HIDRÁULICA
 * Sistema Integral: Inscripción, Registro de Asistencia y Seguimiento
 * ===================================================================
 * 
 * ESTRUCTURA DE PESTAÑAS EN GOOGLE SHEETS:
 * 1. "Inscriptos":   Fecha Reg | Nombre Completo | DNI | Teléfono | Email | Especialidad | Estado
 * 2. "Asistencias":  Fecha     | Nombre completo | DNI | Hora ingreso | Estado
 * 3. "Seguimiento":  DNI       | Nombre Completo | Total Clases | Asistencias | % Asistencia | Condición
 * 4. "Finalizacion": DNI       | Nombre Completo | Fecha Fin    | Calificación | Certificado
 */

// Si este script está vinculado a la hoja (Extensiones > Apps Script), déjalo vacío ("")
// Si es un script independiente (creado desde script.google.com), coloca el ID de tu Google Sheet aquí:
var SPREADSHEET_ID = "";

// ===================================================================
// CARPETA DE GOOGLE DRIVE CON LAS FOTOS DEL TALLER
// (Asegúrate de que la carpeta esté compartida como "Cualquier persona con el enlace puede ver")
// ===================================================================
var DRIVE_CARPETA_FOTOS_ID = "1l3lIdUTNm5i7ZrSEpWsaTRjxGO97Cb7s";

// ===================================================================
// CONFIGURACIÓN DE IA / INTERNET PARA EL CHATBOT (OPCIONAL)
// Si quieres que el bot responda cualquier pregunta técnica usando
// Inteligencia Artificial conectada a internet, puedes obtener tu clave
// gratuita en: https://aistudio.google.com/app/apikey y pegarla aquí.
// Si lo dejas vacío (""), el bot usa el motor de conocimiento y búsqueda web:
// ===================================================================
var GEMINI_API_KEY = "";

// Nombres de las pestañas principales
var HOJA_INSCRIPTOS = "Inscriptos";
var HOJA_ASISTENCIAS = "Asistencias";
var HOJA_SEGUIMIENTO = "Seguimiento";
var HOJA_FINALIZACION = "Finalizacion";
var HOJA_CONSULTAS = "Consultas";

// Parámetros académicos
var TOTAL_CLASES_CURSO = 16;          // Cantidad estimada de clases del curso (editable)
var PORCENTAJE_MINIMO_CERTIFICADO = 75; // % requerido para obtener el certificado final


// ===================================================================
// CONTROLADOR WEB (doGet y doPost)
// ===================================================================

/**
 * Atiende peticiones GET.
 * Permite acceder visualmente a la aplicación web (con o sin parámetros en la URL como ?dni=... o ?tab=estado)
 * o devolver JSON si se especifica ?formato=json o ?api=true.
 */
function doGet(e) {
  // Inicializa las pestañas automáticamente si aún no tienen encabezados
  verificarEstructuraPlanilla();

  var params = (e && e.parameter) ? e.parameter : {};
  var accion = (params.accion || params.action || "").toLowerCase().trim();
  var formato = (params.formato || params.format || "").toLowerCase().trim();
  var dni = normalizarDni(params.dni || params.documento || params.estado || params.consultar || "");

  // Si se pide explícitamente formato JSON para consumo API externo
  if (formato === "json" || params.api === "true" || params.api === "1") {
    var respuesta = {};
    if (accion === "consultar" || (dni && !accion)) {
      respuesta = consultarEstadoAlumno(dni);
    } else if (accion === "asistencia") {
      respuesta = registrarAsistencia(dni);
    } else if (accion === "resumen") {
      respuesta = obtenerResumenKiosco();
    } else if (accion === "fotos") {
      respuesta = { exito: true, fotos: obtenerFotosDrive() };
    } else if (accion === "chatbot" || accion === "consulta") {
      respuesta = procesarConsultaChatbot(params.mensaje || "", params.nombre || "", params.contacto || "");
    } else {
      respuesta = { exito: false, mensaje: "Acción no reconocida." };
    }
    return ContentService.createTextOutput(JSON.stringify(respuesta))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Renderizar la aplicación web visual (index.html), inyectando los parámetros y fotos de Drive
  var template = HtmlService.createTemplateFromFile('index');
  template.urlParams = params;
  try {
    template.fotosIniciales = obtenerFotosDrive();
  } catch (errFotos) {
    Logger.log("Aviso al obtener fotos iniciales de Drive: " + errFotos.toString());
    template.fotosIniciales = [];
  }

  return template.evaluate()
    .setTitle('Kiosco - Curso de Torno e Hidráulica')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Atiende peticiones POST (ej: envíos desde formularios externos o apps)
 */
function doPost(e) {
  var datos = {};
  if (e && e.postData && e.postData.contents) {
    try { datos = JSON.parse(e.postData.contents); } catch(err) { datos = e.parameter || {}; }
  } else if (e && e.parameter) {
    datos = e.parameter;
  }

  var accion = (datos.accion || "").toLowerCase().trim();
  var res = {};

  if (accion === "inscribir") {
    res = inscribirAlumno(datos);
  } else if (accion === "asistencia") {
    res = registrarAsistencia(datos.dni || "");
  } else if (accion === "consultar") {
    res = consultarEstadoAlumno(datos.dni || "");
  } else if (accion === "chatbot" || accion === "consulta") {
    res = procesarConsultaChatbot(datos.mensaje || "", datos.nombre || "", datos.contacto || "");
  } else {
    res = { exito: false, mensaje: "Acción no reconocida." };
  }

  return ContentService.createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}


// ===================================================================
// 1. MÓDULO DE INSCRIPCIÓN DE ALUMNOS
// ===================================================================

/**
 * Registra un nuevo alumno en la pestaña "Inscriptos".
 */
function inscribirAlumno(datos) {
  try {
    var nombre = String(datos.nombre || datos.nombreCompleto || "").trim();
    var dni = normalizarDni(datos.dni || datos.documento);
    var telefono = String(datos.telefono || "").trim();
    var email = String(datos.email || "").trim();
    var curso = String(datos.curso || datos.especialidad || "Tornería e Hidráulica").trim();

    if (!nombre || !dni) {
      return { exito: false, mensaje: "Nombre completo y DNI son campos obligatorios." };
    }

    var ss = obtenerSpreadsheet();
    if (!ss) {
      return { 
        exito: false, 
        mensaje: "No se pudo conectar con la hoja de cálculo. Si el script es independiente, configura SPREADSHEET_ID en codigo.gs." 
      };
    }

    var hoja = obtenerHojaFlexible(ss, [HOJA_INSCRIPTOS, "Inscripciones", "Alumnos", "Estudiantes"], [
      "Fecha Inscripción", "Nombre Completo", "DNI", "Teléfono", "Email", "Especialidad", "Estado"
    ]);

    var valores = hoja.getDataRange().getValues();
    var headers = valores[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var colDni = buscarIndiceColumna(headers, [/dni/, /documento/, /cedula/, /doc/], 2);
    var colNombre = buscarIndiceColumna(headers, [/nombre/, /alumno/], 1);

    // Validar si el alumno ya está inscripto por DNI
    for (var i = 1; i < valores.length; i++) {
      if (sonDnisIguales(valores[i][colDni], dni) || sonDnisIguales(valores[i][2], dni)) {
        return { 
          exito: false, 
          mensaje: "El alumno con DNI " + dni + " ya se encuentra inscripto como: " + (valores[i][colNombre] || valores[i][1] || "Alumno") 
        };
      }
    }

    // Agregar nueva fila
    var fechaHoy = formatearFecha(new Date());
    hoja.appendRow([fechaHoy, nombre, "'" + dni, telefono, email, curso, "Activo"]);

    // Actualizar también la hoja de seguimiento para tenerlo listado
    actualizarHojaSeguimiento(ss, dni, nombre, curso);

    return {
      exito: true,
      mensaje: "¡Inscripción exitosa! Bienvenido/a " + nombre + " al curso.",
      alumno: { nombre: nombre, dni: dni, curso: curso }
    };

  } catch (error) {
    Logger.log("Error en inscribirAlumno: " + error.toString());
    return { exito: false, mensaje: "Error al registrar la inscripción: " + error.message };
  }
}


// ===================================================================
// 2. MÓDULO DE REGISTRO DE ASISTENCIA (CHECK-IN)
// ===================================================================

/**
 * Registra la asistencia del día en la pestaña "Asistencias".
 */
function registrarAsistencia(dniIngresado) {
  try {
    var dni = normalizarDni(dniIngresado);
    if (!dni) {
      return { exito: false, mensaje: "Por favor, ingresa un número de DNI válido (solo números)." };
    }

    var ss = obtenerSpreadsheet();
    if (!ss) {
      return { 
        exito: false, 
        mensaje: "No se pudo conectar con la hoja de cálculo. Configura SPREADSHEET_ID en codigo.gs si el script es independiente." 
      };
    }

    // 1. Buscar los datos del alumno
    var alumnoInfo = buscarAlumnoPorDni(ss, dni);
    var nombreAlumno = alumnoInfo ? alumnoInfo.nombre : ("Alumno DNI " + dni);
    var cursoAlumno = alumnoInfo ? (alumnoInfo.curso || "Tornería e Hidráulica") : "Tornería e Hidráulica";

    // 2. Obtener la hoja "Asistencias"
    var hojaAsis = obtenerHojaFlexible(ss, [HOJA_ASISTENCIAS, "Asistencias", "Presentes", "Clases"], [
      "Fecha", "Nombre completo", "DNI", "Hora ingreso", "Estado"
    ]);

    var ahora = new Date();
    var fechaHoy = formatearFecha(ahora);
    var horaHoy = formatearHora(ahora);

    // 3. Verificar si ya marcó asistencia hoy (evita duplicar la misma clase)
    if (hojaAsis.getLastRow() > 1) {
      var valoresAsis = hojaAsis.getDataRange().getValues();
      var headersAsis = valoresAsis[0].map(function(h) { return String(h).toLowerCase().trim(); });
      var colAsisFecha = buscarIndiceColumna(headersAsis, [/fecha/, /dia/], 0);
      var colAsisNombre = buscarIndiceColumna(headersAsis, [/nombre/, /alumno/], 1);
      var colAsisDni = buscarIndiceColumna(headersAsis, [/dni/, /documento/, /cedula/], 2);
      var colAsisHora = buscarIndiceColumna(headersAsis, [/hora/], 3);

      for (var i = 1; i < valoresAsis.length; i++) {
        var row = valoresAsis[i];
        var filaFecha = formatearFechaGenerica(row[colAsisFecha]);
        var filaCoincideDni = sonDnisIguales(row[colAsisDni], dni);

        if (!filaCoincideDni) {
          for (var c = 0; c < row.length; c++) {
            if (sonDnisIguales(row[c], dni)) {
              filaCoincideDni = true;
              break;
            }
          }
        }

        if (filaCoincideDni && filaFecha === fechaHoy) {
          var horaRegistrada = row[colAsisHora] ? String(row[colAsisHora]) : "temprano";
          return {
            exito: true,
            yaRegistrado: true,
            nombre: row[colAsisNombre] || nombreAlumno,
            dni: dni,
            fecha: fechaHoy,
            hora: horaRegistrada,
            mensaje: "¡Ya habías registrado tu asistencia hoy (" + fechaHoy + ") a las " + horaRegistrada + " hs!"
          };
        }
      }
    }

    // 4. Guardar la nueva asistencia
    hojaAsis.appendRow([fechaHoy, nombreAlumno, "'" + dni, horaHoy, "Presente"]);

    // 5. Actualizar pestaña de Seguimiento
    actualizarHojaSeguimiento(ss, dni, nombreAlumno, cursoAlumno);

    return {
      exito: true,
      yaRegistrado: false,
      nombre: nombreAlumno,
      dni: dni,
      fecha: fechaHoy,
      hora: horaHoy,
      mensaje: "¡Asistencia registrada correctamente! Que tengas una excelente clase."
    };

  } catch (error) {
    Logger.log("Error en registrarAsistencia: " + error.toString());
    return { exito: false, mensaje: "Error al registrar asistencia: " + error.message };
  }
}


// ===================================================================
// 3. MÓDULO DE CONSULTA DE ESTADO, SEGUIMIENTO Y FINALIZACIÓN
// ===================================================================

/**
 * Consulta el estado académico completo del alumno por DNI:
 * Clases asistidas, inasistencias, % de asistencia, condición y certificado de finalización.
 */
function consultarEstadoAlumno(dniIngresado) {
  try {
    var dni = normalizarDni(dniIngresado);
    if (!dni) {
      return { 
        encontrado: false, 
        exito: false, 
        mensaje: "Por favor, ingresa un número de DNI válido (sin puntos ni letras)." 
      };
    }

    var ss = obtenerSpreadsheet();
    if (!ss) {
      return { 
        encontrado: false, 
        exito: false, 
        mensaje: "No se pudo conectar con la hoja de Google Sheets. Asegúrate de que el script esté vinculado a la hoja o coloca el ID en la variable SPREADSHEET_ID (línea 16 de codigo.gs)." 
      };
    }

    // 1. Obtener datos del alumno (busca en Inscriptos, Seguimiento, etc.)
    var alumno = buscarAlumnoPorDni(ss, dni);

    // 2. Contar todas las asistencias registradas para este DNI en Asistencias
    var hojaAsis = obtenerHojaFlexible(ss, [HOJA_ASISTENCIAS, "Asistencias", "Presentes", "Clases"]);
    var totalAsistenciasAlumno = 0;
    var historialAsistencias = [];
    var fechasUnicasClases = {};

    if (hojaAsis && hojaAsis.getLastRow() > 1) {
      var filasAsis = hojaAsis.getDataRange().getValues();
      var headersAsis = filasAsis[0].map(function(h) { return String(h).toLowerCase().trim(); });

      var colAsisFecha = buscarIndiceColumna(headersAsis, [/fecha/, /dia/, /date/], 0);
      var colAsisNombre = buscarIndiceColumna(headersAsis, [/nombre/, /alumno/, /estudiante/], 1);
      var colAsisDni = buscarIndiceColumna(headersAsis, [/dni/, /documento/, /cedula/, /doc/], 2);
      var colAsisHora = buscarIndiceColumna(headersAsis, [/hora/, /time/, /ingreso/], 3);
      var colAsisEstado = buscarIndiceColumna(headersAsis, [/estado/, /asistencia/, /condicion/], 4);

      for (var i = 1; i < filasAsis.length; i++) {
        var row = filasAsis[i];
        var fFecha = formatearFechaGenerica(row[colAsisFecha]);
        var fNombre = row[colAsisNombre] || "";
        var fDni = normalizarDni(row[colAsisDni]);
        var fHora = row[colAsisHora] ? String(row[colAsisHora]) : "";
        var fEstado = row[colAsisEstado] || "Presente";

        // Coincidencia por columna o por cualquier celda de la fila
        var coincideDni = sonDnisIguales(fDni, dni);
        if (!coincideDni) {
          for (var c = 0; c < row.length; c++) {
            if (sonDnisIguales(row[c], dni)) {
              coincideDni = true;
              break;
            }
          }
        }

        if (fFecha) {
          fechasUnicasClases[fFecha] = true;
        }

        if (coincideDni) {
          totalAsistenciasAlumno++;
          historialAsistencias.push({
            fecha: fFecha,
            hora: fHora,
            estado: fEstado
          });
          if (!alumno) {
            alumno = {
              nombre: fNombre || ("Alumno DNI " + dni),
              dni: dni,
              curso: "Tornería e Hidráulica"
            };
          }
        }
      }
    }

    // 3. Si no encontramos al alumno ni asistencias, buscar en Seguimiento o Finalización
    if (!alumno) {
      var enSeg = buscarEnSeguimiento(ss, dni);
      if (enSeg) {
        alumno = enSeg;
        if (totalAsistenciasAlumno === 0 && enSeg.asistencias) {
          totalAsistenciasAlumno = Number(enSeg.asistencias) || 0;
        }
      }
    }

    // 4. Si definitivamente no existe ningún registro
    if (!alumno && totalAsistenciasAlumno === 0) {
      var totalInscriptos = contarTotalAlumnos(ss);
      var mensajeAyuda = "No se encontró ningún alumno registrado con el DNI " + dniIngresado + ".";
      if (totalInscriptos === 0) {
        mensajeAyuda += " La planilla de inscriptos está vacía en Google Sheets. Puedes inscribirte ahora en la pestaña 'Inscribirme'.";
      } else {
        mensajeAyuda += " Verifica que el DNI esté bien escrito o regístrate en la pestaña 'Inscribirme'.";
      }
      return {
        encontrado: false,
        exito: false,
        mensaje: mensajeAyuda,
        dni: dniIngresado
      };
    }

    // Total de clases dictadas
    var clasesDictadas = Math.max(Object.keys(fechasUnicasClases).length, totalAsistenciasAlumno, 1);
    var totalEsperado = Math.max(TOTAL_CLASES_CURSO, clasesDictadas);
    var inasistencias = Math.max(0, clasesDictadas - totalAsistenciasAlumno);
    var porcentaje = Math.round((totalAsistenciasAlumno / clasesDictadas) * 100);

    // 5. Revisar si ya está en la hoja de Finalización
    var finalizacionInfo = buscarEnFinalizacion(ss, dni);
    var cursoFinalizado = finalizacionInfo ? true : (totalAsistenciasAlumno >= Math.round(TOTAL_CLASES_CURSO * 0.75));
    var certificadoHabilitado = (porcentaje >= PORCENTAJE_MINIMO_CERTIFICADO);

    var condicion = "Regular";
    if (finalizacionInfo) {
      condicion = "Curso Finalizado (" + (finalizacionInfo.calificacion || "Aprobado") + ")";
    } else if (certificadoHabilitado) {
      condicion = "Al día (Habilitado para Certificado)";
    } else if (porcentaje >= 60) {
      condicion = "Regular (En riesgo de asistencia)";
    } else {
      condicion = "Asistencia Baja / Libre";
    }

    return {
      encontrado: true,
      exito: true,
      dni: dni,
      nombre: alumno ? alumno.nombre : "Alumno",
      curso: alumno ? (alumno.curso || "Tornería e Hidráulica") : "Tornería e Hidráulica",
      totalClasesDictadas: clasesDictadas,
      totalClasesCurso: totalEsperado,
      presentes: totalAsistenciasAlumno,
      asistencias: totalAsistenciasAlumno,
      ausentes: inasistencias,
      porcentaje: porcentaje,
      porcentajeTexto: porcentaje + "%",
      condicion: condicion,
      estado: condicion,
      certificado: certificadoHabilitado,
      finalizado: !!finalizacionInfo,
      detallesFinalizacion: finalizacionInfo,
      historial: historialAsistencias.reverse().slice(0, 10), // Últimas 10 asistencias
      mensaje: "Datos encontrados correctamente."
    };

  } catch (error) {
    Logger.log("Error en consultarEstadoAlumno: " + error.toString());
    return { encontrado: false, exito: false, mensaje: "Error al consultar estado: " + error.message };
  }
}


// ===================================================================
// 4. FUNCIONES DE BÚSQUEDA Y MANTENIMIENTO FLEXIBLES
// ===================================================================

/**
 * Busca a un alumno por su DNI en la hoja de Inscriptos o variantes.
 * Detecta dinámicamente las columnas para evitar errores si el orden cambió.
 */
function buscarAlumnoPorDni(ss, dni) {
  if (!ss) return null;

  var hoja = obtenerHojaFlexible(ss, [
    HOJA_INSCRIPTOS, "Inscripciones", "Alumnos", "Estudiantes", "Respuestas de formulario 1", "Sheet1", "Hoja 1"
  ]);

  if (hoja && hoja.getLastRow() > 1) {
    var filas = hoja.getDataRange().getValues();
    var headers = filas[0].map(function(h) { return String(h).toLowerCase().trim(); });

    var colDni = buscarIndiceColumna(headers, [/dni/, /documento/, /doc/, /cedula/, /identificacion/, /id/, /legajo/], 2);
    var colNombre = buscarIndiceColumna(headers, [/nombre/, /apellido/, /alumno/, /estudiante/], 1);
    var colCurso = buscarIndiceColumna(headers, [/curso/, /especialidad/, /taller/, /carrera/, /materia/], 5);
    var colTel = buscarIndiceColumna(headers, [/tel/, /cel/, /whatsapp/], 3);
    var colEmail = buscarIndiceColumna(headers, [/mail/, /correo/], 4);
    var colEstado = buscarIndiceColumna(headers, [/estado/, /condicion/], 6);

    for (var i = 1; i < filas.length; i++) {
      var row = filas[i];
      var coincide = sonDnisIguales(row[colDni], dni);

      // Si la columna detectada no coincidió, buscar en toda la fila por si el DNI está en otra columna
      if (!coincide) {
        for (var c = 0; c < row.length; c++) {
          if (sonDnisIguales(row[c], dni)) {
            coincide = true;
            break;
          }
        }
      }

      if (coincide) {
        var nombreEncontrado = row[colNombre] || "";
        // Si el nombre detectado es un número o está vacío, buscar la primera celda con texto que parezca nombre
        if (!nombreEncontrado || !isNaN(Number(nombreEncontrado))) {
          for (var k = 0; k < row.length; k++) {
            var val = String(row[k] || "").trim();
            if (val.length > 2 && isNaN(Number(val)) && val.indexOf('@') === -1 && val.indexOf('/') === -1) {
              nombreEncontrado = val;
              break;
            }
          }
        }

        return {
          fechaInscripcion: row[0],
          nombre: nombreEncontrado || ("Alumno DNI " + dni),
          dni: dni,
          telefono: row[colTel] || "",
          email: row[colEmail] || "",
          curso: row[colCurso] || "Tornería e Hidráulica",
          estado: row[colEstado] || "Activo"
        };
      }
    }
  }

  // Si no se encontró en Inscriptos, revisar si está en Seguimiento
  var enSeg = buscarEnSeguimiento(ss, dni);
  if (enSeg) return enSeg;

  // Si no, revisar en Finalización
  var enFin = buscarEnFinalizacion(ss, dni);
  if (enFin) {
    return {
      nombre: enFin.nombre,
      dni: dni,
      curso: "Tornería e Hidráulica",
      estado: "Finalizado"
    };
  }

  return null;
}

/**
 * Busca al alumno en la hoja Seguimiento.
 */
function buscarEnSeguimiento(ss, dni) {
  var hoja = obtenerHojaFlexible(ss, [HOJA_SEGUIMIENTO, "Seguimiento", "Progreso"]);
  if (!hoja || hoja.getLastRow() < 2) return null;

  var filas = hoja.getDataRange().getValues();
  var headers = filas[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var colDni = buscarIndiceColumna(headers, [/dni/, /documento/, /cedula/], 0);
  var colNombre = buscarIndiceColumna(headers, [/nombre/, /alumno/], 1);
  var colAsis = buscarIndiceColumna(headers, [/asistencias/, /presentes/], 3);

  for (var i = 1; i < filas.length; i++) {
    var row = filas[i];
    var coincide = sonDnisIguales(row[colDni], dni);
    if (!coincide) {
      for (var c = 0; c < row.length; c++) {
        if (sonDnisIguales(row[c], dni)) {
          coincide = true;
          break;
        }
      }
    }

    if (coincide) {
      return {
        dni: dni,
        nombre: row[colNombre] || ("Alumno DNI " + dni),
        curso: "Tornería e Hidráulica",
        asistencias: row[colAsis] || 0,
        estado: "Activo"
      };
    }
  }
  return null;
}

/**
 * Busca si el alumno está registrado en la hoja de Finalización.
 */
function buscarEnFinalizacion(ss, dni) {
  var hoja = obtenerHojaFlexible(ss, [HOJA_FINALIZACION, "Finalizacion", "Finalización", "Egresados", "Certificados"]);
  if (!hoja || hoja.getLastRow() < 2) return null;

  var filas = hoja.getDataRange().getValues();
  var headers = filas[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var colDni = buscarIndiceColumna(headers, [/dni/, /documento/, /cedula/], 0);
  var colNombre = buscarIndiceColumna(headers, [/nombre/, /alumno/], 1);
  var colFechaFin = buscarIndiceColumna(headers, [/fecha/], 2);
  var colCalif = buscarIndiceColumna(headers, [/calificaci/, /nota/, /aprobado/], 3);
  var colCert = buscarIndiceColumna(headers, [/certificad/, /nro/, /folio/], 4);

  for (var i = 1; i < filas.length; i++) {
    var row = filas[i];
    var coincide = sonDnisIguales(row[colDni], dni);
    if (!coincide) {
      for (var c = 0; c < row.length; c++) {
        if (sonDnisIguales(row[c], dni)) {
          coincide = true;
          break;
        }
      }
    }

    if (coincide) {
      return {
        dni: dni,
        nombre: row[colNombre] || "Alumno",
        fechaFin: formatearFechaGenerica(row[colFechaFin]),
        calificacion: row[colCalif] || "Aprobado",
        nroCertificado: row[colCert] || "-"
      };
    }
  }
  return null;
}

/**
 * Actualiza o agrega una fila en la pestaña "Seguimiento".
 */
function actualizarHojaSeguimiento(ss, dni, nombre, curso) {
  try {
    var hoja = obtenerHojaFlexible(ss, [HOJA_SEGUIMIENTO, "Seguimiento"], [
      "DNI", "Nombre Completo", "Total Clases", "Asistencias", "% Asistencia", "Condición", "Última Actualización"
    ]);

    // Contar asistencias actuales
    var hojaAsis = obtenerHojaFlexible(ss, [HOJA_ASISTENCIAS, "Asistencias", "Presentes"]);
    var asistenciasCount = 0;
    var fechasUnicas = {};

    if (hojaAsis && hojaAsis.getLastRow() > 1) {
      var fAsis = hojaAsis.getDataRange().getValues();
      var headersAsis = fAsis[0].map(function(h) { return String(h).toLowerCase().trim(); });
      var colAsisDni = buscarIndiceColumna(headersAsis, [/dni/, /documento/], 2);
      var colAsisFecha = buscarIndiceColumna(headersAsis, [/fecha/, /dia/], 0);

      for (var k = 1; k < fAsis.length; k++) {
        var rowA = fAsis[k];
        var fecha = formatearFechaGenerica(rowA[colAsisFecha]);
        if (fecha) fechasUnicas[fecha] = true;

        var coincide = sonDnisIguales(rowA[colAsisDni], dni);
        if (!coincide) {
          for (var c = 0; c < rowA.length; c++) {
            if (sonDnisIguales(rowA[c], dni)) {
              coincide = true;
              break;
            }
          }
        }
        if (coincide) asistenciasCount++;
      }
    }

    var clasesDictadas = Math.max(Object.keys(fechasUnicas).length, asistenciasCount, 1);
    var porc = Math.round((asistenciasCount / clasesDictadas) * 100);
    var cond = porc >= PORCENTAJE_MINIMO_CERTIFICADO ? "Habilitado Certificado" : (porc >= 60 ? "Regular" : "En Riesgo");
    var fechaActualizacion = formatearFecha(new Date()) + " " + formatearHora(new Date());

    var filas = hoja.getDataRange().getValues();
    var filaEncontrada = -1;

    for (var i = 1; i < filas.length; i++) {
      if (sonDnisIguales(filas[i][0], dni)) {
        filaEncontrada = i + 1; // 1-based index
        break;
      }
    }

    var valoresFila = [
      "'" + dni,
      nombre,
      clasesDictadas,
      asistenciasCount,
      porc + "%",
      cond,
      fechaActualizacion
    ];

    if (filaEncontrada !== -1) {
      hoja.getRange(filaEncontrada, 1, 1, valoresFila.length).setValues([valoresFila]);
    } else {
      hoja.appendRow(valoresFila);
    }
  } catch (e) {
    Logger.log("Error en actualizarHojaSeguimiento: " + e.toString());
  }
}

/**
 * Obtiene métricas generales para mostrar en el Kiosco.
 */
function obtenerResumenKiosco() {
  try {
    var ss = obtenerSpreadsheet();
    if (!ss) return { inscriptos: 0, asistenciasHoy: 0 };

    var hIns = obtenerHojaFlexible(ss, [HOJA_INSCRIPTOS, "Inscripciones", "Alumnos"]);
    var totalInscriptos = (hIns && hIns.getLastRow() > 1) ? (hIns.getLastRow() - 1) : 0;

    var hAsis = obtenerHojaFlexible(ss, [HOJA_ASISTENCIAS, "Asistencias"]);
    var hoy = formatearFecha(new Date());
    var presentesHoy = 0;

    if (hAsis && hAsis.getLastRow() > 1) {
      var rows = hAsis.getDataRange().getValues();
      var headers = rows[0].map(function(h) { return String(h).toLowerCase().trim(); });
      var colFecha = buscarIndiceColumna(headers, [/fecha/, /dia/], 0);

      for (var i = 1; i < rows.length; i++) {
        if (formatearFechaGenerica(rows[i][colFecha]) === hoy) {
          presentesHoy++;
        }
      }
    }

    return { inscriptos: totalInscriptos, asistenciasHoy: presentesHoy, fechaHoy: hoy };
  } catch (e) {
    return { inscriptos: 0, asistenciasHoy: 0 };
  }
}

/**
 * Cuenta cuántos alumnos hay cargados en la hoja de inscriptos.
 */
function contarTotalAlumnos(ss) {
  try {
    if (!ss) return 0;
    var h = obtenerHojaFlexible(ss, [HOJA_INSCRIPTOS, "Inscripciones", "Alumnos", "Estudiantes"]);
    if (h && h.getLastRow() > 1) {
      return h.getLastRow() - 1;
    }
    return 0;
  } catch(e) {
    return 0;
  }
}

/**
 * Verifica y crea los encabezados correspondientes en cada pestaña si no existen.
 */
function verificarEstructuraPlanilla() {
  var ss = obtenerSpreadsheet();
  if (!ss) return;

  obtenerHojaFlexible(ss, [HOJA_INSCRIPTOS, "Inscripciones", "Alumnos"], [
    "Fecha Inscripción", "Nombre Completo", "DNI", "Teléfono", "Email", "Especialidad", "Estado"
  ]);
  obtenerHojaFlexible(ss, [HOJA_ASISTENCIAS, "Asistencias"], [
    "Fecha", "Nombre completo", "DNI", "Hora ingreso", "Estado"
  ]);
  obtenerHojaFlexible(ss, [HOJA_SEGUIMIENTO, "Seguimiento"], [
    "DNI", "Nombre Completo", "Total Clases", "Asistencias", "% Asistencia", "Condición", "Última Actualización"
  ]);
  obtenerHojaFlexible(ss, [HOJA_FINALIZACION, "Finalizacion"], [
    "DNI", "Nombre Completo", "Fecha Finalización", "Calificación / Aprobación", "N° Certificado"
  ]);
  obtenerHojaFlexible(ss, [HOJA_CONSULTAS, "Consultas", "Chatbot", "Preguntas"], [
    "Fecha y Hora", "Nombre / Remitente", "Contacto (Tel/Email)", "Consulta / Mensaje", "Respuesta del Bot", "Estado"
  ]);
}

/**
 * Busca una pestaña de manera flexible entre una lista de nombres posibles.
 * Si no existe y se proveen encabezados, la crea.
 */
function obtenerHojaFlexible(ss, nombresPosibles, encabezados) {
  if (!ss) return null;
  if (typeof nombresPosibles === "string") nombresPosibles = [nombresPosibles];

  var todas = ss.getSheets();

  // 1. Coincidencia exacta
  for (var i = 0; i < nombresPosibles.length; i++) {
    var h = ss.getSheetByName(nombresPosibles[i]);
    if (h) return h;
  }

  // 2. Coincidencia sin distinguir mayúsculas ni espacios
  for (var k = 0; k < todas.length; k++) {
    var actual = todas[k].getName().toLowerCase().trim();
    for (var j = 0; j < nombresPosibles.length; j++) {
      if (actual === nombresPosibles[j].toLowerCase().trim()) {
        return todas[k];
      }
    }
  }

  // 3. Coincidencia por contenido de palabra clave
  for (var m = 0; m < todas.length; m++) {
    var nomActual = todas[m].getName().toLowerCase().trim();
    for (var n = 0; n < nombresPosibles.length; n++) {
      var clave = nombresPosibles[n].toLowerCase().trim();
      if (nomActual.indexOf(clave) !== -1 || clave.indexOf(nomActual) !== -1) {
        return todas[m];
      }
    }
  }

  // 4. Si no se encontró y se indicaron encabezados, se crea la pestaña
  if (encabezados && encabezados.length > 0) {
    var nuevoNombre = nombresPosibles[0];
    var nuevaHoja = ss.insertSheet(nuevoNombre);
    nuevaHoja.appendRow(encabezados);
    nuevaHoja.getRange(1, 1, 1, encabezados.length).setFontWeight("bold").setBackground("#e2e8f0");
    nuevaHoja.setFrozenRows(1);
    return nuevaHoja;
  }

  return null;
}

/**
 * Busca el índice de columna en un array de encabezados según una lista de expresiones regulares.
 */
function buscarIndiceColumna(headers, listaRegex, indiceFallback) {
  if (!headers || !headers.length) return indiceFallback;
  for (var c = 0; c < headers.length; c++) {
    var texto = String(headers[c] || "").toLowerCase().trim();
    for (var r = 0; r < listaRegex.length; r++) {
      if (listaRegex[r].test(texto)) {
        return c;
      }
    }
  }
  return indiceFallback;
}

/**
 * Normaliza el DNI quitando comillas, decimales y caracteres no numéricos.
 */
function normalizarDni(valor) {
  if (valor === null || valor === undefined) return "";
  var str = String(valor).trim();
  if (str.startsWith("'")) str = str.substring(1);
  if (str.indexOf('.') !== -1 && !isNaN(Number(str))) {
    str = str.split('.')[0];
  }
  return str.replace(/\D/g, "").trim();
}

/**
 * Compara dos valores de DNI asegurando coincidencia tanto por string limpio como numérica.
 */
function sonDnisIguales(valA, valB) {
  var a = normalizarDni(valA);
  var b = normalizarDni(valB);
  if (!a || !b) return false;
  if (a === b) return true;
  var numA = parseInt(a, 10);
  var numB = parseInt(b, 10);
  return !isNaN(numA) && !isNaN(numB) && numA === numB;
}

/**
 * Obtiene la referencia al Spreadsheet de Google Sheets.
 */
function obtenerSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch(e) {
      Logger.log("Error al abrir por SPREADSHEET_ID: " + e.toString());
    }
  }
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch(e) {
    Logger.log("No hay active spreadsheet: " + e.toString());
    return null;
  }
}

function formatearFecha(date) {
  var d = String(date.getDate()).padStart(2, '0');
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var y = date.getFullYear();
  return d + "/" + m + "/" + y;
}

function formatearHora(date) {
  var h = String(date.getHours()).padStart(2, '0');
  var m = String(date.getMinutes()).padStart(2, '0');
  var s = String(date.getSeconds()).padStart(2, '0');
  return h + ":" + m + ":" + s;
}

function formatearFechaGenerica(valor) {
  if (!valor) return "";
  if (valor instanceof Date) {
    return formatearFecha(valor);
  }
  return String(valor).trim();
}

// Alias de compatibilidad
function buscarAlumno(dni) { return consultarEstadoAlumno(dni); }
function consultarEstado(dni) { return consultarEstadoAlumno(dni); }
function consultarAsistencia(dni) { return consultarEstadoAlumno(dni); }

// ===================================================================
// GESTOR DE FOTOS DESDE GOOGLE DRIVE
// ===================================================================

/**
 * Obtiene dinámicamente las fotos contenidas en la carpeta de Google Drive configurada.
 * Devuelve un array de objetos con id, titulo y URLs directas para mostrar como fondo.
 */
function obtenerFotosDrive() {
  try {
    var rawId = (typeof DRIVE_CARPETA_FOTOS_ID !== 'undefined' ? DRIVE_CARPETA_FOTOS_ID : "").trim();
    if (!rawId) {
      Logger.log("Aviso: DRIVE_CARPETA_FOTOS_ID está vacío. Configúralo en codigo.gs.");
      return [];
    }

    var folderId = rawId;
    // Si pegaron la URL completa de Drive, extraer el ID automáticamente:
    if (folderId.indexOf("folders/") !== -1) {
      folderId = folderId.split("folders/")[1].split("?")[0].split("/")[0].trim();
    } else if (folderId.indexOf("id=") !== -1) {
      folderId = folderId.split("id=")[1].split("&")[0].trim();
    }

    var carpeta = DriveApp.getFolderById(folderId);
    if (!carpeta) {
      Logger.log("No se encontró la carpeta de Drive con ID: " + folderId);
      return [];
    }

    var archivos = carpeta.getFiles();
    var fotos = [];
    var extensiones = [".jpg", ".jpeg", ".png", ".webp", ".jfif", ".gif", ".bmp"];

    while (archivos.hasNext()) {
      var arch = archivos.next();
      var nombre = arch.getName();
      var mime = (arch.getMimeType() || "").toLowerCase();

      var esFoto = mime.indexOf("image/") === 0;
      if (!esFoto) {
        var nMin = nombre.toLowerCase();
        for (var i = 0; i < extensiones.length; i++) {
          if (nMin.indexOf(extensiones[i]) !== -1) {
            esFoto = true;
            break;
          }
        }
      }

      if (esFoto) {
        var id = arch.getId();
        var titulo = nombre.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
        if (titulo.length > 0) {
          titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
        } else {
          titulo = "Trabajo de Taller";
        }

        fotos.push({
          id: id,
          titulo: titulo,
          url: "https://drive.google.com/thumbnail?id=" + id + "&sz=w1920",
          urlSecundaria: "https://lh3.googleusercontent.com/d/" + id
        });
      }
    }

    Logger.log("obtenerFotosDrive encontró " + fotos.length + " fotos en Drive.");
    return fotos;
  } catch (error) {
    Logger.log("Error en obtenerFotosDrive: " + error.toString());
    return [];
  }
}

/**
 * Función de prueba para ejecutar en Apps Script.
 * Haz clic en "Ejecutar" con esta función seleccionada para autorizar permisos de Drive
 * y verificar cuántas fotos detecta.
 */
function probarFotosDrive() {
  Logger.log("==> Iniciando prueba de fotos de Google Drive...");
  var fotos = obtenerFotosDrive();
  Logger.log("==> Total de fotos encontradas: " + fotos.length);
  for (var i = 0; i < fotos.length; i++) {
    Logger.log(" [" + (i + 1) + "] " + fotos[i].titulo);
  }
  return fotos;
}

// ===================================================================
// MÓDULO CHATBOT VIRTUAL DE CONSULTAS
// ===================================================================

/**
 * Procesa la consulta enviada desde el chatbot, genera una respuesta atenta y respetuosa,
 * y guarda la conversación en la pestaña "Consultas" de la hoja de cálculo.
 */
function procesarConsultaChatbot(mensajeUsuario, nombreUsuario, contactoUsuario) {
  try {
    var texto = String(mensajeUsuario || "").trim();
    var nombre = String(nombreUsuario || "").trim();
    var contacto = String(contactoUsuario || "").trim();

    if (!texto) {
      return {
        exito: false,
        respuesta: "Por favor, escribe tu consulta y con mucho gusto te responderé."
      };
    }

    var nombreSaludo = nombre ? nombre : "estimado/a";
    var respuesta = generarRespuestaChatbot(texto, nombreSaludo);

    // Guardar en la hoja de cálculo (pestaña "Consultas")
    var ss = obtenerSpreadsheet();
    if (ss) {
      var hojaConsultas = obtenerHojaFlexible(ss, [HOJA_CONSULTAS, "Consultas", "Chatbot", "Preguntas"], [
        "Fecha y Hora", "Nombre / Remitente", "Contacto (Tel/Email)", "Consulta / Mensaje", "Respuesta del Bot", "Estado"
      ]);

      var ahora = new Date();
      var fechaHoraStr = formatearFecha(ahora) + " " + formatearHora(ahora);
      var tieneContacto = (contacto && contacto !== "No especificado" && contacto !== "No indicado");
      var estado = tieneContacto ? "Pendiente de contacto" : "Respondido por Bot";

      hojaConsultas.appendRow([
        fechaHoraStr,
        nombre || "Visitante",
        tieneContacto ? ("'" + contacto) : "No indicado",
        texto,
        respuesta,
        estado
      ]);
    }

    return {
      exito: true,
      respuesta: respuesta
    };

  } catch (error) {
    Logger.log("Error en procesarConsultaChatbot: " + error.toString());
    return {
      exito: true,
      respuesta: "Muchas gracias por tu consulta. Tu mensaje ha quedado registrado. Nuestro equipo del taller se pondrá en contacto a la brevedad."
    };
  }
}

/**
 * Genera una respuesta cordial, educada y contextual sobre el curso.
 * Si está configurada GEMINI_API_KEY, consulta la IA conectada a internet.
 * En caso contrario, utiliza el motor de conocimiento y búsqueda técnica web.
 */
function generarRespuestaChatbot(mensaje, nombre) {
  var texto = String(mensaje || "").trim();

  // 1. Si hay clave de Gemini API configurada, consultar IA de última generación
  var apiKey = (typeof GEMINI_API_KEY !== 'undefined' ? GEMINI_API_KEY : "").trim();
  if (apiKey) {
    try {
      var respuestaIA = consultarGeminiAI(texto, nombre, apiKey);
      if (respuestaIA && respuestaIA.length > 5) {
        return respuestaIA;
      }
    } catch (e) {
      Logger.log("Aviso al consultar Gemini AI: " + e.toString());
    }
  }

  // 2. Motor de conocimiento especializado de MetalmecanicaFG (Mercedes, Bs. As.)
  var m = texto.toLowerCase().trim();

  // A. Precio / Costo (¡ES 100% GRATIS!)
  if (/precio|costo|arancel|cu[aá]nto cuesta|cuota|pagar|valor|cobran|gratis|gratuito/i.test(m)) {
    return "¡Te tengo una excelente noticia, " + nombre + "! El Curso de Tornería e Hidráulica es **100% GRATUITO** (totalmente gratis, no tiene costo alguno ni de inscripción ni de cuotas mensuales).\n\n" +
      "Se dicta en el taller **MetalmecanicaFG** (Mercedes, Buenos Aires) con el objetivo de brindar formación práctica en oficios técnicos.\n\n" +
      "Para reservar tu vacante o recibir novedades de inicio, puedes dejar tu **número de WhatsApp** aquí en el chat o anotarte directamente en la pestaña '✍️ Inscribirme'.";
  }

  // B. Ubicación / Taller / Dónde se hace
  if (/d[oó]nde|lugar|ubicaci[oó]n|direcci[oó]n|taller|mercedes|metalmecanica/i.test(m)) {
    return "El curso se realiza de manera presencial en el taller **MetalmecanicaFG**, ubicado en la ciudad de **Mercedes, Provincia de Buenos Aires, Argentina**.\n\n" +
      "El taller cuenta con tornos paralelos y bancos de prueba de hidráulica para aprender con prácticas reales de mecanizado.\n\n" +
      "Si deseas la dirección exacta para acercarte o coordinar tu visita, por favor déjanos tu nombre y número de **WhatsApp** en el chat y te contactaremos con mucho agrado.";
  }

  // C. Horarios / Días / Cuándo empieza (A CONFIRMAR)
  if (/horario|d[ií]as|cu[aá]ndo empieza|cu[aá]ndo es|turno|fecha de inicio|qu[eé] d[ií]a/i.test(m)) {
    return "Respecto a los días y horarios de cursada, te informamos con mucho agrado que se encuentran actualmente **A CONFIRMAR** (próximamente se definirán los turnos y la fecha de inicio del próximo grupo).\n\n" +
      "Para asegurarte un cupo y que el equipo de **MetalmecanicaFG** te avise de inmediato apenas se confirmen los horarios, por favor déjanos tu nombre y número de **WhatsApp** aquí en el chat.";
  }

  // D. Contacto directo / WhatsApp para consultas específicas
  if (/whatsapp|contacto|tel[eé]fono|celular|llamar|comunicar|docente|profesor|espec[ií]fic/i.test(m)) {
    return "¡Con mucho gusto, " + nombre + "! Para consultas más completas, específicas o temas puntuales con el docente a cargo en **MetalmecanicaFG**, por favor déjanos tu nombre y número de **WhatsApp** aquí en el chat (o en la barra de contacto desplegable).\n\n" +
      "Nos comunicaremos directamente contigo a la brevedad para asesorarte en todo lo que necesites.";
  }

  // E. Inscripciones
  if (/inscrib|inscripci|anotar|anotarme|ingresar|registro|matr[ií]cula|vacante|cupo/i.test(m)) {
    return "Con mucho agrado te oriento, " + nombre + ". La inscripción al curso es **totalmente gratuita**.\n\n" +
      "Puedes anotarte ahora mismo desde esta pantalla haciendo clic en la pestaña superior **'✍️ Inscribirme'**, donde completas tu Nombre, DNI, Teléfono y eliges la especialidad.\n\n" +
      "Si prefieres ayuda personalizada, indícanos tu número de **WhatsApp** y el equipo de MetalmecanicaFG te contactará con gusto.";
  }

  // F. Saludos cordiales
  if (/^(hola|buen dia|buenos dias|buenas tardes|buenas noches|que tal|hola!|saludos)/i.test(m)) {
    return "¡Muy bienvenido/a! Es un verdadero gusto saludarte, " + nombre + ". Soy el asistente virtual del Curso de Tornería e Hidráulica del taller **MetalmecanicaFG** (Mercedes, Buenos Aires).\n\n" +
      "Te recordamos que el curso es **100% GRATUITO** y los horarios están actualmente **a confirmar**.\n\n" +
      "¿En qué te puedo asesorar hoy? Si necesitas una consulta específica, también puedes dejarnos tu **WhatsApp**.";
  }

  // G. Duración y Certificación (16 clases, 75%)
  if (/duraci[oó]n|cu[aá]nto dura|clases|certificad|diploma|aprob|requisito/i.test(m)) {
    return "El curso consta de un total de " + TOTAL_CLASES_CURSO + " clases prácticas y teóricas en el taller **MetalmecanicaFG**.\n\n" +
      "Para obtener el certificado de aprobación se requiere cumplir con un mínimo del " + PORCENTAJE_MINIMO_CERTIFICADO + "% de asistencia a las clases (" + Math.ceil(TOTAL_CLASES_CURSO * (PORCENTAJE_MINIMO_CERTIFICADO / 100)) + " clases asistidas).\n\n" +
      "Los horarios están a confirmar; déjanos tu **WhatsApp** si deseas que te avisemos en cuanto comience.";
  }

  // H. Temas técnicos / Consulta de conocimientos
  if (/temario|contenido|qu[eé] se enseña|aprender|torno|hidr[aá]ulica|mecanizad|cilindrado|rosca|bomba|v[aá]lvula/i.test(m)) {
    // Intentar buscar definición técnica en Wikipedia si es un término puntual
    var infoWeb = "";
    if (m.indexOf("torno") !== -1) infoWeb = consultarInternetTecnico("Torno");
    else if (m.indexOf("hidraulica") !== -1 || m.indexOf("hidráulica") !== -1) infoWeb = consultarInternetTecnico("Hidráulica");
    else if (m.indexOf("mecanizado") !== -1) infoWeb = consultarInternetTecnico("Mecanizado");

    var respuestaTecnica = "En el curso de **MetalmecanicaFG** aprenderás de forma 100% práctica en taller:\n" +
      "1) **Tornería y Mecanizado**: Puesta a punto del torno paralelo, afilado de herramientas, cilindrado, refrentado, roscado métrico/withworth, conos y control dimensional con calibres y micrómetros.\n" +
      "2) **Sistemas Hidráulicos**: Funcionamiento de bombas de engranajes y pistones, válvulas distribuidoras y de alivio, cilindros, lectura de esquemas y mantenimiento de circuitos hidráulicos.";

    if (infoWeb && infoWeb.length > 50) {
      respuestaTecnica = infoWeb + "\n\n" + respuestaTecnica;
    }

    return respuestaTecnica + "\n\n¡Es 100% gratuito! Si quieres coordinar o consultar temas específicos, déjanos tu número de **WhatsApp**.";
  }

  // I. Agradecimientos o despedidas
  if (/gracias|muchas gracias|agradezco|chau|adios|hasta luego/i.test(m)) {
    return "¡Ha sido un verdadero placer atenderte, " + nombre + "! En **MetalmecanicaFG** quedamos a tu entera disposición ante cualquier otra inquietud. ¡Que tengas una excelente jornada!";
  }

  // J. Respuesta general atenta con registro y pedido de WhatsApp
  return "Muchas gracias por tu consulta, " + nombre + ". He registrado tu mensaje en la planilla de **MetalmecanicaFG** (Mercedes, Bs. As.).\n\n" +
    "Te recordamos que el curso es **100% gratuito** y los horarios están **a confirmar**. Para brindarte una respuesta más completa y detallada a tu pregunta, por favor déjanos tu nombre y número de **WhatsApp** aquí en el chat para que el equipo docente se comunique directamente contigo. ¡Que tengas un gran día!";
}

/**
 * Consulta a la IA de Google Gemini para responder preguntas libres con información de internet.
 */
function consultarGeminiAI(pregunta, nombre, apiKey) {
  var promptSistema = "Eres el asistente virtual cordial, muy educado y respetuoso del 'Curso de Tornería e Hidráulica' dictado en el taller 'MetalmecanicaFG', ubicado en Mercedes, Provincia de Buenos Aires, Argentina.\n\n" +
    "INFORMACIÓN OBLIGATORIA DEL CURSO QUE DEBES SEGUIR ESTRICTAMENTE:\n" +
    "1. PRECIO: El curso es 100% GRATIS (totalmente gratuito, sin matrícula ni cuotas).\n" +
    "2. LUGAR: Se realiza de forma presencial en el taller 'MetalmecanicaFG', en la ciudad de Mercedes, Provincia de Buenos Aires, Argentina.\n" +
    "3. HORARIOS: Están actualmente A CONFIRMAR (próximamente se definirán e informarán las fechas y turnos).\n" +
    "4. DURACIÓN: Son 16 clases de taller. Se requiere al menos 75% de asistencia para recibir el certificado.\n" +
    "5. INSCRIPCIÓN: Se realiza desde la pestaña 'Inscribirme' de la web cargando DNI, Nombre y Teléfono.\n" +
    "6. CONTACTO PARA CONSULTAS ESPECÍFICAS: Para consultas más completas o específicas, invita SIEMPRE a la persona a dejar su nombre y número de WHATSAPP aquí en el chat para que el equipo de MetalmecanicaFG se comunique directamente.\n" +
    "7. CONOCIMIENTO TÉCNICO: Si te hacen preguntas técnicas sobre tornería, hidráulica, máquinas, herramientas, física de fluidos o mecánica, responde con precisión técnica, claridad y educación, aprovechando tus conocimientos de internet.\n" +
    "8. TONO: Muy educado, atento, respetuoso y formal, llamando al usuario por su nombre ('" + nombre + "').";

  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
  var payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: promptSistema + "\n\nPregunta del usuario (" + nombre + "): " + pregunta }]
      }
    ],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 600
    }
  };

  var opciones = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var res = UrlFetchApp.fetch(url, opciones);
  if (res.getResponseCode() === 200) {
    var json = JSON.parse(res.getContentText());
    if (json.candidates && json.candidates.length > 0 && json.candidates[0].content && json.candidates[0].content.parts.length > 0) {
      return json.candidates[0].content.parts[0].text.trim();
    }
  }
  return "";
}

/**
 * Consulta la enciclopedia técnica de Wikipedia en español para traer información verídica de internet.
 */
function consultarInternetTecnico(termino) {
  try {
    var url = "https://es.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(termino);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      var json = JSON.parse(res.getContentText());
      if (json && json.extract) {
        return "🌐 *Información técnica:* " + json.extract;
      }
    }
  } catch (e) {
    Logger.log("Aviso consulta Wikipedia: " + e.toString());
  }
  return "";
}



