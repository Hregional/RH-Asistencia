// En reportes.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';

const API = environment.apiBase + '/reportes';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  constructor(private http: HttpClient) { }

  getAreas() {
    return this.http.get<any>(`${API}/areas`);
  }

  getReporte(areaId: number, desde: string, hasta: string, tipoReporte: string = 'semana') {
    let params = new HttpParams()
      .set('area_id', areaId.toString())
      .set('tipo_reporte', tipoReporte);

    if (desde && hasta) {
      params = params
        .set('desde', desde)
        .set('hasta', hasta);
    }

    return this.http.get<any>(`${API}/asistencia`, { params });
  }

  // Modificar para incluir filtro por empleado
  getEventosBiometricos(fecha: string, tipo: string = 'mes', empleadoId?: number, desde?: string, hasta?: string) {
    let params = new HttpParams();

    if (tipo === 'rango') {
      // Filtro por rango de fechas
      params = params.set('desde', desde || '');
      params = params.set('hasta', hasta || '');
    } else if (tipo === 'dia') {
      params = params.set('dia', fecha);
    } else {
      params = params.set('mes', fecha);
    }

    if (empleadoId) {
      params = params.set('empleado_id', empleadoId.toString());
    }

    return this.http.get<any>(`${API}/eventos-biometricos`, { params });
  }

  // Nuevo método para buscar empleados
  buscarEmpleados(query: string) {
    const params = new HttpParams().set('query', query);
    return this.http.get<any>(`${API}/buscar-empleados`, { params });
  }

  // Agrega este método en el servicio
  actualizarBiometrico() {
    return this.http.post<any>(`${API}/actualizar-biometrico`, {});
  }

  // En reportes.service.ts - agregar este método
  sincronizarMarcajesAnteriores(fechaDesde: string, fechaHasta: string) {
    const params = new HttpParams()
      .set('desde', fechaDesde)
      .set('hasta', fechaHasta);

    return this.http.post<any>(`${API}/sincronizar-marcajes-anteriores`, {}, { params });
  }

  getReporteHorarios(areaId: number, desde: string, hasta: string) {
    const params = new HttpParams()
      .set('area_id', areaId.toString())
      .set('desde', desde)
      .set('hasta', hasta);
    return this.http.get<any>(`${API}/horarios`, { params });
  }

  getReportePermisos(params: { desde: string; hasta: string; area_id?: number | string | null; empleado_id?: number | null; estado?: string }) {
    let httpParams = new HttpParams()
      .set('desde', params.desde)
      .set('hasta', params.hasta);
    if (params.area_id) httpParams = httpParams.set('area_id', params.area_id.toString());
    if (params.empleado_id) httpParams = httpParams.set('empleado_id', params.empleado_id.toString());
    if (params.estado && params.estado !== 'todos') httpParams = httpParams.set('estado', params.estado);
    return this.http.get<any>(`${environment.apiBase}/permisos/reporte`, { params: httpParams });
  }
}