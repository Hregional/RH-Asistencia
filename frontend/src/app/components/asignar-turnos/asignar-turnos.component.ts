import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule, FormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TurnosService } from '../../services/turnos.service';
import { CalendarioTurnosComponent } from '../calendario-turnos/calendario-turnos.component';
import { EmpleadosService } from '../../services/empleados.service';
import { PermisosService } from '../../services/permisos.service';
import { RemplazoComponent } from '../reemplazo/remplazo.component';
import { RenovacionComponent } from '../renovacion/renovacion.component';
import { FijoComponent } from '../fijo/fijo.component';
import { Subject, takeUntil } from 'rxjs';


const API = environment.apiBase;

// ===== Interfaces =====
interface Turno {
  nombre_turno: string;
  id: number;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  minutos_descanso: number;
  tolerancia_entrada_minutos: number;
  tolerancia_salida_minutos: number;
  cruza_medianoche: boolean;
  esPersonalizado?: boolean;
}

interface Area {
  id: number;
  nombre: string;
}

interface Empleado {
  empleado: any[];
  length: any;
  asignacionesPrevias?: Asignacion[];
  numero_empleado: string;
  id: number;
  nombre_completo: string;
  area_id: number | null;
  rol_id: number | null;
  email?: string | null;
  activo?: boolean;
  turnoAsignado?: number | null;
  rol_nombre?: string;
}

interface Rol {
  id: number;
  nombre: string;
  nivel?: number;
}

interface NuevoTurno {
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  tolerancia_entrada_minutos: number;
  tolerancia_salida_minutos: number;
}

interface Asignacion {
  empleado_id: number;
  turno_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  hora_entrada?: string;
  hora_salida?: string;
}

@Component({
  selector: 'app-asignar-turnos',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    CalendarioTurnosComponent,
    RemplazoComponent,
    RenovacionComponent,
    FijoComponent
  ],
  templateUrl: './asignar-turnos.component.html',
  styleUrls: ['./asignar-turnos.component.scss']
})
export class AsignarTurnosComponent implements OnInit, OnDestroy {


  private destroy$ = new Subject<void>();
  private filtroTimeout: any;

  private empleadosService = inject(EmpleadosService);
  private permisosSvc = inject(PermisosService);

  // Mapa de permisos por empleado_id para el rango de fechas seleccionado
  permisosEmpleados = new Map<number, { autorizado: boolean; pendiente: boolean; detalle: string }>();

  constructor(private turnosService: TurnosService) { }

  // ===== Estado de vistas =====
  vista: 'HOME' | 'LISTA_ROTATIVOS' | 'LISTA_FIJOS' | 'FORMULARIO' = 'HOME';
  modo: 'FIJO' | 'ROTATIVO' = 'ROTATIVO';
  editandoId: number | 'NUEVO' | null = null;
  step = 1;

  turnoSeleccionadoGlobal: number | null = null;
  modoReemplazoActivo: boolean = false;

  // ===== Estado general =====
  loading = false;
  error: string | null = null;
  info: string | null = null;

  // ===== Catálogos =====
  turnosFiltrados: any[] = [];
  turnos: Turno[] = [];
  areas: Area[] = [];
  jefesCandidatos: Empleado[] = [];
  roles: Rol[] = [];
  empleados: Empleado[] = [];
  empleadosAsignados: any[] = [];

  // Datos de prueba / placeholders
  enfermerosSeleccionados: any[] = [];
  auxEnfermeriaSeleccionados: any[] = [];
  auxHospitalSeleccionadosData: any[] = [];
  empleadoCalendarioSeleccionado?: number;
  EmpleadoSeleccionado: any;

  areaSeleccionada: any = null;
  conf: any = { area_id: null };
  mostrarModalRemplazo: boolean = false;
  configuracionSeleccionada: any = null;

  // ===== Inyecciones =====
  // private turnosService = inject(TurnosService);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);

  // ===== Formularios =====
  areaJefeForm = this.fb.group({
    area_id: [null as number | null, Validators.required],
    jefe_id: [null as number | null, Validators.required],
  });

  fechasForm = this.fb.group({
    fecha_inicio: ['', Validators.required],
    fecha_fin: ['', Validators.required],
    patron: ['NORMAL', Validators.required],
  });

  // ===== Turnos personalizados =====
  nuevoTurno: NuevoTurno = {
    nombre: '',
    hora_inicio: '08:00',
    hora_fin: '16:00',
    tolerancia_entrada_minutos: 15,
    tolerancia_salida_minutos: 15
  };

  // Asignaciones
  asignacionesPendientes: Asignacion[] = [];
  asignacionesCalendario: Asignacion[] = [];
  modoEdicion: boolean | undefined;
  form: any;
  asignacionesPrevias: any;
  reemplazos: any[] = [];
  calendarioComponent: any;
  mostrarModalReemplazo: boolean = false;
  reemplazoActivo: any;
  empleadoOriginal: any;
  turnoId: any;

  // ===== Gestión de equipos =====
  empleadosFiltrados: Empleado[] = [];
  filtroBusqueda: string = '';
  filtroRol: string | null = null;
  equipoCompleto: Empleado[] = [];

  // ===== Asignaciones individuales (desde calendario-turnos) =====
  asignaciones: Record<number, any[]> = {};

  // ===== Filtros Tablas =====
  searchMonth: number = new Date().getMonth() + 1;
  searchYear: number = new Date().getFullYear();
  searchAreaId: number | null = null;
  filteredFijos: any[] = [];
  filtroAplicado = false;
  diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // ===== Ciclo de vida =====
  ngOnInit(): void {
    this.cargarCatalogos();
    this.cargarTurnos();
    this.cargarConfiguraciones();

    this.empleadosService.empleados$
      .pipe(takeUntil(this.destroy$))
      .subscribe(empleados => {
        this.empleados = empleados.map(emp => ({
          ...emp,
          id: emp.id ?? 0,
          empleado: emp.empleado ?? [],
          length: emp.length ?? 0,
          asignacionesPrevias: emp.asignacionesPrevias ?? undefined
        }));

        if (this.vista === 'FORMULARIO' && this.step === 2) {
          setTimeout(() => this.filtrarEmpleados(), 100);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.filtroTimeout) {
      clearTimeout(this.filtroTimeout);
    }
  }

  // ===== Métodos de navegación =====
  abrirFormulario(id: any) {
    this.editandoId = id === 'NUEVO' ? 'NUEVO' : id;
    this.modo = this.vista === 'LISTA_ROTATIVOS' ? 'ROTATIVO' : 'FIJO';
    this.vista = 'FORMULARIO';
    this.resetFormulario();

    // Si es un nuevo turno, no hay problema
    if (id === 'NUEVO') return;

    // Si es una configuración existente
    const conf = this.modo === 'ROTATIVO'
      ? this.configuracionesRotativas.find(c => c.id === id)
      : this.configuracionesFijas.find(c => c.id === id);

    if (conf) {
      this.configuracionSeleccionada = conf;

      // Si es FIJO, detenemos aquí la carga manual porque el componente app-fijo se encargará (si le pasamos el input)
      if (this.modo === 'FIJO') {
        return;
      }

      // Cargar datos básicos (SOLO PARA ROTATIVOS)
      this.areaJefeForm.patchValue({
        area_id: conf.areaId || conf.area_id,
        jefe_id: conf.jefeId || conf.jefe_id
      });

      this.fechasForm.patchValue({
        fecha_inicio: conf.fecha_inicio,
        fecha_fin: conf.fecha_fin,
        patron: conf.patron || 'NORMAL'
      });

      this.reemplazos = [...(conf.reemplazos || [])];

      // REEMPLAZO CLAVE:
      // Si el equipo no viene cargado, lo reconstruimos desde la BD
      if (!conf.equipo || conf.equipo.length === 0) {
        // Intentar extraer los IDs de empleados guardados en configuraciones_turnos
        try {
          // Algunos backends devuelven empleados_ids como JSON string o array
          const ids = Array.isArray(conf.empleados_ids)
            ? conf.empleados_ids
            : JSON.parse(conf.empleados_ids || '[]');

          if (ids.length > 0) {
            this.cargarEmpleadosDelLote(ids);
          } else {
            console.warn('No se encontraron empleados_ids en la configuración');
            this.equipoCompleto = [];
          }
        } catch (e) {
          console.error('Error parseando empleados_ids:', e);
          this.equipoCompleto = [];
        }
      } else {
        // Si ya vienen los datos del equipo
        this.equipoCompleto = [...conf.equipo];
      }

      // Cargar asignaciones existentes si hay fechas
      if (conf.fecha_inicio && conf.fecha_fin) {
        this.cargarAsignacionesEquipoCompleto(conf.fecha_inicio, conf.fecha_fin);
      }

      // Mostrar paso 4 directamente (selector de empleado)
      this.step = 4;
    }
  }

  cargarEmpleadosDelLote(ids: number[]) {
    if (!ids || ids.length === 0) return;

    this.http.post(`${API}/asignaciones/empleados/por-ids`, { ids }).subscribe({
      next: (resp: any) => {
        if (resp.success) {
          this.equipoCompleto = resp.data;
          console.info(`Equipo reconstruido (${resp.data.length} empleados)`);
        } else {
          console.warn('No se pudo cargar el equipo del lote');
        }
      },
      error: (err) => console.error('Error al cargar empleados del lote:', err)
    });
  }



  cargarConfiguraciones() {
    this.turnosService.getConfiguraciones().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const mapConfig = (c: any) => {
            let conf: any = {};
            try { conf = typeof c.configuracion === 'string' ? JSON.parse(c.configuracion) : c.configuracion } catch (e) { }
            return {
              ...c,
              configuracion: conf,
              diasDescansoLabel: this.getDiasDescansoLabels(conf?.dias_descanso)
            };
          };

          this.configuracionesFijas = res.data.filter((c: any) => c.tipo === 'FIJO').map(mapConfig);
          this.configuracionesRotativas = res.data.filter((c: any) => c.tipo === 'ROTATIVO').map(mapConfig);

          this.aplicarFiltrosTabla();
        }
      },
      error: (err) => {
        console.error('Error cargando configuraciones:', err);
      }
    });
  }

  aplicarFiltrosTabla() {
    // Filtrado básico por Mes/Anio para Fijos (si aplica) o solo mostrar todos por ahora
    // Replicando lógica de FijoComponent:
    const startSearch = new Date(this.searchYear, this.searchMonth - 1, 1);
    const endSearch = new Date(this.searchYear, this.searchMonth, 0);

    this.filteredFijos = this.configuracionesFijas.filter(c => {
      // Si no tiene fechas, asumir activo
      if (!c.fecha_inicio) return true;

      const startDate = new Date(c.fecha_inicio);
      const endDate = new Date(c.fecha_fin); // Fijos suelen ser largos, 1 año

      // Superposición 
      const overlaps = startDate <= endSearch && endDate >= startSearch;

      const matchArea = this.searchAreaId ? Number(c.area_id) === Number(this.searchAreaId) : true;

      return overlaps && matchArea;
    });
    this.filtroAplicado = true;
  }

  onSearchFilter() {
    this.aplicarFiltrosTabla();
  }

  getDiasDescansoLabels(dias: any): string {
    if (!dias) return '';
    const diasArray = Array.isArray(dias) ? dias : (typeof dias === 'string' ? dias.split(',') : []);
    if (diasArray.length === 0) return '';

    // Mapeo ID Backend -> Nombre UI
    // Backend 0=Domingo, 1=Lunes... 
    const map: Record<string, string> = {
      '0': 'Domingo', '1': 'Lunes', '2': 'Martes', '3': 'Miércoles',
      '4': 'Jueves', '5': 'Viernes', '6': 'Sábado'
    };
    return diasArray.map((d: any) => map[d.toString().trim()] || d).join(', ');
  }

  // Cuando cambia la vista
  abrirVistaFijos() {
    this.vista = 'LISTA_FIJOS';
    this.cargarConfiguraciones();
  }

  abrirVistaRotativos() {
    this.vista = 'LISTA_ROTATIVOS';
    this.cargarConfiguraciones();
  }

  abrirModalRemplazo(conf: any) {
    this.conf = conf;
    this.mostrarModalRemplazo = true;
  }

  // Cerrar modal de reemplazo
  cerrarModalRemplazo() {
    this.mostrarModalRemplazo = false;
  }



  cancelarFormulario(esCancelacionTotal: boolean = true) {
    if (esCancelacionTotal) {
      this.vista = this.modo === 'ROTATIVO' ? 'LISTA_ROTATIVOS' : 'LISTA_FIJOS';
      this.editandoId = null;
      this.step = 1;
      this.error = null;
      this.equipoCompleto = [];
    } else {
      this.prevStep();
    }
  }

  prevStep() {
    if (this.step > 1) {
      this.step--;
      this.error = null;
    }
  }

  nextStep() {
    if (this.step === 1) {
      if (!this.areaJefeForm.value.area_id || !this.areaJefeForm.value.jefe_id) {
        this.error = 'Debes seleccionar un área y un jefe de área antes de continuar.';
        return;
      }
    }

    if (this.step === 2) {
      if (this.equipoCompleto.length === 0) {
        this.error = 'Debes seleccionar al menos un empleado para el equipo.';
        return;
      }

      // ⚠️ FIX: No agregar al jefe automáticamente. Debe seleccionarse manualmente.
      // const jefeId = this.areaJefeForm.controls.jefe_id.value;
      // const jefeSeleccionado = this.jefesCandidatos.find(j => j.id === jefeId);
      // if (jefeSeleccionado && !this.equipoCompleto.some(e => e.id === jefeSeleccionado.id)) {
      //   this.equipoCompleto = [jefeSeleccionado, ...this.equipoCompleto];
      // }
    }

    if (this.step === 3) {
      if (this.turnosDisponibles.length === 0) {
        this.error = 'Debes crear al menos un turno antes de continuar.';
        return;
      }
    }

    if (this.step === 4) {
      const empleadosConTurno = this.equipoCompleto.filter(e => e.turnoAsignado);
      if (empleadosConTurno.length === 0 && this.asignacionesCalendario.length === 0) {
        this.error = 'Debes asignar turnos a los empleados seleccionados antes de guardar.';
        return;
      }
    }

    if (this.step < 4) {
      this.step++;
      this.error = null;
    }
  }

  // ===== Métodos para turnos fijos =====
  onFijoGuardado(configuracion: any): void {

    this.configuracionesFijas = [...this.configuracionesFijas, configuracion];
    this.vista = 'LISTA_FIJOS';
    this.info = `Turno fijo creado correctamente para ${configuracion.empleadosCount} empleado(s)`;

    setTimeout(() => {
      this.info = null;
    }, 3000);
  }

  // ===== Modal de Confirmación de Eliminación =====
  showDeleteConfirm = false;
  configToDelete: any = null;
  vistaDelete: string = '';

  eliminarConfiguracion(conf: any, vista: string) {
    this.configToDelete = conf;
    this.vistaDelete = vista;
    this.showDeleteConfirm = true;
  }

  confirmarEliminacion() {
    if (!this.configToDelete) return;

    this.turnosService.eliminarConfiguracion(this.configToDelete.id).subscribe({
      next: (res) => {
        if (res.success) {
          if (this.vistaDelete === 'LISTA_ROTATIVOS') {
            this.configuracionesRotativas = this.configuracionesRotativas.filter(c => c.id !== this.configToDelete.id);
          } else {
            this.configuracionesFijas = this.configuracionesFijas.filter(c => c.id !== this.configToDelete.id);
          }

          this.info = 'Configuración eliminada correctamente';
          setTimeout(() => this.info = null, 3000);
        } else {
          this.error = 'No se pudo eliminar la configuración';
        }
        this.cerrarModalEliminacion();
      },
      error: (err) => {
        console.error('Error eliminando configuración:', err);
        this.error = 'Error al eliminar la configuración';
        this.cerrarModalEliminacion();
      }
    });
  }

  cerrarModalEliminacion() {
    this.showDeleteConfirm = false;
    this.configToDelete = null;
    this.vistaDelete = '';
  }

  // ===== Métodos de carga de datos =====
  private cargarCatalogos() {
    this.loading = true;
    this.error = null;

    const turnosGuardados = localStorage.getItem('turnosPersonalizados');
    const turnosPersonalizados = turnosGuardados ? JSON.parse(turnosGuardados) : [];

    this.empleadosService.cargarEmpleados().subscribe({
      next: (empleadosResponse) => {
        Promise.all([
          this.http.get<any>(`${API}/turnos`).toPromise(),
          this.http.get<any>(`${API}/areas`).toPromise(),
          this.http.get<any>(`${API}/roles`).toPromise()
        ])
          .then(([t, a, r]) => {
            this.turnos = [...turnosPersonalizados, ...(t?.data || [])];

            this.areas = (a?.data || []).map((x: any) => ({
              id: x.id,
              nombre: x.nombre || x.nombre_area || 'Sin nombre'
            }));

            this.roles = (r?.data || []).map((rol: any) => ({
              id: rol.id,
              nombre: rol.nombre_rol || rol.nombre,
              nivel: rol.nivel
            }));
            this.filtrarEmpleados();
          })
          .catch((error) => {
            console.error('Error cargando catálogos:', error);
            this.error = 'No se pudieron cargar algunos catálogos.';
            this.filtrarEmpleados();
          })
          .finally(() => {
            this.loading = false;
          });
      },
      error: (error) => {
        console.error('Error cargando empleados:', error);
        this.error = 'No se pudieron cargar los empleados.';
        this.loading = false;
      }
    });
  }

  cargarTurnos() {
    this.http.get<any>(`${API}/turnos`).subscribe({
      next: (res) => {
        const turnosDB: Turno[] = res.data || res || [];
        this.turnos = turnosDB.map(t => ({
          id: t.id,
          nombre: t.nombre || t.nombre_turno,
          nombre_turno: t.nombre_turno || t.nombre || '',
          hora_inicio: t.hora_inicio,
          hora_fin: t.hora_fin,
          minutos_descanso: t.minutos_descanso ?? 0,
          tolerancia_entrada_minutos: t.tolerancia_entrada_minutos,
          tolerancia_salida_minutos: t.tolerancia_salida_minutos,
          cruza_medianoche: t.cruza_medianoche ?? false,
          esPersonalizado: true
        }));
      },
      error: (err) => console.error('Error cargando turnos:', err)
    });
  }

  // ===== Gestión de áreas y empleados =====
  onAreaChangeRotativo(areaId: string | number | null) {
    const id = areaId ? Number(areaId) : null;
    if (id !== null) {
      this.cargarJefesCandidatos(id);
    }

    setTimeout(() => {
      this.filtrarEmpleados();
    }, 100);
  }

  cargarJefesCandidatos(areaId: number | null) {
    if (!areaId) {
      this.jefesCandidatos = [];
      return;
    }
    this.jefesCandidatos = this.empleados.filter(emp =>
      emp.area_id === areaId && emp.activo
    );
  }

  // ===== Gestión de empleados =====
  filtrarEmpleados() {
    if (this.filtroTimeout) {
      clearTimeout(this.filtroTimeout);
    }

    this.filtroTimeout = setTimeout(() => {
      let filtrados = this.empleados.filter(e => e.activo);

      if (this.filtroBusqueda) {
        const search = this.filtroBusqueda.toLowerCase();
        filtrados = filtrados.filter(e =>
          e.nombre_completo.toLowerCase().includes(search)
        );
      }

      if (this.filtroRol) {
        filtrados = filtrados.filter(e =>
          this.getTipoRolPorNombre(e.rol_id) === this.filtroRol
        );
      } else {
        filtrados = filtrados.filter(e =>
          ['ENFERMERO', 'AUX_ENFERMERIA', 'AUX_HOSPITAL']
            .includes(this.getTipoRolPorNombre(e.rol_id))
        );
      }

      this.empleadosFiltrados = filtrados;
      this.cargarPermisosParaEmpleados(filtrados);
    }, 300);
  }

  cargarPermisosParaEmpleados(empleados: Empleado[]) {
    const desde = this.fechasForm.value.fecha_inicio;
    const hasta = this.fechasForm.value.fecha_fin;
    if (!desde || !hasta) return;

    empleados.forEach(emp => {
      if (!emp.id) return;
      this.permisosSvc.getPermisosVigentes(emp.id, desde, hasta).subscribe({
        next: (res) => {
          if (res.success && res.permisos?.length > 0) {
            const detalle = res.permisos.map((p: any) =>
              `${p.tipo_permiso_nombre || p.tipo_permiso_otro || 'Permiso'} (${p.fecha_inicio} - ${p.fecha_fin})`
            ).join(', ');
            this.permisosEmpleados.set(emp.id!, {
              autorizado: res.tienePermisoAutorizado,
              pendiente: res.tienePermisoPendiente,
              detalle
            });
          } else {
            this.permisosEmpleados.delete(emp.id!);
          }
        },
        error: () => {}
      });
    });
  }

  getPermisoEmpleado(id: number) {
    return this.permisosEmpleados.get(id);
  }

  tienePermisoAutorizado(id: number): boolean {
    return this.permisosEmpleados.get(id)?.autorizado ?? false;
  }

  tienePermisoPendiente(id: number): boolean {
    return this.permisosEmpleados.get(id)?.pendiente ?? false;
  }

  toggleEmpleadoEquipo(empleado: Empleado) {
    if (!this.puedeSerSeleccionado(empleado)) {
      this.error = `${empleado.nombre_completo} ya está asignado a otra área (${this.getAreaNombre(empleado.area_id)})`;
      return;
    }

    const index = this.equipoCompleto.findIndex(e => e.id === empleado.id);

    if (index === -1) {
      const permiso = this.getPermisoEmpleado(empleado.id!);

      if (permiso?.autorizado) {
        if (!confirm(`⚠️ ${empleado.nombre_completo} tiene permiso AUTORIZADO en este período:\n${permiso.detalle}\n\n¿Desea agregarlo de todas formas?`)) return;
      } else if (permiso?.pendiente) {
        const detalle = permiso.detalle || '';
        this.info = `⚠️ ${empleado.nombre_completo} tiene una solicitud de permiso pendiente: ${detalle}`;
        setTimeout(() => this.info = null, 5000);
      }

      this.equipoCompleto.push({ ...empleado });
    } else {
      this.equipoCompleto.splice(index, 1);
    }

    this.error = null;
  }

  puedeSerSeleccionado(empleado: Empleado): boolean {
    if (empleado.area_id === null) return true;
    const areaFormId = this.areaJefeForm.controls.area_id.value;
    if (!areaFormId) return false;
    return empleado.area_id === areaFormId;
  }

  isEmpleadoSeleccionado(id: number): boolean {
    return this.equipoCompleto.some(e => e.id === id);
  }

  isEmpleadoSeleccionable(emp: any): boolean {
    return !this.empleadosAsignados.some(a => a.id === emp.id);
  }

  getEmpleadosDisponiblesRotativos(): Empleado[] {
    const areaId = this.areaJefeForm.controls.area_id.value;

    return this.empleados.filter(emp => {
      if (!emp.activo) return false;

      const tipoRol = this.getTipoRolPorNombre(emp.rol_id);

      if (!['ENFERMERO', 'AUX_ENFERMERIA', 'AUX_HOSPITAL'].includes(tipoRol)) return false;

      return emp.area_id === null || emp.area_id === areaId;
    });
  }

  getEstadoDisponibilidad(empleado: any): string {
    if (!empleado.area_id) {
      return 'Disponible para asignar';
    } else if (empleado.area_id === this.areaJefeForm.controls.area_id.value) {
      return 'Ya asignado a esta área';
    } else {
      return `Ocupado en ${this.getAreaNombre(empleado.area_id)}`;
    }
  }

  // ===== Gestión de turnos =====
  crearTurnoPersonalizado() {
    if (!this.nuevoTurno.nombre || !this.nuevoTurno.hora_inicio || !this.nuevoTurno.hora_fin) {
      this.error = "Debes completar nombre, hora de inicio y hora de fin para crear el turno.";
      return;
    }

    const nuevo = {
      nombre: this.nuevoTurno.nombre,
      hora_inicio: this.nuevoTurno.hora_inicio,
      hora_fin: this.nuevoTurno.hora_fin,
      tolerancia_entrada_minutos: this.nuevoTurno.tolerancia_entrada_minutos ?? 15,
      tolerancia_salida_minutos: this.nuevoTurno.tolerancia_salida_minutos ?? 15
    };

    this.http.post<any>(`${API}/turnos`, nuevo).subscribe({
      next: (res) => {
        const turnoGuardado = res.data;

        this.turnos.push({
          ...turnoGuardado,
          id: turnoGuardado.id,
          nombre: turnoGuardado.nombre || turnoGuardado.nombre_turno,
          hora_inicio: turnoGuardado.hora_inicio,
          hora_fin: turnoGuardado.hora_fin,
          tolerancia_entrada_minutos: turnoGuardado.tolerancia_entrada_minutos,
          tolerancia_salida_minutos: turnoGuardado.tolerancia_salida_minutos,
          minutos_descanso: turnoGuardado.minutos_descanso || 0,
          cruza_medianoche: turnoGuardado.cruza_medianoche || false,
          esPersonalizado: true
        });

        this.info = 'Turno creado correctamente';
        this.nuevoTurno = {
          nombre: '',
          hora_inicio: '08:00',
          hora_fin: '16:00',
          tolerancia_entrada_minutos: 15,
          tolerancia_salida_minutos: 15
        };
      },
      error: (err) => {
        console.error('Error guardando turno:', err);
        this.error = 'Error al crear el turno';
      }
    });
  }

  eliminarTurno(id: number) {
    const turno = this.turnos.find(t => t.id === id);

    if (!turno) {
      this.error = 'Turno no encontrado';
      return;
    }

    if (!turno.esPersonalizado) {
      if (!confirm('Este es un turno del sistema. ¿Estás seguro de que quieres eliminarlo?')) {
        return;
      }
    } else {
      if (!confirm('¿Estás seguro de que quieres eliminar este turno?')) {
        return;
      }
    }

    this.http.delete<any>(`${API}/turnos/${id}`).subscribe({
      next: () => {
        this.turnos = this.turnos.filter(t => t.id !== id);
        this.info = 'Turno eliminado correctamente';
      },
      error: (err) => {
        console.error('Error eliminando turno:', err);
        this.error = 'No se pudo eliminar el turno';
      }
    });
  }

  // ===== Gestión de asignaciones =====
  recibirAsignaciones(event: any) {

    if (Array.isArray(event)) {
      const nuevasAsignaciones = event.map(asig => ({
        empleado_id: asig.empleado_id,
        turno_id: asig.turno_id,
        fecha_inicio: asig.fecha_inicio || asig.fecha,
        fecha_fin: asig.fecha_fin || asig.fecha,
        hora_entrada: asig.hora_entrada,
        hora_salida: asig.hora_salida
      }));
      this.asignacionesCalendario = [...this.asignacionesCalendario, ...nuevasAsignaciones];
    }
    else if (event && event.empleado_id) {
      const nuevaAsignacion: Asignacion = {
        empleado_id: event.empleado_id,
        turno_id: event.turno_id,
        fecha_inicio: event.fecha_inicio || event.fecha,
        fecha_fin: event.fecha_fin || event.fecha,
        hora_entrada: event.hora_entrada,
        hora_salida: event.hora_salida
      };
      this.asignacionesCalendario.push(nuevaAsignacion);

      const empleado = this.equipoCompleto.find(e => e.id === event.empleado_id);
      if (empleado) {
        empleado.turnoAsignado = event.turno_id;
      }
    }

  }

  // ===== Guardado de formulario rotativo =====
  async guardarFormulario() {
    if (!this.fechasForm.value.fecha_inicio || !this.fechasForm.value.fecha_fin) {
      this.error = 'Debes seleccionar fechas de inicio y fin';
      return;
    }

    if (this.equipoCompleto.length === 0) {
      this.error = 'No hay empleados en el equipo.';
      return;
    }

    if (this.turnosDisponibles.length === 0) {
      this.error = 'No hay turnos disponibles. Crea al menos uno.';
      return;
    }

    const empleadosConTurno = this.equipoCompleto.filter(e => e.turnoAsignado);

    if (empleadosConTurno.length === 0 && this.asignacionesCalendario.length === 0) {
      this.error = 'Debes asignar turnos a los empleados antes de guardar.';
      return;
    }

    await this.asignarAreasDefinitivas();

    let asignacionesParaGuardar: Asignacion[] = [];

    if (this.asignacionesCalendario.length > 0) {
      asignacionesParaGuardar = this.asignacionesCalendario.map(asig => ({
        empleado_id: asig.empleado_id,
        turno_id: asig.turno_id,
        fecha_inicio: asig.fecha_inicio,
        fecha_fin: asig.fecha_fin
      }));
    } else {
      const empleadosConTurno = this.equipoCompleto.filter(emp => emp.turnoAsignado);

      if (empleadosConTurno.length === 0) {
        this.error = 'Ningún empleado tiene turno asignado. Asigna turnos antes de guardar.';
        return;
      }

      asignacionesParaGuardar = empleadosConTurno.map(emp => ({
        empleado_id: emp.id,
        turno_id: emp.turnoAsignado!,
        fecha_inicio: String(this.fechasForm.value.fecha_inicio ?? ''),
        fecha_fin: String(this.fechasForm.value.fecha_fin ?? '')
      }));
    }

    const payload = {
      asignaciones: asignacionesParaGuardar
    };

    this.http.post(`${API}/asignaciones/bulk`, payload).subscribe({
      next: (res: any) => {
        this.info = `Asignaciones guardadas correctamente (${payload.asignaciones.length} turnos)`;
        this.guardarConfiguracionEnLocalStorage();
        this.mostrarResumenAsignaciones();

        this.asignacionesCalendario = [];
        setTimeout(() => {
          this.cancelarFormulario();
        }, 3000);
      },
      error: (err) => {
        console.error('Error guardando asignaciones:', err);
        this.revertirAsignacionAreas();

        if (err.status === 400) {
          this.error = 'Error en los datos enviados: ' + (err.error?.message || 'Formato incorrecto');
        } else if (err.status === 500) {
          this.error = 'Error del servidor: ' + (err.error?.error || 'Intenta nuevamente');
        } else {
          this.error = 'Error al guardar asignaciones: ' + err.message;
        }
      }
    });
  }

  // ===== Métodos auxiliares =====
  private cargarAsignacionesEquipoCompleto(fechaInicio: string, fechaFin: string) {
    ('Cargando asignaciones del equipo completo...');

    this.equipoCompleto.forEach(empleado => {
      this.turnosService.getAsignacionesEmpleado(empleado.id, fechaInicio, fechaFin).subscribe({
        next: (res) => {
          if (res.success && res.asignaciones && res.asignaciones.length > 0) {
            if (!empleado.asignacionesPrevias) {
              empleado.asignacionesPrevias = [];
            }
            empleado.asignacionesPrevias = [...res.asignaciones];

            if (this.empleadoCalendarioSeleccionado === empleado.id) {
              this.actualizarCalendarioConAsignacionesPrevias();
            }
          }
        },
        error: (err) => {
          console.error(`Error cargando asignaciones para ${empleado.nombre_completo}:`, err);
        }
      });
    });
  }

  onEmpleadoCalendarioChange() {

    if (this.empleadoCalendarioSeleccionado) {
      this.actualizarCalendarioConAsignacionesPrevias();
    }
  }

  private actualizarCalendarioConAsignacionesPrevias() {
    if (!this.empleadoCalendarioSeleccionado) return;

    const empleado = this.equipoCompleto.find(e => e.id === this.empleadoCalendarioSeleccionado);
    if (empleado && empleado.asignacionesPrevias) {
      this.recibirAsignaciones(empleado.asignacionesPrevias);
    }
  }

  onReemplazoConfirmado(event: any) {

    this.reemplazoActivo = event.empleadoReemplazo;
    this.empleadoOriginal = event.empleadoOriginal;
    this.turnoId = event.turnoId;

    this.empleadoCalendarioSeleccionado = this.reemplazoActivo.id;

    this.info = ` ${event.empleadoReemplazo.nombre_completo} cubrirá el turno de ${event.empleadoOriginal.nombre_completo}. 
    Ahora selecciona los días en el calendario que este empleado cubrirá.`;

    this.cargarAsignacionesEquipoCompleto(
      this.fechasForm.controls.fecha_inicio.value || '',
      this.fechasForm.controls.fecha_fin.value || ''
    );

    this.reemplazoActivo = true;
  }

  onReemplazoSeleccionado(event: any) {
    this.calendarioComponent.activarModoReemplazo(event);
  }

  abrirModalReemplazo(empleado: any) {
    this.EmpleadoSeleccionado = empleado;
    this.mostrarModalReemplazo = true;
  }

  private async asignarAreasDefinitivas(): Promise<void> {
    const areaId = this.areaJefeForm.controls.area_id.value;
    if (!areaId) {
      throw new Error('No hay área seleccionada');
    }

    const promesas = this.equipoCompleto.map(empleado => {
      if (empleado.area_id !== areaId) {
        return this.actualizarAreaEmpleadoEnBD(empleado.id, areaId).toPromise();
      }
      return Promise.resolve();
    });

    await Promise.all(promesas);

    this.equipoCompleto.forEach(empleado => {
      empleado.area_id = areaId;
    });
  }

  private revertirAsignacionAreas(): void {
    this.equipoCompleto.forEach(empleado => {
      empleado.area_id = null;
    });
  }

  private mostrarResumenAsignaciones(): void {
    const areaNombre = this.getAreaNombre(this.areaJefeForm.controls.area_id.value);
    const empleadosCount = this.equipoCompleto.length;

    this.info = ` ${empleadosCount} empleados asignados al área ${areaNombre} y turnos guardados correctamente`;

    setTimeout(() => {
      ('Resumen de asignaciones:');
      this.equipoCompleto.forEach(emp => {
        const turnoNombre = this.turnos.find(t => t.id === emp.turnoAsignado)?.nombre || 'Sin turno';
        (`   - ${emp.nombre_completo}: ${turnoNombre}`);
      });
    }, 100);
  }

  private actualizarAreaEmpleadoEnBD(empleadoId: number, areaId: number | null) {
    return this.http.patch(`${API}/empleados/${empleadoId}`, { area_id: areaId });
  }

  private guardarConfiguracionEnLocalStorage() {
    const configuracion = {
      id: this.editandoId === 'NUEVO' ? Date.now() : this.editandoId,
      areaId: this.areaJefeForm.value.area_id,
      jefeId: this.areaJefeForm.value.jefe_id,
      equipo: [...this.equipoCompleto],
      turnos: [...this.turnos],
      reemplazos: [...this.reemplazos],
      fecha_inicio: this.fechasForm.value.fecha_inicio,
      fecha_fin: this.fechasForm.value.fecha_fin,
      patron: this.fechasForm.value.patron,
      areaNombre: this.getAreaNombre(this.areaJefeForm.value.area_id ?? null),
      jefeNombre: this.getEmpleadoNombre(this.areaJefeForm.value.jefe_id ?? null),
      empleadosCount: this.equipoCompleto.length,
      fechaCreacion: new Date().toISOString(),
      asignacionesCalendario: [...this.asignacionesCalendario]
    };

    const configs = this.configuracionesRotativas;
    if (this.editandoId === 'NUEVO') {
      configs.push(configuracion);
    } else {
      const index = configs.findIndex(c => c.id === this.editandoId);
      if (index !== -1) configs[index] = configuracion;
    }
    this.configuracionesRotativas = configs;
  }

  private resetFormulario() {
    this.areaJefeForm.reset();
    this.fechasForm.reset({ patron: 'NORMAL' });
    this.equipoCompleto = [];
    this.reemplazos = [];
    this.step = 1;
    this.error = null;
    this.filtroBusqueda = '';
    this.filtroRol = null;
    this.asignacionesCalendario = [];
    this.configuracionSeleccionada = null;
  }

  // ===== Getters =====
  get turnosDisponibles(): Turno[] {
    return this.turnos
      .filter(t => t && t.nombre && t.hora_inicio && t.hora_fin)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  get enfermerosEquipoSeleccionados() {
    return this.equipoCompleto.filter(e => this.getTipoRolPorNombre(e.rol_id) === 'ENFERMERO');
  }

  get auxEnfermeriaEquipoSeleccionados() {
    return this.equipoCompleto.filter(e => this.getTipoRolPorNombre(e.rol_id) === 'AUX_ENFERMERIA');
  }

  get auxHospitalSeleccionados() {
    return this.equipoCompleto.filter(e => this.getTipoRolPorNombre(e.rol_id) === 'AUX_HOSPITAL');
  }

  // ===== LocalStorage =====
  get configuracionesRotativas(): any[] {
    const stored = localStorage.getItem('configuracionesRotativas');
    return stored ? JSON.parse(stored) : [];
  }

  set configuracionesRotativas(value: any[]) {
    localStorage.setItem('configuracionesRotativas', JSON.stringify(value));
  }

  get configuracionesFijas(): any[] {
    const stored = localStorage.getItem('configuracionesFijas');
    return stored ? JSON.parse(stored) : [];
  }

  set configuracionesFijas(value: any[]) {
    localStorage.setItem('configuracionesFijas', JSON.stringify(value));
  }

  // ===== Utilidades =====
  getTipoRolPorNombre(rolId: number | null): string {
    if (!rolId) return '';
    const rolNombre = this.getRolNombre(rolId).toLowerCase();
    if (rolNombre.includes('enfermer') && !rolNombre.includes('auxiliar')) return 'ENFERMERO';
    if (rolNombre.includes('auxiliar') && rolNombre.includes('enfermer')) return 'AUX_ENFERMERIA';
    if (rolNombre.includes('auxiliar') && rolNombre.includes('hospital')) return 'AUX_HOSPITAL';
    return '';
  }

  getRolNombre(rolId: number | null): string {
    if (!rolId) return 'Sin rol';
    return this.roles.find(r => r.id === rolId)?.nombre || `Rol ${rolId}`;
  }

  getEmpleadoNombre(id: number | null): string {
    return this.empleados.find(e => e.id === id)?.nombre_completo || '—';
  }

  getAreaNombre(id: number | null): string {
    return this.areas.find(a => a.id === id)?.nombre || '—';
  }

  // ===== Funciones TrackBy =====
  trackByEmpleadoId(index: number, empleado: any): number {
    return empleado.id;
  }

  trackByTurnoId(index: number, turno: any): number {
    return turno.id;
  }

  trackByAreaId(index: number, area: any): number {
    return area.id;
  }

  trackByConfigId(index: number, config: any): number {
    return config.id || index;
  }

  trackByDiaSemana(index: number, dia: any): number {
    return index;
  }

  trackByRolId(index: number, rol: any): number {
    return rol.id || index;
  }

  trackByJefeId(index: number, jefe: any): number {
    return jefe.id || index;
  }

  trackByAsignacionId(index: number, asignacion: any): number {
    return asignacion.id || index;
  }


}