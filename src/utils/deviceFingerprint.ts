/**
 * Device fingerprint & single-device binding utility for Sakhr Al-Masri App
 */

const DEVICE_ID_KEY = 'sakhr_employee_device_id_v1';
const BOUND_EMPLOYEE_KEY = 'sakhr_bound_employee_id_v1';

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'هاتف آيفون (iOS)';
  if (/Android/.test(ua)) return 'هاتف أندرويد (Android)';
  if (/Macintosh/.test(ua)) return 'جهاز ماك (macOS)';
  if (/Windows/.test(ua)) return 'جهاز ويندوز (Windows)';
  return 'جهاز ذكي';
}

export function getLocallyBoundEmployeeId(): string | null {
  return localStorage.getItem(BOUND_EMPLOYEE_KEY);
}

export function setLocallyBoundEmployeeId(employeeId: string): void {
  localStorage.setItem(BOUND_EMPLOYEE_KEY, employeeId);
}

export function clearLocallyBoundEmployee(): void {
  localStorage.removeItem(BOUND_EMPLOYEE_KEY);
}
