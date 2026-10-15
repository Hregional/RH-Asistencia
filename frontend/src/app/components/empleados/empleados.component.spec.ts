import { of, throwError } from 'rxjs';
import { EmpleadosComponent } from './empleados.component';
import { Empleado } from '../../services/empleados.service';

describe('EmpleadosComponent', () => {
    let component: EmpleadosComponent;
    let empleadosSvc: any;

    beforeEach(() => {
        empleadosSvc = {
            createEmpleado: jasmine.createSpy('createEmpleado'),
            updateEmpleado: jasmine.createSpy('updateEmpleado'),
            getEmpleados: () => of({ success: true, data: [] })
        };
        const keycloakSvc = {} as any;
        const areasSvc = {} as any;
        const permisosSvc = { getPermisosVigentesHoy: () => of({ success: true, data: [] }) } as any;
        component = new EmpleadosComponent(empleadosSvc, areasSvc, keycloakSvc, permisosSvc);
        component.showCreateForm();
        component.empleadofrorm.numero_empleado = '123';
        component.empleadofrorm.nombre_completo = 'Ana López';
    });

    it('busca por código de expediente y número de colegiado', () => {
        component.empleados = [
            { id: 1, numero_empleado: '10', nombre_completo: 'Ana', codigo_expediente: 'EXP-0452', numero_colegiado: null },
            { id: 2, numero_empleado: '11', nombre_completo: 'Beto', codigo_expediente: null, numero_colegiado: '98765' }
        ] as unknown as Empleado[];

        component.searchTerm = 'exp-0452';
        expect(component.filteredEmpleados.map(e => e.id)).toEqual([1]);

        component.searchTerm = '98765';
        expect(component.filteredEmpleados.map(e => e.id)).toEqual([2]);
    });

    it('no guarda si el colegio y el número de colegiado no van juntos', async () => {
        component.empleadofrorm.colegio_id = 1;
        component.empleadofrorm.numero_colegiado = '';
        expect(component.colegiadoIncompleto).toBe('numero');
        await component.saveEmpleado();

        component.empleadofrorm.colegio_id = null;
        component.empleadofrorm.numero_colegiado = '12345';
        expect(component.colegiadoIncompleto).toBe('colegio');
        await component.saveEmpleado();

        expect(empleadosSvc.createEmpleado).not.toHaveBeenCalled();
    });

    it('muestra junto al campo el colegiado duplicado que reporta el backend', async () => {
        component.empleadofrorm.colegio_id = 1;
        component.empleadofrorm.numero_colegiado = '500';
        const mensaje = 'El colegiado N° 500 del Colegio de Médicos y Cirujanos de Guatemala ya está registrado a Prueba A';
        empleadosSvc.createEmpleado.and.returnValue(throwError(() => ({
            status: 409, error: { field: 'numero_colegiado', error: mensaje }
        })));
        spyOn(console, 'error');

        await component.saveEmpleado();

        expect(component.serverErrors.colegiado).toBe(mensaje);
        expect(component.error).toBeNull();
    });

    it('normaliza el código de expediente y el número de colegiado al escribir', () => {
        const codigo = { value: 'exp 04/52' } as HTMLInputElement;
        component.onCodigoInput({ target: codigo } as any);
        expect(component.empleadofrorm.codigo_expediente).toBe('EXP0452');

        const numero = { value: '12a-34' } as HTMLInputElement;
        component.onColegiadoInput({ target: numero } as any);
        expect(component.empleadofrorm.numero_colegiado).toBe('1234');
    });

    it('arma la etiqueta de colegiado para la tabla', () => {
        expect(component.getColegiadoLabel({ numero_colegiado: '12345', colegio_siglas: 'Médicos' } as Empleado)).toBe('Col. 12345 · Médicos');
        expect(component.getColegiadoLabel({ numero_colegiado: null } as Empleado)).toBe('');
    });
});
