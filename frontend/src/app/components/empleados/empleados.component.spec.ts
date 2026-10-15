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

describe('EmpleadosComponent — código de expediente', () => {
    let component: EmpleadosComponent;
    let empleadosSvc: any;

    beforeEach(() => {
        empleadosSvc = {
            createEmpleado: jasmine.createSpy('createEmpleado').and.returnValue(of({ success: true, data: { id: 9 } })),
            updateEmpleado: jasmine.createSpy('updateEmpleado').and.returnValue(of({ success: true, data: {} })),
            getEmpleados: () => of({ success: true, data: [] })
        };
        const permisosSvc = { getPermisosVigentesHoy: () => of({ success: true, data: [] }) } as any;
        component = new EmpleadosComponent(empleadosSvc, {} as any, {} as any, permisosSvc);
        component.showCreateForm();
        component.empleadofrorm.numero_empleado = '123';
        component.empleadofrorm.nombre_completo = 'Ana López';
    });

    it('el formulario nuevo inicia sin código ni colegiado', () => {
        expect(component.empleadofrorm.codigo_expediente).toBe('');
        expect(component.empleadofrorm.colegio_id).toBeNull();
        expect(component.empleadofrorm.numero_colegiado).toBe('');
        expect(component.colegiadoIncompleto).toBeNull();
    });

    it('limita el código a 20 caracteres y refleja el valor saneado en el input', () => {
        const input = { value: 'abc-' + 'x'.repeat(30) } as HTMLInputElement;
        component.onCodigoInput({ target: input } as any);

        expect(component.empleadofrorm.codigo_expediente!.length).toBe(20);
        expect(component.empleadofrorm.codigo_expediente).toMatch(/^ABC-X+$/);
        expect(input.value).toBe(component.empleadofrorm.codigo_expediente as string);
    });

    it('limpia el error de código duplicado al volver a escribir', () => {
        component.serverErrors.codigo = 'El código de expediente ya está asignado a Beto';
        component.onCodigoInput({ target: { value: 'EXP-2' } } as any);
        expect(component.serverErrors.codigo).toBe('');
    });

    it('envía el código de expediente al crear', async () => {
        component.onCodigoInput({ target: { value: 'exp-0452' } } as any);
        await component.saveEmpleado();

        expect(empleadosSvc.createEmpleado).toHaveBeenCalledTimes(1);
        expect(empleadosSvc.createEmpleado.calls.mostRecent().args[0].codigo_expediente).toBe('EXP-0452');
    });

    it('muestra junto al campo el código duplicado (409) sin error general', async () => {
        const mensaje = 'El código de expediente ya está asignado a Beto';
        empleadosSvc.createEmpleado.and.returnValue(throwError(() => ({ status: 409, error: { field: 'codigo_expediente', error: mensaje } })));
        spyOn(console, 'error');

        await component.saveEmpleado();

        expect(component.serverErrors.codigo).toBe(mensaje);
        expect(component.serverErrors.numeroDuplicado).toBeFalse();
        expect(component.error).toBeNull();
    });

    it('muestra junto al campo el código inválido (400)', async () => {
        empleadosSvc.createEmpleado.and.returnValue(throwError(() => ({ status: 400, error: { field: 'codigo_expediente', error: 'Formato inválido' } })));
        spyOn(console, 'error');

        await component.saveEmpleado();

        expect(component.serverErrors.codigo).toBe('Formato inválido');
    });

    it('al editar carga el código existente y al cancelar limpia los errores', () => {
        component.showEditForm({ id: 5, numero_empleado: '5', nombre_completo: 'Beto', codigo_expediente: 'EXP-7', dpi: null } as any);
        expect(component.empleadofrorm.codigo_expediente).toBe('EXP-7');

        component.serverErrors.codigo = 'dup';
        component.serverErrors.colegiado = 'dup';
        component.cancelForm();
        expect(component.serverErrors.codigo).toBe('');
        expect(component.serverErrors.colegiado).toBe('');
    });

    it('la búsqueda por expediente ignora mayúsculas y empleados sin código', () => {
        component.empleados = [
            { id: 1, numero_empleado: '10', nombre_completo: 'Ana', codigo_expediente: 'EXP-0452' },
            { id: 2, numero_empleado: '11', nombre_completo: 'Beto', codigo_expediente: null },
            { id: 3, numero_empleado: '12', nombre_completo: 'Caro' }
        ] as unknown as Empleado[];

        component.searchTerm = 'Exp-04';
        expect(component.filteredEmpleados.map(e => e.id)).toEqual([1]);

        // "null" no debe coincidir con los empleados sin código
        component.searchTerm = 'null';
        expect(component.filteredEmpleados.length).toBe(0);
    });
});

describe('EmpleadosComponent — número de colegiado', () => {
    let component: EmpleadosComponent;
    let empleadosSvc: any;

    beforeEach(() => {
        empleadosSvc = {
            createEmpleado: jasmine.createSpy('createEmpleado').and.returnValue(of({ success: true, data: { id: 9 } })),
            updateEmpleado: jasmine.createSpy('updateEmpleado').and.returnValue(of({ success: true, data: {} })),
            getEmpleados: () => of({ success: true, data: [] }),
            getColegios: jasmine.createSpy('getColegios').and.returnValue(of({
                success: true,
                data: [
                    { id: 1, nombre: 'Colegio de Médicos y Cirujanos de Guatemala', siglas: 'Médicos' },
                    { id: 2, nombre: 'Colegio de Profesionales de Enfermería de Guatemala', siglas: 'Enfermería' }
                ]
            }))
        };
        const permisosSvc = { getPermisosVigentesHoy: () => of({ success: true, data: [] }) } as any;
        component = new EmpleadosComponent(empleadosSvc, {} as any, {} as any, permisosSvc);
        component.showCreateForm();
        component.empleadofrorm.numero_empleado = '123';
        component.empleadofrorm.nombre_completo = 'Ana López';
    });

    it('carga el catálogo de colegios', () => {
        component.loadColegios();
        expect(empleadosSvc.getColegios).toHaveBeenCalled();
        expect(component.colegios.map(c => c.id)).toEqual([1, 2]);
    });

    it('no rompe si falla la carga del catálogo', () => {
        empleadosSvc.getColegios.and.returnValue(throwError(() => new Error('sin red')));
        spyOn(console, 'error');
        component.loadColegios();
        expect(component.colegios).toEqual([]);
    });

    it('colegiadoIncompleto es null con ambos campos o con ninguno', () => {
        component.empleadofrorm.colegio_id = 1;
        component.empleadofrorm.numero_colegiado = '100';
        expect(component.colegiadoIncompleto).toBeNull();

        component.empleadofrorm.colegio_id = null;
        component.empleadofrorm.numero_colegiado = '';
        expect(component.colegiadoIncompleto).toBeNull();
    });

    it('un número con solo espacios cuenta como vacío', () => {
        component.empleadofrorm.colegio_id = 1;
        component.empleadofrorm.numero_colegiado = '   ';
        expect(component.colegiadoIncompleto).toBe('numero');
    });

    it('marca el formulario como tocado al bloquear un colegiado incompleto', async () => {
        const form = { control: { markAllAsTouched: jasmine.createSpy('markAllAsTouched') } } as any;
        component.empleadofrorm.colegio_id = 1;
        component.empleadofrorm.numero_colegiado = '';

        await component.saveEmpleado(form);

        expect(form.control.markAllAsTouched).toHaveBeenCalled();
        expect(empleadosSvc.createEmpleado).not.toHaveBeenCalled();
    });

    it('envía colegio y número al crear', async () => {
        component.empleadofrorm.colegio_id = 2;
        component.onColegiadoInput({ target: { value: '00123' } } as any);

        await component.saveEmpleado();

        const enviado = empleadosSvc.createEmpleado.calls.mostRecent().args[0];
        expect(enviado.colegio_id).toBe(2);
        expect(enviado.numero_colegiado).toBe('00123'); // conserva ceros a la izquierda
    });

    it('envía colegio y número al editar', async () => {
        component.showEditForm({ id: 7, numero_empleado: '7', nombre_completo: 'Beto', colegio_id: 1, numero_colegiado: '55', dpi: null } as any);

        await component.saveEmpleado();

        expect(empleadosSvc.updateEmpleado).toHaveBeenCalledWith(7, jasmine.objectContaining({ colegio_id: 1, numero_colegiado: '55' }));
    });

    it('limita el número a 20 dígitos', () => {
        component.onColegiadoInput({ target: { value: '1'.repeat(25) } } as any);
        expect(component.empleadofrorm.numero_colegiado).toBe('1'.repeat(20));
    });

    it('limpia el error de colegiado al cambiar el número o el colegio', () => {
        component.serverErrors.colegiado = 'dup';
        component.onColegiadoInput({ target: { value: '1' } } as any);
        expect(component.serverErrors.colegiado).toBe('');

        component.serverErrors.colegiado = 'dup';
        component.onColegioChange();
        expect(component.serverErrors.colegiado).toBe('');
    });

    it('muestra junto al campo los 400 de colegio_id y numero_colegiado', async () => {
        spyOn(console, 'error');
        empleadosSvc.createEmpleado.and.returnValue(throwError(() => ({ status: 400, error: { field: 'colegio_id', error: 'El colegio seleccionado no es válido' } })));
        await component.saveEmpleado();
        expect(component.serverErrors.colegiado).toBe('El colegio seleccionado no es válido');

        empleadosSvc.createEmpleado.and.returnValue(throwError(() => ({ status: 400, error: { field: 'numero_colegiado', error: 'Solo dígitos' } })));
        await component.saveEmpleado();
        expect(component.serverErrors.colegiado).toBe('Solo dígitos');
        expect(component.error).toBeNull();
    });

    it('la etiqueta usa el nombre o el catálogo cuando no vienen siglas', () => {
        component.loadColegios();
        expect(component.getColegiadoLabel({ numero_colegiado: '9', colegio_nombre: 'Colegio X' } as Empleado)).toBe('Col. 9 · Colegio X');
        expect(component.getColegiadoLabel({ numero_colegiado: '9', colegio_id: 2 } as Empleado)).toBe('Col. 9 · Enfermería');
        expect(component.getColegiadoLabel({ numero_colegiado: '9', colegio_id: 99 } as Empleado)).toBe('Col. 9');
    });

    it('la búsqueda por colegiado encuentra el mismo número en colegios distintos', () => {
        component.empleados = [
            { id: 1, numero_empleado: '10', nombre_completo: 'Ana', colegio_id: 1, numero_colegiado: '500' },
            { id: 2, numero_empleado: '11', nombre_completo: 'Beto', colegio_id: 2, numero_colegiado: '500' },
            { id: 3, numero_empleado: '12', nombre_completo: 'Caro', colegio_id: 1, numero_colegiado: '501' }
        ] as unknown as Empleado[];

        component.searchTerm = '500';
        expect(component.filteredEmpleados.map(e => e.id)).toEqual([1, 2]);
    });
});
