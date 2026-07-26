import Link from 'next/link';

/** Page 404 aux couleurs de l'app (au lieu de l'écran brut de Next). */
export default function NotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center p-8 bg-bg">
      <div className="card p-8 max-w-md w-full text-center">
        <h1 className="text-xl font-semibold tracking-tight">Page introuvable</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Cette page n&apos;existe pas ou a été déplacée.
        </p>
        <Link
          href="/caisse"
          className="btn-primary h-11 px-5 mt-6 inline-flex items-center justify-center"
        >
          Retour à la caisse
        </Link>
      </div>
    </div>
  );
}
