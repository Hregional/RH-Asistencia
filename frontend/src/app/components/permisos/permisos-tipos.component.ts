import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TipoPermiso } from '../../services/permisos.service';

@Component({
    selector: 'app-permisos-tipos',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './permisos-tipos.component.html',
    styleUrls: ['./permisos.component.scss']
})
export class PermisosTiposComponent {
    @Input() tiposPermiso: TipoPermiso[] = [];
    @Input() tipoPermisoForm: TipoPermiso = { nombre: '', dias_permitidos: 1, mensaje_carta: '' };
    @Input() editingTipoPermiso: TipoPermiso | null = null;
    @Input() loading = false;

    @Output() guardar = new EventEmitter<void>();
    @Output() editar = new EventEmitter<TipoPermiso>();
    @Output() eliminar = new EventEmitter<TipoPermiso>();
    @Output() cancelar = new EventEmitter<void>();
    @Output() volver = new EventEmitter<void>();
}