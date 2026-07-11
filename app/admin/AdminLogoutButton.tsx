'use client';

/** Bouton de déconnexion du back-office admin (header). */
export default function AdminLogoutButton() {
  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* on redirige quand même */ }
    window.location.assign('/login');
  }
  return (
    <button
      onClick={() => void logout()}
      className="px-3 py-1.5 rounded-lg text-sm font-medium text-danger hover:bg-danger/10 transition-colors"
    >
      Se déconnecter
    </button>
  );
}
