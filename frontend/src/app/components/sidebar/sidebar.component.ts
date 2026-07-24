import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
import { environment } from '../../../environments/environment';
import { defer, from, of, switchMap, map, catchError, take } from 'rxjs';

/** Normaliza un array de roles a minúsculas */
function normalizeRoles(roles: string[]): string[] {
  return roles.map(r => r.toLowerCase());
}

export interface UserVm {
  ok: boolean;
  userName: string;
  fullName: string;
  email: string;
  initials: string;
  accountUrl: string;
  // Roles booleanos para usar en el template
  isSuperadmin: boolean;
  isAdmin: boolean;
  isMarcaje: boolean;
  isPermisos: boolean;
  isEmpleados: boolean;
  // Acceso a módulos
  canVerDashboard: boolean;
  canVerEmpleados: boolean;
  canVerTurnos: boolean;
  canVerPermisos: boolean;
  canVerReportes: boolean;
  canVerCatalogos: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  private kc = inject(KeycloakService);

  isAuthenticated$ = defer(async () => this.kc.isLoggedIn()).pipe(
    map(isLoggedIn => !!isLoggedIn)
  );

  vm$ = this.isAuthenticated$.pipe(
    switchMap(ok => ok
      ? from(this.kc.loadUserProfile()).pipe(
        map(profile => {
          const userName = profile.username ?? '';
          const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || userName;
          const email = profile.email ?? '';
          const rawRoles = normalizeRoles(this.kc.getUserRoles(true) || []);

          const isSuperadmin = rawRoles.includes('superadmin');
          const isAdmin      = rawRoles.includes('admin') || rawRoles.includes('realm-admin');
          const isMarcaje    = rawRoles.includes('marcaje');
          const isPermisos   = rawRoles.includes('permisos');
          const isEmpleados  = rawRoles.includes('empleados');

          // Reglas de acceso por módulo
          const canVerDashboard  = isSuperadmin || isAdmin || isMarcaje || isPermisos || isEmpleados;
          const canVerEmpleados  = isSuperadmin || isAdmin || isEmpleados || isMarcaje || isPermisos;
          const canVerTurnos     = isSuperadmin || isAdmin;
          const canVerPermisos   = isSuperadmin || isAdmin || isPermisos;
          const canVerReportes   = isSuperadmin || isAdmin || isMarcaje || isPermisos;
          const canVerCatalogos  = isSuperadmin || isAdmin;

          const initials = (fullName || userName)
            .split(/\s+/).map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();

          const base = environment.keycloak.url.replace(/\/+$/, '');
          const realm = environment.keycloak.realm;
          const accountUrl = `${base}/realms/${realm}/account`;

          return {
            ok, userName, fullName, email, initials, accountUrl,
            isSuperadmin, isAdmin, isMarcaje, isPermisos, isEmpleados,
            canVerDashboard, canVerEmpleados, canVerTurnos,
            canVerPermisos, canVerReportes, canVerCatalogos
          } as UserVm;
        }),
        catchError(() => of({
          ok: true, userName: '', fullName: '', email: '', initials: '', accountUrl: '',
          isSuperadmin: false, isAdmin: false, isMarcaje: false, isPermisos: false, isEmpleados: false,
          canVerDashboard: true, canVerEmpleados: false, canVerTurnos: false,
          canVerPermisos: false, canVerReportes: false, canVerCatalogos: false
        } as UserVm))
      )
      : of({
          ok: false, userName: '', fullName: '', email: '', initials: '', accountUrl: '',
          isSuperadmin: false, isAdmin: false, isMarcaje: false, isPermisos: false, isEmpleados: false,
          canVerDashboard: false, canVerEmpleados: false, canVerTurnos: false,
          canVerPermisos: false, canVerReportes: false, canVerCatalogos: false
        } as UserVm)
    ),
    take(1)
  );

  openAccount(url: string) { if (url) window.open(url, '_blank'); }

  async logout() {
    try {
      await this.kc.logout(window.location.origin);
    } catch {
      const base = environment.keycloak.url.replace(/\/+$/, '');
      const realm = environment.keycloak.realm;
      const clientId = environment.keycloak.clientId;
      const redirect = encodeURIComponent(window.location.origin);
      window.location.href =
        `${base}/realms/${realm}/protocol/openid-connect/logout` +
        `?client_id=${clientId}&post_logout_redirect_uri=${redirect}`;
    }
  }
}
