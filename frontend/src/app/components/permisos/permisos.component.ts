import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KeycloakService } from 'keycloak-angular';
import { PermisosService, Permiso, TipoPermiso } from '../../services/permisos.service';
import { EmpleadosService, Empleado, Rol, Area } from '../../services/empleados.service';
import {
  esFeriado, getNombreFeriado, parseFechaLocal,
  calcularDiasHabilesGT, feriadosEnRango, finesDeSemanaEnRango,
  getPascua
} from '../../utils/feriados';

// ─── Número a letras (español) ───────────────────────────────────────────────
const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];

export function numeroALetras(n: number): string {
  if (n === 0) return 'CERO';
  if (n < 20) return UNIDADES[n];
  if (n < 30) return n === 20 ? 'VEINTE' : 'VEINTI' + UNIDADES[n - 20];
  const dec = Math.floor(n / 10);
  const uni = n % 10;
  return uni === 0 ? DECENAS[dec] : DECENAS[dec] + ' Y ' + UNIDADES[uni];
}

@Component({
  selector: 'app-permisos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './permisos.component.html',
  styleUrls: ['./permisos.component.scss']
})
export class PermisosComponent implements OnInit {
  permisos: Permiso[] = [];
  empleados: Empleado[] = [];
  tiposPermiso: TipoPermiso[] = [];
  roles: Rol[] = [];
  areas: Area[] = [];

  loading = false;
  error: string | null = null;

  searchTerm = '';
  filtroEstado: 'TODOS' | 'PENDIENTE' | 'AUTORIZADO' | 'RECHAZADO' = 'TODOS';

  // Vistas
  vistaActual: 'tabla' | 'solicitud' | 'editarPermiso' | 'tiposPermiso' = 'tabla';

  // Buscador empleado en solicitud
  empleadoBusqueda = '';
  empleadosFiltrados: Empleado[] = [];
  empleadoSeleccionado: Empleado | null = null;

  // Formulario solicitud / edición
  solicitudForm: Partial<Permiso> = this.initSolicitudForm();

  // Formulario tipo de permiso
  tipoPermisoForm: TipoPermiso = this.initTipoForm();
  editingTipoPermiso: TipoPermiso | null = null;

  // Permiso en edición
  editingPermiso: Permiso | null = null;

  // Flag para impresión directa desde tabla
  imprimiendoDesdeTabla = false;

  // Popup de observaciones
  popupObservaciones: { permiso: Permiso; x: number; y: number } | null = null;

  // Modal de aviso simple
  avisoModal: string | null = null;

  mostrarObservaciones(event: MouseEvent, permiso: Permiso) {
    event.stopPropagation();
    this.popupObservaciones = { permiso, x: event.clientX, y: event.clientY };
  }

  cerrarPopup() {
    this.popupObservaciones = null;
  }

  getTextoObservaciones(permiso: Permiso): string {
    if (permiso.observaciones?.trim()) return permiso.observaciones;
    if (permiso.estado === 'PENDIENTE') return 'Pendiente de autorizar';
    if (permiso.estado === 'AUTORIZADO') return 'Permiso autorizado';
    if (permiso.estado === 'RECHAZADO') return 'Permiso rechazado';
    return '—';
  }

  // Advertencia de días excedidos
  diasExcedidos = false;

  // Fecha mínima = hoy
  readonly hoy = new Date().toISOString().substring(0, 10);

  /** True cuando el tipo seleccionado tiene límite de 1 día */
  get esDiaUnico(): boolean {
    if (this.solicitudForm.tipo_permiso_id === -1) return false;
    const tipo = this.tiposPermiso.find(t => t.id === this.solicitudForm.tipo_permiso_id);
    return tipo?.dias_permitidos === 1;
  }

  // Carta preview
  cartaData = this.initCartaData();

  // Usuario logueado actual
  usuarioActual = '';

  constructor(
    private permisosSvc: PermisosService,
    private empleadosSvc: EmpleadosService,
    private kc: KeycloakService
  ) { }

  ngOnInit() {
    this.loadPermisos();
    this.loadEmpleados();
    this.loadTiposPermiso();
    this.empleadosSvc.getRoles().subscribe(r => { if (r.success && r.data) this.roles = r.data; });
    this.empleadosSvc.getAreas().subscribe(a => { if (a.success && a.data) this.areas = a.data; });
    // Obtener username del usuario logueado
    try {
      const token = this.kc.getKeycloakInstance()?.tokenParsed as any;
      this.usuarioActual = token?.preferred_username || token?.name || '';
    } catch { this.usuarioActual = ''; }
  }

  private initSolicitudForm(): Partial<Permiso> {
    return {
      empleado_id: 0,
      tipo_permiso_id: undefined,
      tipo_permiso_otro: '',
      mensaje_otro: '',
      fecha_inicio: '',
      fecha_fin: '',
      dias_solicitados: 0,
      estado: 'PENDIENTE'
    };
  }

  private initTipoForm(): TipoPermiso {
    return { nombre: '', dias_permitidos: 1, mensaje_carta: '' };
  }

  private initCartaData() {
    return {
      nombreEmpleado: '',
      renglon: '',
      area: '',
      rol: '',
      dia: '',
      mes: '',
      anio: '',
      tipoPermiso: '',
      mensaje: '',
      fechaInicio: '',
      fechaFin: '',
      diasSolicitados: 0,
      diasEnLetras: '',
      feriadosIncluidos: [] as string[],
      finesDeSemanaCont: 0,
      creadoPor: '',
      autorizadoPor: '',
      fechaHoraImpresion: '',
      autorizadoEn: ''
    };
  }

  // ─── CARGA DE DATOS ───────────────────────────────────────────────
  loadPermisos() {
    this.loading = true;
    // Cargar todos los permisos para gestión (vigentes, futuros y recientes)
    this.permisosSvc.getPermisos('todos').subscribe({
      next: (res) => {
        this.permisos = res.success && res.data ? res.data : [];
        this.updatePagination();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  loadEmpleados() {
    this.empleadosSvc.getEmpleados().subscribe({
      next: (res: any) => {
        if (res.success && res.data) {
          this.empleados = res.data.filter((e: Empleado) => e.activo);
        }
      },
      error: (err) => console.error('Error cargando empleados:', err)
    });
  }

  loadTiposPermiso() {
    this.permisosSvc.getTiposPermiso().subscribe({
      next: (res) => { this.tiposPermiso = res.success && res.data ? res.data : []; },
      error: (err) => console.error('Error cargando tipos:', err)
    });
  }

  get filteredPermisos(): Permiso[] {
    const t = this.norm(this.searchTerm);
    let lista = this.permisos;

    // Filtro por estado
    if (this.filtroEstado !== 'TODOS') {
      lista = lista.filter(p => p.estado === this.filtroEstado);
    }

    // Filtro por texto
    if (!t) return lista;
    return lista.filter(p =>
      [p.nombre_completo, p.rol_nombre, p.area_nombre].some(v => this.norm(String(v || '')).includes(t))
    );
  }

  // Paginación
  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 1;

  get paginatedPermisos(): Permiso[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    return this.filteredPermisos.slice(start, start + this.itemsPerPage);
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredPermisos.length / this.itemsPerPage) || 1;
    if (this.currentPage > this.totalPages) this.currentPage = 1;
  }

  prevPage(): void { if (this.currentPage > 1) this.currentPage--; }
  nextPage(): void { if (this.currentPage < this.totalPages) this.currentPage++; }

  tienePermisoVigente(permiso: Permiso): boolean {
    if (!permiso.fecha_inicio || !permiso.fecha_fin) return false;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicio = new Date(permiso.fecha_inicio + 'T00:00:00');
    const fin = new Date(permiso.fecha_fin + 'T00:00:00');
    return inicio <= hoy && hoy <= fin;
  }

  private norm(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  // ─── BUSCADOR EMPLEADO ────────────────────────────────────────────
  onEmpleadoBusqueda() {
    const t = this.norm(this.empleadoBusqueda);
    if (!t) { this.empleadosFiltrados = []; return; }
    this.empleadosFiltrados = this.empleados.filter(e =>
      [e.nombre_completo, String(e.numero_empleado),
      (e as any).rol_nombre || '', (e as any).area_nombre || '']
        .some(v => this.norm(String(v)).includes(t))
    ).slice(0, 10);
  }

  seleccionarEmpleado(emp: Empleado) {
    this.empleadoSeleccionado = emp;
    this.solicitudForm.empleado_id = emp.id!;
    this.empleadoBusqueda = emp.nombre_completo;
    this.empleadosFiltrados = [];
    this.actualizarCarta();
  }

  // ─── NAVEGACIÓN ───────────────────────────────────────────────────
  irASolicitud() {
    this.vistaActual = 'solicitud';
    this.editingPermiso = null;
    this.empleadoSeleccionado = null;
    this.empleadoBusqueda = '';
    this.empleadosFiltrados = [];
    this.solicitudForm = this.initSolicitudForm();
    this.cartaData = this.initCartaData();
    this.diasExcedidos = false;
  }

  /** Normaliza fecha ISO con timezone a 'YYYY-MM-DD' para inputs date */
  private toDateInput(val: string | undefined): string {
    if (!val) return '';
    // Si ya tiene formato YYYY-MM-DD, retornar directo
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    // Si viene con timezone (ej: 2026-04-23T06:00:00.000Z), tomar solo la parte de fecha
    return val.substring(0, 10);
  }

  irAEditarPermiso(permiso: Permiso) {
    this.editingPermiso = permiso;
    this.vistaActual = 'editarPermiso';

    // Si tipo_permiso_id es null, es personalizado → mapear a -1
    const tipoId = permiso.tipo_permiso_id ?? (permiso.tipo_permiso_otro ? -1 : undefined);

    this.solicitudForm = {
      ...permiso,
      tipo_permiso_id: tipoId,
      fecha_inicio: this.toDateInput(permiso.fecha_inicio),
      fecha_fin: this.toDateInput(permiso.fecha_fin),
    };
    this.empleadoSeleccionado = this.empleados.find(e => e.id === permiso.empleado_id) || null;
    this.empleadoBusqueda = permiso.nombre_completo || '';
    this.diasExcedidos = false;
    if (this.solicitudForm.fecha_inicio && this.solicitudForm.fecha_fin) {
      this.solicitudForm.dias_solicitados = calcularDiasHabilesGT(
        parseFechaLocal(this.solicitudForm.fecha_inicio),
        parseFechaLocal(this.solicitudForm.fecha_fin)
      );
      const tipo = this.tiposPermiso.find(t => t.id === this.solicitudForm.tipo_permiso_id);
      this.diasExcedidos = !!(tipo && this.solicitudForm.dias_solicitados > tipo.dias_permitidos);
    }
    this.actualizarCarta();
  }

  irATiposPermiso() {
    this.vistaActual = 'tiposPermiso';
    this.editingTipoPermiso = null;
    this.tipoPermisoForm = this.initTipoForm();
  }

  volverATabla() {
    this.vistaActual = 'tabla';
    this.editingPermiso = null;
    this.editingTipoPermiso = null;
    this.error = null;
    this.loadPermisos();
  }

  // ─── TIPO PERMISO CHANGE ──────────────────────────────────────────
  onTipoPermisoChange() {
    // Solo limpiar campos específicos del tipo anterior, no todo
    this.solicitudForm.tipo_permiso_otro = '';
    this.solicitudForm.mensaje_otro = '';

    // Solo resetear fechas para recalcular días hábiles según el nuevo tipo
    this.solicitudForm.fecha_inicio = '';
    this.solicitudForm.fecha_fin = '';
    this.solicitudForm.dias_solicitados = 0;
    this.diasExcedidos = false;
    this.actualizarCarta();
  }

  // ─── CÁLCULO DE DÍAS HÁBILES (calendario guatemalteco) ───────────
  calcularDias() {
    // Si es permiso de 1 día, forzar fecha_fin = fecha_inicio antes de validar
    if (this.esDiaUnico && this.solicitudForm.fecha_inicio) {
      this.solicitudForm.fecha_fin = this.solicitudForm.fecha_inicio;
    }
    if (!this.solicitudForm.fecha_inicio || !this.solicitudForm.fecha_fin) {
      this.solicitudForm.dias_solicitados = 0;
      this.actualizarCarta();
      return;
    }
    const inicio = parseFechaLocal(this.solicitudForm.fecha_inicio);
    const fin = parseFechaLocal(this.solicitudForm.fecha_fin);
    this.solicitudForm.dias_solicitados = calcularDiasHabilesGT(inicio, fin);

    // Validar límite del tipo de permiso (solo días hábiles, no fines de semana/feriados)
    const tipo = this.tiposPermiso.find(t => t.id === this.solicitudForm.tipo_permiso_id);
    this.diasExcedidos = !!(tipo && this.solicitudForm.dias_solicitados > tipo.dias_permitidos);

    this.actualizarCarta();
  }

  // ─── CARTA PREVIEW ────────────────────────────────────────────────
  actualizarCarta() {
    const tipo = this.tiposPermiso.find(t => t.id === this.solicitudForm.tipo_permiso_id);
    const hoy = new Date();
    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
      'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

    const fmtFecha = (iso: string) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    };

    const emp = this.empleadoSeleccionado;
    const rolNombre = emp ? (this.roles.find(r => r.id === emp.rol_id)?.nombre || '') : '';
    const areaNombre = emp ? (this.areas.find(a => a.id === emp.area_id)?.nombre || '') : '';
    const dias = this.solicitudForm.dias_solicitados || 0;

    const feriados = (this.solicitudForm.fecha_inicio && this.solicitudForm.fecha_fin)
      ? feriadosEnRango(parseFechaLocal(this.solicitudForm.fecha_inicio), parseFechaLocal(this.solicitudForm.fecha_fin))
      : [];

    const finesSemana = (this.solicitudForm.fecha_inicio && this.solicitudForm.fecha_fin)
      ? finesDeSemanaEnRango(parseFechaLocal(this.solicitudForm.fecha_inicio), parseFechaLocal(this.solicitudForm.fecha_fin))
      : 0;

    this.cartaData = {
      nombreEmpleado: emp?.nombre_completo || '',
      renglon: emp?.renglon || '',
      area: areaNombre,
      rol: rolNombre,
      dia: String(hoy.getDate()).padStart(2, '0'),
      mes: meses[hoy.getMonth()],
      anio: String(hoy.getFullYear()),
      tipoPermiso: this.solicitudForm.tipo_permiso_id === -1
        ? (this.solicitudForm.tipo_permiso_otro || '')
        : (tipo?.nombre || ''),
      mensaje: this.solicitudForm.tipo_permiso_id === -1
        ? (this.solicitudForm.mensaje_otro || '')
        : (tipo?.mensaje_carta || ''),
      fechaInicio: fmtFecha(this.solicitudForm.fecha_inicio || ''),
      fechaFin: fmtFecha(this.solicitudForm.fecha_fin || ''),
      diasSolicitados: dias,
      diasEnLetras: dias > 0 ? numeroALetras(dias) : '',
      feriadosIncluidos: feriados,
      finesDeSemanaCont: finesSemana,
      creadoPor: this.usuarioActual,
      autorizadoPor: '',
      fechaHoraImpresion: '',
      autorizadoEn: ''
    };
  }

  // ─── GUARDAR SOLICITUD ────────────────────────────────────────────
  guardarSolicitud() {
    if (!this.solicitudForm.empleado_id || !this.solicitudForm.fecha_inicio || !this.solicitudForm.fecha_fin) {
      this.error = 'Complete todos los campos requeridos';
      return;
    }
    if (this.solicitudForm.tipo_permiso_id === undefined) {
      this.error = 'Seleccione un tipo de permiso';
      return;
    }
    if (this.solicitudForm.tipo_permiso_id === -1) {
      if (!this.solicitudForm.tipo_permiso_otro?.trim()) {
        this.error = 'El nombre del permiso es obligatorio';
        return;
      }
      if (!this.solicitudForm.mensaje_otro?.trim()) {
        this.error = 'El motivo del permiso es obligatorio';
        return;
      }
    }
    if (!this.solicitudForm.dias_solicitados || this.solicitudForm.dias_solicitados === 0) {
      this.error = 'El rango de fechas no contiene días hábiles. Verifique las fechas.';
      return;
    }
    if (this.diasExcedidos) {
      const tipo = this.tiposPermiso.find(t => t.id === this.solicitudForm.tipo_permiso_id);
      this.error = `Los días hábiles (${this.solicitudForm.dias_solicitados}) exceden el límite del tipo de permiso (${tipo?.dias_permitidos} días).`;
      return;
    }

    // Verificar si tiene turno asignado en ese rango
    this.permisosSvc.getTurnosEnRango(
      this.solicitudForm.empleado_id!,
      this.solicitudForm.fecha_inicio!,
      this.solicitudForm.fecha_fin!
    ).subscribe({
      next: (res) => {
        if (res.tieneTurnos) {
          const turnos = res.turnos.map((t: any) => `${t.nombre_turno} (${t.fecha_inicio} - ${t.fecha_fin})`).join(', ');
          if (!confirm(`⚠️ Este empleado tiene turno(s) asignado(s) en este período:\n${turnos}\n\n¿Desea crear el permiso de todas formas?`)) return;
        }
        this.ejecutarGuardarSolicitud();
      },
      error: () => this.ejecutarGuardarSolicitud() // si falla la verificación, continuar
    });
  }

  private ejecutarGuardarSolicitud() {
    this.loading = true;
    const data: any = { ...this.solicitudForm };
    if (data.tipo_permiso_id === -1) {
      data.tipo_permiso_id = null;
    } else {
      data.tipo_permiso_otro = null;
      data.mensaje_otro = null;
    }

    this.permisosSvc.createPermiso(data).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) { this.volverATabla(); }
        else this.error = res.error || 'Error guardando solicitud';
      },
      error: () => { this.error = 'Error de conexión'; this.loading = false; }
    });
  }

  actualizarPermiso() {
    if (!this.editingPermiso) return;
    if (!this.solicitudForm.fecha_inicio || !this.solicitudForm.fecha_fin) {
      this.error = 'Las fechas de inicio y fin son obligatorias';
      return;
    }
    if (this.solicitudForm.tipo_permiso_id === -1) {
      if (!this.solicitudForm.tipo_permiso_otro?.trim()) {
        this.error = 'El nombre del permiso es obligatorio';
        return;
      }
      if (!this.solicitudForm.mensaje_otro?.trim()) {
        this.error = 'El motivo del permiso es obligatorio';
        return;
      }
    }
    if (!this.solicitudForm.dias_solicitados || this.solicitudForm.dias_solicitados === 0) {
      this.error = 'El rango de fechas no contiene días hábiles. Verifique las fechas.';
      return;
    }
    if (this.diasExcedidos) {
      const tipo = this.tiposPermiso.find(t => t.id === this.solicitudForm.tipo_permiso_id);
      this.error = `Los días hábiles (${this.solicitudForm.dias_solicitados}) exceden el límite del tipo de permiso (${tipo?.dias_permitidos} días).`;
      return;
    }

    // Verificar turnos asignados en el rango
    this.permisosSvc.getTurnosEnRango(
      this.solicitudForm.empleado_id!,
      this.solicitudForm.fecha_inicio!,
      this.solicitudForm.fecha_fin!
    ).subscribe({
      next: (res) => {
        if (res.tieneTurnos) {
          const turnos = res.turnos.map((t: any) => `${t.nombre_turno} (${t.fecha_inicio} - ${t.fecha_fin})`).join(', ');
          if (!confirm(`⚠️ Este empleado tiene turno(s) asignado(s) en este período:\n${turnos}\n\n¿Desea actualizar el permiso de todas formas?`)) return;
        }
        this.ejecutarActualizarPermiso();
      },
      error: () => this.ejecutarActualizarPermiso()
    });
  }

  private ejecutarActualizarPermiso() {
    this.loading = true;
    const data: any = { ...this.solicitudForm };
    if (data.tipo_permiso_id === -1) {
      data.tipo_permiso_id = null;
    } else {
      data.tipo_permiso_otro = null;
      data.mensaje_otro = null;
    }
    this.permisosSvc.updatePermiso(this.editingPermiso!.id!, data).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) { this.volverATabla(); }
        else this.error = res.error || 'Error actualizando';
      },
      error: () => { this.error = 'Error de conexión'; this.loading = false; }
    });
  }

  // ─── ESTADO ───────────────────────────────────────────────────────
  cambiarEstadoEnEdicion(estado: 'AUTORIZADO' | 'RECHAZADO' | 'PENDIENTE') {
    this.solicitudForm.estado = estado;
    if (this.editingPermiso?.id) {
      const permisoTemp = { ...this.editingPermiso, estado: this.solicitudForm.estado as any };
      if (estado === 'AUTORIZADO') {
        this.permisosSvc.getTurnosEnRango(permisoTemp.empleado_id, permisoTemp.fecha_inicio, permisoTemp.fecha_fin).subscribe({
          next: (res) => {
            if (res.tieneTurnos) {
              const turnos = res.turnos.map((t: any) => `${t.nombre_turno} (${t.fecha_inicio} - ${t.fecha_fin})`).join(', ');
              if (!confirm(`⚠️ Tiene turno(s) asignado(s):\n${turnos}\n\n¿Autorizar de todas formas?`)) {
                this.solicitudForm.estado = this.editingPermiso!.estado;
                return;
              }
            }
            this.ejecutarCambioEstado(permisoTemp, estado);
          },
          error: () => this.ejecutarCambioEstado(permisoTemp, estado)
        });
      } else {
        this.ejecutarCambioEstado(permisoTemp, estado);
      }
    }
  }

  cambiarEstado(permiso: Permiso, estado: 'PENDIENTE' | 'AUTORIZADO' | 'RECHAZADO') {
    if (estado === 'AUTORIZADO') {
      this.permisosSvc.getTurnosEnRango(permiso.empleado_id, permiso.fecha_inicio, permiso.fecha_fin).subscribe({
        next: (res) => {
          if (res.tieneTurnos) {
            const turnos = res.turnos.map((t: any) => `${t.nombre_turno} (${t.fecha_inicio} - ${t.fecha_fin})`).join(', ');
            if (!confirm(`⚠️ ${permiso.nombre_completo} tiene turno(s) asignado(s) en este período:\n${turnos}\n\n¿Desea autorizar el permiso de todas formas?`)) return;
          }
          this.ejecutarCambioEstado(permiso, estado);
        },
        error: () => this.ejecutarCambioEstado(permiso, estado)
      });
    } else {
      this.ejecutarCambioEstado(permiso, estado);
    }
  }

  private ejecutarCambioEstado(permiso: Permiso, estado: 'PENDIENTE' | 'AUTORIZADO' | 'RECHAZADO') {
    this.loading = true;
    this.permisosSvc.updateEstadoPermiso(permiso.id!, estado).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) this.loadPermisos();
        else this.error = res.error || 'Error';
      },
      error: () => { this.error = 'Error de conexión'; this.loading = false; }
    });
  }

  eliminarPermiso(permiso: Permiso) {
    if (!confirm(`¿Eliminar permiso de ${permiso.nombre_completo}?`)) return;
    this.loading = true;
    this.permisosSvc.deletePermiso(permiso.id!).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) this.loadPermisos();
        else this.error = res.error || 'Error';
      },
      error: () => { this.error = 'Error de conexión'; this.loading = false; }
    });
  }

  // ─── TIPOS DE PERMISO CRUD ────────────────────────────────────────
  editarTipoPermiso(tipo: TipoPermiso) {
    this.editingTipoPermiso = tipo;
    this.tipoPermisoForm = { ...tipo };
  }

  cancelarEdicionTipo() {
    this.editingTipoPermiso = null;
    this.tipoPermisoForm = this.initTipoForm();
  }

  guardarTipoPermiso() {
    if (!this.tipoPermisoForm.nombre?.trim() || !this.tipoPermisoForm.dias_permitidos) {
      this.error = 'Complete nombre y días';
      return;
    }
    if (!this.tipoPermisoForm.mensaje_carta?.trim()) {
      this.error = 'El motivo del permiso es obligatorio';
      return;
    }
    this.loading = true;
    const op = this.editingTipoPermiso
      ? this.permisosSvc.updateTipoPermiso(this.editingTipoPermiso.id!, this.tipoPermisoForm)
      : this.permisosSvc.createTipoPermiso(this.tipoPermisoForm);

    op.subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) {
          this.editingTipoPermiso = null;
          this.tipoPermisoForm = this.initTipoForm();
          this.loadTiposPermiso();
        } else this.error = res.error || 'Error';
      },
      error: () => { this.error = 'Error de conexión'; this.loading = false; }
    });
  }

  eliminarTipoPermiso(tipo: TipoPermiso) {
    if (!confirm(`¿Eliminar "${tipo.nombre}"?`)) return;
    this.loading = true;
    this.permisosSvc.deleteTipoPermiso(tipo.id!).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) this.loadTiposPermiso();
        else this.error = res.error || 'Error';
      },
      error: (err) => {
        this.loading = false;
        const msg = err?.error?.error || '';
        if (err.status === 409 || msg.includes('está siendo usado')) {
          this.avisoModal = msg || `El tipo "${tipo.nombre}" está siendo usado en permisos existentes y no puede eliminarse.`;
        } else {
          this.error = 'Error de conexión';
        }
      }
    });
  }

  // ─── IMPRIMIR ─────────────────────────────────────────────────────
  imprimirCarta() {
    const cartaEl = document.querySelector('.carta-hoja');
    if (!cartaEl) { window.print(); return; }

    const win = window.open('', '_blank', 'width=816,height=1056');
    if (!win) { window.print(); return; }

    // Recoger todos los estilos de la página actual
    const estilos = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(el => el.outerHTML).join('\n');

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  ${estilos}
  <style>
    @page { size: letter portrait; margin: 10mm 15mm; margin-header: 0; margin-footer: 0; }
    head { display: none !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; background: #fff !important; }
    html { background: #fff !important; }
    .carta-hoja {
      width: 100%; height: calc(100vh - 20mm);
      display: flex; flex-direction: column;
      border: none; margin: 0; max-width: 100%;
      font-size: 10pt; line-height: 1.4; color: #111;
    }
    .carta-copia-bloque {
      flex: 1 1 0; min-height: 0; padding: 5mm 0;
      display: flex; flex-direction: column;
      justify-content: space-between; overflow: hidden; box-sizing: border-box;
    }
    .carta-copia-bloque + .carta-copia-bloque { margin-top: 8mm; }
    .carta-separador {
      flex: 0 0 12mm; border-top: 1.5px dashed #444; border-bottom: none;
      text-align: center; font-size: 14pt; display: flex;
      align-items: flex-start; justify-content: center;
      font-family: 'Segoe UI', sans-serif; color: #555; padding: 4mm 0 0;
      margin-top: 4mm;
    }
    .carta-hro-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:5px; margin-bottom:6px; }
    .carta-hro-logo-left { display:flex; align-items:flex-start; gap:8px; }
    .logo-escudo { font-size:26pt; line-height:1; }
    .carta-hro-inst { font-size:7.5pt; line-height:1.3; }
    .carta-hro-logo-right { text-align:right; }
    .hro-text { font-size:28pt; font-weight:900; font-style:italic; letter-spacing:-2px; line-height:1; display:block; }
    .hro-sub { font-size:6pt; letter-spacing:1px; text-align:center; margin-top:2px; }
    .carta-hro-fecha-line { font-size:8.5pt; margin-bottom:5px; border-bottom:1px solid #000; padding-bottom:3px; display:flex; gap:5px; align-items:baseline; flex-wrap:wrap; }
    .fecha-campo { border-bottom:1px solid #000; min-width:50px; display:inline-block; text-align:center; padding:0 3px; }
    .fecha-mes { min-width:80px; }
    .carta-hro-destinatario { margin-bottom:6px; font-size:9pt; line-height:1.4; }
    .carta-hro-body { margin-bottom:4px; flex:1; }
    .carta-hro-body p { font-size:9pt; margin:0 0 4px; }
    .carta-underline { border-bottom:1px solid #000; padding-bottom:1px; }
    .carta-mensaje { font-size:8.5pt; text-transform:uppercase; }
    .carta-feriados { font-size:8pt; font-style:italic; text-transform:uppercase; margin:1px 0 3px !important; }
    .carta-fechas-row { display:flex; gap:20px; margin:4px 0; font-size:9pt; }
    .carta-sujeto { text-align:center; border-top:1px solid #000; border-bottom:1px solid #000; padding:2px 0; margin:4px 0; font-size:8.5pt; }
    .carta-atentamente { font-size:9pt; margin-top:4px !important; margin-bottom:30pt !important; }
    .carta-hro-firmas { display:flex !important; flex-direction:row !important; justify-content:space-between !important; margin-top:0; gap:6px; width:100%; }
    .firma-bloque { flex:1 1 0 !important; min-width:0 !important; text-align:center !important; display:flex !important; flex-direction:column !important; align-items:center !important; gap:1px; font-size:7.5pt; }
    .firma-linea { width:100% !important; border-top:1px solid #000 !important; margin-bottom:2px; display:block !important; }
    .firma-label { font-weight:600; font-size:7pt; text-transform:uppercase; display:block !important; }
    .firma-sub { font-size:6.5pt; color:#333; display:block !important; }
    .dias-autorizacion { font-size:9pt; }
    .carta-solicitud-line { margin-bottom:3px !important; }
    .carta-tipo-permiso { margin-bottom:3px !important; }
    .carta-meta-impresion { display:flex; justify-content:space-between; font-size:7pt; color:#555; border-top:1px solid #ccc; margin-top:4px; padding-top:3px; }
  </style>
</head>
<body>${cartaEl.outerHTML}</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  // ─── IMPRIMIR DESDE TABLA ─────────────────────────────────────────
  imprimirPermisoDirecto(permiso: Permiso) {
    const emp = this.empleados.find(e => e.id === permiso.empleado_id);
    const rolNombre = emp ? (this.roles.find(r => r.id === emp.rol_id)?.nombre || '') : '';
    const areaNombre = emp ? (this.areas.find(a => a.id === emp.area_id)?.nombre || '') : '';
    const tipo = this.tiposPermiso.find(t => t.id === permiso.tipo_permiso_id);
    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const fmtFecha = (iso: string) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
    const inicio = permiso.fecha_inicio ? parseFechaLocal(permiso.fecha_inicio.substring(0, 10)) : null;
    const fin = permiso.fecha_fin ? parseFechaLocal(permiso.fecha_fin.substring(0, 10)) : null;
    const feriados = inicio && fin ? feriadosEnRango(inicio, fin) : [];
    const finesSemana = inicio && fin ? finesDeSemanaEnRango(inicio, fin) : 0;
    const dias = permiso.dias_solicitados || 0;

    // Fecha de la carta = fecha en que se creó el permiso (respetando timezone local)
    let fechaCarta: Date;
    if (permiso.creado_en) {
      // Si viene como string ISO, forzar interpretación local quitando la Z
      const creadoStr = String(permiso.creado_en).replace('Z', '').replace('T', ' ');
      fechaCarta = new Date(creadoStr);
      if (isNaN(fechaCarta.getTime())) fechaCarta = new Date(permiso.creado_en);
    } else {
      fechaCarta = new Date();
    }

    // Fecha y hora de impresión = ahora
    const ahora = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const horas24 = ahora.getHours();
    const ampm = horas24 >= 12 ? 'PM' : 'AM';
    const horas12 = horas24 % 12 || 12;
    const fechaHoraImpresion = `${pad(ahora.getDate())}/${pad(ahora.getMonth()+1)}/${ahora.getFullYear()} ${pad(horas12)}:${pad(ahora.getMinutes())} ${ampm}`;

    this.cartaData = {
      nombreEmpleado: permiso.nombre_completo || '',
      renglon: emp?.renglon || '',
      area: areaNombre,
      rol: rolNombre,
      dia: String(fechaCarta.getDate()).padStart(2, '0'),
      mes: meses[fechaCarta.getMonth()],
      anio: String(fechaCarta.getFullYear()),
      tipoPermiso: permiso.tipo_permiso_id ? (tipo?.nombre || '') : (permiso.tipo_permiso_otro || ''),
      mensaje: permiso.tipo_permiso_id ? (tipo?.mensaje_carta || '') : (permiso.mensaje_otro || ''),
      fechaInicio: fmtFecha(permiso.fecha_inicio?.substring(0, 10) || ''),
      fechaFin: fmtFecha(permiso.fecha_fin?.substring(0, 10) || ''),
      diasSolicitados: dias,
      diasEnLetras: dias > 0 ? numeroALetras(dias) : '',
      feriadosIncluidos: feriados,
      finesDeSemanaCont: finesSemana,
      creadoPor: (permiso as any).creado_por_usuario || '',
      autorizadoPor: (permiso as any).autorizado_por_usuario || '',
      autorizadoEn: (() => {
        const ae = permiso.autorizado_en;
        if (!ae) return '';
        // Asegurar que se interprete como UTC agregando Z si no la tiene
        const isoStr = String(ae).includes('Z') || String(ae).includes('+') ? String(ae) : String(ae).replace(' ', 'T') + 'Z';
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        const p2 = (n: number) => String(n).padStart(2,'0');
        // Convertir a Guatemala UTC-6
        const gt = new Date(d.getTime() - 6 * 60 * 60 * 1000);
        const h = gt.getUTCHours(), ampm = h >= 12 ? 'PM' : 'AM';
        return `${p2(gt.getUTCDate())}/${p2(gt.getUTCMonth()+1)}/${gt.getUTCFullYear()} ${p2(h%12||12)}:${p2(gt.getUTCMinutes())} ${ampm}`;
      })(),
      fechaHoraImpresion
    };

    this.imprimiendoDesdeTabla = true;
    setTimeout(() => {
      this.imprimirCarta();
      setTimeout(() => { this.imprimiendoDesdeTabla = false; }, 1000);
    }, 150);
  }

  // ─── HELPERS ──────────────────────────────────────────────────────
  getEstadoClass(estado: string, permiso?: Permiso): string {
    if (estado === 'AUTORIZADO') {
      if (permiso && this.yaFinalizo(permiso)) return 'estado-finalizado';
      return 'estado-autorizado';
    }
    if (estado === 'RECHAZADO') return 'estado-rechazado';
    return 'estado-pendiente';
  }

  /** Retorna true si hoy está dentro del rango fecha_inicio–fecha_fin del permiso */
  esVigente(permiso: Permiso): boolean {
    const hoy = new Date().toISOString().substring(0, 10);
    const inicio = (permiso.fecha_inicio as any instanceof Date)
      ? (permiso.fecha_inicio as any).toISOString().substring(0, 10)
      : String(permiso.fecha_inicio).substring(0, 10);
    const fin = (permiso.fecha_fin as any instanceof Date)
      ? (permiso.fecha_fin as any).toISOString().substring(0, 10)
      : String(permiso.fecha_fin).substring(0, 10);
    return hoy >= inicio && hoy <= fin;
  }

  /** Retorna true si fecha_fin ya pasó */
  yaFinalizo(permiso: Permiso): boolean {
    const hoy = new Date().toISOString().substring(0, 10);
    const fin = (permiso.fecha_fin as any instanceof Date)
      ? (permiso.fecha_fin as any).toISOString().substring(0, 10)
      : String(permiso.fecha_fin).substring(0, 10);
    return hoy > fin;
  }
}
