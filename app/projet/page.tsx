import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { spaceUrls } from '@/lib/site/spaces';

/**
 * Page de présentation autonome (hellopos.fr/projet).
 *
 * - Publique, hors du site vitrine (`/site`) : elle n'est PAS soumise au réglage
 *   « site public » ni à la page d'attente, et n'apparaît dans aucun menu.
 * - Rendu isolé : tout le CSS est préfixé `.hp` pour ne pas entrer en conflit
 *   avec les styles globaux de l'app. Les visuels sont des EMPLACEMENTS vides,
 *   prêts à recevoir des captures/mockups (voir commentaires « Remplacez … »).
 * - Page de travail : `robots noindex` tant qu'elle n'est pas finalisée.
 */
export const metadata: Metadata = {
  title: 'HelloPos — Présentation',
  description:
    'HelloPos : la caisse pour iPad, smartphone et back-office, pour tous les commerces de détail.',
  robots: { index: false, follow: false },
};

// Lit l'hôte pour pointer « Connexion » vers les bons espaces (app./bo.).
export const dynamic = 'force-dynamic';

const CSS = `
.hp{
  --bg:#F4F7F1;--surface:#FFFFFF;--surface-2:#EEF3EA;--ink:#13251B;--ink-soft:#556257;
  --brand:#16412C;--brand-ink:#16412C;--cta:#1C9E62;--cta-ink:#FFFFFF;
  --accent:#F2D96B;--accent-deep:#C79A18;--border:#E1E8DB;
  --shadow:0 1px 2px rgba(19,37,27,.06), 0 12px 30px -12px rgba(19,37,27,.18);
  --shadow-soft:0 1px 2px rgba(19,37,27,.05), 0 8px 24px -16px rgba(19,37,27,.20);
  --radius:18px;
  color-scheme:light dark;
  background:var(--bg);color:var(--ink);min-height:100dvh;
  font-family:'Hanken Grotesk',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme: dark){
  .hp{
    --bg:#0D1510;--surface:#14201A;--surface-2:#182620;--ink:#E9F1E9;--ink-soft:#9BAFA1;
    --brand:#8BD9AC;--brand-ink:#CFEBD9;--cta:#25B573;--cta-ink:#06180E;
    --accent:#F2D96B;--accent-deep:#F2D96B;--border:#233329;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 18px 40px -18px rgba(0,0,0,.6);
    --shadow-soft:0 1px 2px rgba(0,0,0,.35), 0 12px 30px -20px rgba(0,0,0,.55);
  }
}
html:has(.hp){scroll-behavior:smooth}
.hp *{box-sizing:border-box}
.hp h1,.hp h2,.hp h3{font-family:'Bricolage Grotesque','Hanken Grotesk',system-ui,sans-serif;line-height:1.05;letter-spacing:-.02em;text-wrap:balance;margin:0}
.hp p{margin:0}
.hp a{color:inherit;text-decoration:none}
.hp .wrap{max-width:1140px;margin:0 auto;padding:0 24px}
.hp .tnum{font-variant-numeric:tabular-nums}

.hp .btn{display:inline-flex;align-items:center;gap:.5rem;font-weight:600;font-size:.98rem;padding:.72rem 1.15rem;border-radius:12px;border:1px solid transparent;cursor:pointer;transition:transform .15s ease, box-shadow .15s ease, background .15s ease}
.hp .btn-primary{background:var(--cta);color:var(--cta-ink);box-shadow:var(--shadow-soft)}
.hp .btn-primary:hover{transform:translateY(-1px)}
.hp .btn-ghost{background:transparent;color:var(--ink);border-color:var(--border)}
.hp .btn-ghost:hover{background:var(--surface-2)}
.hp .btn-lg{padding:.85rem 1.4rem;font-size:1.05rem}
.hp .btn-gold{background:var(--accent);color:#3a2f05;box-shadow:var(--shadow-soft)}
.hp .btn-gold:hover{transform:translateY(-1px)}
.hp .btn-sm{padding:.55rem .9rem;font-size:.9rem}

.hp .logo-img{height:30px;width:auto;display:block;flex:none}
.hp .logo-word{font-family:'Bricolage Grotesque','Hanken Grotesk',sans-serif;font-weight:800;letter-spacing:-.03em}

.hp .login{position:relative}
.hp .login>summary{list-style:none;cursor:pointer}
.hp .login>summary::-webkit-details-marker{display:none}
.hp .login-menu{position:absolute;right:0;top:calc(100% + 8px);background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);padding:6px;min-width:190px;display:flex;flex-direction:column;z-index:60}
.hp .login-menu a{padding:.6rem .7rem;border-radius:8px;font-size:.92rem;font-weight:500;color:var(--ink);display:flex;align-items:center;gap:.55rem}
.hp .login-menu a small{display:block;color:var(--ink-soft);font-weight:400;font-size:.78rem}
.hp .login-menu a:hover{background:var(--surface-2)}

.hp header.nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 82%, transparent);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--border)}
.hp .nav-in{display:flex;align-items:center;gap:1.5rem;height:66px}
.hp .brand{display:flex;align-items:center;gap:.6rem;font-family:'Bricolage Grotesque';font-weight:800;font-size:1.2rem;letter-spacing:-.03em}
.hp .nav-links{display:flex;gap:1.4rem;margin-left:1rem;font-size:.95rem;font-weight:500;color:var(--ink-soft)}
.hp .nav-links a:hover{color:var(--ink)}
.hp .nav-cta{margin-left:auto;display:flex;gap:.6rem;align-items:center}
@media(max-width:860px){.hp .nav-links{display:none}}

.hp .hero{padding:64px 0 40px;position:relative}
.hp .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center}
@media(max-width:960px){.hp .hero-grid{grid-template-columns:1fr;gap:36px}}
.hp .eyebrow{display:inline-flex;align-items:center;gap:.5rem;font-size:.82rem;font-weight:600;letter-spacing:.02em;color:var(--brand-ink);background:var(--surface);border:1px solid var(--border);padding:.35rem .7rem;border-radius:999px}
.hp .eyebrow .dot{width:7px;height:7px;border-radius:50%;background:var(--cta)}
.hp h1.hero-h{font-size:clamp(2.3rem,5.4vw,3.7rem);font-weight:800;margin:20px 0 0}
.hp .hero-h .mark{position:relative;white-space:nowrap}
.hp .hero-h .mark::after{content:"";position:absolute;left:-2%;right:-2%;bottom:.06em;height:.34em;background:var(--accent);z-index:-1;border-radius:4px;transform:rotate(-.6deg)}
.hp .hero-sub{margin-top:20px;font-size:1.16rem;color:var(--ink-soft);max-width:33ch}
.hp .hero-cta{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:28px}
.hp .trust{display:flex;gap:1.1rem;flex-wrap:wrap;margin-top:26px;font-size:.86rem;color:var(--ink-soft)}
.hp .trust span{display:inline-flex;align-items:center;gap:.4rem}
.hp .trust svg{flex:none}

.hp .shot{position:relative;border:1.5px dashed var(--border);border-radius:22px;background:repeating-linear-gradient(45deg,var(--surface) 0 13px,var(--surface-2) 13px 26px);display:grid;place-items:center;text-align:center;color:var(--ink-soft);box-shadow:var(--shadow-soft);overflow:hidden;padding:16px}
.hp .shot .lbl{background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:.5rem .95rem;font-size:.8rem;font-weight:600;display:inline-flex;gap:.5rem;align-items:center;box-shadow:var(--shadow-soft)}
.hp .shot .lbl svg{flex:none;color:var(--cta)}
.hp .shot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
/* Image « pleine » : les mockups fournis intègrent déjà le cadre de l'appareil
   et son ombre. On retire donc TOUT habillage (bordure, fond, ombre, coins,
   ratio imposé) et on laisse l'image à sa taille naturelle. */
.hp .shot.filled{border:none;border-radius:0;background:transparent;box-shadow:none;padding:0;overflow:visible;aspect-ratio:auto;display:block}
.hp .shot.filled img{position:static;width:100%;height:auto;object-fit:contain}
/* Captures agrandies (~x2). overflow-x:clip évite tout scroll horizontal si
   une image déborde légèrement de sa colonne. */
.hp{overflow-x:clip}
.hp #mobile .shot.phone-ar.filled{max-width:600px;margin:0 auto}
@media(min-width:961px){
  .hp .hero .shot.filled{width:min(56vw,960px);max-width:none}
}
.hp .shot.tablet-ar{aspect-ratio:4/3}
.hp .shot.phone-ar{aspect-ratio:9/16;max-width:280px;margin:0 auto;border-radius:26px}
.hp .shot.wide-ar{aspect-ratio:16/10}

.hp section{padding:72px 0}
.hp .sec-head{max-width:640px;margin-bottom:40px}
.hp .kicker{font-size:.8rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--cta)}
.hp h2.sec-h{font-size:clamp(1.7rem,3.6vw,2.5rem);font-weight:700;margin-top:12px}
.hp .sec-head p{margin-top:14px;color:var(--ink-soft);font-size:1.08rem}
.hp .divider{border:none;border-top:1px solid var(--border);margin:0}

.hp .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
@media(max-width:820px){.hp .steps{grid-template-columns:1fr}}
.hp .step{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow-soft)}
.hp .step .n{font-family:'Bricolage Grotesque';font-weight:800;font-size:1rem;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--accent);color:#3a2f05;margin-bottom:14px}
.hp .step h3{font-size:1.15rem;margin-bottom:6px}
.hp .step p{color:var(--ink-soft);font-size:.98rem}

.hp .pillars{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
@media(max-width:820px){.hp .pillars{grid-template-columns:1fr}}
.hp .pillar{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:26px;box-shadow:var(--shadow-soft)}
.hp .pillar .ic{width:44px;height:44px;border-radius:12px;background:var(--surface-2);display:grid;place-items:center;margin-bottom:16px;color:var(--brand-ink)}
.hp .pillar h3{font-size:1.25rem;margin-bottom:8px}
.hp .pillar p{color:var(--ink-soft);font-size:.98rem}

.hp .feat{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
@media(max-width:960px){.hp .feat{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.hp .feat{grid-template-columns:1fr}}
.hp .f{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px}
.hp .f .ic{width:36px;height:36px;border-radius:10px;background:var(--surface-2);display:grid;place-items:center;color:var(--brand-ink);margin-bottom:12px}
.hp .f h4{font-family:'Hanken Grotesk';font-weight:700;font-size:1rem;margin:0 0 4px}
.hp .f p{font-size:.9rem;color:var(--ink-soft)}

.hp .split{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.hp .split.rev .visual{order:2}
@media(max-width:900px){.hp .split{grid-template-columns:1fr;gap:28px}.hp .split.rev .visual{order:0}}
.hp .split h2{font-size:clamp(1.6rem,3.2vw,2.2rem);font-weight:700}
.hp .split .lead{color:var(--ink-soft);margin-top:14px;font-size:1.05rem}
.hp .ticks{margin-top:20px;display:flex;flex-direction:column;gap:12px}
.hp .tick{display:flex;gap:.7rem;align-items:flex-start}
.hp .tick svg{flex:none;margin-top:2px;color:var(--cta)}
.hp .tick b{font-weight:600}
.hp .tick span{color:var(--ink-soft);font-size:.96rem}

.hp .plans{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
@media(max-width:820px){.hp .plans{grid-template-columns:1fr}}
.hp .plan{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:26px;display:flex;flex-direction:column;box-shadow:var(--shadow-soft)}
.hp .plan.hot{border-color:var(--cta);box-shadow:var(--shadow)}
.hp .plan .pname{font-family:'Bricolage Grotesque';font-weight:800;font-size:1.25rem}
.hp .plan .price{font-size:2rem;font-weight:800;font-family:'Bricolage Grotesque';margin:10px 0 2px}
.hp .plan .price small{font-size:.9rem;font-weight:600;color:var(--ink-soft)}
.hp .plan ul{list-style:none;padding:0;margin:16px 0 22px;display:flex;flex-direction:column;gap:9px}
.hp .plan li{display:flex;gap:.55rem;font-size:.94rem;color:var(--ink-soft)}
.hp .plan li svg{flex:none;color:var(--cta);margin-top:3px}
.hp .plan .btn{margin-top:auto;justify-content:center}
.hp .badge-hot{align-self:flex-start;font-size:.7rem;font-weight:700;color:var(--cta-ink);background:var(--cta);border-radius:999px;padding:3px 10px;margin-bottom:6px}

.hp .faq{max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
.hp details{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:2px 20px}
.hp summary{list-style:none;cursor:pointer;padding:18px 0;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:1rem}
.hp summary::-webkit-details-marker{display:none}
.hp summary .pm{flex:none;width:22px;height:22px;border:1px solid var(--border);border-radius:6px;display:grid;place-items:center;color:var(--ink-soft);transition:transform .2s}
.hp details[open] summary .pm{transform:rotate(45deg);color:var(--cta)}
.hp details p{padding:0 0 18px;color:var(--ink-soft);font-size:.98rem}

.hp .cta-band{background:var(--brand);color:#EAF6EE;border-radius:26px;padding:52px 40px;text-align:center;position:relative;overflow:hidden}
@media (prefers-color-scheme: dark){.hp .cta-band{background:var(--surface-2);color:var(--ink)}}
.hp .cta-band h2{font-size:clamp(1.7rem,4vw,2.6rem);color:inherit}
.hp .cta-band p{margin:14px auto 0;max-width:46ch;opacity:.85}
.hp .cta-band .btn-primary{margin-top:26px}
.hp .cta-band .smile{position:absolute;left:50%;top:-40px;transform:translateX(-50%);opacity:.14}

.hp footer{padding:44px 0 60px;border-top:1px solid var(--border);color:var(--ink-soft);font-size:.9rem}
.hp .foot-in{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;align-items:center}

.hp .reveal{opacity:0;transform:translateY(16px);transition:opacity .6s ease, transform .6s ease}
.hp .reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.hp .reveal{opacity:1;transform:none;transition:none}html:has(.hp){scroll-behavior:auto}}
`;

// Emplacement de capture réutilisable. Pour insérer un mockup : remplacez le
// contenu (le <span class="lbl">…</span>) par <img src="/projet/xxx.png" alt="…">.
function shot(kind: 'tablet-ar' | 'phone-ar' | 'wide-ar', legende: string, id: string, img?: string): string {
  // Avec une image (déposée dans public/projet/), on l'affiche pleine trame.
  // Sans image, un emplacement vide invite à en ajouter une.
  if (img) {
    return `<div class="shot ${kind} filled" id="${id}"><img src="${img}" alt="${legende}"></div>`;
  }
  return `<div class="shot ${kind}" id="${id}">
    <!-- Remplacez ce bloc par : <img src="/projet/${id}.png" alt="${legende}"> (ou passez le 4e argument de shot()) -->
    <span class="lbl"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/><circle cx="8.5" cy="9" r="1.4" fill="currentColor" stroke="none"/></svg> ${legende}</span>
  </div>`;
}

// Logo : image swappable dans public/projet/logo.svg (la marque HelloPos).
// Remplacez ce fichier pour changer le logo. Le mot « HelloPos » reste en texte
// (il s'adapte au thème clair/sombre) ; masquez-le via .logo-word{display:none}
// si votre logo contient déjà le nom.
const logoBrand = `<img class="logo-img" src="/projet/logo.svg" alt="" aria-hidden="true"><span class="logo-word">HelloPos</span>`;
const check = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5"/></svg>`;
const tick = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg>`;

function renderHtml(setup: string, caisse: string, bo: string): string {
  return `
<header class="nav">
  <div class="wrap nav-in">
    <a class="brand" href="#top" aria-label="HelloPos">${logoBrand}</a>
    <nav class="nav-links">
      <a href="#fonctions">Fonctions</a>
      <a href="#caisse">Caisse</a>
      <a href="#mobile">Mobile</a>
      <a href="#backoffice">Back-office</a>
      <a href="#tarifs">Tarifs</a>
    </nav>
    <div class="nav-cta">
      <a class="btn btn-gold btn-sm" href="${setup}">Créer ma caisse</a>
      <details class="login">
        <summary class="btn btn-ghost btn-sm">Connexion</summary>
        <div class="login-menu">
          <a href="${caisse}"><span>Espace caisse</span></a>
          <a href="${bo}"><span>Back-office</span></a>
        </div>
      </details>
    </div>
  </div>
</header>

<a id="top"></a>

<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <span class="eyebrow"><span class="dot"></span> Caisse SaaS · tous commerces · France</span>
      <h1 class="hero-h">La caisse qui vit sur <span class="mark">iPad, mobile</span> et dans votre back-office.</h1>
      <p class="hero-sub">HelloPos encaisse, gère le stock, fidélise et sort des tickets conformes — sur la tablette du comptoir, dans la poche, et depuis un back-office multi-boutiques.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="${setup}">Créer ma caisse</a>
        <a class="btn btn-ghost btn-lg" href="#fonctions">Voir les fonctions</a>
      </div>
      <div class="trust">
        <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2l7 3v6c0 4.5-3 8.3-7 9-4-.7-7-4.5-7-9V5z"/><path d="M9 12l2 2 4-4"/></svg> Conçu conforme art. 286 CGI</span>
        <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 9h18"/></svg> Sans engagement</span>
        <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg> 100% en français</span>
      </div>
    </div>
    <div class="visual">${shot('tablet-ar', 'Aperçu de la caisse HelloPos', 'hero', '/projet/hero.png')}</div>
  </div>
</section>

<hr class="divider">

<section id="demarrer">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="kicker">Prise en main</div>
      <h2 class="sec-h">Opérationnel en quelques minutes</h2>
      <p>Pas de matériel imposé pour démarrer : votre iPad ou votre smartphone suffit. Le reste se configure à votre rythme.</p>
    </div>
    <div class="steps">
      <div class="step reveal"><div class="n">1</div><h3>Créez votre catalogue</h3><p>Saisie rapide, catégories, codes-barres, packs d'articles — ou import de votre fichier Excel en un clic.</p></div>
      <div class="step reveal"><div class="n">2</div><h3>Ouvrez la caisse</h3><p>Fond de caisse, modes de règlement, TVA par boutique. La caisse tactile est prête sur l'iPad du comptoir.</p></div>
      <div class="step reveal"><div class="n">3</div><h3>Encaissez</h3><p>Ticket conforme à chaque vente, stock décompté automatiquement, chiffre d'affaires suivi en temps réel.</p></div>
    </div>
  </div>
</section>

<section style="background:var(--surface-2)">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="kicker">Ce que HelloPos change</div>
      <h2 class="sec-h">Encaisser vite, piloter juste, vendre plus</h2>
    </div>
    <div class="pillars">
      <div class="pillar reveal">
        <div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h7l-1 8 11-13h-7z"/></svg></div>
        <h3>Vitesse</h3>
        <p>Grille tactile, recherche instantanée, tickets en attente, rendu monnaie. Espèces, carte, chèque, lien de paiement, différé client — tout au même endroit.</p>
      </div>
      <div class="pillar reveal">
        <div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/></svg></div>
        <h3>Contrôle</h3>
        <p>Stock, réassort et inventaires par boutique, clôtures X/Z, chaîne fiscale inaltérable et exports comptables prêts pour votre expert-comptable.</p>
      </div>
      <div class="pillar reveal">
        <div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12v9H4v-9"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/></svg></div>
        <h3>Croissance</h3>
        <p>Programme de fidélité, cartes Apple Wallet, commandes avec retrait ou livraison. De quoi faire revenir vos clients et vendre au-delà du comptoir.</p>
      </div>
    </div>
  </div>
</section>

<section id="fonctions">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="kicker">Tout-en-un</div>
      <h2 class="sec-h">Les grandes fonctions</h2>
      <p>Une seule application pour l'encaissement, la gestion et la conformité — sans logiciel annexe à brancher.</p>
    </div>
    <div class="feat">
      <div class="f reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></div><h4>Catalogue & packs</h4><p>Produits, catégories, codes-barres, packs d'articles et import Excel.</p></div>
      <div class="f reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg></div><h4>Encaissement</h4><p>Espèces, carte, chèque, lien de paiement, différé client, remises.</p></div>
      <div class="f reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/></svg></div><h4>Stock & inventaires</h4><p>Mouvements, réassort, inventaires et alertes, par boutique.</p></div>
      <div class="f reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></div><h4>Fidélité & Wallet</h4><p>Points, récompenses et cartes de fidélité dans Apple Wallet.</p></div>
      <div class="f reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg></div><h4>Tickets & factures</h4><p>Tickets fiscaux, tickets cadeaux, factures B2B et avoirs.</p></div>
      <div class="f reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div><h4>Clôtures X/Z</h4><p>Rapports de caisse, clôtures journalières et chaîne fiscale scellée.</p></div>
      <div class="f reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v13H3z"/><path d="M8 21h8M12 16v5"/></svg></div><h4>Commandes</h4><p>Commandes différées, retrait ou livraison, écran & livraison.</p></div>
      <div class="f reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg></div><h4>Exports comptables</h4><p>Exports conformes au contrôle fiscal, prêts pour la compta.</p></div>
    </div>
  </div>
</section>

<hr class="divider">

<section id="caisse">
  <div class="wrap split">
    <div class="reveal">
      <div class="kicker">L'application Caisse</div>
      <h2>Le comptoir, en plein écran sur iPad</h2>
      <p class="lead">L'app de caisse tactile pensée pour la vente rapide : la grille produits d'un côté, le ticket de l'autre, l'encaissement en deux gestes.</p>
      <div class="ticks">
        <div class="tick">${tick}<span><b>Multi-règlements</b> — espèces, carte, chèque, lien de paiement, différé, avec rendu monnaie.</span></div>
        <div class="tick">${tick}<span><b>Tickets en attente</b> — mettez une vente de côté et reprenez-la sans bloquer la file.</span></div>
        <div class="tick">${tick}<span><b>Imprimante ticket réseau</b> — impression directe sur imprimante IP/ESC-POS, ou ticket PDF.</span></div>
        <div class="tick">${tick}<span><b>Fidélité au comptoir</b> — reconnaissance client, points et cartes cadeaux intégrés à la vente.</span></div>
      </div>
    </div>
    <div class="visual reveal">${shot('tablet-ar', "Aperçu de l'app Caisse HelloPos", 'caisse', '/projet/caisse.png')}</div>
  </div>
</section>

<section id="mobile" style="background:var(--surface-2)">
  <div class="wrap split rev">
    <div class="visual reveal">${shot('phone-ar', 'HelloPos sur smartphone', 'mobile', '/projet/mobile.png')}</div>
    <div class="reveal">
      <div class="kicker">Sur smartphone</div>
      <h2>Toute la caisse, dans la poche</h2>
      <p class="lead">HelloPos tourne aussi bien dans le navigateur qu'en application installée sur smartphone. Idéal en rayon, en réserve, ou en vente nomade.</p>
      <div class="ticks">
        <div class="tick">${tick}<span><b>Scan code-barres par la caméra</b> — lecture native EAN, UPC, QR, Code 128 pour ajouter un produit ou l'identifier.</span></div>
        <div class="tick">${tick}<span><b>Gestion du stock mobile</b> — entrées, sorties et inventaires directement depuis le téléphone.</span></div>
        <div class="tick">${tick}<span><b>Application installable</b> — ajoutez HelloPos à l'écran d'accueil pour un lancement plein écran, comme une app.</span></div>
      </div>
    </div>
  </div>
</section>

<section id="backoffice">
  <div class="wrap split">
    <div class="reveal">
      <div class="kicker">Le back-office</div>
      <h2>Pilotez, depuis un seul endroit</h2>
      <p class="lead">Le back-office réunit la gestion : catalogue central, stock, équipes, conformité et suivi du chiffre d'affaires — pour une boutique comme pour un réseau.</p>
      <div class="ticks">
        <div class="tick">${tick}<span><b>Multi-boutiques</b> — catalogue partagé, TVA par boutique, articles rattachés à leur point de vente.</span></div>
        <div class="tick">${tick}<span><b>Utilisateurs & rôles</b> — propriétaire, manager, vendeur, comptable : chacun ses permissions.</span></div>
        <div class="tick">${tick}<span><b>CA consolidé & clôtures</b> — chiffre d'affaires, clôtures X/Z et historique par jour et par boutique.</span></div>
        <div class="tick">${tick}<span><b>Exports & conformité</b> — exports comptables et chaîne fiscale vérifiable à tout moment.</span></div>
      </div>
    </div>
    <div class="visual reveal">${shot('wide-ar', 'Aperçu du back-office HelloPos', 'backoffice', '/projet/backoffice.png')}</div>
  </div>
</section>

<section style="background:var(--surface-2)">
  <div class="wrap">
    <div class="sec-head reveal" style="max-width:720px">
      <div class="kicker">Conformité fiscale</div>
      <h2 class="sec-h">Conçu conforme, par construction</h2>
      <p>Chaque vente validée alimente une chaîne d'événements scellée et inaltérable, conçue pour répondre aux exigences françaises applicables aux logiciels de caisse (art. 286-I-3°bis du CGI) : inaltérabilité, sécurisation, conservation et archivage des données.</p>
    </div>
    <div class="feat" style="grid-template-columns:repeat(3,1fr)">
      <div class="f reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div><h4>Inaltérable</h4><p>Une vente validée ne peut plus être modifiée : tout est tracé et scellé.</p></div>
      <div class="f reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div><h4>Clôtures & archives</h4><p>Clôtures Z journalières, mensuelles et annuelles, avec archivage.</p></div>
      <div class="f reveal"><div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v6H4zM4 14h16v6H4z"/></svg></div><h4>Exports contrôle</h4><p>Exports au format attendu pour un contrôle fiscal, en un clic.</p></div>
    </div>
  </div>
</section>

<section id="tarifs">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="kicker">Tarifs</div>
      <h2 class="sec-h">Une offre par taille de commerce</h2>
      <p>Sans engagement. Ajoutez des caisses en option quand vous grandissez.</p>
    </div>
    <div class="plans">
      <div class="plan reveal">
        <div class="pname">Essentiel</div>
        <div class="price tnum">29 €<small> /mois</small></div>
        <ul>
          <li>${check} 1 boutique · 1 caisse (+ caisses en option)</li>
          <li>${check} Catalogue illimité</li>
          <li>${check} Tickets fiscaux conformes</li>
          <li>${check} Support email</li>
        </ul>
        <a class="btn btn-ghost" href="${setup}">Choisir Essentiel</a>
      </div>
      <div class="plan hot reveal">
        <span class="badge-hot">Recommandé</span>
        <div class="pname">Croissance</div>
        <div class="price tnum">59 €<small> /mois</small></div>
        <ul>
          <li>${check} 1 boutique · jusqu'à 5 caisses</li>
          <li>${check} Écran & Livraison (commande différée)</li>
          <li>${check} Programme de fidélité</li>
          <li>${check} Factures B2B, avoirs, exports</li>
          <li>${check} Support prioritaire</li>
        </ul>
        <a class="btn btn-primary" href="${setup}">Choisir Croissance</a>
      </div>
      <div class="plan reveal">
        <div class="pname">Réseau</div>
        <div class="price">Sur mesure</div>
        <ul>
          <li>${check} Boutiques & caisses illimitées</li>
          <li>${check} Gestion multi-boutiques centralisée</li>
          <li>${check} CA consolidé</li>
          <li>${check} Accompagnement dédié</li>
        </ul>
        <a class="btn btn-ghost" href="#contact">Nous contacter</a>
      </div>
    </div>
  </div>
</section>

<section style="background:var(--surface-2)">
  <div class="wrap">
    <div class="sec-head reveal" style="margin:0 auto 36px;text-align:center">
      <div class="kicker">Questions fréquentes</div>
      <h2 class="sec-h">Bon à savoir</h2>
    </div>
    <div class="faq">
      <details class="reveal"><summary>Faut-il du matériel spécifique ?<span class="pm">+</span></summary><p>Non. HelloPos fonctionne sur un iPad ou un smartphone récent, et dans le navigateur. Vous pouvez ensuite ajouter une imprimante ticket réseau (IP / ESC-POS) et un tiroir-caisse si besoin.</p></details>
      <details class="reveal"><summary>HelloPos est-il conforme à la réglementation française ?<span class="pm">+</span></summary><p>HelloPos est conçu pour répondre aux exigences applicables aux logiciels de caisse (art. 286-I-3°bis du CGI) : inaltérabilité, sécurisation, conservation et archivage. La chaîne fiscale est scellée et vérifiable, avec clôtures X/Z et exports pour le contrôle.</p></details>
      <details class="reveal"><summary>Puis-je l'utiliser sur smartphone ?<span class="pm">+</span></summary><p>Oui. La caisse tourne sur smartphone, avec le scan de codes-barres par la caméra et la gestion du stock en mobilité. L'application s'installe aussi sur l'écran d'accueil pour un usage plein écran.</p></details>
      <details class="reveal"><summary>Ça marche pour quel type de commerce ?<span class="pm">+</span></summary><p>Pour tout commerce de détail : catalogue, packs, stock, fidélité et tickets s'adaptent à votre activité. La configuration (TVA, catégories, modes de règlement) se fait en quelques minutes.</p></details>
      <details class="reveal"><summary>Et pour plusieurs boutiques ?<span class="pm">+</span></summary><p>Le back-office gère le multi-boutiques : catalogue partagé, TVA par boutique, rôles utilisateurs et suivi du chiffre d'affaires consolidé, avec l'offre adaptée.</p></details>
    </div>
  </div>
</section>

<section id="contact">
  <div class="wrap">
    <div class="cta-band reveal">
      <svg class="smile" width="180" height="90" viewBox="0 0 180 90" aria-hidden="true"><path d="M20 20a70 70 0 0 0 140 0" fill="none" stroke="var(--accent)" stroke-width="12" stroke-linecap="round"/></svg>
      <h2>Prêt à passer à HelloPos ?</h2>
      <p>Une caisse tactile, une caisse mobile et un back-office, réunis dans une seule application française — sans engagement.</p>
      <a class="btn btn-primary btn-lg" href="${setup}">Créer ma caisse</a>
    </div>
  </div>
</section>

<footer>
  <div class="wrap foot-in">
    <a class="brand" href="#top" style="font-size:1.05rem">${logoBrand}</a>
    <span>Caisse SaaS pour les commerces de détail · France</span>
  </div>
</footer>
`;
}

const JS = `(function(){
  var root=document.currentScript&&document.currentScript.previousElementSibling;
  var scope=document.querySelector('.hp')||document;
  var els=scope.querySelectorAll('.reveal');
  if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in')});return;}
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target);}});
  },{threshold:.12,rootMargin:'0px 0px -8% 0px'});
  els.forEach(function(e){io.observe(e)});
})();`;

export default function ProjetPage() {
  const urls = spaceUrls(headers().get('host'));
  const html = renderHtml('/setup', urls.caisse, urls.bo);
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap"
      />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="hp" dangerouslySetInnerHTML={{ __html: html }} />
      <script dangerouslySetInnerHTML={{ __html: JS }} />
    </>
  );
}
