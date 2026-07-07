import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiBase}/retroactivo`;

@Injectable({ providedIn: 'root' })
export class RetroactivoService {
  private http = inject(HttpClient);

  getStatus() {
    return this.http.get<any>(`${BASE}/status`);
  }

  reprocesarAsistencia(desde: string, hasta: string) {
    return this.http.post<any>(`${BASE}/reprocesar-asistencia`, { desde, hasta });
  }

  sincronizarHistorico(desde: string, hasta: string) {
    return this.http.post<any>(`${BASE}/sincronizar-historico`, { desde, hasta });
  }
}
