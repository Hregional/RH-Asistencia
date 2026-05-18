import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { AccesoDenegadoComponent } from './components/acceso-denegado/acceso-denegado.component';
import { AuthGuard } from './guards/auth.guard';
import { EmpleadosComponent } from './components/empleados/empleados.component';
import { AsignarTurnosComponent } from './components/asignar-turnos/asignar-turnos.component';
import { ReportesComponent } from './components/reportes/reportes.component';
import { DepartamentosComponent } from './components/departamentos/departamentos/departamentos.component';
import { PuestosComponent } from './components/puestos/puestos/puestos.component';
import { PermisosComponent } from './components/permisos/permisos.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'acceso-denegado', component: AccesoDenegadoComponent },

  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [AuthGuard],
    data: { roles: ['rrhh', 'jefe'] }
  },

  {
    path: 'empleados',
    component: EmpleadosComponent,
    canActivate: [AuthGuard],
    data: { roles: ['rrhh', 'jefe'] }
  },

  {
    path: 'asignar-turnos',
    component: AsignarTurnosComponent,
    canActivate: [AuthGuard],
    data: { roles: ['rrhh', 'jefe'] }
  },

  {
    path: 'permisos',
    component: PermisosComponent,
    canActivate: [AuthGuard],
    data: { roles: ['rrhh', 'jefe'] }
  },

  {
    path: 'turnos',
    loadComponent: () => import('./components/gestion-turnos/gestion-turnos.component').then(m => m.GestionTurnosComponent),
    canActivate: [AuthGuard],
    data: { roles: ['rrhh', 'jefe'] }
  },

  {
    path: 'reportes',
    component: ReportesComponent,
    canActivate: [AuthGuard],
    data: { roles: ['rrhh', 'jefe'] }
  },

  {
    path: 'departamentos',
    component: DepartamentosComponent,
    canActivate: [AuthGuard],
    data: { roles: ['rrhh'] }
  },

  {
    path: 'puestos',
    component: PuestosComponent,
    canActivate: [AuthGuard],
    data: { roles: ['rrhh'] }
  },

  { path: '**', redirectTo: 'dashboard' }
];
