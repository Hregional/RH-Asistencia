import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Permiso } from '../../services/permisos.service';
import { PopupObservaciones } from './permisos.types';

@Component({
    selector: 'app-permisos-list',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './permisos-list.component.html',
    styleUrls: ['./permisos.component.scss']
})
export class PermisosListComponent {
    @Input() permisos: Permiso[] = [];
    @Input() paginatedPermisos: Permiso[] = [];
    @Input() filteredPermisos: Permiso[] = [];
    @Input() searchTerm = '';
    @Input() filtroEstado: 'TODOS' | 'PENDIENTE' | 'AUTORIZADO' | 'RECHAZADO' = 'TODOS';
    @Input() currentPage = 1;
    @Input() totalPages = 1;
    @Input() itemsPerPage = 10;
    @Input() loading = false;
    @Input() popupObservaciones: PopupObservaciones | null = null;

    @Output() searchTermChange = new EventEmitter<string>();
    @Output() filtroEstadoChange = new EventEmitter<'TODOS' | 'PENDIENTE' | 'AUTORIZADO' | 'RECHAZADO'>();
    @Output() solicitarPermiso = new EventEmitter<void>();
    @Output() registrarTipoPermiso = new EventEmitter<void>();
    @Output() editarPermiso = new EventEmitter<Permiso>();
    @Output() autorizarPermiso = new EventEmitter<Permiso>();
    @Output() rechazarPermiso = new EventEmitter<Permiso>();
    @Output() imprimirPermiso = new EventEmitter<Permiso>();
    @Output() mostrarObservaciones = new EventEmitter<{ event: MouseEvent; permiso: Permiso }>();
    @Output() cerrarPopup = new EventEmitter<void>();
    @Output() prevPage = new EventEmitter<void>();
    @Output() nextPage = new EventEmitter<void>();

    yaFinalizo(permiso: Permiso): boolean {
        if (!permiso.fecha_fin) return false;
        const hoy = new Date().toISOString().substring(0, 10);
        const fin = String(permiso.fecha_fin).substring(0, 10);
        return hoy > fin;
    }

    getEstadoClass(estado: string, permiso?: Permiso): string {
        if (estado === 'AUTORIZADO') {
            if (permiso && this.yaFinalizo(permiso)) return 'estado-finalizado';
            return 'estado-autorizado';
        }
        if (estado === 'RECHAZADO') return 'estado-rechazado';
        return 'estado-pendiente';
    }

    getTextoVacio(): string {
        if (this.searchTerm) return 'No se encontraron coincidencias';
        if (this.filtroEstado !== 'TODOS') return 'No hay permisos con estado ' + this.filtroEstado;
        return 'No hay permisos registrados';
    }

    emitirObservacion(event: MouseEvent, permiso: Permiso): void {
        event.stopPropagation();
        this.mostrarObservaciones.emit({ event, permiso });
    }
}