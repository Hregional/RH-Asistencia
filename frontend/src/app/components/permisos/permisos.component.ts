import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KeycloakService } from 'keycloak-angular';
import { PermisosService, Permiso, TipoPermiso } from '../../services/permisos.service';
import { EmpleadosService, Empleado, Rol, Area } from '../../services/empleados.service';
import { numeroALetras } from '../../utils/number-to-words';
import {
  esFeriado,
  parseFechaLocal,
  calcularDiasHabilesGT, calcularDiasConFDS, calcularFechaExtendida,
  feriadosEnRango, finesDeSemanaEnRango,
  rangoIncluyeMadreOPadre, getNombreFeriado, getFeriadosDelMes, esFeriadoMadreOPadre, OpcionesFeriados
} from '../../utils/feriados';
import { PermisoCartaComponent } from './permiso-carta.component';
import { PermisosFormComponent } from './permisos-form.component';
import { PermisosListComponent } from './permisos-list.component';
import { PermisosTiposComponent } from './permisos-tipos.component';
import { CartaData, PermisosView, PopupObservaciones } from './permisos.types';

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
  vistaActual: PermisosView = 'tabla';

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

  // Firmas visibles en la carta (todas activas por defecto)
  firmas = {
    empleado: true,
    jefeServicio: true,
    jefeDepto: true,
    jefePersonal: true,
    direccion: true,
    oficioRH: true
  };

  // Extensión de días adicionales
  tieneExtension = false;
  // Fines de semana como días hábiles
  incluyeFinesDeSemana = false;

  // Feriados condicionales (Día de la Madre / Padre)
  aplicaDiaMadre = true;
  aplicaDiaPadre = true;
  mostrarPreguntaMadre = false;
  mostrarPreguntaPadre = false;

  // Modal Calendario con puntos de color
  mostrarCalendarioModal = false;
  calYear = new Date().getFullYear();
  calMonth = new Date().getMonth();
  calModoSeleccion: 'inicio' | 'fin' = 'inicio';
  nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  anosDisponibles = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() + i);

  // Cache de celdas del calendario para evitar recalcular en cada ciclo de detección de cambios
  calCeldasCache: Array<{
    dia: number | null;
    iso?: string;
    esFinSemana?: boolean;
    feriado?: { nombre: string; esCondicional?: boolean } | null;
    esInicio?: boolean;
    esFin?: boolean;
    enRango?: boolean;
    esHoy?: boolean;
  }> = [];

  fmtFechaDisplay(iso: string | undefined): string {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  irAHoy() {
    const hoy = new Date();
    this.calYear = hoy.getFullYear();
    this.calMonth = hoy.getMonth();
    this.actualizarCalendarioCache();
  }

  // Flag para impresión directa desde tabla
  imprimiendoDesdeTabla = false;

  // Popup de observaciones
  popupObservaciones: PopupObservaciones | null = null;

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

  /** True cuando el tipo seleccionado es Vacaciones */
  get esVacaciones(): boolean {
    const tipo = this.tiposPermiso.find(t => t.id === this.solicitudForm.tipo_permiso_id);
    return tipo?.nombre.toLowerCase() === 'vacaciones';
  }

  // Carta preview
  cartaData: CartaData = this.initCartaData();

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
    this.empleadosSvc.getRoles().subscribe((r: any) => { if (r.success && r.data) this.roles = r.data; });
    this.empleadosSvc.getAreas().subscribe((a: any) => { if (a.success && a.data) this.areas = a.data; });
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
      estado: 'PENDIENTE',
      dias_adicionales: null,
      motivo_extension: null,
      fecha_fin_extendida: null,
      incluye_fines_semana: 0
    };
  }

  private initTipoForm(): TipoPermiso {
    return { nombre: '', dias_permitidos: 1, mensaje_carta: '' };
  }

  private initCartaData(): CartaData {
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
      autorizadoEn: '',
      fechaFinExtendida: '',
      motivoExtension: '',
      diasAdicionales: null,
      incluyeFinesDeSemana: false
    };
  }

  // ─── CARGA DE DATOS 
  loadPermisos() {
    this.loading = true;
    // Cargar todos los permisos para gestión (vigentes, futuros y recientes)
    this.permisosSvc.getPermisos('todos').subscribe({
      next: (res: any) => {
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
      error: (err: any) => console.error('Error cargando empleados:', err)
    });
  }

  loadTiposPermiso() {
    this.permisosSvc.getTiposPermiso().subscribe({
      next: (res: any) => { this.tiposPermiso = res.success && res.data ? res.data : []; },
      error: (err: any) => console.error('Error cargando tipos:', err)
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

  // OPTIMIZADO BUSCADOR EMPLEADO SOLO NOM
  onEmpleadoBusqueda() {
    const t = this.norm(this.empleadoBusqueda);
    if (!t) { this.empleadosFiltrados = []; return; }
    this.empleadosFiltrados = this.empleados
      .filter(e => this.norm(e.nombre_completo || '').includes(t))
      .slice(0, 10);
  }

  seleccionarEmpleado(emp: Empleado) {
    this.empleadoSeleccionado = emp;
    this.solicitudForm.empleado_id = emp.id!;
    this.empleadoBusqueda = emp.nombre_completo;
    this.empleadosFiltrados = [];
    this.actualizarCarta();
  }

  // CÁLCULO FECHA FIN EXTENDIDA SIN CONSIDERAR FINES DE SEM Y TAMPOCO FERIADOS ESTABLECIDOS
  /** Suma N días hábiles desde una fecha dada (máx 30 días adicionales, límite de 500 iteraciones) */
  calcularFechaFinExtendida(): void {
    const dias = this.solicitudForm.dias_adicionales;
    const fechaBase = this.solicitudForm.fecha_fin;

    const opciones: OpcionesFeriados = {
      aplicaMadre: this.aplicaDiaMadre,
      aplicaPadre: this.aplicaDiaPadre
    };

    const resultado = calcularFechaExtendida(
      fechaBase || '',
      dias || 0,
      this.incluyeFinesDeSemana,
      opciones
    );
    this.solicitudForm.fecha_fin_extendida = resultado;
  }

  onDiasAdicionalesChange(valor: any): void {
    const dias = Number(valor);
    if (!valor || isNaN(dias) || dias <= 0) {
      this.solicitudForm.dias_adicionales = null;
      this.solicitudForm.fecha_fin_extendida = null;
      this.calcularDias();
      return;
    }
    const clamped = Math.min(Math.max(Math.floor(dias), 1), 30);
    this.solicitudForm.dias_adicionales = clamped;
    this.calcularDias();
  }

  onToggleExtension(valor: boolean): void {
    if (!valor) {
      this.solicitudForm.dias_adicionales = null;
      this.solicitudForm.motivo_extension = null;
      this.solicitudForm.fecha_fin_extendida = null;
    }
    this.calcularDias();
  }

  toggleExtension(): void {
    this.tieneExtension = !this.tieneExtension;
    if (!this.tieneExtension) {
      this.solicitudForm.dias_adicionales = null;
      this.solicitudForm.motivo_extension = null;
      this.solicitudForm.fecha_fin_extendida = null;
    }
    this.calcularDias();
  }

  onToggleFinesDeSemana(): void {
    this.calcularDias();
  }

  // ─── NAVEGACIÓN ───────────────────────────────────────────────────
  private resetFirmas(permiso?: Permiso) {
    const cfg = permiso?.firmas_config;
    if (cfg) {
      const parsed = typeof cfg === 'string' ? JSON.parse(cfg) : cfg;
      this.firmas = {
        empleado: parsed.empleado ?? true,
        jefeServicio: parsed.jefeServicio ?? true,
        jefeDepto: parsed.jefeDepto ?? true,
        jefePersonal: parsed.jefePersonal ?? true,
        direccion: parsed.direccion ?? true,
        oficioRH: parsed.oficioRH ?? true
      };
      if (parsed.aplicaDiaMadre !== undefined) this.aplicaDiaMadre = parsed.aplicaDiaMadre;
      if (parsed.aplicaDiaPadre !== undefined) this.aplicaDiaPadre = parsed.aplicaDiaPadre;
    } else {
      this.firmas = { empleado: true, jefeServicio: true, jefeDepto: true, jefePersonal: true, direccion: true, oficioRH: true };
      this.aplicaDiaMadre = true;
      this.aplicaDiaPadre = true;
    }
    this.calcularFirmasFilas();
  }

  irASolicitud() {
    this.vistaActual = 'solicitud';
    this.editingPermiso = null;
    this.empleadoSeleccionado = null;
    this.empleadoBusqueda = '';
    this.empleadosFiltrados = [];
    this.solicitudForm = this.initSolicitudForm();
    this.cartaData = this.initCartaData();
    this.diasExcedidos = false;
    this.resetFirmas();
    this.tieneExtension = false;
    this.incluyeFinesDeSemana = false;
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
    // Cargar firmas desde el permiso (firmas_config viene del backend)
    console.log('firmas_config al editar:', (permiso as any).firmas_config);
    this.resetFirmas(permiso);
    // Cargar estado de extensión
    this.tieneExtension = !!(permiso.dias_adicionales && permiso.dias_adicionales > 0);
    // Cargar estado de fines de semana
    this.incluyeFinesDeSemana = !!permiso.incluye_fines_semana;

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
      this.calcularDias();
    } else {
      this.actualizarCarta();
    }
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
    this.resetFirmas();
    this.tieneExtension = false;
    this.incluyeFinesDeSemana = false;
    // Resetear formulario completo para que no queden datos sucios
    this.solicitudForm = this.initSolicitudForm();
    this.empleadoSeleccionado = null;
    this.empleadoBusqueda = '';
    this.empleadosFiltrados = [];
    this.diasExcedidos = false;
    this.cartaData = this.initCartaData();
    this.loadPermisos();
  }

  // ─── TIPO PERMISO CUANDO SE CAMBIA EN EDITAR 
  onTipoPermisoChange() {
    // Solo limpiar campos específicos del tipo anterior, no todo
    this.solicitudForm.tipo_permiso_otro = '';
    this.solicitudForm.mensaje_otro = '';

    // Solo resetear fechas para recalcular días hábiles según el nuevo tipo
    this.solicitudForm.fecha_inicio = '';
    this.solicitudForm.fecha_fin = '';
    this.solicitudForm.dias_solicitados = 0;
    this.diasExcedidos = false;

    // Resetear extensión porque las fechas cambiaron
    this.tieneExtension = false;
    this.incluyeFinesDeSemana = false;
    this.solicitudForm.dias_adicionales = null;
    this.solicitudForm.motivo_extension = null;
    this.solicitudForm.fecha_fin_extendida = null;

    this.actualizarCarta();
  }

  // ─── CÁLCULO DE DÍAS HÁBILES (calendario GT)
  calcularDias() {
    // Si es permiso de 1 día, forzar fecha_fin = fecha_inicio antes de validar
    if (this.esDiaUnico && this.solicitudForm.fecha_inicio) {
      this.solicitudForm.fecha_fin = this.solicitudForm.fecha_inicio;
    }

    if (!this.solicitudForm.fecha_inicio || !this.solicitudForm.fecha_fin) {
      this.solicitudForm.dias_solicitados = 0;
      this.mostrarPreguntaMadre = false;
      this.mostrarPreguntaPadre = false;
      this.actualizarCarta();
      return;
    }

    const inicio = parseFechaLocal(this.solicitudForm.fecha_inicio);
    const finOriginal = parseFechaLocal(this.solicitudForm.fecha_fin);

    // Si hay extensión, recalcular la fecha fin extendida primero
    if (this.tieneExtension && this.solicitudForm.dias_adicionales && this.solicitudForm.fecha_fin) {
      this.calcularFechaFinExtendida();
    }

    const fechaFinEfectivaStr = this.solicitudForm.fecha_fin_extendida || this.solicitudForm.fecha_fin;
    const finExtendido = parseFechaLocal(fechaFinEfectivaStr);

    // Detectar si el rango abarca 10 de mayo o 17 de junio (hasta la extensión)
    const { incluyeMadre, incluyePadre } = rangoIncluyeMadreOPadre(inicio, finExtendido);
    this.mostrarPreguntaMadre = incluyeMadre;
    this.mostrarPreguntaPadre = incluyePadre;

    const opciones: OpcionesFeriados = {
      aplicaMadre: this.aplicaDiaMadre,
      aplicaPadre: this.aplicaDiaPadre
    };

    // Validar fines de semana solo si el toggle FDS está desactivado
    if (!this.incluyeFinesDeSemana) {
      if (this.solicitudForm.fecha_inicio) {
        const dInicio = new Date(this.solicitudForm.fecha_inicio + 'T00:00:00');
        if (dInicio.getDay() === 0 || dInicio.getDay() === 6) {
          this.error = 'La fecha de inicio no puede ser sábado o domingo.';
          this.solicitudForm.fecha_inicio = '';
          this.solicitudForm.dias_solicitados = 0;
          this.actualizarCarta();
          setTimeout(() => this.error = null, 4000);
          return;
        }
      }
      if (this.solicitudForm.fecha_fin && !this.esDiaUnico) {
        const dFin = new Date(this.solicitudForm.fecha_fin + 'T00:00:00');
        if (dFin.getDay() === 0 || dFin.getDay() === 6) {
          this.error = 'La fecha de fin no puede ser sábado o domingo.';
          this.solicitudForm.fecha_fin = '';
          this.solicitudForm.dias_solicitados = 0;
          this.actualizarCarta();
          setTimeout(() => this.error = null, 4000);
          return;
        }
      }
    }

    // Usar la función correcta según el toggle para los días base
    this.solicitudForm.dias_solicitados = this.incluyeFinesDeSemana
      ? calcularDiasConFDS(inicio, finOriginal, opciones)
      : calcularDiasHabilesGT(inicio, finOriginal, opciones);

    // Validar límite del tipo de permiso
    const tipo = this.tiposPermiso.find(t => t.id === this.solicitudForm.tipo_permiso_id);
    this.diasExcedidos = !!(tipo && this.solicitudForm.dias_solicitados > tipo.dias_permitidos);

    this.actualizarCarta();
    // Solo actualizar cache del calendario si el modal está abierto
    if (this.mostrarCalendarioModal) {
      this.actualizarCalendarioCache();
    }
  }

  // ─── CARTA PREVIEW 
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

    const opciones = {
      aplicaMadre: this.aplicaDiaMadre,
      aplicaPadre: this.aplicaDiaPadre,
      incluyeFDS: this.incluyeFinesDeSemana
    };

    const fechaFinEfectiva = this.solicitudForm.fecha_fin_extendida || this.solicitudForm.fecha_fin;

    const feriados = (this.solicitudForm.fecha_inicio && fechaFinEfectiva)
      ? feriadosEnRango(parseFechaLocal(this.solicitudForm.fecha_inicio), parseFechaLocal(fechaFinEfectiva), opciones)
      : [];

    const finesSemana = (this.solicitudForm.fecha_inicio && fechaFinEfectiva)
      ? finesDeSemanaEnRango(parseFechaLocal(this.solicitudForm.fecha_inicio), parseFechaLocal(fechaFinEfectiva))
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
        : (tipo?.mensaje_carta || '') + (this.solicitudForm.mensaje_otro ? ' ' + this.solicitudForm.mensaje_otro : ''),
      fechaInicio: fmtFecha(this.solicitudForm.fecha_inicio || ''),
      fechaFin: fmtFecha(this.solicitudForm.fecha_fin || ''),
      diasSolicitados: dias,
      diasEnLetras: dias > 0 ? numeroALetras(dias) : '',
      feriadosIncluidos: feriados,
      finesDeSemanaCont: finesSemana,
      creadoPor: this.usuarioActual,
      autorizadoPor: '',
      fechaHoraImpresion: '',
      autorizadoEn: (() => {
        // En formulario de creación/edición, mostrar hora actual como hora de generación
        const ahora = new Date();
        const p2 = (n: number) => String(n).padStart(2, '0');
        const h = ahora.getHours(), ampm = h >= 12 ? 'PM' : 'AM';
        return `${p2(ahora.getDate())}/${p2(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${p2(h % 12 || 12)}:${p2(ahora.getMinutes())} ${ampm}`;
      })(),
      fechaFinExtendida: this.solicitudForm.fecha_fin_extendida
        ? (() => { const [y, m, d] = (this.solicitudForm.fecha_fin_extendida as string).split('-'); return `${d}/${m}/${y}`; })()
        : '',
      motivoExtension: this.solicitudForm.motivo_extension || '',
      diasAdicionales: this.solicitudForm.dias_adicionales || null,
      incluyeFinesDeSemana: this.incluyeFinesDeSemana
    };
    this.calcularFirmasFilas();
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

    if (this.esVacaciones && !this.solicitudForm.mensaje_otro?.trim()) {
      this.error = 'La descripción del período de vacaciones es obligatoria';
      return;
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

    // Validar extensión: si hay días adicionales, el motivo es obligatorio
    if (this.tieneExtension && this.solicitudForm.dias_adicionales && this.solicitudForm.dias_adicionales > 0) {
      if (!this.solicitudForm.motivo_extension?.trim()) {
        this.error = 'El motivo de extensión es obligatorio cuando se agregan días adicionales.';
        setTimeout(() => this.error = null, 4000);
        return;
      }
    }

    // Validar traslapes si se guarda como AUTORIZADO
    if (this.solicitudForm.estado === 'AUTORIZADO') {
      const hayTraslape = this.hayTraslapeLocal(
        this.solicitudForm.empleado_id!,
        this.solicitudForm.fecha_inicio!,
        this.solicitudForm.fecha_fin!,
        this.solicitudForm.fecha_fin_extendida
      );
      if (hayTraslape) {
        this.error = 'El empleado ya tiene un permiso autorizado que se traslapa con estas fechas.';
        return;
      }
    }

    // Guardar directamente sin verificar turnos
    this.ejecutarGuardarSolicitud();
  }

  private ejecutarGuardarSolicitud() {
    this.loading = true;
    const data: any = { ...this.solicitudForm };
    if (data.tipo_permiso_id === -1) {
      data.tipo_permiso_id = null;
    } else {
      data.tipo_permiso_otro = null;
    }
    // Guardar configuración de firmas y feriados condicionales en BD
    data.firmas_config = {
      ...this.firmas,
      aplicaDiaMadre: this.aplicaDiaMadre,
      aplicaDiaPadre: this.aplicaDiaPadre
    };
    data.incluye_fines_semana = this.incluyeFinesDeSemana ? 1 : 0;

    this.permisosSvc.createPermiso(data).subscribe({
      next: (res: any) => {
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

    if (this.esVacaciones && !this.solicitudForm.mensaje_otro?.trim()) {
      this.error = 'La descripción del período de vacaciones es obligatoria';
      return;
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

    // Validar extensión: si hay días adicionales, el motivo es obligatorio
    if (this.tieneExtension && this.solicitudForm.dias_adicionales && this.solicitudForm.dias_adicionales > 0) {
      if (!this.solicitudForm.motivo_extension?.trim()) {
        this.error = 'El motivo de extensión es obligatorio cuando se agregan días adicionales.';
        setTimeout(() => this.error = null, 4000);
        return;
      }
    }

    // Validar traslapes si se cambia a AUTORIZADO
    if (this.solicitudForm.estado === 'AUTORIZADO') {
      const hayTraslape = this.hayTraslapeLocal(
        this.editingPermiso!.empleado_id,
        this.solicitudForm.fecha_inicio!,
        this.solicitudForm.fecha_fin!,
        this.solicitudForm.fecha_fin_extendida,
        this.editingPermiso!.id
      );
      if (hayTraslape) {
        this.error = 'El empleado ya tiene un permiso autorizado que se traslapa con estas fechas.';
        return;
      }
    }

    // Actualizar directamente sin verificar turnos
    this.ejecutarActualizarPermiso();
  }

  private ejecutarActualizarPermiso() {
    this.loading = true;
    const data: any = { ...this.solicitudForm };
    if (data.tipo_permiso_id === -1) {
      data.tipo_permiso_id = null;
    } else {
      data.tipo_permiso_otro = null;
    }
    // Guardar configuración de firmas y feriados condicionales en BD
    data.firmas_config = {
      ...this.firmas,
      aplicaDiaMadre: this.aplicaDiaMadre,
      aplicaDiaPadre: this.aplicaDiaPadre
    };
    data.incluye_fines_semana = this.incluyeFinesDeSemana ? 1 : 0;

    this.permisosSvc.updatePermiso(this.editingPermiso!.id!, data).subscribe({
      next: (res: any) => {
        this.loading = false;
        if (res.success) {
          // Actualizar también el objeto local para que imprimir desde tabla use datos frescos
          const idx = this.permisos.findIndex(p => p.id === this.editingPermiso!.id);
          if (idx !== -1 && res.data) {
            this.permisos[idx] = { ...this.permisos[idx], ...res.data, firmas_config: data.firmas_config };
          }
          this.volverATabla();
        }
        else this.error = res.error || 'Error actualizando';
      },
      error: () => { this.error = 'Error de conexión'; this.loading = false; }
    });
  }

  // ─── ESTADO ───────────────────────────────────────────────────────
  cambiarEstadoEnEdicion(estado: 'AUTORIZADO' | 'RECHAZADO' | 'PENDIENTE') {
    // Solo actualiza el formulario local — el backend se llama al dar "Actualizar"
    this.solicitudForm.estado = estado;
  }

  cambiarEstado(permiso: Permiso, estado: 'PENDIENTE' | 'AUTORIZADO' | 'RECHAZADO') {
    if (estado === 'AUTORIZADO') {
      const hayTraslape = this.hayTraslapeLocal(
        permiso.empleado_id,
        permiso.fecha_inicio,
        permiso.fecha_fin,
        permiso.fecha_fin_extendida,
        permiso.id
      );
      if (hayTraslape) {
        this.error = 'El empleado ya tiene un permiso autorizado que se traslapa con estas fechas.';
        setTimeout(() => this.error = null, 5000);
        return;
      }
    }
    this.ejecutarCambioEstado(permiso, estado);
  }

  private ejecutarCambioEstado(permiso: Permiso, estado: 'PENDIENTE' | 'AUTORIZADO' | 'RECHAZADO') {
    this.loading = true;
    this.permisosSvc.updateEstadoPermiso(permiso.id!, estado).subscribe({
      next: (res: any) => {
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
      next: (res: any) => {
        this.loading = false;
        if (res.success) {
          this.editingTipoPermiso = null;
          this.tipoPermisoForm = this.initTipoForm();
          this.loadTiposPermiso();
        } else {
          this.error = res.error || 'Error';
          setTimeout(() => this.error = null, 4000);
        }
      },
      error: () => {
        this.error = 'Ya existe este tipo de permiso';
        this.loading = false;
        setTimeout(() => this.error = null, 4000);
      }
    });
  }

  eliminarTipoPermiso(tipo: TipoPermiso) {
    if (!confirm(`¿Eliminar "${tipo.nombre}"?`)) return;
    this.loading = true;
    this.permisosSvc.deleteTipoPermiso(tipo.id!).subscribe({
      next: (res: any) => {
        this.loading = false;
        if (res.success) this.loadTiposPermiso();
        else this.error = res.error || 'Error';
      },
      error: (err: any) => {
        this.loading = false;
        const msg = err?.error?.error || '';
        if (err.status === 409 || msg.includes('está siendo usado')) {
          this.avisoModal = msg || `El tipo "${tipo.nombre}" está siendo usado en permisos existentes y no puede eliminarse.`;
        } else if (err.status === 403) {
          this.avisoModal = msg || `El tipo "${tipo.nombre}" no puede eliminarse.`;
        } else {
          this.error = 'Error de conexión';
        }
      }
    });
  }

  // ─── IMPRIMIR
  imprimirCarta() {
    const contenedor = document.querySelector('[data-print-container]');
    const cartaEl = contenedor
      ? contenedor.querySelector('.carta-hoja')
      : document.querySelector('.carta-hoja');

    if (!cartaEl) { window.print(); return; }

    const win = window.open('', '_blank', 'width=850,height=1100');
    if (!win) { window.print(); return; }

    // Tomar UNA SOLA copia del DOM y duplicarla en JS
    const copias = cartaEl.querySelectorAll('.carta-copia-bloque');
    const primeraCopia = copias[0]?.outerHTML || '';
    const segundaCopia = copias[1]?.outerHTML || copias[0]?.outerHTML || '';

    const estilos = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(el => el.outerHTML).join('\n');

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  ${estilos}
  <style>
    @page { size: letter portrait; margin: 0; }
    * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; box-sizing:border-box; font-family:'Segoe UI', Arial, sans-serif !important; }
    head { display:none !important; }
    html,body { margin:0; padding:0; background:#fff !important; height:100vh !important; max-height:100vh !important; overflow:hidden !important; }
    body { font-size:10.5pt; color:#000; line-height:1.4; }
    .carta-wrapper { width:100%; height:100vh; max-height:100vh; padding:4mm 10mm; display:flex; flex-direction:column; box-sizing:border-box; overflow:hidden; page-break-inside:avoid; break-inside:avoid; }
    .carta-copia-bloque {
      flex:1 1 0;
      min-height:0;
      display:flex;
      flex-direction:column;
      justify-content:space-between;
      padding:1mm 0;
      overflow:hidden;
      page-break-inside:avoid;
      break-inside:avoid;
    }
    .carta-copia-bloque + .carta-copia-bloque {
      border-top:1.5px dashed #555;
      padding-top:5mm;
      margin-top:3mm;
      page-break-before:avoid;
      break-before:avoid;
    }
    .carta-hro-header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:4px; margin-bottom:5px; }
    .carta-logo-img { height:44px; width:auto; object-fit:contain; }
    .carta-hro-inst-right { font-size:7.5pt; line-height:1.35; text-align:right; color:#000; }
    .carta-meta-impresion { display:flex; justify-content:space-between; font-size:7.5pt; color:#444; margin-bottom:4px; }
    .carta-hro-fecha-line { font-size:10.5pt; margin-bottom:5px; display:flex; gap:4px; align-items:baseline; flex-wrap:wrap; justify-content:center; }
    .fecha-campo { min-width:46px; display:inline-block; text-align:center; padding:0 4px; font-weight:600; border-bottom:1px solid #000; }
    .fecha-mes { min-width:70px; }
    .carta-hro-destinatario { margin-bottom:5px; font-size:10.5pt; display:flex; gap:4px; flex-wrap:wrap; }
    .carta-hro-body p { font-size:10.5pt; margin:0 0 4px; line-height:1.4; }
    .carta-underline { border-bottom:1px solid #000; }
    .carta-solicitud-line,.carta-tipo-permiso { margin-bottom:4px !important; }
    .carta-mensaje { font-size:10pt; margin:3px 0 !important; }
    .carta-feriados { font-size:8.5pt; font-style:italic; margin:2px 0 !important; color:#333; }
    .dias-autorizacion { font-weight:700; }
    .carta-fechas-row { display:block; margin:4px 0; font-size:10.5pt; text-align:center; }
    .carta-sujeto { text-align:center; border-top:1px solid #000; border-bottom:1px solid #000; padding:3px 0; margin:5px 0; font-size:9pt; font-weight:700; text-transform:uppercase; }
    .carta-atentamente { font-size:10.5pt; margin:4px 0 10mm !important; flex-shrink:0; }
    .firma-spacer { display:none; }
    .carta-hro-firmas-wrapper { display:flex; flex-direction:column; gap:10mm; width:100%; flex-shrink:0; }
    .carta-hro-firmas { display:flex !important; flex-direction:row !important; justify-content:space-around !important; gap:16px; width:100%; }
    .firmas-n2 .carta-hro-firmas { justify-content:space-around !important; }
    .firmas-n4 .fila-1 { justify-content:center !important; gap:24px !important; }
    .firmas-n4 .fila-2 { justify-content:space-between !important; }
    .firma-bloque { flex:0 0 45mm !important; max-width:45mm !important; text-align:center !important; display:flex !important; flex-direction:column !important; align-items:center !important; }
    .firma-bloque strong { font-size:7.5pt !important; font-weight:600 !important; text-transform:uppercase !important; display:block !important; line-height:1.2 !important; margin-bottom:1px !important; }
    .firma-linea { width:45mm !important; max-width:45mm !important; border-top:1px solid #000 !important; margin-bottom:2px; display:block !important; }
    .firma-label { font-weight:700; font-size:7.5pt; text-transform:uppercase; display:block !important; line-height:1.25; }
    .firma-sub { font-size:7pt; color:#444; display:block !important; }
    .carta-hro-logo-right img { display:block !important; }
  </style>
</head>
<body>
  <div class="carta-wrapper">
    ${primeraCopia}
    ${segundaCopia}
  </div>
</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  // ─── IMPRIMIR DESDE TABLA 
  imprimirPermisoDirecto(permiso: Permiso) {
    if (!this.editingPermiso || this.editingPermiso.id !== permiso.id) {
      this.resetFirmas(permiso);
    }
    const opciones: OpcionesFeriados = {
      aplicaMadre: this.aplicaDiaMadre,
      aplicaPadre: this.aplicaDiaPadre
    };
    const emp = this.empleados.find(e => e.id === permiso.empleado_id);
    const rolNombre = emp ? (this.roles.find(r => r.id === emp.rol_id)?.nombre || '') : '';
    const areaNombre = emp ? (this.areas.find(a => a.id === emp.area_id)?.nombre || '') : '';
    const tipo = this.tiposPermiso.find(t => t.id === permiso.tipo_permiso_id);
    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const fmtFecha = (iso: string) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
    const inicio = permiso.fecha_inicio ? parseFechaLocal(permiso.fecha_inicio.substring(0, 10)) : null;
    const fin = permiso.fecha_fin ? parseFechaLocal(permiso.fecha_fin.substring(0, 10)) : null;
    const feriados = inicio && fin ? feriadosEnRango(inicio, fin, opciones) : [];
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
    const fechaHoraImpresion = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${pad(horas12)}:${pad(ahora.getMinutes())} ${ampm}`;

    this.cartaData = {
      nombreEmpleado: permiso.nombre_completo || '',
      renglon: emp?.renglon || '',
      area: areaNombre,
      rol: rolNombre,
      dia: String(fechaCarta.getDate()).padStart(2, '0'),
      mes: meses[fechaCarta.getMonth()],
      anio: String(fechaCarta.getFullYear()),
      tipoPermiso: permiso.tipo_permiso_id ? (tipo?.nombre || '') : (permiso.tipo_permiso_otro || ''),
      mensaje: permiso.tipo_permiso_id
        ? (tipo?.mensaje_carta || '') + (permiso.mensaje_otro ? ' ' + permiso.mensaje_otro : '')
        : (permiso.mensaje_otro || ''),
      fechaInicio: fmtFecha(permiso.fecha_inicio?.substring(0, 10) || ''),
      fechaFin: fmtFecha(permiso.fecha_fin?.substring(0, 10) || ''),
      diasSolicitados: dias,
      diasEnLetras: dias > 0 ? numeroALetras(dias) : '',
      feriadosIncluidos: feriados,
      finesDeSemanaCont: finesSemana,
      creadoPor: (permiso as any).creado_por_usuario || '',
      autorizadoPor: (permiso as any).autorizado_por_usuario || '',
      autorizadoEn: (() => {
        // Si está autorizado usar autorizado_en, si no usar creado_en como referencia
        const ae = permiso.autorizado_en || permiso.creado_en;
        if (!ae) return '';
        const isoStr = String(ae).includes('Z') || String(ae).includes('+') ? String(ae) : String(ae).replace(' ', 'T') + 'Z';
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        const p2 = (n: number) => String(n).padStart(2, '0');
        // Convertir a Guatemala UTC-6
        const gt = new Date(d.getTime() - 6 * 60 * 60 * 1000);
        const h = gt.getUTCHours(), ampm = h >= 12 ? 'PM' : 'AM';
        return `${p2(gt.getUTCDate())}/${p2(gt.getUTCMonth() + 1)}/${gt.getUTCFullYear()} ${p2(h % 12 || 12)}:${p2(gt.getUTCMinutes())} ${ampm}`;
      })(),
      fechaFinExtendida: permiso.fecha_fin_extendida
        ? (() => { const [y, m, d] = (permiso.fecha_fin_extendida as string).split('-'); return `${d}/${m}/${y}`; })()
        : '',
      motivoExtension: permiso.motivo_extension || '',
      diasAdicionales: permiso.dias_adicionales || null,
      fechaHoraImpresion
    };

    this.imprimiendoDesdeTabla = true;

    // Usar las firmas actuales del componente (no recargar desde BD)
    // Si se está editando este permiso, las firmas ya están en this.firmas
    // Si se imprime desde la tabla sin editar, cargar desde BD
    if (!this.editingPermiso || this.editingPermiso.id !== permiso.id) {
      this.resetFirmas(permiso);
    }

    setTimeout(() => {
      this.imprimirCarta();
      setTimeout(() => { this.imprimiendoDesdeTabla = false; }, 1500);
    }, 300);
  }

  // ─── HELPERS 

  // Firmas organizadas en filas para la carta (se recalcula en actualizarCarta)
  firmasFilas: Array<Array<{ key: string; label: string; sub?: string }>> = [];

  private calcularFirmasFilas(): void {
    type FirmaKey = keyof typeof this.firmas;
    const todas: Array<{ key: FirmaKey; label: string; sub?: string }> = [
      { key: 'empleado', label: this.cartaData.rol ? this.cartaData.rol.toUpperCase() : '', sub: 'Empleado' },
      { key: 'jefeServicio', label: 'JEFE DE SERVICIO' },
      { key: 'jefeDepto', label: 'JEFE DE DEPARTAMENTO' },
      { key: 'jefePersonal', label: 'JEFE DE PERSONAL' },
      { key: 'direccion', label: 'DIRECCIÓN EJECUTIVA', sub: 'Y/O SUBDIRECCIÓN' },
      { key: 'oficioRH', label: 'OFICINA DE RECURSOS HUMANOS', sub: 'Firma y Sello' }
    ];
    const activas = todas.filter(f => this.firmas[f.key as FirmaKey]);
    const n = activas.length;
    if (n <= 1) {
      this.firmasFilas = [activas];
    } else if (n === 2) {
      // 2 firmas: 1 fila, separadas a los lados
      this.firmasFilas = [activas];
    } else if (n === 3) {
      // 3 firmas: 1 arriba centrada + 2 abajo
      this.firmasFilas = [[activas[0]], activas.slice(1)];
    } else if (n === 4) {
      // 4 firmas: 2 + 2 bien distribuidas
      this.firmasFilas = [activas.slice(0, 2), activas.slice(2)];
    } else if (n === 5) {
      // 5 firmas: 3 + 2
      this.firmasFilas = [activas.slice(0, 3), activas.slice(3)];
    } else {
      // 6 firmas: 3 + 3
      this.firmasFilas = [activas.slice(0, 3), activas.slice(3)];
    }
  }

  /** Devuelve el nombre del día de la semana en minúscula a partir de 'dd/mm/yyyy' */
  diaDeSemana(fechaDDMMYYYY: string): string {
    if (!fechaDDMMYYYY) return '';
    const [d, m, y] = fechaDDMMYYYY.split('/');
    const fecha = new Date(`${y}-${m}-${d}T00:00:00`);
    if (isNaN(fecha.getTime())) return '';
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    return dias[fecha.getDay()];
  }

  get totalFirmasActivas(): number {
    return this.firmasFilas.reduce((a, f) => a + f.length, 0);
  }

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

  /** Retorna true si la fecha efectiva de fin ya pasó (usa fecha_fin_extendida si existe) */
  yaFinalizo(permiso: Permiso): boolean {
    const hoy = new Date().toISOString().substring(0, 10);
    // Usar fecha_fin_extendida si existe, si no fecha_fin
    const finEfectivo = permiso.fecha_fin_extendida
      ? String(permiso.fecha_fin_extendida).substring(0, 10)
      : (permiso.fecha_fin as any instanceof Date)
        ? (permiso.fecha_fin as any).toISOString().substring(0, 10)
        : String(permiso.fecha_fin).substring(0, 10);
    return hoy > finEfectivo;
  }

  private hayTraslapeLocal(empleado_id: number, inicio: string, fin: string, finExt?: string | null, excludeId?: number): boolean {
    const newS = inicio.substring(0, 10);
    const newE = (finExt || fin).substring(0, 10);

    return this.permisos.some(p => {
      if (p.empleado_id !== empleado_id) return false;
      if (p.estado !== 'AUTORIZADO') return false;
      if (excludeId && p.id === excludeId) return false;

      const oldS = String(p.fecha_inicio).substring(0, 10);
      const oldE = String(p.fecha_fin_extendida || p.fecha_fin).substring(0, 10);

      // Overlap: S1 <= E2 AND S2 <= E1
      return newS <= oldE && oldS <= newE;
    });
  }

  // ─── MÉTODOS DEL CALENDARIO CON PUNTOS DE COLOR ─────────────────────
  abrirCalendario(modo: 'inicio' | 'fin') {
    this.calModoSeleccion = modo;
    const refIso = modo === 'inicio' ? this.solicitudForm.fecha_inicio : (this.solicitudForm.fecha_fin || this.solicitudForm.fecha_inicio);
    if (refIso && refIso.length >= 7) {
      const [y, m] = refIso.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        this.calYear = y;
        this.calMonth = m - 1;
      }
    } else {
      const hoy = new Date();
      this.calYear = hoy.getFullYear();
      this.calMonth = hoy.getMonth();
    }
    this.actualizarCalendarioCache();
    this.mostrarCalendarioModal = true;
  }

  cerrarCalendario() {
    this.mostrarCalendarioModal = false;
  }

  calMesAnterior() {
    if (this.calMonth === 0) {
      this.calMonth = 11;
      this.calYear--;
    } else {
      this.calMonth--;
    }
    this.actualizarCalendarioCache();
  }

  calMesSiguiente() {
    if (this.calMonth === 11) {
      this.calMonth = 0;
      this.calYear++;
    } else {
      this.calMonth++;
    }
    this.actualizarCalendarioCache();
  }

  /** Llamar cuando cambia el año o mes desde los selects del calendario */
  onCalNavChange() {
    this.actualizarCalendarioCache();
  }

  seleccionarDiaCalendario(dia: number | null) {
    if (!dia) return;
    const m = String(this.calMonth + 1).padStart(2, '0');
    const d = String(dia).padStart(2, '0');
    const iso = `${this.calYear}-${m}-${d}`;

    if (this.calModoSeleccion === 'inicio') {
      this.solicitudForm.fecha_inicio = iso;
      if (this.esDiaUnico) {
        this.solicitudForm.fecha_fin = iso;
      }
    } else {
      this.solicitudForm.fecha_fin = iso;
    }
    this.calcularDias();
    this.cerrarCalendario();
  }

  /** Recalcula y cachea las celdas del calendario. Llamar solo cuando cambian mes, año o fechas seleccionadas. */
  actualizarCalendarioCache() {
    this.calCeldasCache = this.getMatrizDiasCalendario();
  }

  private getMatrizDiasCalendario() {
    const primerDia = new Date(this.calYear, this.calMonth, 1).getDay(); // 0=Dom
    const totalDias = new Date(this.calYear, this.calMonth + 1, 0).getDate();
    const feriados = getFeriadosDelMes(this.calYear, this.calMonth, {
      aplicaMadre: this.aplicaDiaMadre,
      aplicaPadre: this.aplicaDiaPadre
    });

    const hoy = new Date();
    const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    const celdas: Array<{
      dia: number | null;
      iso?: string;
      esFinSemana?: boolean;
      feriado?: { nombre: string; esCondicional?: boolean } | null;
      esInicio?: boolean;
      esFin?: boolean;
      enRango?: boolean;
      esHoy?: boolean;
    }> = [];

    for (let i = 0; i < primerDia; i++) {
      celdas.push({ dia: null });
    }

    const isoInicio = this.solicitudForm.fecha_inicio;
    const isoFin = this.solicitudForm.fecha_fin;

    for (let dia = 1; dia <= totalDias; dia++) {
      const m = String(this.calMonth + 1).padStart(2, '0');
      const d = String(dia).padStart(2, '0');
      const iso = `${this.calYear}-${m}-${d}`;
      const fechaObj = new Date(this.calYear, this.calMonth, dia);
      const dow = fechaObj.getDay();
      const esFinSemana = dow === 0 || dow === 6;
      const feriadoInfo = feriados[dia] || null;

      const esInicio = iso === isoInicio;
      const esFin = iso === isoFin;
      let enRango = false;
      if (isoInicio && isoFin && iso >= isoInicio && iso <= isoFin) {
        enRango = true;
      }

      celdas.push({
        dia,
        iso,
        esFinSemana,
        feriado: feriadoInfo,
        esInicio,
        esFin,
        enRango,
        esHoy: iso === hoyIso
      });
    }

    return celdas;
  }
}
