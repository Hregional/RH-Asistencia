import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TipoPermiso {
  id?: number;
  nombre: string;
  dias_permitidos: number;
  mensaje_carta?: string;
  activo?: boolean;
}

export interface Permiso {
  id?: number;
  empleado_id: number;
  numero_empleado?: string;
  nombre_completo?: string;
  rol_id?: number;
  rol_nombre?: string;
  area_id?: number;
  area_nombre?: string;
  tipo_permiso_id?: number;
  tipo_permiso_nombre?: string;
  tipo_permiso_otro?: string;
  mensaje_otro?: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_solicitados: number;
  estado: 'PENDIENTE' | 'AUTORIZADO' | 'RECHAZADO';
  observaciones?: string;
  creado_en?: string;
  actualizado_en?: string;
  autorizado_en?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PermisosService {
  private apiUrl = `${environment.apiBase}/permisos`;

  constructor(private http: HttpClient) { }

  // Tipos de permiso
  getTiposPermiso(): Observable<ApiResponse<TipoPermiso[]>> {
    return this.http.get<ApiResponse<TipoPermiso[]>>(`${this.apiUrl}/tipos`);
  }

  createTipoPermiso(tipo: TipoPermiso): Observable<ApiResponse<TipoPermiso>> {
    return this.http.post<ApiResponse<TipoPermiso>>(`${this.apiUrl}/tipos`, tipo);
  }

  updateTipoPermiso(id: number, tipo: TipoPermiso): Observable<ApiResponse<TipoPermiso>> {
    return this.http.put<ApiResponse<TipoPermiso>>(`${this.apiUrl}/tipos/${id}`, tipo);
  }

  deleteTipoPermiso(id: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.apiUrl}/tipos/${id}`);
  }

  // Permisos
  getPermisos(filtro: 'todos' | 'permiso' = 'todos'): Observable<ApiResponse<Permiso[]>> {
    return this.http.get<ApiResponse<Permiso[]>>(`${this.apiUrl}?filtro=${filtro}`);
  }

  getPermisoById(id: number): Observable<ApiResponse<Permiso>> {
    return this.http.get<ApiResponse<Permiso>>(`${this.apiUrl}/${id}`);
  }

  createPermiso(permiso: Permiso): Observable<ApiResponse<Permiso>> {
    return this.http.post<ApiResponse<Permiso>>(this.apiUrl, permiso);
  }

  updatePermiso(id: number, permiso: Partial<Permiso>): Observable<ApiResponse<Permiso>> {
    return this.http.put<ApiResponse<Permiso>>(`${this.apiUrl}/${id}`, permiso);
  }

  updateEstadoPermiso(id: number, estado: string): Observable<ApiResponse<Permiso>> {
    return this.http.patch<ApiResponse<Permiso>>(`${this.apiUrl}/${id}/estado`, { estado });
  }

  deletePermiso(id: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.apiUrl}/${id}`);
  }

  getPermisosVigentes(empleadoId: number, desde: string, hasta: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/empleado/${empleadoId}/vigente?desde=${desde}&hasta=${hasta}`);
  }

  getPermisosVigentesHoy(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/vigentes-hoy`);
  }

  getTurnosEnRango(empleadoId: number, desde: string, hasta: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/empleado/${empleadoId}/turnos-en-rango?desde=${desde}&hasta=${hasta}`);
  }

  getReportePermisos(params: { desde: string; hasta: string; area_id?: number; empleado_id?: number; estado?: string }): Observable<any> {
    let query = `desde=${params.desde}&hasta=${params.hasta}`;
    if (params.area_id) query += `&area_id=${params.area_id}`;
    if (params.empleado_id) query += `&empleado_id=${params.empleado_id}`;
    if (params.estado) query += `&estado=${params.estado}`;
    return this.http.get<any>(`${this.apiUrl}/reporte?${query}`);
  }
}
