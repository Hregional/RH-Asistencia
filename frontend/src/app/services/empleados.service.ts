// src/app/services/empleados.service.ts
import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { BehaviorSubject, Observable } from "rxjs";
import { map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface Empleado {
  asignacionesPrevias: undefined;
  length: number;
  empleado: never[];
  id?: number;
  numero_empleado: string;
  renglon?: string;
  nombre_completo: string;
  dpi?: string | null;
  email: string;
  rol_id: number | null;
  area_id: number | null;
  activo: boolean;
  datos_actualizados?: boolean | number;
  creado_en?: string;
  actualizado_en?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  count?: number;
  message?: string;
  error?: string;
}

export interface Rol  { id: number; nombre: string; descripcion?: string | null; }  
export interface Area { id: number; nombre: string; descripcion?: string | null; } 
@Injectable({ providedIn: "root" })
export class EmpleadosService {
  private empleadosSubject = new BehaviorSubject<Empleado[]>([]);
  public empleados$ = this.empleadosSubject.asObservable();
  private base = environment.apiBase;                 
  private empleadosUrl = `${this.base}/empleados`;
  private API_ROOT = `${environment.apiBase}/empleados`;
  private rolesUrl     = `${this.base}/roles`;
  private areasUrl     = `${this.base}/areas`;
  API_URL: any;

  constructor(private http: HttpClient) {}

importarDesdeBiometrico(): Observable<any> {
  return this.http.get(`${this.API_URL}/biometric/usuarios/nombres`);
}

  // ---------- Empleados ---------
  getEmpleados(): Observable<ApiResponse<Empleado[]>> {
    return this.http.get<ApiResponse<Empleado[]>>(this.empleadosUrl);
  }

  getEmpleadosActivos(): Observable<ApiResponse<Empleado[]>> {
    return this.http.get<ApiResponse<Empleado[]>>(`${this.empleadosUrl}/activos`);
  }

  getEmpleado(id: number): Observable<ApiResponse<Empleado>> {
    return this.http.get<ApiResponse<Empleado>>(`${this.empleadosUrl}/${id}`);
  }

  createEmpleado(empleado: Empleado): Observable<ApiResponse<Empleado>> {
    return this.http.post<ApiResponse<Empleado>>(this.empleadosUrl, empleado);
  }

  updateEmpleado(id: number, empleado: Empleado): Observable<ApiResponse<Empleado>> {
    return this.http.put<ApiResponse<Empleado>>(`${this.empleadosUrl}/${id}`, empleado);
  }

  deactivateEmpleado(id: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.empleadosUrl}/${id}`);
  }

  activarEmpleado(id: number) {
    return this.http.patch(`${this.empleadosUrl}/${id}/activate`, {});
  }

  desactivarEmpleado(id: number) {
    return this.http.delete(`${this.empleadosUrl}/${id}`);
  }


  deleteEmpleado(id: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.empleadosUrl}/${id}/permanent`);
  }

  //  Catálogo Roles 
  getRoles(): Observable<ApiResponse<Rol[]>> {
    return this.http
      .get<ApiResponse<Array<{ id: number; nombre_rol: string; descripcion?: string | null }>>>(this.rolesUrl)
      .pipe(
        map(resp => ({
          ...resp,
          data: (resp.data ?? []).map(r => ({ id: r.id, nombre: r.nombre_rol, descripcion: r.descripcion ?? null }))
        }))
      );
  }

  createRol(body: { nombre_rol: string; descripcion?: string | null }) {
  return this.http.post<ApiResponse<any>>(this.rolesUrl, body);
  }


  //  Catálogo Áreas 
  getAreas(): Observable<ApiResponse<Area[]>> {
    return this.http
      .get<ApiResponse<Array<{ id: number; nombre_area: string; descripcion?: string | null }>>>(this.areasUrl)
      .pipe(
        map(resp => ({
          ...resp,
          data: (resp.data ?? []).map(a => ({ id: a.id, nombre: a.nombre_area, descripcion: a.descripcion ?? null }))
        }))
      );
  }
  createArea(body: { nombre_area: string; descripcion?: string | null }) {
    return this.http.post<ApiResponse<any>>(this.areasUrl, body);
  }

  actualizarEmpleado(empleadoActualizado: Empleado): void {
    const empleados = this.empleadosSubject.value;
    const index = empleados.findIndex(e => e.id === empleadoActualizado.id);
    
    if (index !== -1) {
      empleados[index] = { ...empleados[index], ...empleadoActualizado };
      this.empleadosSubject.next([...empleados]);
    }
  }

  cargarEmpleados(): Observable<ApiResponse<Empleado[]>> {
    return this.http.get<ApiResponse<Empleado[]>>(this.empleadosUrl).pipe(
      tap((response: ApiResponse<Empleado[]>) => {
        if (response.success && response.data) {
          this.empleadosSubject.next(response.data);
        }
      })
    );
  }

  // En empleados.service.ts - Agrega este método en la clase
  syncBiometricUsers(): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.empleadosUrl}/sync-biometric`, {});
  }

}
