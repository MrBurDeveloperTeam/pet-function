// Single place to resolve the destinations Phase 1A action buttons can point
// to, so the route strings aren't duplicated between providers and so
// navigation always goes through a small, known set of destinations.
import { getSuperappHostDependencies } from '../dependencies';

const FALLBACK_INVENTORY_ROUTE = 'https://inventory.snabbb.com/';
const FALLBACK_TODO_ROUTE = 'https://todo.snabbb.com/';
const FALLBACK_APPOINTMENT_ROUTE = 'https://appointment.snabbb.com/';
const PROFILE_SETTINGS_ROUTE = '/profile-settings';

export function getInventoryAppRoute(): string {
  const app = getSuperappHostDependencies().miniApps.find((a) => a.title === 'Inventory');
  return app?.route || FALLBACK_INVENTORY_ROUTE;
}

/** The Todo app's landing page only — never a task-detail path, which
 *  doesn't exist as a controlled destination. */
export function getTodoAppRoute(): string {
  const app = getSuperappHostDependencies().miniApps.find((a) => a.title === 'To-Do Manager');
  return app?.route || FALLBACK_TODO_ROUTE;
}

/** The Appointment app's landing page only — no appointment-detail route
 *  exists as a controlled destination. */
export function getAppointmentAppRoute(): string {
  const app = getSuperappHostDependencies().miniApps.find((a) => a.title === 'Appointment');
  return app?.route || FALLBACK_APPOINTMENT_ROUTE;
}

export function getProfileSettingsRoute(): string {
  return PROFILE_SETTINGS_ROUTE;
}
