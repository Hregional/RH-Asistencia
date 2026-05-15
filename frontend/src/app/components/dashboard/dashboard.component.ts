import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import Chart from 'chart.js/auto';
import { DashboardService, DashboardSummary } from '../../services/dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {

  private refreshInterval: any;
  private readonly REFRESH_MS = 5 * 60 * 1000; // 5 minutos

  areaColors = [
    '#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6',
    '#14b8a6','#f97316','#6366f1','#ec4899','#0ea5e9'
  ];

  data: DashboardSummary = {
    personalActivo: 0,
    personalInactivo: 0,
    personalTotal: 0,
    totalTurnos: 0,           
    turnosFijos: 0,
    turnosRotativos: 0,
    personalSinTurno: 0,
    personalConPermiso: 0,
    proximosTurnos: {
      manana: { enfermeros: 0, medicos: 0 },
      tarde: { enfermeros: 0, medicos: 0 },
      noche: { enfermeros: 0, medicos: 0 },
    },
    asistenciaSemanal: [],
    horaPromedioEntrada: [],
    distribucionArea: []
  } as unknown as DashboardSummary;

  loading = true;
  hasData = false;

  constructor(private dash: DashboardService) {}

  ngOnInit(): void {
    this.loadDashboardData();
    // Refresco automático cada 5 minutos
    this.refreshInterval = setInterval(() => this.loadDashboardData(), this.REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  /** Carga los datos del dashboard */
  loadDashboardData(): void {
    this.loading = true;

    this.dash.getSummary().subscribe({
      next: (resp) => {
        if (resp.success && resp.data) {
          this.data = resp.data;
          
          // SOBRESCRIBIR con los datos exactos de localStorage (igual que en asignar-turnos)
          const turnosData = this.dash.getTurnosFromLocalStorage();
          this.data.turnosFijos = turnosData.turnosFijos;
          this.data.turnosRotativos = turnosData.turnosRotativos;
          this.data.totalTurnos = turnosData.totalTurnos;

          ( {
            fijos: this.data.turnosFijos,
            rotativos: this.data.turnosRotativos,
            total: this.data.totalTurnos
          });

          this.hasData = this.hasAnyData(this.data);
          setTimeout(() => this.renderCharts(), 300);
        } else {
          this.hasData = false;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading dashboard:', err);
        
        // En caso de error, cargar solo datos de turnos desde localStorage
        const turnosData = this.dash.getTurnosFromLocalStorage();
        this.data.turnosFijos = turnosData.turnosFijos;
        this.data.turnosRotativos = turnosData.turnosRotativos;
        this.data.totalTurnos = turnosData.totalTurnos;
        
        this.hasData = this.data.totalTurnos > 0;
        this.loading = false;
      }
    });
  }

  /** Verifica si hay datos válidos */
  private hasAnyData(d: DashboardSummary): boolean {
    if (!d) return false;

    const hasPersonalData = (d.personalActivo || 0) + (d.personalInactivo || 0) + (d.personalTotal || 0) > 0;
    const hasTurnosData = (d.totalTurnos || 0) > 0;
    const hasAsistenciaData = d.asistenciaSemanal?.some(x => x.entradas > 0) || false;
    const hasDistribucionData = d.distribucionArea?.length > 0 || false;

    return hasPersonalData || hasTurnosData || hasAsistenciaData || hasDistribucionData;
  }

  /** Renderiza los gráficos del dashboard */
  private renderCharts(): void {
    Chart.getChart("areaChart")?.destroy();
    Chart.getChart("asistenciaChart")?.destroy();
    Chart.getChart("horaChart")?.destroy();

    // Helper para formatear etiquetas de fecha
    const fmtLabel = (fecha: string) => {
      const d = new Date(fecha + 'T00:00:00');
      const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      return `${dias[d.getDay()]} ${dd}/${mm}`;
    };

    // Dona — Distribución por Área
    if (this.data.distribucionArea && this.data.distribucionArea.length > 0) {
      const ctx1 = document.getElementById('areaChart') as HTMLCanvasElement;
      const areas = this.data.distribucionArea.map((a: any) => a.area || 'Sin área');
      const cantidades = this.data.distribucionArea.map((a: any) => a.cantidad || 0);
      const total = cantidades.reduce((s: number, v: number) => s + v, 0);

      new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: areas,
          datasets: [{
            data: cantidades,
            backgroundColor: this.areaColors,
            borderWidth: 2,
            borderColor: '#fff',
          }]
        },
        options: {
          cutout: '58%',
          animation: { duration: 600 },
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 9 }, boxWidth: 9, padding: 5 } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0';
                  return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                }
              }
            }
          }
        }
      });
    }

    // Línea — Asistencia Semanal
    if (this.data.asistenciaSemanal && this.data.asistenciaSemanal.length > 0) {
      const ctx2 = document.getElementById('asistenciaChart') as HTMLCanvasElement;
      const labels = this.data.asistenciaSemanal.map((d: any) => fmtLabel(d.fecha));
      const entradas = this.data.asistenciaSemanal.map((d: any) => d.entradas);

      new Chart(ctx2, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Entradas registradas',
            data: entradas,
            borderColor: '#3b82f6',
            borderWidth: 2,
            pointBackgroundColor: '#3b82f6',
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: true,
            backgroundColor: 'rgba(59,130,246,0.10)',
            tension: 0.35,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 500 },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Entradas', font: { size: 10 }, color: '#94a3b8' },
              ticks: { font: { size: 10 }, color: '#94a3b8' },
              grid: { color: '#f1f5f9' }
            },
            x: {
              grid: { display: false },
              ticks: { font: { size: 9 }, color: '#94a3b8', maxRotation: 0 }
            }
          },
          plugins: {
            legend: { display: true, labels: { font: { size: 10 }, boxWidth: 10, color: '#64748b' } },
            tooltip: {
              callbacks: {
                title: (items) => items[0].label,
                label: (ctx) => ` ${ctx.parsed.y} entradas`
              }
            }
          }
        }
      });
    }

    // Barras pill — Hora Promedio de Entrada
    if (this.data.horaPromedioEntrada && this.data.horaPromedioEntrada.some(d => d.hora !== null)) {
      const ctx3 = document.getElementById('horaChart') as HTMLCanvasElement;
      const labels = this.data.horaPromedioEntrada.map((d: any) => fmtLabel(d.fecha));
      const horas = this.data.horaPromedioEntrada.map((d: any) => d.hora);

      const fmtHora = (v: number | null) => {
        if (v === null) return 'Sin datos';
        const h = Math.floor(v);
        const m = Math.round((v - h) * 60);
        const ampm = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
      };

      // Plugin para dibujar círculo con valor en la punta de cada barra
      const pillPlugin = {
        id: 'pillTop',
        afterDatasetsDraw(chart: any) {
          const { ctx: c, scales: { x, y } } = chart;
          chart.data.datasets[0].data.forEach((val: number | null, i: number) => {
            if (val === null) return;
            const xPos = x.getPixelForValue(i);
            const yPos = y.getPixelForValue(val);
            const r = 16;
            // Círculo blanco con borde
            c.save();
            c.beginPath();
            c.arc(xPos, yPos, r, 0, Math.PI * 2);
            c.fillStyle = '#fff';
            c.fill();
            c.strokeStyle = val <= 8 ? '#22c55e' : val <= 8.5 ? '#f59e0b' : '#ef4444';
            c.lineWidth = 2;
            c.stroke();
            // Texto hora
            c.fillStyle = '#1e293b';
            c.font = 'bold 8px sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            const h = Math.floor(val);
            const m = Math.round((val - h) * 60);
            c.fillText(`${h % 12 || 12}:${String(m).padStart(2,'0')}`, xPos, yPos);
            c.restore();
          });
        }
      };

      new Chart(ctx3, {
        type: 'bar',
        plugins: [pillPlugin],
        data: {
          labels,
          datasets: [{
            label: 'Hora promedio entrada',
            data: horas,
            backgroundColor: horas.map((h: number | null) => {
              if (h === null) return 'rgba(203,213,225,0.3)';
              if (h <= 8)   return 'rgba(34,197,94,0.25)';
              if (h <= 8.5) return 'rgba(245,158,11,0.25)';
              return 'rgba(239,68,68,0.25)';
            }),
            borderColor: horas.map((h: number | null) => {
              if (h === null) return '#cbd5e1';
              if (h <= 8)   return '#22c55e';
              if (h <= 8.5) return '#f59e0b';
              return '#ef4444';
            }),
            borderWidth: 2,
            borderRadius: 20,
            borderSkipped: false,
            barPercentage: 0.5,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 500 },
          layout: { padding: { top: 20 } },
          scales: {
            y: {
              min: 5, max: 12,
              title: { display: true, text: 'Hora', font: { size: 10 }, color: '#94a3b8' },
              ticks: {
                font: { size: 9 }, color: '#94a3b8',
                callback: (val) => fmtHora(Number(val))
              },
              grid: { color: '#f1f5f9' }
            },
            x: {
              grid: { display: false },
              ticks: { font: { size: 9 }, color: '#94a3b8', maxRotation: 0 }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => items[0].label,
                label: (ctx) => ` Promedio: ${fmtHora(ctx.parsed.y)}`
              }
            }
          }
        }
      });
    }
  }
}