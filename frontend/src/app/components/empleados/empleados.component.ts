import { Component, OnInit } from "@angular/core";
import { EmpleadosService, Empleado, ApiResponse, Rol, Area } from "../../services/empleados.service";
import { AreasService } from "../../services/areass.service";
import { PermisosService } from "../../services/permisos.service";
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { KeycloakService } from 'keycloak-angular';
import { environment } from "../../../environments/environment";
import { firstValueFrom } from 'rxjs';

type KeycloakLikeInfo = {
  preferred_username?: string;
  email?: string;
  name?: string;
  [k: string]: any;
};

@Component({
  selector: "app-empleados",
  standalone: true,
  templateUrl: "./empleados.component.html",
  styleUrls: ["./empleados.component.scss"],
  imports: [CommonModule, FormsModule],
})
export class EmpleadosComponent implements OnInit {
  empleados: Empleado[] = [];
  roles: Rol[] = [];
  areas: Area[] = [];
  loading = false;
  error: string | null = null;

  // Mapa de permisos vigentes por empleado_id
  permisosVigentes = new Map<number, { estado: string; fecha_inicio: string; fecha_fin: string }>();
  // Objeto plano para detección de cambios de Angular
  permisosVigentesObj: Record<number, { estado: string; fecha_inicio: string; fecha_fin: string }> = {};

  showForm = false;
  editingEmpleado: Empleado | null = null;
  empleadofrorm: Empleado = {
    numero_empleado: '',
    renglon: '',
    nombre_completo: '',
    email: '',
    rol_id: 1,
    area_id: null,
    activo: true,
    // supervision: 'NINGUNO',
    id: 0,
    asignacionesPrevias: undefined,
    length: 0,
    empleado: []
  };

  // Nuevas propiedades para gestión de supervisión
  supervision: 'NINGUNO' | 'ESPECIFICO' | 'TITULAR' = 'NINGUNO';

  // mini forms
  showNewRolForm = false;
  showNewAreaForm = false;
  newArea = { nombre_area: '', descripcion: '' };
  newRol = { nombre_rol: '', descripcion: '' };

  // errores de servidor por campo
  serverErrors = {
    numeroDuplicado: false,
    nombreDuplicado: false,
    emailDuplicado: false
  };

  // Usuario y roles
  userInfo: KeycloakLikeInfo | null = null;
  displayRoles: string[] = [];
  private allRolesLower: string[] = [];

  // Maps para lookup de nombres
  rolesById = new Map<number, string>();
  areasById = new Map<number, string>();

  constructor(
    private empleadosService: EmpleadosService,
    private areasSvc: AreasService,
    private kc: KeycloakService,
    private permisosSvc: PermisosService
  ) { }

  // texto de busqueda
  searchTerm = '';

  // Normaliza para comparar sin tildes y en minúsculas
  private norm(s: string): string {
    return (s || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  // Lista ya filtrada (se usa en el *ngFor)
  get filteredEmpleados(): Empleado[] {
    const t = this.norm(this.searchTerm);
    if (!t) return this.empleados;

    return this.empleados.filter((e) => {
      const rol = this.rolesById.get(Number(e.rol_id)) || '';
      const area = this.areasById.get(Number(e.area_id)) || '';
      const estado = e.activo ? 'activo' : 'inactivo';

      return [
        e.numero_empleado,
        e.nombre_completo,
        rol,
        area,
        estado,
      ].some(v => this.norm(String(v)).includes(t));
    });
  }

  // Para *ngFor performance
  trackById(_i: number, e: Empleado) {
    return e.id ?? `${e.numero_empleado}-${e.nombre_completo}`;
  }

  clearSearch() {
    this.searchTerm = '';
  }


  getRolNombre(id: number | null | undefined): string {
    if (id == null) return 'Sin asignar';
    return this.rolesById.get(Number(id)) ?? 'Sin asignar';
  }

  getAreaNombre(id: number | null | undefined): string {
    if (id == null) return 'Sin asignar';
    return this.areasById.get(Number(id)) ?? 'Sin asignar';
  }

  async ngOnInit() {
    await this.loadUserInfoAndRoles();
    this.loadEmpleados();
    this.loadRoles();
    this.loadAreas();
  }

  private async loadUserInfoAndRoles() {
    try {
      const logged = await this.kc.isLoggedIn();
      if (!logged) {
        this.userInfo = null;
        this.displayRoles = [];
        this.allRolesLower = [];
        return;
      }

      const inst = this.kc.getKeycloakInstance();
      const parsed: any = inst?.tokenParsed || {};
      const roles = this.kc.getUserRoles(true) || [];

      this.userInfo = {
        preferred_username: parsed.preferred_username,
        email: parsed.email,
        name: parsed.name,
        ...parsed
      };
      this.displayRoles = roles;
      this.allRolesLower = roles.map(r => r.toLowerCase());
    } catch (e) {
      console.error('No pude cargar info de usuario/roles', e);
      this.userInfo = null;
      this.displayRoles = [];
      this.allRolesLower = [];
    }
  }

  //  Data catálogos
  loadRoles() {
    this.empleadosService.getRoles().subscribe({
      next: (resp: ApiResponse<Rol[]>) => {
        if (resp.success && resp.data) {
          this.roles = resp.data;
          this.rolesById.clear();
          for (const r of this.roles) this.rolesById.set(Number(r.id), r.nombre);
        }
      },
      error: (err) => console.error('Error cargando roles:', err)
    });
  }

  loadAreas() {
    this.empleadosService.getAreas().subscribe({
      next: (resp: ApiResponse<Area[]>) => {
        if (resp.success && resp.data) {
          this.areas = resp.data;
          this.areasById.clear();
          for (const a of this.areas) this.areasById.set(Number(a.id), a.nombre);
        }
      },
      error: (err) => console.error('Error cargando áreas:', err)
    });
  }

  syncBiometricUsers() {
    if (!confirm('La consulta tardara un momento. ¿Desea continuar?')) {
      return;
    }

    this.loading = true;
    this.error = null;

    this.empleadosService.syncBiometricUsers().subscribe({
      next: (response: any) => {
        this.loading = false;
        if (response.success) {
          this.showToast('success', 'Sincronización completada exitosamente');
          // Recargar la lista de empleados
          this.loadEmpleados();
        } else {
          this.error = response.error || 'Error en la sincronización';
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = 'Error de conexión al servidor';
        console.error('Error sincronizando empleados:', err);
      }
    });
  }

  importarBiometrico() {
    this.loading = true;
    this.empleadosService.importarDesdeBiometrico().subscribe({
      next: (res) => {
        if (res.count > 0) {
          this.showToast('success', `${res.count} empleados importados del biométrico`);
        } else {
          this.showToast('info', 'No se encontraron empleados nuevos en el biométrico');
        }
        this.loadEmpleados(); // recargar la tabla
        this.loading = false;
      },
      error: (err) => {
        const msg = err?.error?.error || err.message || 'Error desconocido';
        this.showToast('error', 'Error al importar empleados: ' + msg);
        this.loading = false;
      }
    });
  }


  showToast(arg0: string, arg1: string) {
    throw new Error("Method not implemented.");
  }


  // ------- CRUD
  loadEmpleados() {
    this.loading = true;
    this.error = null;

    this.empleadosService.getEmpleados().subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          this.empleados = response.data;
          this.cargarPermisosVigentes();
        } else {
          this.error = response.error || 'Error cargando empleados';
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Error de conexión al servidor';
        this.loading = false;
        console.error('Error:', err);
      }
    });
  }

  cargarPermisosVigentes() {
    this.permisosSvc.getPermisosVigentesHoy().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const nuevoObj: Record<number, { estado: string; fecha_inicio: string; fecha_fin: string }> = {};
          // Si un empleado tiene AUTORIZADO y PENDIENTE, AUTORIZADO tiene prioridad
          res.data.forEach((p: any) => {
            const existing = nuevoObj[p.empleado_id];
            if (!existing || p.estado === 'AUTORIZADO') {
              nuevoObj[p.empleado_id] = {
                estado: p.estado,
                fecha_inicio: p.fecha_inicio,
                fecha_fin: p.fecha_fin
              };
            }
          });
          this.permisosVigentesObj = { ...nuevoObj };
          this.permisosVigentes = new Map(Object.entries(nuevoObj).map(([k, v]) => [Number(k), v]));
        }
      },
      error: () => {}
    });
  }

  getEstadoEmpleado(emp: Empleado): string {
    if (!emp.activo) return 'Inactivo';
    const permiso = this.permisosVigentesObj[emp.id!];
    // Solo muestra "Con Permiso" si el permiso está AUTORIZADO y en rango de fechas activo hoy
    if (permiso?.estado === 'AUTORIZADO') return 'Con Permiso';
    return 'Activo';
  }

  getEstadoEmpleadoClass(emp: Empleado): string {
    if (!emp.activo) return 'status-inactive';
    const permiso = this.permisosVigentesObj[emp.id!];
    if (permiso?.estado === 'AUTORIZADO') return 'status-permiso';
    return 'status-active';
  }

  saveArea(form?: NgForm) {
    if (form && form.invalid) return;
    const { nombre_area, descripcion } = this.newArea;
    if (!nombre_area?.trim()) return;

    this.loading = true;
    this.empleadosService.createArea({ nombre_area: nombre_area.trim(), descripcion: (descripcion ?? '').trim() || null })
      .subscribe({
        next: (r) => {
          this.loading = false;
          if (r.success) {
            this.newArea = { nombre_area: '', descripcion: '' };
            this.showNewAreaForm = false;
            this.loadAreas();
          } else {
            this.error = r.error || 'Error creando área';
          }
        },
        error: () => { this.loading = false; this.error = 'Error de conexión al servidor'; }
      });
  }

  saveRol(form?: NgForm) {
    if (form && form.invalid) return;
    const { nombre_rol, descripcion } = this.newRol;
    if (!nombre_rol?.trim()) return;

    this.loading = true;
    this.empleadosService.createRol({ nombre_rol: nombre_rol.trim(), descripcion: (descripcion ?? '').trim() || null })
      .subscribe({
        next: (r) => {
          this.loading = false;
          if (r.success) {
            this.newRol = { nombre_rol: '', descripcion: '' };
            this.showNewRolForm = false;
            this.loadRoles();
          } else {
            this.error = r.error || 'Error creando rol';
          }
        },
        error: () => { this.loading = false; this.error = 'Error de conexión al servidor'; }
      });
  }

  showCreateForm() {
    this.showForm = true;
    this.editingEmpleado = null;
    this.serverErrors.numeroDuplicado = false;
    this.serverErrors.nombreDuplicado = false;
    this.serverErrors.emailDuplicado = false;
    this.supervision = 'NINGUNO'; // Por defecto

    this.empleadofrorm = {
      numero_empleado: '',
      nombre_completo: '',
      email: '',
      rol_id: 1,
      area_id: null,
      activo: true
    } as any;
  }

  showEditForm(empleado: Empleado) {
    this.showForm = true;
    this.editingEmpleado = empleado;
    this.serverErrors.numeroDuplicado = false;
    this.serverErrors.nombreDuplicado = false;
    this.serverErrors.emailDuplicado = false;
    this.empleadofrorm = { ...empleado };
    this.supervision = 'NINGUNO';
  }

  cancelForm() {
    this.showForm = false;
    this.editingEmpleado = null;
    this.serverErrors.numeroDuplicado = false;
    this.serverErrors.nombreDuplicado = false;
  }

  // Sanitización inputs
  onNumeroInput(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const sanitized = (input.value || '').replace(/\D+/g, '');
    input.value = sanitized;
    this.empleadofrorm.numero_empleado = sanitized;
  }

  onNombreInput(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const sanitized = (input.value || '').replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+/g, '');
    input.value = sanitized;
    this.empleadofrorm.nombre_completo = sanitized;
  }

  onEmailInput(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const sanitized = (input.value || '').trim().toLowerCase();
    input.value = sanitized;
    this.empleadofrorm.email = sanitized;
  }

  clearServerError(field: 'numero' | 'nombre' | 'email') {
    if (field === 'numero') this.serverErrors.numeroDuplicado = false;
    if (field === 'nombre') this.serverErrors.nombreDuplicado = false;
    if (field === 'email') this.serverErrors.emailDuplicado = false;
  }

  // alias por si tu template llama en plural
  clearServerErrors(field: 'numero' | 'nombre' | 'email') { this.clearServerError(field); }

  // acepta opcionalmente el NgForm si lo envías desde el template
  async saveEmpleado(form?: NgForm) {
    if (form && form.invalid) {
      this.error = 'Por favor corrige los campos marcados.';
      return;
    }

    this.loading = true;
    this.error = null;
    this.serverErrors = { numeroDuplicado: false, nombreDuplicado: false, emailDuplicado: false };

    try {
      // 1) Guardar empleado
      const op = this.editingEmpleado
        ? this.empleadosService.updateEmpleado(this.editingEmpleado.id!, this.empleadofrorm)
        : this.empleadosService.createEmpleado(this.empleadofrorm);

      const response: any = await firstValueFrom(op);

      if (!response.success) {
        this.error = response.error || 'Error guardando empleado';
        this.loading = false;
        return;
      }

      const empleadoId = this.editingEmpleado
        ? this.editingEmpleado.id
        : response?.data?.id;

      const areaId = this.empleadofrorm.area_id;

      // 2) Sincronizar supervisor en el área
      if (areaId && empleadoId) {
        // Limpieza previa (por si cambió de área o estado)
        try {
          await firstValueFrom(this.areasSvc.removeSupervisor(areaId, empleadoId));
        } catch (e: any) {
          // Ignora error 404/409 (si no existe la relación)
          if (e.status !== 404 && e.status !== 409) {
            console.error('Error eliminando supervisor:', e);
          }
        }

        if (this.supervision !== 'NINGUNO') {
          const esTitular = this.supervision === 'TITULAR';
          await firstValueFrom(this.areasSvc.addSupervisor(areaId, empleadoId, esTitular));
        }
      }

      // 3) OK UI
      this.loadEmpleados();
      this.cancelForm();

    } catch (err: any) {
      this.loading = false;

      if (err?.status === 409) {
        const field = (err.error?.field || '').toString().toLowerCase();
        const msg = (err.error?.error || '').toLowerCase();
        if (field === 'numero_empleado' || msg.includes('número de empleado') || msg.includes('numero de empleado')) {
          this.serverErrors.numeroDuplicado = true;
        } else if (field === 'nombre_completo' || msg.includes('nombre')) {
          this.serverErrors.nombreDuplicado = true;
        } else if (field === 'email' || msg.includes('correo')) {
          this.serverErrors.emailDuplicado = true;
        } else {
          this.error = err.error?.error || 'Registro duplicado';
        }
      } else if (err?.status === 400) {
        this.error = err.error?.error || 'Datos inválidos';
      } else {
        this.error = 'Error de conexión al servidor';
      }
      console.error('Error:', err);
    }
  }

  //  Permisos (usa la lógica completa de Keycloak)
  private hasRole(role: string, userInfo: KeycloakLikeInfo | null): boolean {
    if (!userInfo) return false;

    const realm = userInfo["realm_access"]?.roles ?? [];
    const clientId = environment.keycloak?.clientId;
    const client = clientId ? (userInfo["resource_access"]?.[clientId]?.roles ?? []) : [];

    return [...realm, ...client].map(r => r.toLowerCase()).includes(role.toLowerCase());
  }

  canCreateEdit(): boolean { return this.hasRole('rrhh', this.userInfo); }
  canDelete(): boolean { return this.hasRole('rrhh', this.userInfo); }

  //  Métodos CRUD de Empleados
  deactivateEmpleado(emp: any) {
    const accion = emp.activo ? 'desactivar' : 'activar';
    const confirmMsg = `¿Está seguro de ${accion} al empleado ${emp.nombre_completo}?`;

    if (!confirm(confirmMsg)) return;

    this.loading = true;
    const request = emp.activo
      ? this.empleadosService.desactivarEmpleado(emp.id)
      : this.empleadosService.activarEmpleado(emp.id);

    request.subscribe({
      next: (res: any) => {
        alert(res.message || `Empleado ${emp.activo ? 'desactivado' : 'activado'} correctamente.`);
        emp.activo = !emp.activo; // alterna el estado visualmente
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        alert('Error al actualizar el estado del empleado');
        this.loading = false;
      },
    });
  }


  deleteEmpleado(empleado: Empleado) {
    if (!confirm(`¿Está seguro de ELIMINAR PERMANENTEMENTE al empleado ${empleado.nombre_completo}? Esta acción no se puede deshacer.`)) return;

    this.empleadosService.deleteEmpleado(empleado.id!).subscribe({
      next: (response: any) => {
        if (response.success) this.loadEmpleados();
        else this.error = response.error || 'Error eliminando empleado';
      },
      error: (err) => {
        this.error = 'Error de conexión al servidor';
        console.error('Error:', err);
      }
    });
  }
}