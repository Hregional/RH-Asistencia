import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportesService } from '../../services/reportes.service';
import { AuthService } from '../../services/auth.service';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reportes.component.html',
  styleUrls: ['./reportes.component.scss']
})
export class ReportesComponent implements OnInit {
  private repService = inject(ReportesService);
  private authService = inject(AuthService);
  isSuperAdmin: boolean = false;
  empleadoBusqueda: string = '';
  empleadosEncontrados: any[] = [];
  empleadoSeleccionado: any = null;
  mostrandoResultados: boolean = false;
  areas: any[] = [];
  registros: any[] = [];
  horarios: any[] = [];
  eventosBiometricos: any[] = [];
  actualizandoBiometrico = false;
  sincronizandoMarcajes = false;

  areaSeleccionada: number | null = null;
  mesSeleccionado = '';
  semanaSeleccionada: any = null;
  semanas: any[] = [];
  tipoReporte: string = 'semana';
  diaEspecifico: string = '';

  fechaDesde: string = '';
  fechaHasta: string = '';
  tipoFiltroBiometricos: string = 'mes';

  cargando = false;

  async ngOnInit() {
    this.isSuperAdmin = await this.authService.hasRole('superadministrador');
    this.inicializarFechasPorDefecto();
    this.repService.getAreas().subscribe({
      next: (res) => {
        this.areas = res.areas;
      },
      error: (err) => {
        console.error('Error cargando áreas:', err);
      }
    });
  }

  inicializarFechasPorDefecto() {
    const hoy = new Date();
    const haceUnaSemana = new Date();
    haceUnaSemana.setDate(hoy.getDate() - 7);

    this.fechaDesde = haceUnaSemana.toISOString().split('T')[0];
    this.fechaHasta = hoy.toISOString().split('T')[0];
  }

  obtenerNombreArea() {
    const areaObj = this.areas.find(a => a.id == this.areaSeleccionada);
    return areaObj ? areaObj.nombre_area : 'Área no encontrada';
  }

  generarSemanas() {
    if (!this.mesSeleccionado) return;

    const [year, month] = this.mesSeleccionado.split('-').map(Number);
    const fechaInicioMes = new Date(year, month - 1, 1);
    const diasMes = new Date(year, month, 0).getDate();

    this.semanas = [];

    // Agregar opción "Mes Completo"
    this.semanas.push({
      numero: 0,
      desde: `${year}-${month.toString().padStart(2, '0')}-01`,
      hasta: `${year}-${month.toString().padStart(2, '0')}-${diasMes}`,
      texto: `Mes Completo (1-${diasMes} ${fechaInicioMes.toLocaleString('es', { month: 'short' })})`
    });

    let diaActual = 1;
    let numeroSemana = 1;

    while (diaActual <= diasMes) {
      const inicio = diaActual;
      const fin = Math.min(diaActual + 6, diasMes);
      const desde = new Date(year, month - 1, inicio).toISOString().split('T')[0];
      const hasta = new Date(year, month - 1, fin).toISOString().split('T')[0];
      const texto = `Semana ${numeroSemana}: ${inicio} al ${fin} ${fechaInicioMes.toLocaleString('es', { month: 'short' })}`;
      this.semanas.push({ numero: numeroSemana, desde, hasta, texto });
      diaActual += 7;
      numeroSemana++;
    }

    this.semanaSeleccionada = null;

    // Si es reporte de horarios, actualizar automáticamente el rango de fechas
    if (this.tipoReporte === 'horarios') {
      this.fechaDesde = `${year}-${month.toString().padStart(2, '0')}-01`;
      this.fechaHasta = `${year}-${month.toString().padStart(2, '0')}-${diasMes}`;
    }
  }

  generarReporteHorarios() {
    if (!this.areaSeleccionada) {
      alert('Seleccione un área.');
      return;
    }
    if (!this.fechaDesde || !this.fechaHasta) {
      alert('Seleccione un rango de fechas.');
      return;
    }

    this.cargando = true;
    this.repService.getReporteHorarios(this.areaSeleccionada, this.fechaDesde, this.fechaHasta).subscribe({
      next: (res: any) => {
        this.horarios = res.data || [];
        this.cargando = false;
        if (this.horarios.length === 0) {
          alert('No se encontraron horarios para los filtros seleccionados.');
        }
      },
      error: (err: any) => {
        console.error('Error al generar reporte de horarios:', err);
        this.cargando = false;
        alert('Error al generar el reporte: ' + (err.error?.message || err.message));
      }
    });
  }

  descargarPDFHorarios() {
    if (this.horarios.length === 0) {
      alert('No hay datos para generar el PDF. Genere el reporte primero.');
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4');
    const logo = new Image();
    logo.src = 'assets/logo-hospital.png';

    const fechaGen = new Date().toLocaleDateString('es-GT');
    const nombreArea = this.obtenerNombreArea();
    const rango = `${this.fechaDesde} al ${this.fechaHasta}`;

    const generarPDF = () => {
      // --- Encabezado ---
      doc.setFontSize(10);
      try {
        doc.addImage(logo, 'PNG', 14, 8, 25, 25);
      } catch (e) {
        console.warn('No se pudo cargar el logo, continuando sin imagen...');
      }

      doc.setFont('helvetica', 'bold');
      doc.text('Hospital Regional de Occidente', 45, 15);
      doc.setFontSize(14);
      doc.text('Planificación de Horarios', 45, 23);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Departamento: ${nombreArea}`, 14, 38);
      doc.text(`Rango de Fechas: ${rango}`, 140, 38);
      doc.text(`Generado: ${fechaGen}`, 240, 38);

      // --- Tabla ---
      const columnas = [
        { header: '#', dataKey: 'num' },
        { header: 'Nombre del Trabajador', dataKey: 'nombre' },
        { header: 'Puesto', dataKey: 'puesto' },
        { header: 'Detalle del Horario', dataKey: 'horario' },
        { header: 'Días de Descanso', dataKey: 'descanso' }
      ];

      const filas = this.horarios.map((emp, index) => {
        return {
          num: index + 1,
          nombre: emp.nombre_completo,
          puesto: emp.rol_nombre || 'No especificado',
          horario: emp.detalle_horario || 'N/A',
          descanso: emp.dias_descanso || 'N/A'
        };
      });

      autoTable(doc, {
        columns: columnas,
        body: filas,
        startY: 45,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [0, 82, 155], textColor: 255, halign: 'center' },
        columnStyles: {
          num: { halign: 'center', cellWidth: 15 },
          horario: { halign: 'center' },
          descanso: { halign: 'center' }
        },
        didDrawPage: (data) => {
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.height || pageSize.getHeight();

          doc.setLineWidth(0.5);
          doc.line(40, pageHeight - 30, 100, pageHeight - 30);
          doc.line(180, pageHeight - 30, 240, pageHeight - 30);

          doc.setFontSize(8);
          doc.text('Firma del Responsable', 50, pageHeight - 25);
          doc.text('Sello', 205, pageHeight - 25);
        }
      });

      const nombreArchivo = `Horarios_${nombreArea.replace(/\s+/g, '_')}_${this.fechaDesde}.pdf`;
      doc.save(nombreArchivo);
    };

    if (logo.complete) {
      generarPDF();
    } else {
      logo.onload = generarPDF;
      logo.onerror = generarPDF;
    }
  }

  generarReporte() {
    if (this.tipoReporte === 'biometricos') {
      this.generarReporteBiometricos();
    } else if (this.tipoReporte === 'horarios') {
      this.generarReporteHorarios();
    } else if (this.tipoReporte === 'permisos') {
      this.generarReportePermisos();
    } else {
      this.generarReporteAsistencia();
    }
  }

  generarReporteAsistencia() {
    if (!this.areaSeleccionada) {
      alert('Seleccione un área.');
      return;
    }

    if (this.tipoReporte === 'semana' && !this.semanaSeleccionada) {
      alert('Seleccione una semana.');
      return;
    }

    let desde: string, hasta: string;

    if (this.tipoReporte === 'todo') {
      // Reporte completo sin filtro de fecha
      desde = '';
      hasta = '';
    } else if (this.tipoReporte === 'mes' && this.mesSeleccionado) {
      // Reporte del mes completo
      const [year, month] = this.mesSeleccionado.split('-').map(Number);
      const diasMes = new Date(year, month, 0).getDate();
      desde = `${year}-${month.toString().padStart(2, '0')}-01`;
      hasta = `${year}-${month.toString().padStart(2, '0')}-${diasMes}`;
    } else {
      // Reporte por semana
      desde = this.semanaSeleccionada.desde;
      hasta = this.semanaSeleccionada.hasta;
    }

    this.cargando = true;

    this.repService.getReporte(this.areaSeleccionada, desde, hasta, this.tipoReporte).subscribe({
      next: (res) => {
        this.registros = res.registros;
        this.eventosBiometricos = []; // Limpiar eventos Biométricos
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error al generar reporte:', err);
        this.cargando = false;
        alert('Error al generar el reporte: ' + err.message);
      }
    });
  }

  buscarEmpleados() {
    if (this.empleadoBusqueda.length < 2) {
      this.empleadosEncontrados = [];
      this.mostrandoResultados = false;
      return;
    }

    this.repService.buscarEmpleados(this.empleadoBusqueda).subscribe({
      next: (res) => {
        this.empleadosEncontrados = res.empleados;
        this.mostrandoResultados = true;
      },
      error: (err) => {
        console.error('Error buscando empleados:', err);
        this.empleadosEncontrados = [];
        this.mostrandoResultados = false;
      }
    });
  }

  // Metodo para seleccionar un empleado
  seleccionarEmpleado(empleado: any) {
    this.empleadoSeleccionado = empleado;
    this.empleadoBusqueda = empleado.nombre_completo;
    this.mostrandoResultados = false;
  }

  // Metodo para limpiar la seleccion
  limpiarBusquedaEmpleado() {
    this.empleadoSeleccionado = null;
    this.empleadoBusqueda = '';
    this.empleadosEncontrados = [];
    this.mostrandoResultados = false;
  }


  generarReporteBiometricos() {
    if (this.tipoFiltroBiometricos === 'mes' && !this.mesSeleccionado) {
      alert('Seleccione un mes para generar el reporte de eventos Biométricos.');
      return;
    }

    if (this.tipoFiltroBiometricos === 'dia' && !this.diaEspecifico) {
      alert('Seleccione un día específico para generar el reporte de eventos Biométricos.');
      return;
    }

    if (this.tipoFiltroBiometricos === 'rango' && (!this.fechaDesde || !this.fechaHasta)) {
      alert('Seleccione ambas fechas (desde y hasta) para generar el reporte de eventos Biométricos.');
      return;
    }

    // NUEVA VALIDACION: Rango de fechas valido
    if (this.tipoFiltroBiometricos === 'rango') {
      const desde = new Date(this.fechaDesde);
      const hasta = new Date(this.fechaHasta);

      if (desde > hasta) {
        alert('La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
        return;
      }

      // Validar que el rango no sea muy extenso (opcional)
      const diffTime = Math.abs(hasta.getTime() - desde.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 31) {
        if (!confirm(`Está solicitando un reporte de ${diffDays} Días. Esto puede generar un archivo muy grande. ¿Desea continuar?`)) {
          return;
        }
      }
    }

    this.cargando = true;

    const parametro = this.tipoFiltroBiometricos === 'dia' ? this.diaEspecifico :
      this.tipoFiltroBiometricos === 'mes' ? this.mesSeleccionado :
        this.fechaDesde; // Para rango, podemos enviar cualquier fecha como parametro base

    const empleadoId = this.empleadoSeleccionado ? this.empleadoSeleccionado.id : undefined;

    this.repService.getEventosBiometricos(
      parametro,
      this.tipoFiltroBiometricos,
      empleadoId,
      this.fechaDesde,
      this.fechaHasta
    ).subscribe({
      next: (res) => {
        this.eventosBiometricos = res.eventos;
        this.registros = [];
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error al generar reporte de eventos Biométricos:', err);
        this.cargando = false;
        alert('Error al generar el reporte de eventos Biométricos: ' + err.message);
      }
    });
  }

  // NUEVO METODO PARA ACTUALIZAR BIOMETRICO
  actualizarBiometrico() {
    this.actualizandoBiometrico = true;

    this.repService.actualizarBiometrico().subscribe({
      next: (res) => {
        this.actualizandoBiometrico = false;
        if (res.success) {
          alert('Biométrico actualizado correctamente. Se encontraron ' + res.totalEventos + ' eventos.');

          // Si estamos en el reporte de eventos Biométricos, actualizar automÃ¡ticamente
          if (this.tipoReporte === 'biometricos') {
            this.generarReporteBiometricos();
          }
        } else {
          alert('Error al actualizar Biométrico: ' + res.message);
        }
      },
      error: (err) => {
        this.actualizandoBiometrico = false;
        console.error('Error actualizando Biométrico:', err);
        alert('Error al actualizar Biométrico: ' + err.message);
      }
    });
  }

  // Metodo para sincronizar marcajes anteriores
  sincronizarMarcajesAnteriores() {
    if (!this.fechaDesde || !this.fechaHasta) {
      alert('Seleccione las fechas desde y hasta para sincronizar.');
      return;
    }

    // Validar rango de fechas
    const desde = new Date(this.fechaDesde);
    const hasta = new Date(this.fechaHasta);

    if (desde > hasta) {
      alert('La fecha "Desde" no puede ser mayor que la fecha "Hasta".');
      return;
    }

    // Validar que el rango no sea muy extenso
    const diffTime = Math.abs(hasta.getTime() - desde.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 31) {
      if (!confirm(`Está solicitando sincronizar ${diffDays} Días. Esto puede tomar mucho tiempo. ¿Desea continuar?`)) {
        return;
      }
    }

    this.sincronizandoMarcajes = true;

    this.repService.sincronizarMarcajesAnteriores(this.fechaDesde, this.fechaHasta).subscribe({
      next: (res) => {
        this.sincronizandoMarcajes = false;
        if (res.success) {
          alert(`Sincronización completada:\n
            Eventos insertados: ${res.eventos}\n
            Duplicados omitidos: ${res.duplicados}\n
            Asistencias procesadas: ${res.asistencias}`);

          // Opcional: generar reporte automático después de sincronizar
          this.generarReporteBiometricos();
        } else {
          alert('Error al sincronizar marcajes: ' + res.message);
        }
      },
      error: (err) => {
        this.sincronizandoMarcajes = false;
        console.error('Error sincronizando marcajes:', err);
        alert('Error al sincronizar marcajes: ' + err.message);
      }
    });
  }

  // Modificar onTipoFiltroBiometricosChange para incluir la nueva opción
  onTipoFiltroBiometricosChange() {
    if (this.tipoFiltroBiometricos === 'mes') {
      this.diaEspecifico = '';
      this.fechaDesde = '';
      this.fechaHasta = '';
    } else if (this.tipoFiltroBiometricos === 'dia') {
      this.mesSeleccionado = '';
      this.fechaDesde = '';
      this.fechaHasta = '';
    } else if (this.tipoFiltroBiometricos === 'rango' || this.tipoFiltroBiometricos === 'marcajes_anteriores') {
      this.mesSeleccionado = '';
      this.diaEspecifico = '';
      // Inicializar rango si está vacío
      if (!this.fechaDesde || !this.fechaHasta) {
        this.inicializarFechasPorDefecto();
      }
    }
    this.eventosBiometricos = [];
  }


  obtenerResumen() {
    if (this.tipoReporte === 'biometricos') {
      const total = this.eventosBiometricos.length;
      const entradas = this.eventosBiometricos.filter(e => e.tipo_evento === 'ENTRADA').length;
      const salidas = this.eventosBiometricos.filter(e => e.tipo_evento === 'SALIDA').length;

      return {
        total,
        entradas,
        salidas,
        tipo: 'biometricos'
      };
    } else {
      const total = this.registros.length;
      const presentes = this.registros.filter(r =>
        r.estado_dia === 'Presente' ||
        (r.entrada_real && r.estado_dia !== 'Ausente')
      ).length;
      const ausentes = total - presentes;

      return { total, presentes, ausentes, tipo: 'asistencia' };
    }
  }


  // MÉTODOS PARA LAS CLASES DINÁMICAS
  getCumplimientoClass(valor: string): string {
    if (!valor) return '';
    const v = valor.toLowerCase();
    if (v.includes('con permiso')) return 'cumplimiento-permiso';
    if (v.includes('feriado')) return 'cumplimiento-feriado';
    if (v.includes('cumple')) return 'cumplimiento-exito';
    if (v.includes('retraso')) return 'cumplimiento-advertencia';
    if (v.includes('ausente')) return 'cumplimiento-error';
    if (v.includes('no aplica')) return 'cumplimiento-exento';
    return '';
  }


  getEstadoClass(estado: string): string {
    if (!estado) return '';
    if (estado.includes('No obligatorio')) return 'estado-exento';
    if (estado.includes('Con Permiso')) return 'estado-permiso';
    if (estado.includes('Feriado')) return 'estado-feriado';
    if (estado.includes('Presente')) return 'estado-presente';
    if (estado.includes('Ausente')) return 'estado-ausente';
    if (estado.includes('Retraso') || estado.includes('Tarde')) return 'estado-retraso';
    return '';
  }

  descargarExcel() {
    if (this.registros.length === 0 && this.eventosBiometricos.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    if (this.tipoReporte === 'biometricos') {
      this.descargarExcelEventosBiometricos();
    } else {
      this.descargarExcelAsistencia();
    }
  }

  descargarExcelAsistencia() {
    if (this.registros.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    const nombreArea = this.obtenerNombreArea();
    const fechaGen = new Date().toLocaleDateString('es-GT');
    const rango = this.obtenerRangoSeleccionado();

    // Preparar datos para Excel
    const datos = this.registros.map((r, index) => ({
      '#': index + 1,
      'Área': r.area,
      'Jefe de Área': r.jefe_area || 'No asignado',
      'Empleado': r.empleado,
      'Cargo': r.cargo,
      'Fecha': this.formatearFecha(r.fecha),
      'Turno': r.turno_asignado || 'N/A',
      'Tipo Turno': r.tipo_turno || 'N/A',
      'Entrada Programada': r.hora_entrada_programada || 'N/A',
      'Salida Programada': r.hora_salida_programada || 'N/A',
      'Entrada Real': r.entrada_real ? this.formatearHora(r.entrada_real) : '--:--',
      'Salida Real': r.salida_real ? this.formatearHora(r.salida_real) : '--:--',
      'Cumplimiento': r.cumplimiento,
      'Estado': r.estado_dia
    }));

    // Crear workbook y worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datos);

    // Agregar encabezado con información del reporte
    const encabezado = [
      ['Hospital Regional de Occidente'],
      ['Reporte de Asistencia por Área'],
      [`Área: ${nombreArea}`],
      [`Periodo: ${rango}`],
      [`Tipo: ${this.obtenerTipoReporteTexto()}`],
      [`Generado: ${fechaGen}`],
      [`Total registros: ${this.registros.length}`],
      [] // Línea en blanco
    ];

    XLSX.utils.sheet_add_aoa(ws, encabezado, { origin: 'A1' });

    // Estilizar el encabezado
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } });
    ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 12 } });

    // Ajustar anchos de columnas
    const colWidths = [
      { wch: 5 },   // #
      { wch: 15 },  // Área
      { wch: 20 },  // Jefe de Área
      { wch: 25 },  // Empleado
      { wch: 20 },  // Cargo
      { wch: 12 },  // Fecha
      { wch: 15 },  // Turno
      { wch: 12 },  // Tipo Turno
      { wch: 18 },  // Entrada Programada
      { wch: 18 },  // Salida Programada
      { wch: 15 },  // Entrada Real
      { wch: 15 },  // Salida Real
      { wch: 15 },  // Cumplimiento
      { wch: 15 }   // Estado
    ];
    ws['!cols'] = colWidths;

    // Agregar worksheet al workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Asistencia');

    // Generar nombre de archivo
    const nombreArchivo = `Reporte_Asistencia_${nombreArea.replace(/\s+/g, '_')}_${fechaGen.replace(/\//g, '-')}.xlsx`;

    // Descargar archivo
    XLSX.writeFile(wb, nombreArchivo);
  }

  descargarExcelEventosBiometricos() {
    if (this.eventosBiometricos.length === 0) {
      alert('No hay eventos Biométricos para exportar.');
      return;
    }

    const fechaGen = new Date().toLocaleDateString('es-GT');
    const resumen = this.obtenerResumen();

    // Preparar datos para Excel
    const datos = this.eventosBiometricos.map((evento, index) => ({
      '#': index + 1,
      'ID': evento.id,
      'Empleado': evento.empleado || 'No identificado',
      'Tipo Evento': evento.tipo_evento,
      'Fecha': evento.fecha,
      'Hora': evento.hora,
      'Dispositivo IP': evento.dispositivo_ip || 'N/A',
      'Renglón Evento': evento.codigo_evento || 'N/A',
      'Origen': evento.origen,
      'Procesado': evento.procesado ? 'Sí' : 'No',
      'Registrado En': evento.creado_en ?
        `${this.formatearFecha(evento.creado_en)} ${this.formatearHora(evento.creado_en)}` : 'N/A'
    }));

    // Crear workbook y worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datos);

    // Agregar encabezado con información del reporte
    const periodoInfo = this.diaEspecifico ?
      `Día: ${this.formatearFecha(this.diaEspecifico)}` :
      `Mes: ${this.mesSeleccionado}`;

    const encabezado = [
      ['Hospital Regional de Occidente'],
      ['Reporte de Eventos Biométricos'],
      [periodoInfo],
      [`Total eventos: ${resumen.total} | Entradas: ${resumen.entradas} | Salidas: ${resumen.salidas}`],
      [`Generado: ${fechaGen}`],
      [] // Línea en blanco
    ];

    XLSX.utils.sheet_add_aoa(ws, encabezado, { origin: 'A1' });

    // Estilizar el encabezado
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });
    ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 9 } });
    ws['!merges'].push({ s: { r: 2, c: 0 }, e: { r: 2, c: 9 } });
    ws['!merges'].push({ s: { r: 3, c: 0 }, e: { r: 3, c: 9 } });

    // Ajustar anchos de columnas
    const colWidths = [
      { wch: 5 },   // #
      { wch: 8 },   // ID
      { wch: 25 },  // Empleado
      { wch: 12 },  // Tipo Evento
      { wch: 12 },  // Fecha
      { wch: 10 },  // Hora
      { wch: 15 },  // Dispositivo IP
      { wch: 15 },  // Renglón Evento
      { wch: 10 },  // Origen
      { wch: 10 },  // Procesado
      { wch: 20 }   // Registrado En
    ];
    ws['!cols'] = colWidths;

    // Agregar worksheet al workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Eventos Biométricos');

    // Generar nombre de archivo
    const nombreArchivo = `Reporte_Eventos_Biometricos_${this.mesSeleccionado || this.diaEspecifico}_${fechaGen.replace(/\//g, '-')}.xlsx`;

    // Descargar archivo
    XLSX.writeFile(wb, nombreArchivo);
  }

  descargarPDF() {
    if (this.tipoReporte === 'horarios') {
      this.descargarPDFHorarios();
      return;
    }

    if (this.registros.length === 0 && this.eventosBiometricos.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    if (this.tipoReporte === 'biometricos') {
      this.descargarPDFEventosBiometricos();
    } else {
      this.descargarPDFAsistencia();
      this.eventosBiometricos = [];
    }

  }

  descargarPDFAsistencia() {
    if (this.registros.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    if (!this.areaSeleccionada) {
      console.error('No hay Ã¡rea seleccionada para el PDF');
      alert('Error: No se ha seleccionado un Ã¡rea vÃ¡lida.');
      return;
    }

    let nombreArea = this.obtenerNombreArea();

    if (nombreArea === 'Área no encontrada' && this.registros.length > 0) {
      nombreArea = this.registros[0].area || 'Área_Desconocida';
    }

    const doc = new jsPDF('l', 'mm', 'a4');
    const logo = new Image();
    logo.src = 'assets/logo-hospital.png';

    const fechaGen = new Date().toLocaleDateString('es-GT');
    const rango = this.obtenerRangoSeleccionado();
    const resumen = this.obtenerResumen();

    const nombreArchivo = `Reporte_${nombreArea.replace(/\s+/g, '_')}_${this.tipoReporte}_${fechaGen.replace(/\//g, '-')}.pdf`;

    logo.onload = () => {
      // --- Encabezado ---
      doc.setFontSize(10);
      try {
        doc.addImage(logo, 'PNG', 14, 8, 25, 25);
      } catch (e) {
        console.warn('No se pudo cargar el logo, continuando sin imagen...');
      }

      doc.setFont('helvetica', 'bold');
      doc.text('Hospital Regional de Occidente', 45, 15);
      doc.setFontSize(12);
      doc.text('Reporte de Asistencia por Área', 45, 23);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Área: ${nombreArea}`, 14, 38);
      doc.text(`Periodo: ${rango}`, 90, 38);
      doc.text(`Tipo: ${this.obtenerTipoReporteTexto()}`, 140, 38);
      doc.text(`Generado: ${fechaGen}`, 200, 38);

      doc.text(
        `Total: ${resumen.total} | Presentes: ${resumen.presentes} | Ausentes: ${resumen.ausentes}`,
        14,
        45
      );

      // --- Datos de la tabla ---
      const columnas = [
        { header: 'Empleado', dataKey: 'empleado' },
        { header: 'Cargo', dataKey: 'cargo' },
        { header: 'Fecha', dataKey: 'fecha' },
        { header: 'Turno', dataKey: 'turno_asignado' },
        { header: 'Tipo Turno', dataKey: 'tipo_turno' },
        { header: 'Entrada Prog.', dataKey: 'hora_entrada_programada' },
        { header: 'Salida Prog.', dataKey: 'hora_salida_programada' },
        { header: 'Entrada Real', dataKey: 'entrada_real' },
        { header: 'Salida Real', dataKey: 'salida_real' },
        { header: 'Cumplimiento', dataKey: 'cumplimiento' },
        { header: 'Estado', dataKey: 'estado_dia' }
      ];

      const filas = this.registros.map((r) => ({
        empleado: r.empleado,
        cargo: r.cargo,
        fecha: this.formatearFecha(r.fecha),
        turno_asignado: r.turno_asignado || 'N/A',
        tipo_turno: r.tipo_turno || 'N/A',
        hora_entrada_programada: r.hora_entrada_programada || 'N/A',
        hora_salida_programada: r.hora_salida_programada || 'N/A',
        entrada_real: r.entrada_real ? this.formatearHora(r.entrada_real) : '--:--',
        salida_real: r.salida_real ? this.formatearHora(r.salida_real) : '--:--',
        cumplimiento: r.cumplimiento,
        estado_dia: r.estado_dia
      }));

      autoTable(doc, {
        columns: columnas,
        body: filas,
        startY: 50,
        styles: {
          fontSize: 8,
          cellPadding: 2,
          font: 'helvetica'
        },
        headStyles: {
          fillColor: [0, 82, 155],
          textColor: 255,
          halign: 'center',
          fontStyle: 'bold'
        },
        alternateRowStyles: { fillColor: [240, 240, 240] },
        columnStyles: {
          cumplimiento: { halign: 'center' },
          estado_dia: { halign: 'center' },
          tipo_turno: { halign: 'center' },
          // Aplicar negritas a horas reales
          entrada_real: { fontStyle: 'bold' },
          salida_real: { fontStyle: 'bold' }
        },
        // Aplicar estilos condicionales a las celdas
        didParseCell: (data) => {
          // Colorear tipo de turno
          if (data.column.dataKey === 'tipo_turno' && data.cell.raw) {
            if (data.cell.raw === 'FIJO') {
              data.cell.styles.fillColor = [40, 167, 69]; // Verde
              data.cell.styles.textColor = 255;
            } else if (data.cell.raw === 'ROTATIVO') {
              data.cell.styles.fillColor = [23, 162, 184]; // Azul
              data.cell.styles.textColor = 255;
            }
          }

          // Colorear estado de cumplimiento
          if (data.column.dataKey === 'cumplimiento' && data.cell.raw) {
            const cumplimiento = typeof data.cell.raw === 'string' ? data.cell.raw.toLowerCase() : '';
            if (cumplimiento.includes('cumple')) {
              data.cell.styles.textColor = [25, 135, 84]; // Verde
              data.cell.styles.fontStyle = 'bold';
            } else if (cumplimiento.includes('retraso')) {
              data.cell.styles.textColor = [230, 126, 34]; // Naranja
              data.cell.styles.fontStyle = 'bold';
            } else if (cumplimiento.includes('ausente')) {
              data.cell.styles.textColor = [220, 53, 69]; // Rojo
              data.cell.styles.fontStyle = 'bold';
            } else if (cumplimiento.includes('no aplica')) {
              data.cell.styles.textColor = [32, 201, 151]; // Verde claro
              data.cell.styles.fontStyle = 'bold';
            }
          }

          // Colorear estado del dÃ­a
          if (data.column.dataKey === 'estado_dia' && data.cell.raw) {
            const estado = typeof data.cell.raw === 'string' ? data.cell.raw.toLowerCase() : '';
            if (estado.includes('presente') && !estado.includes('no obligatorio')) {
              data.cell.styles.textColor = [25, 135, 84]; // Verde
              data.cell.styles.fontStyle = 'bold';
            } else if (estado.includes('ausente')) {
              data.cell.styles.textColor = [220, 53, 69]; // Rojo
              data.cell.styles.fontStyle = 'bold';
            } else if (estado.includes('retraso') || estado.includes('tarde')) {
              data.cell.styles.textColor = [255, 193, 7]; // Amarillo
              data.cell.styles.fontStyle = 'bold';
            } else if (estado.includes('no obligatorio')) {
              data.cell.styles.textColor = [32, 201, 151]; // Verde claro
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        didDrawPage: (data) => {
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.height || pageSize.getHeight();
          doc.setFontSize(8);
          doc.text(
            `Página ${doc.getNumberOfPages()} | Generado: ${fechaGen}`,
            14,
            pageHeight - 5
          );
        }
      });

      doc.save(nombreArchivo);
    };

    setTimeout(() => {
      if (!logo.complete) {
        console.warn('Sin logo, generando PDF...');
        if (typeof logo.onload === 'function') {
          logo.onload(new Event('load'));
        }
      }
    }, 500);
  }

  obtenerTipoReporteTexto(): string {
    switch (this.tipoReporte) {
      case 'semana': return 'Por Semana';
      case 'mes': return 'Mes Completo';
      case 'horarios': return 'Planificación de Horarios';
      case 'todo': return 'Todo el Historial';
      case 'biometricos': return 'Eventos Biométricos';
      default: return 'No especificado';
    }
  }

  descargarPDFEventosBiometricos() {
    if (this.eventosBiometricos.length === 0) {
      alert('No hay eventos Biométricos para exportar.');
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4');
    const logo = new Image();
    logo.src = 'assets/logo-hospital.png';

    const fechaGen = new Date().toLocaleDateString('es-GT');
    const resumen = this.obtenerResumen();
    const nombreArchivo = `Reporte_Eventos_Biometricos_${this.mesSeleccionado || this.diaEspecifico}.pdf`;

    logo.onload = () => {
      // Encabezado
      doc.setFontSize(10);
      try {
        doc.addImage(logo, 'PNG', 14, 8, 25, 25);
      } catch (e) {
        console.warn('No se pudo cargar el logo...');
      }

      doc.setFont('helvetica', 'bold');
      doc.text('Hospital Regional de Occidente', 45, 15);
      doc.setFontSize(12);
      doc.text('Reporte de Eventos Biométricos', 45, 23);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      // Mostrar mes o día específico según corresponda
      if (this.diaEspecifico) {
        doc.text(`Día: ${this.formatearFecha(this.diaEspecifico)}`, 14, 38);
      } else {
        doc.text(`Mes: ${this.mesSeleccionado}`, 14, 38);
      }

      doc.text(`Total eventos: ${resumen.total}`, 90, 38);
      doc.text(`Entradas: ${resumen.entradas} | Salidas: ${resumen.salidas}`, 140, 38);
      doc.text(`Generado: ${fechaGen}`, 200, 38);

      // Columnas para eventos Biométricos
      const columnas = [
        { header: 'Empleado', dataKey: 'empleado' },
        { header: 'Tipo Evento', dataKey: 'tipo_evento' },
        { header: 'Fecha', dataKey: 'fecha' },
        { header: 'Hora', dataKey: 'hora' },
        { header: 'Dispositivo IP', dataKey: 'dispositivo_ip' },
        { header: 'Renglón Evento', dataKey: 'codigo_evento' },
        { header: 'Origen', dataKey: 'origen' },
        { header: 'Procesado', dataKey: 'procesado' }
      ];

      const filas = this.eventosBiometricos.map((e) => ({
        empleado: e.empleado || 'No identificado',
        tipo_evento: e.tipo_evento,
        fecha: this.formatearFecha(e.fecha),
        hora: e.hora,
        dispositivo_ip: e.dispositivo_ip || 'N/A',
        codigo_evento: e.codigo_evento || 'N/A',
        origen: e.origen,
        procesado: e.procesado ? 'Sí' : 'No'
      }));

      autoTable(doc, {
        columns: columnas,
        body: filas,
        startY: 50,
        styles: {
          fontSize: 8,
          cellPadding: 2,
          font: 'helvetica'
        },
        headStyles: {
          fillColor: [0, 82, 155],
          textColor: 255,
          halign: 'center',
          fontStyle: 'bold'
        },
        alternateRowStyles: { fillColor: [240, 240, 240] },
        columnStyles: {
          tipo_evento: { halign: 'center' },
          procesado: { halign: 'center' },
          // Aplicar negritas a la hora
          hora: { fontStyle: 'bold' }
        },
        // Aplicar estilos condicionales
        didParseCell: (data) => {
          // Colorear tipo de evento (ENTRADA/SALIDA)
          if (data.column.dataKey === 'tipo_evento' && data.cell.raw) {
            if (data.cell.raw === 'ENTRADA') {
              data.cell.styles.fillColor = [40, 167, 69]; // Verde
              data.cell.styles.textColor = 255;
              data.cell.styles.fontStyle = 'bold';
            } else if (data.cell.raw === 'SALIDA') {
              data.cell.styles.fillColor = [23, 162, 184]; // Azul
              data.cell.styles.textColor = 255;
              data.cell.styles.fontStyle = 'bold';
            }
          }

          // Colorear estado de procesado
          if (data.column.dataKey === 'procesado' && data.cell.raw) {
            if (data.cell.raw === 'Sí') {
              data.cell.styles.textColor = [25, 135, 84]; // Verde
              data.cell.styles.fontStyle = 'bold';
            } else {
              data.cell.styles.textColor = [220, 53, 69]; // Rojo
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        didDrawPage: (data) => {
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.height || pageSize.getHeight();
          doc.setFontSize(8);
          doc.text(
            `Página ${doc.getNumberOfPages()} | Generado: ${fechaGen}`,
            14,
            pageHeight - 5
          );
        }
      });

      doc.save(nombreArchivo);
    };

    setTimeout(() => {
      if (!logo.complete) {
        if (typeof logo.onload === 'function') {
          logo.onload(new Event('load'));
        }
      }
    }, 500);
  }

  formatearFecha(fechaString: string): string {
    if (!fechaString) return 'N/A';

    // Pattern for DD-MM-YYYY or DD/MM/YYYY
    const europeanDateRegex = /^(\d{2})[-/](\d{2})[-/](\d{4})/;
    const match = fechaString.match(europeanDateRegex);

    let fecha;

    if (match) {
      // If it matches DD-MM-YYYY, parse it manually
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // Month is 0-indexed
      const year = parseInt(match[3], 10);
      fecha = new Date(Date.UTC(year, month, day));
    } else {
      // Otherwise, try to parse it as is (handles ISO format YYYY-MM-DD and full ISO strings)
      const dateStringForParsing = /^\d{4}-\d{2}-\d{2}$/.test(fechaString)
        ? `${fechaString}T00:00:00Z`
        : fechaString;
      fecha = new Date(dateStringForParsing);
    }

    // Check if the created date is valid
    if (isNaN(fecha.getTime())) {
      return 'Fecha inválida';
    }

    return fecha.toLocaleDateString('es-GT', { timeZone: 'UTC' });
  }

  formatearHora(fechaHoraString: string): string {
    if (!fechaHoraString) return '--:--';

    try {
      const fecha = new Date(fechaHoraString);
      return fecha.toLocaleTimeString('es-GT', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Guatemala'
      });
    } catch (e) {
      return '--:--';
    }
  }

  obtenerRangoSeleccionado() {
    if (this.tipoReporte === 'biometricos') {
      if (this.tipoFiltroBiometricos === 'dia') {
        return `Día específico: ${this.formatearFecha(this.diaEspecifico)}`;
      } else if (this.tipoFiltroBiometricos === 'rango') {
        return `Rango: ${this.formatearFecha(this.fechaDesde)} a ${this.formatearFecha(this.fechaHasta)}`;
      } else if (this.tipoFiltroBiometricos === 'mes') {
        const [year, month] = this.mesSeleccionado.split('-');
        const fecha = new Date(parseInt(year), parseInt(month) - 1, 1);
        return `Mes completo: ${fecha.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' })}`;
      }
    }

    if (!this.semanaSeleccionada) return 'Sin rango';
    const { desde, hasta } = this.semanaSeleccionada;
    return `${this.formatearFecha(desde)} a ${this.formatearFecha(hasta)}`;
  }

  onAreaChange() {
    this.registros = [];
  }

  onTipoReporteChange() {
    if (this.tipoReporte === 'todo' || this.tipoReporte === 'biometricos') {
      this.semanaSeleccionada = null;
    }

    if (this.tipoReporte === 'biometricos') {
      this.tipoFiltroBiometricos = 'mes';
      this.diaEspecifico = '';
      this.fechaDesde = '';
      this.fechaHasta = '';
      this.inicializarFechasPorDefecto();
    } else if (this.tipoReporte === 'horarios') {
      this.fechaDesde = '';
      this.fechaHasta = '';
    } else if (this.tipoReporte === 'permisos') {
      this.inicializarFechasPorDefecto();
      this.estadoPermisoFiltro = 'AUTORIZADO';
      this.tipoFiltroPermisos = 'mes';
      this.mesPermisos = new Date().toISOString().substring(0, 7);
      this.onMesPermisosChange();
      this.reportePermisos = [];
    } else {
      this.diaEspecifico = '';
    }

    this.limpiarBusquedaEmpleado();
    this.registros = [];
    this.eventosBiometricos = [];
  }

  // ─── REPORTE DE PERMISOS ──────────────────────────────────────────
  estadoPermisoFiltro: string = 'AUTORIZADO';
  reportePermisos: any[] = [];
  tipoFiltroPermisos: string = 'mes';
  mesPermisos: string = '';

  onTipoFiltroPermisosChange() {
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.mesPermisos = '';
    this.reportePermisos = [];
  }

  onMesPermisosChange() {
    if (!this.mesPermisos) return;
    const [year, month] = this.mesPermisos.split('-').map(Number);
    const diasMes = new Date(year, month, 0).getDate();
    this.fechaDesde = `${year}-${String(month).padStart(2, '0')}-01`;
    this.fechaHasta = `${year}-${String(month).padStart(2, '0')}-${String(diasMes).padStart(2, '0')}`;
  }

  generarReportePermisos() {
    if (!this.fechaDesde || !this.fechaHasta) {
      alert('Seleccione el período.');
      return;
    }
    this.cargando = true;
    this.repService.getReportePermisos({
      desde: this.fechaDesde,
      hasta: this.fechaHasta,
      area_id: this.areaSeleccionada,
      empleado_id: this.empleadoSeleccionado?.id,
      estado: 'AUTORIZADO'  // siempre solo autorizados
    }).subscribe({
      next: (res: any) => {
        this.reportePermisos = res.data || [];
        this.cargando = false;
        if (this.reportePermisos.length === 0) alert('No se encontraron permisos para los filtros seleccionados.');
      },
      error: (err: any) => {
        this.cargando = false;
        alert('Error al generar el reporte: ' + (err.error?.error || err.message));
      }
    });
  }

  descargarExcelPermisos() {
    if (this.reportePermisos.length === 0) { alert('No hay datos para exportar.'); return; }
    const datos = this.reportePermisos.map((p, i) => ({
      '#': i + 1,
      'Empleado': p.nombre_completo,
      'Área': p.area_nombre || 'N/A',
      'Cargo': p.rol_nombre || 'N/A',
      'Tipo Permiso': p.tipo_permiso_nombre || p.tipo_permiso_otro || 'Otro',
      'Fecha Inicio': p.fecha_inicio,
      'Fecha Fin': p.fecha_fin,
      'Días': p.dias_solicitados,
      'Estado': p.estado,
      'Observaciones': p.observaciones || ''
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datos);
    ws['!cols'] = [5, 25, 20, 20, 20, 12, 12, 8, 12, 30].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Permisos');
    XLSX.writeFile(wb, `Reporte_Permisos_${this.fechaDesde}_${this.fechaHasta}.xlsx`);
  }

  descargarPDFPermisos() {
    if (this.reportePermisos.length === 0) { alert('No hay datos para exportar.'); return; }
    const doc = new jsPDF('l', 'mm', 'a4');
    const logo = new Image();
    logo.src = 'assets/logo-hospital.png';
    const fechaGen = new Date().toLocaleDateString('es-GT');

    const generarPDF = () => {
      try { doc.addImage(logo, 'PNG', 14, 8, 25, 25); } catch (e) { }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Hospital Regional de Occidente', 45, 15);
      doc.setFontSize(13);
      doc.text('Reporte de Permisos', 45, 23);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Período: ${this.fechaDesde} al ${this.fechaHasta}`, 14, 38);
      doc.text(`Estado: ${this.estadoPermisoFiltro}`, 120, 38);
      doc.text(`Generado: ${fechaGen}`, 220, 38);

      autoTable(doc, {
        columns: [
          { header: '#', dataKey: 'num' },
          { header: 'Empleado', dataKey: 'nombre' },
          { header: 'Área', dataKey: 'area' },
          { header: 'Tipo Permiso', dataKey: 'tipo' },
          { header: 'Inicio', dataKey: 'inicio' },
          { header: 'Fin', dataKey: 'fin' },
          { header: 'Días', dataKey: 'dias' },
          { header: 'Estado', dataKey: 'estado' }
        ],
        body: this.reportePermisos.map((p, i) => ({
          num: i + 1,
          nombre: p.nombre_completo,
          area: p.area_nombre || 'N/A',
          tipo: p.tipo_permiso_nombre || p.tipo_permiso_otro || 'Otro',
          inicio: p.fecha_inicio,
          fin: p.fecha_fin,
          dias: p.dias_solicitados,
          estado: p.estado
        })),
        startY: 45,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [0, 82, 155], textColor: 255, halign: 'center' },
        didParseCell: (data) => {
          if (data.column.dataKey === 'estado') {
            const v = String(data.cell.raw);
            if (v === 'AUTORIZADO') data.cell.styles.textColor = [25, 135, 84];
            else if (v === 'RECHAZADO') data.cell.styles.textColor = [220, 53, 69];
            else data.cell.styles.textColor = [230, 126, 34];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });
      doc.save(`Reporte_Permisos_${this.fechaDesde}_${this.fechaHasta}.pdf`);
    };

    if (logo.complete) generarPDF();
    else { logo.onload = generarPDF; logo.onerror = generarPDF; }
  }
}
