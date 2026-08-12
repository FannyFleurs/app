import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/**
 * CPUtil : l'outil en ligne de commande de Star qui convertit un document
 * Star Document Markup en commandes imprimante.
 *
 * C'est lui qui traduit `[feed: black-mark]` en la séquence StarPRNT que la
 * mC-Label3 attend — séquence que nous ne pouvons pas écrire nous-mêmes, les
 * spécifications de commandes publiées par Star étant des PDF chiffrés.
 *
 * Le binaire n'est PAS dans le dépôt : il se télécharge depuis le CloudPRNT
 * SDK de Star et se dépose dans `bin/cputil/` (voir le README de ce dossier).
 * Tant qu'il est absent, `cputilDisponible()` répond false et l'appelant
 * retombe sur l'encodage direct.
 */

const execFileAsync = promisify(execFile);

/** Emplacement attendu du binaire, inclus dans le tracing Vercel. */
export function cputilPath(): string {
  return process.env.CPUTIL_PATH || path.join(process.cwd(), 'bin', 'cputil', 'cputil');
}

/** Le binaire est-il présent ET exécutable ? Réponse mise en cache. */
let disponible: boolean | null = null;
export async function cputilDisponible(): Promise<boolean> {
  if (disponible !== null) return disponible;
  try {
    await access(cputilPath(), constants.X_OK);
    disponible = true;
  } catch {
    disponible = false;
  }
  return disponible;
}

export class CputilError extends Error {
  constructor(message: string, readonly stderr?: string) {
    super(message);
    this.name = 'CputilError';
  }
}

/**
 * Convertit un document Markup en buffer StarPRNT.
 *
 * Syntaxe (documentation Star, « Using cputil ») :
 *   cputil [options de conversion] decode <type MIME> <entrée> <sortie>
 * `printarea <dots>` fixe la largeur d'impression, `-` écrit sur la sortie
 * standard. Ici : 400 points = 50 mm à 203 dpi, la largeur de nos étiquettes.
 *
 * Seul le .stm passe par /tmp — le seul répertoire inscriptible d'une lambda.
 * Les PNG restent en mémoire, dans le document.
 */
export async function convertMarkupToStarPrnt(
  markup: string, printAreaDots = 400,
): Promise<Buffer> {
  const binaire = cputilPath();
  if (!(await cputilDisponible())) {
    throw new CputilError(
      `CPUtil introuvable ou non exécutable : ${binaire}. `
      + 'Dépose le binaire Linux x64 du CloudPRNT SDK dans bin/cputil/ (voir son README).',
    );
  }

  const entree = path.join(os.tmpdir(), `labels-${crypto.randomUUID()}.stm`);
  await writeFile(entree, markup, 'utf8');

  try {
    const { stdout, stderr } = await execFileAsync(
      binaire,
      ['printarea', String(printAreaDots), 'decode', 'application/vnd.star.starprnt', entree, '-'],
      { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, timeout: 20_000 },
    );
    const out = Buffer.from(stdout);
    if (out.length === 0) {
      throw new CputilError('CPUtil a renvoyé un buffer vide.', stderr?.toString('utf8'));
    }
    return out;
  } catch (err) {
    if (err instanceof CputilError) throw err;
    const e = err as { code?: number | string; stderr?: Buffer | string; message?: string };
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString('utf8');
    // eslint-disable-next-line no-console
    console.error('[cputil] échec', { code: e.code, stderr: stderr?.slice(0, 2000) });
    throw new CputilError(
      `CPUtil a échoué (code ${String(e.code ?? '?')}) : ${e.message ?? 'erreur inconnue'}`,
      stderr,
    );
  } finally {
    await unlink(entree).catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */

export interface DiagnosticCputil {
  chemin: string;
  cwd: string;
  existe: boolean;
  executable: boolean;
  taille: number | null;
  /** Sortie de `cputil version` si le binaire a pu être lancé. */
  version: string | null;
  /** Ce qui a empêché de l'utiliser, en clair. */
  erreur: string | null;
  /** Contenu du dossier bin/cputil tel qu'il existe à l'exécution. */
  dossier: string[] | null;
}

/**
 * Interroge l'environnement RÉEL d'exécution.
 *
 * Un binaire peut manquer à l'appel pour trois raisons qui se ressemblent de
 * loin : absent du déploiement, présent mais sans droit d'exécution, présent
 * et exécutable mais incapable de démarrer. Depuis un poste de développement
 * on ne voit rien de tout cela — seule la lambda peut répondre.
 */
export async function diagnostiquerCputil(): Promise<DiagnosticCputil> {
  const chemin = cputilPath();
  const d: DiagnosticCputil = {
    chemin, cwd: process.cwd(),
    existe: false, executable: false, taille: null,
    version: null, erreur: null, dossier: null,
  };

  try {
    const { readdir, stat } = await import('node:fs/promises');
    d.dossier = await readdir(path.dirname(chemin)).catch(() => null);
    const st = await stat(chemin);
    d.existe = true;
    d.taille = st.size;
  } catch (err) {
    d.erreur = `Introuvable : ${(err as Error).message}`;
    return d;
  }

  try {
    await access(chemin, constants.X_OK);
    d.executable = true;
  } catch (err) {
    d.erreur = `Présent mais non exécutable : ${(err as Error).message}`;
    return d;
  }

  try {
    const { stdout } = await execFileAsync(chemin, ['version'], {
      encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
    });
    d.version = String(stdout).trim().split('\n').slice(0, 3).join(' · ');
  } catch (err) {
    const e = err as { code?: number | string; stderr?: string; message?: string };
    d.erreur = `Lancement impossible (code ${String(e.code ?? '?')}) : `
      + `${e.message ?? ''} ${e.stderr ?? ''}`.trim().slice(0, 500);
  }
  return d;
}
