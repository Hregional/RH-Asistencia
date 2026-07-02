import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartaData } from './permisos.types';

@Component({
    selector: 'app-permiso-carta',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './permiso-carta.component.html',
    styleUrls: ['./permisos.component.scss']
})
export class PermisoCartaComponent {
    @Input({ required: true }) cartaData!: CartaData;
}