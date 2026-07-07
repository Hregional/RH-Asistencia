import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RetroactivoService } from '../../services/retroactivo.service';

interface StatusData {
  ultimaAsistencia: string | null;
  eventosSinProcesar: number;
  totalEventos: number;
  primerEvento: string | null;
}

interface Resultado {
  tipo: 'exito' | 'error';
  mensaje: string;
  detalle?: string;
}

@Component({
  selector: 'app-retroactivo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './retroactivo.component.html',
  styleUrls: ['./retroactivo.component.scss']
})
export class RetroactivoComponent implements OnInit {
  private svc = inject(RetroactivoService);

  status: StatusData | null = null;
  cargandoStatus = false;

  // Operación 1: reprocesar asistencia con eventos ya en BD
  desdeReprocesar = '';
  hastaReprocesar = '';
  procesandoReprocesar = false;

  // Operación 2: sincronizar histórico desde biométrico + reprocesar
  desdeSincronizar = '';
  hastaSincronizar = '';
  procesandoSincronizar = false;

  resultado: Resultado | null = null;

  ngOnInit() {
    this.cargarStatus();
    this.inicializarFechas();
  }

  private inicializarFechas() {
    const hoy = new Date();
    const hace7 = new Date();
    hace7.setDate(hoy.getDate() - 7);
    this.desdeReprocesar = hace7.toISOString().split('T')[0];
    this.hastaReprocesar = hoy.toISOString().split('T')[0];
    this.desdeSincronizar = hace7.toISOString().split('T')[0];
    this.hastaSincronizar = hoy.toISOString().split('T')[0];
  }

  cargarStatus() {
    this.cargandoStatus = true;
    this.svc.getStatus().subscribe({
      next: (res) => {
        if (res.success) this.status = res.data;
        this.cargandoStatus = false;
      },
      error: () => { this.cargandoStatus = false; }
    });
  }

  reprocesarAsistencia() {
    if (!this.desdeReprocesar || !this.hastaReprocesar) {
      alert('Seleccione el rango de fechas.');
      return;
    }
    if (!confirm(`¿Reprocesar asistencia del ${this.formatFecha(this.desdeReprocesar)} al ${this.formatFecha(this.hastaReprocesar)}?\n\nEsto recalculará estados de asistencia usando los eventos ya almacenados en la base de datos.`)) return;

    this.procesandoReprocesar = true;
    this.resultado = null;

    this.svc.reprocesarAsistencia(this.desdeReprocesar, this.hastaReprocesar).subscribe({
      next: (res) => {
        this.procesandoReprocesar = false;
        if (res.success) {
          this.resultado = {
            tipo: 'exito',
            mensaje: res.message,
            detalle: res.errores?.length
              ? `⚠️ ${res.errores.length} fecha(s) con errores: ${res.errores.map((e: any) => e.fecha).join(', ')}`
              : undefined
          };
          this.cargarStatus();
        } else {
          this.resultado = { tipo: 'error', mensaje: res.error || 'Error al reprocesar' };
        }
      },
      error: (err) => {
        this.procesandoReprocesar = false;
        this.resultado = { tipo: 'error', mensaje: err.error?.error || 'Error de conexión' };
      }
    });
  }

  sincronizarHistorico() {
    if (!this.desdeSincronizar || !this.hastaSincronizar) {
      alert('Seleccione el rango de fechas.');
      return;
    }
    if (!confirm(`¿Sincronizar marcajes del biométrico del ${this.formatFecha(this.desdeSincronizar)} al ${this.formatFecha(this.hastaSincronizar)}?\n\nEsto consultará los dispositivos biométricos y re-importará los eventos de esas fechas. Puede tardar varios minutos.`)) return;

    this.procesandoSincronizar = true;
    this.resultado = null;

    this.svc.sincronizarHistorico(this.desdeSincronizar, this.hastaSincronizar).subscribe({
      next: (res) => {
        this.procesandoSincronizar = false;
        if (res.success) {
          this.resultado = {
            tipo: 'exito',
            mensaje: res.message,
            detalle: `Eventos nuevos: ${res.eventos ?? 0} | Duplicados omitidos: ${res.duplicados ?? 0} | Asistencias procesadas: ${res.asistencias ?? 0}`
          };
          this.cargarStatus();
        } else {
          this.resultado = { tipo: 'error', mensaje: res.message || 'Error en sincronización' };
        }
      },
      error: (err) => {
        this.procesandoSincronizar = false;
        this.resultado = { tipo: 'error', mensaje: err.error?.error || 'Error de conexión' };
      }
    });
  }

  formatFecha(f: string): string {
    if (!f) return '';
    const [y, m, d] = f.split('-');
    return `${d}/${m}/${y}`;
  }

  cerrarResultado() {
    this.resultado = null;
  }
}
