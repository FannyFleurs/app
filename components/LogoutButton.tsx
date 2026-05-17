'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="mt-2 w-full text-left text-xs text-ink-soft hover:text-danger"
    >
      Se déconnecter
    </button>
  );
}
