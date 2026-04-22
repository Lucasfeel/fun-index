const ADMIN_PASSWORD_KEY = 'indicator-admin-password';

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function getStoredAdminPassword() {
  if (!canUseSessionStorage()) {
    return '';
  }

  return window.sessionStorage.getItem(ADMIN_PASSWORD_KEY) ?? '';
}

export function setStoredAdminPassword(password: string) {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(ADMIN_PASSWORD_KEY, password);
}

export function clearStoredAdminPassword() {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
}
