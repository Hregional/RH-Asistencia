import { Component, OnInit } from '@angular/core';
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
export class DashboardComponent implements OnInit {
  data: DashboardSummary = {
    personalActivo: 0,
    personalInactivo: 0,
    personalTotal: 0,
    totalTurnos: 0,           
    turnosFijos: 0,
    turnosRotativos: 0,
    personalSinTurno: 0,
    personalConPermiso: 0,
    // alertas: 0,
    proximosTurnos: {
      manana: { enfermeros: 0, medicos: 0 },
      tarde: { enfermeros: 0, medicos: 0 },
      noche: { enfermeros: 0, medicos: 0 },
    },
    asistenciaSemanal: [],
    distribucionArea: []
  } as unknown as DashboardSummary;

  loading = true;
  hasData = false;

  constructor(private dash: DashboardService) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  /** 🔹 Carga los datos del dashboard */
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

  /** 🔹 Verifica si hay datos válidos */
  private hasAnyData(d: DashboardSummary): boolean {
    if (!d) return false;

    const hasPersonalData = (d.personalActivo || 0) + (d.personalInactivo || 0) + (d.personalTotal || 0) > 0;
    const hasTurnosData = (d.totalTurnos || 0) > 0;
    const hasAsistenciaData = d.asistenciaSemanal?.some(x => x.entradas > 0) || false;
    const hasDistribucionData = d.distribucionArea?.length > 0 || false;

    return hasPersonalData || hasTurnosData || hasAsistenciaData || hasDistribucionData;
  }

  /** 🔹 Renderiza los gráficos del dashboard */
  private renderCharts(): void {
    // Limpia los gráficos previos
    Chart.getChart("areaChart")?.destroy();
    Chart.getChart("asistenciaChart")?.destroy();

    // 1️⃣ Gráfico de Distribución de Personal por Área
    if (this.data.distribucionArea && this.data.distribucionArea.length > 0) {
      const ctx1 = document.getElementById('areaChart') as HTMLCanvasElement;
      const areas = this.data.distribucionArea.map((a: any) => a.area || 'Sin área');
      const cantidades = this.data.distribucionArea.map((a: any) => a.cantidad || 0);

      new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: areas,
          datasets: [{
            data: cantidades,
            backgroundColor: [
              '#007bff', '#17a2b8', '#28a745', '#ffc107', '#dc3545',
              '#6f42c1', '#20c997', '#fd7e14'
            ],
            borderWidth: 2,
            borderColor: '#fff',
          }]
        },
        options: {
          cutout: '70%',
          plugins: {
            legend: { position: 'right', labels: { font: { size: 13 } } },
            title: { display: false }
          }
        }
      });
    }

    // Gráfico de Asistencia Semanal
    if (this.data.asistenciaSemanal && this.data.asistenciaSemanal.length > 0) {
      const ctx2 = document.getElementById('asistenciaChart') as HTMLCanvasElement;
      const labels = this.data.asistenciaSemanal.map((d: any) => d.fecha.slice(5));
      const entradas = this.data.asistenciaSemanal.map((d: any) => d.entradas);

      new Chart(ctx2, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Entradas registradas',
            data: entradas,
            backgroundColor: 'rgba(0, 123, 255, 0.7)',
            borderColor: '#007bff',
            borderWidth: 2,
            borderRadius: 8,
          }]
        },
        options: {
          scales: {
            y: { beginAtZero: true, },
            x: { grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  }
}