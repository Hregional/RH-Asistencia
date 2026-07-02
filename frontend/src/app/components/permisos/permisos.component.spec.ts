import { PermisosComponent } from './permisos.component';
import { Permiso } from '../../services/permisos.service';

describe('PermisosComponent', () => {
  let component: PermisosComponent;

  beforeEach(() => {
    const permisosSvc = {} as any;
    const empleadosSvc = {} as any;
    const keycloakSvc = {
      getKeycloakInstance: () => ({ tokenParsed: {} })
    } as any;

    component = new PermisosComponent(permisosSvc, empleadosSvc, keycloakSvc);
    spyOn(component as any, 'actualizarCarta').and.stub();
  });

  it('filtra permisos por estado y texto ignorando acentos', () => {
    component.permisos = [
      {
        empleado_id: 1,
        nombre_completo: 'José Pérez',
        rol_nombre: 'Analista',
        area_nombre: 'Recursos Humanos',
        fecha_inicio: '2026-07-01',
        fecha_fin: '2026-07-02',
        dias_solicitados: 2,
        estado: 'PENDIENTE'
      },
      {
        empleado_id: 2,
        nombre_completo: 'María López',
        rol_nombre: 'Supervisor',
        area_nombre: 'Operaciones',
        fecha_inicio: '2026-07-03',
        fecha_fin: '2026-07-04',
        dias_solicitados: 2,
        estado: 'AUTORIZADO'
      }
    ] as Permiso[];

    component.filtroEstado = 'AUTORIZADO';
    component.searchTerm = 'maria';

    expect(component.filteredPermisos).toHaveLength(1);
    expect(component.filteredPermisos[0].nombre_completo).toBe('María López');
  });

  it('recalcula la fecha extendida cuando los días adicionales son válidos', () => {
    component.solicitudForm = {
      fecha_fin: '2026-07-03',
      dias_adicionales: 2,
      fecha_fin_extendida: null,
      dias_solicitados: 0,
      empleado_id: 1,
      estado: 'PENDIENTE'
    } as any;

    component.calcularFechaFinExtendida();

    expect(component.solicitudForm.fecha_fin_extendida).toBeTruthy();
    expect((component as any).actualizarCarta).toHaveBeenCalled();
  });

  it('limpia datos de extensión cuando el valor es inválido', () => {
    component.solicitudForm = {
      dias_adicionales: 4,
      fecha_fin_extendida: '2026-07-10',
      empleado_id: 1,
      fecha_inicio: '2026-07-01',
      fecha_fin: '2026-07-03',
      dias_solicitados: 3,
      estado: 'PENDIENTE'
    } as any;

    component.onDiasAdicionalesChange('');

    expect(component.solicitudForm.dias_adicionales).toBeNull();
    expect(component.solicitudForm.fecha_fin_extendida).toBeNull();
  });

  it('busca empleados por nombre normalizado', () => {
    component.empleados = [
      { id: 1, nombre_completo: 'José Pérez', activo: true } as any,
      { id: 2, nombre_completo: 'Carlos Ruiz', activo: true } as any
    ];
    component.empleadoBusqueda = 'jose';

    component.onEmpleadoBusqueda();

    expect(component.empleadosFiltrados).toHaveLength(1);
    expect(component.empleadosFiltrados[0].nombre_completo).toBe('José Pérez');
  });

  it('devuelve el texto correcto para observaciones vacías', () => {
    expect(component.getTextoObservaciones({
      empleado_id: 1,
      fecha_inicio: '2026-07-01',
      fecha_fin: '2026-07-02',
      dias_solicitados: 2,
      estado: 'PENDIENTE'
    } as Permiso)).toBe('Pendiente de autorizar');
  });

  it('detecta permisos vigentes en la fecha actual', () => {
    const hoy = new Date().toISOString().substring(0, 10);

    expect(component.tienePermisoVigente({
      empleado_id: 1,
      fecha_inicio: hoy,
      fecha_fin: hoy,
      dias_solicitados: 1,
      estado: 'AUTORIZADO'
    } as Permiso)).toBeTrue();
  });
});