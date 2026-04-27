import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PermisosService, Permiso, TipoPermiso } from '../../services/permisos.service';
import { EmpleadosService, Empleado, Rol, Area } from '../../services/empleados.service';

// ─── Feriados GT
// Fijos: 'MM-DD'  |  Variables por año: 'YYYY-MM-DD'
const FERIADOS_FIJOS = new Set([
  '01-01', // Año Nuevo
  '05-01', // Día del Trabajo
  '06-30', // Día del Ejército
  '09-15', // Independencia
  '10-20', // Revolución
  '11-01', // Todos los Santos
  '12-24', // Nochebuena 
  '12-25', // Navidad
  '12-31', // Fin de año
]);

// Semana Santa varía cada año — se calculan dinámicamente
function getPascua(year: number): Date {
  // Algoritmo de Butcher
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getFeriadosSemSanta(year: number): Set<string> {
  const pascua = getPascua(year);
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dias = new Set<string>();
  // Jueves Santo, Viernes Santo, Sábado Santo
  for (const offset of [-3, -2, -1]) {
    const d = new Date(pascua);
    d.setDate(d.getDate() + offset);
    dias.add(fmt(d));
  }
  return dias;
}

const NOMBRES_FERIADOS: Record<string, string> = {
  '01-01': 'Año Nuevo',
  '05-01': 'Día del Trabajo',
  '06-30': 'Día del Ejército',
  '09-15': 'Independencia',
  '10-20': 'Revolución',
  '11-01': 'Todos los Santos',
  '12-24': 'Nochebuena',
  '12-25': 'Navidad',
  '12-31': 'Fin de Año',
};

/** Parsea 'YYYY-MM-DD' sin conversión de zona horaria */
function parseFechaLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function esFeriado(fecha: Date): boolean {
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;
  if (FERIADOS_FIJOS.has(key)) return true;
  const semSanta = getFeriadosSemSanta(fecha.getFullYear());
  return semSanta.has(key);
}

function getNombreFeriado(fecha: Date): string {
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;
  if (NOMBRES_FERIADOS[key]) return NOMBRES_FERIADOS[key];
  // Semana Santa
  const semSanta = getFeriadosSemSanta(fecha.getFullYear());
  if (semSanta.has(key)) {
    const pascua = getPascua(fecha.getFullYear());
    const diff = Math.round((fecha.getTime() - pascua.getTime()) / 86400000);
    if (diff === -3) return 'Jueves Santo';
    if (diff === -2) return 'Viernes Santo';
    if (diff === -1) return 'Sábado Santo';
  }
  return 'Feriado';
}

export function calcularDiasHabilesGT(inicio: Date, fin: Date): number {
  let dias = 0;
  const cur = new Date(inicio);
  while (cur <= fin) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) dias++; // lunes-viernes, feriados incluidos en el total
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

/** Devuelve lista de feriados (hábiles excluidos) que caen en el rango */
export function feriadosEnRango(inicio: Date, fin: Date): string[] {
  const lista: string[] = [];
  const cur = new Date(inicio);
  while (cur <= fin) {
    const d = cur.getDay();
    // Solo feriados que caen en día hábil (lunes-viernes)
    if (d !== 0 && d !== 6 && esFeriado(cur)) {
      const dd = String(cur.getDate()).padStart(2, '0');
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      lista.push(`${dd}/${mm} ${getNombreFeriado(cur)}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return lista;
}

/** Cuenta fines de semana (sábados y domingos) en el rango */
export function finesDeSemanaEnRango(inicio: Date, fin: Date): number {
  let count = 0;
  const cur = new Date(inicio);
  while (cur <= fin) {
    const d = cur.getDay();
    if (d === 0 || d === 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

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

  constructor(
    private permisosSvc: PermisosService,
    private empleadosSvc: EmpleadosService
  ) { }

  ngOnInit() {
    this.loadPermisos();
    this.loadEmpleados();
    this.loadTiposPermiso();
    this.empleadosSvc.getRoles().subscribe(r => { if (r.success && r.data) this.roles = r.data; });
    this.empleadosSvc.getAreas().subscribe(a => { if (a.success && a.data) this.areas = a.data; });
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
      finesDeSemanaCont: 0
    };
  }

  // ─── CARGA DE DATOS ───────────────────────────────────────────────
  loadPermisos() {
    this.loading = true;
    // Siempre cargar solo los que están en permiso vigente
    this.permisosSvc.getPermisos('permiso').subscribe({
      next: (res) => {
        this.permisos = res.success && res.data ? res.data : [];
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
    if (!t) return this.permisos;
    return this.permisos.filter(p =>
      [p.nombre_completo, p.rol_nombre, p.area_nombre].some(v => this.norm(String(v || '')).includes(t))
    );
  }

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
    this.solicitudForm = {
      ...permiso,
      fecha_inicio: this.toDateInput(permiso.fecha_inicio),
      fecha_fin: this.toDateInput(permiso.fecha_fin),
    };
    this.empleadoSeleccionado = this.empleados.find(e => e.id === permiso.empleado_id) || null;
    this.empleadoBusqueda = permiso.nombre_completo || '';
    // Recalcular días con las fechas normalizadas y validar límite
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
    const tipo = this.tiposPermiso.find(t => t.id === this.solicitudForm.tipo_permiso_id);
    if (tipo) {
      this.solicitudForm.tipo_permiso_otro = '';
    }
    if (this.solicitudForm.tipo_permiso_id === -1) {
      this.solicitudForm.fecha_inicio = '';
      this.solicitudForm.fecha_fin = '';
      this.solicitudForm.dias_solicitados = 0;
    }
    // Si es 1 día, limpiar fechas para que el usuario solo elija inicio
    if (tipo?.dias_permitidos === 1) {
      this.solicitudForm.fecha_inicio = '';
      this.solicitudForm.fecha_fin = '';
      this.solicitudForm.dias_solicitados = 0;
    }
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
      finesDeSemanaCont: finesSemana
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
    this.loading = true;
    const data: any = { ...this.solicitudForm };
    // Permiso personalizado: no asociar tipo_permiso_id
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
    this.loading = true;
    const data: any = { ...this.solicitudForm };
    if (data.tipo_permiso_id === -1) {
      data.tipo_permiso_id = null;
    } else {
      data.tipo_permiso_otro = null;
      data.mensaje_otro = null;
    }
    this.permisosSvc.updatePermiso(this.editingPermiso.id!, data).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) { this.volverATabla(); }
        else this.error = res.error || 'Error actualizando';
      },
      error: () => { this.error = 'Error de conexión'; this.loading = false; }
    });
  }

  // ─── ESTADO ───────────────────────────────────────────────────────
  cambiarEstado(permiso: Permiso, estado: 'PENDIENTE' | 'AUTORIZADO') {
    if (!confirm(`¿Cambiar estado a ${estado}?`)) return;
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
      error: () => { this.error = 'Error de conexión'; this.loading = false; }
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
  <title>Solicitud de Permiso</title>
  ${estilos}
  <style>
    @page { size: letter portrait; margin: 10mm 15mm; }
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
  </style>
</head>
<body>${cartaEl.outerHTML}</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  // ─── HELPERS ──────────────────────────────────────────────────────
  getEstadoClass(estado: string): string {
    if (estado === 'AUTORIZADO') return 'estado-autorizado';
    if (estado === 'RECHAZADO') return 'estado-rechazado';
    return 'estado-pendiente';
  }
}
