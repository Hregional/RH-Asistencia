import { Permiso } from '../../services/permisos.service';

export type PermisosView = 'tabla' | 'solicitud' | 'editarPermiso' | 'tiposPermiso';

export interface CartaData {
    nombreEmpleado: string;
    renglon: string;
    area: string;
    rol: string;
    dia: string;
    mes: string;
    anio: string;
    tipoPermiso: string;
    mensaje: string;
    fechaInicio: string;
    fechaFin: string;
    diasSolicitados: number;
    diasEnLetras: string;
    feriadosIncluidos: string[];
    finesDeSemanaCont: number;
    creadoPor: string;
    autorizadoPor: string;
    fechaHoraImpresion: string;
    autorizadoEn: string;
}

export interface PopupObservaciones {
    permiso: Permiso;
    x: number;
    y: number;
}