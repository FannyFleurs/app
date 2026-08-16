'use client';

import { useEffect } from 'react';
import { track } from '@/lib/site/analytics';

/**
 * Envoie un événement analytics à l'affichage d'une page (page métier, cas
 * client, matériel…). Ne rend rien.
 */
export default function TrackView({
  event,
  props,
}: {
  event: string;
  props?: Record<string, string | number | boolean>;
}) {
  useEffect(() => {
    track(event, props ?? {});
    // Un seul envoi par montage de page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}
