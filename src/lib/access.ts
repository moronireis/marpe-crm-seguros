/**
 * Role-based access control for Marpe CRM.
 * Two roles: admin (Marcel) and operador (Vanessa, Adria).
 */

const ROLE_LEVELS: Record<string, number> = {
  operador: 1,
  admin: 2,
};

export function hasAccess(userRole: string, requiredRole: string): boolean {
  return (ROLE_LEVELS[userRole] ?? 0) >= (ROLE_LEVELS[requiredRole] ?? 999);
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Administrador',
    operador: 'Operador',
  };
  return labels[role] ?? role;
}
