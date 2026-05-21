import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Empleado } from '../../services/empleados.service';
import { Permiso, TipoPermiso } from '../../services/permisos.service';
import { CartaData } from './permisos.types';
import { PermisoCartaComponent } from './permiso-carta.component';

@Component({
    selector: 'app-permisos-form',
    standalone: true,
    imports: [CommonModule, FormsModule, PermisoCartaComponent],
    templateUrl: './permisos-form.component.html',
    styleUrls: ['./permisos.component.scss']
})
export class PermisosFormComponent {
    @Input() mode: 'solicitud' | 'editar' = 'solicitud';
    @Input() tiposPermiso: TipoPermiso[] = [];
    @Input() solicitudForm: Partial<Permiso> = {};
    @Input() empleadoBusqueda = '';
    @Input() empleadosFiltrados: Empleado[] = [];
    @Input() empleadoSeleccionado: Empleado | null = null;
    @Input() loading = false;
    @Input() diasExcedidos = false;
    @Input() esDiaUnico = false;
    @Input() hoy = '';
    @Input() cartaData: CartaData | null = null;
    @Input() editingPermiso: Permiso | null = null;

    @Output() empleadoBusquedaChange = new EventEmitter<string>();
    @Output() buscarEmpleado = new EventEmitter<void>();
    @Output() seleccionarEmpleado = new EventEmitter<Empleado>();
    @Output() tipoPermisoChange = new EventEmitter<void>();
    @Output() calcularDias = new EventEmitter<void>();
    @Output() guardarSolicitud = new EventEmitter<void>();
    @Output() actualizarPermiso = new EventEmitter<void>();
    @Output() volver = new EventEmitter<void>();
    @Output() estadoChange = new EventEmitter<'AUTORIZADO' | 'RECHAZADO' | 'PENDIENTE'>();
}