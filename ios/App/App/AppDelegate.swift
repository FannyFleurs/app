import UIKit
import Capacitor
import WebKit


final class HelloPosBridgeViewController: CAPBridgeViewController {
    private let appURL = URL(string: "https://app.hellopos.fr")!
    private let settingsURL = URL(string: "capacitor://localhost/")!

    override public func capacitorDidLoad() {
        print("### HELLOPOS capacitorDidLoad APPELE ###")
        bridge?.registerPluginInstance(HelloPosPrinterPlugin())
        print("### HELLOPOS PLUGIN ENREGISTRE ###")
    }

    override public func viewDidLoad() {
        super.viewDidLoad()

        installPrintInterceptor()

        // La configuration imprimante vit désormais surtout dans le back-office
        // (lue via /api/pos/ip-printer). On charge donc toujours l'application ;
        // l'écran de réglages local reste accessible en repli (menu « Imprimante
        // réseau » ou bouton roue crantée).
        webView?.load(URLRequest(url: appURL))
    }

    override public func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Après viewDidAppear le webview est présent : le bouton se place ainsi
        // à coup sûr au-dessus du contenu web (z-order fiable).
        installSettingsButton()
    }

    private func installPrintInterceptor() {
        let printInterceptScript = #"""
        (() => {
          if (window.__helloPosNativePrintInterceptorInstalled) return;
          window.__helloPosNativePrintInterceptorInstalled = true;

          const originalFetch = window.fetch.bind(window);

          async function helloposPrinterConfig() {
            // 1) Config serveur (back-office), résolue pour la boutique du poste.
            //    C'est la source prioritaire : configurée une fois dans le BO,
            //    partagée par tous les postes de la boutique.
            try {
              const r = await originalFetch('/api/pos/ip-printer', {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store'
              });

              if (r.ok) {
                const s = await r.json();
                if (s && s.configured && s.host) {
                  return {
                    host: s.host,
                    port: s.port || 9100,
                    widthDots: s.widthDots || 576
                  };
                }
              }
            } catch (error) {
              console.log('### HELLOPOS SERVER CONFIG ERROR ###', String(error));
            }

            // 2) Repli : réglage local de l'appareil (écran de réglages natif),
            //    utile hors-ligne ou avant configuration du BO.
            try {
              const plugin = window.Capacitor
                && window.Capacitor.Plugins
                && window.Capacitor.Plugins.HelloPosPrinter;

              if (plugin) {
                const s = await plugin.getSettings();
                if (s && s.configured && s.host) {
                  return {
                    host: s.host,
                    port: s.port || 9100,
                    widthDots: s.widthDots || 576
                  };
                }
              }
            } catch (error) {
              console.log('### HELLOPOS LOCAL CONFIG ERROR ###', String(error));
            }

            return null;
          }

          function jsonResponse(body, status) {
            return new Response(JSON.stringify(body), {
              status,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          function sleep(ms) {
            return new Promise(function (r) { setTimeout(r, ms); });
          }

          // Résilience : l'imprimante peut être en veille / le réseau instable.
          // On réessaie quelques fois avec une petite attente croissante avant
          // d'abandonner (réveil imprimante, TCP transitoire).
          async function nativePrintWithRetry(params) {
            let lastError;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                return await window.Capacitor.Plugins.HelloPosPrinter.printPdf(params);
              } catch (error) {
                lastError = error;
                console.log('### HELLOPOS PRINT RETRY ###', attempt, String(error));
                if (attempt < 3) await sleep(attempt * 500);
              }
            }
            throw lastError;
          }

          window.fetch = async function(input, init) {
            try {
              const rawUrl = typeof input === 'string'
                ? input
                : (input && typeof input.url === 'string' ? input.url : String(input));

              const url = new URL(rawUrl, window.location.href);

              const method = String(
                (init && init.method) ||
                (input && input.method) ||
                'GET'
              ).toUpperCase();

              // Familles de documents thermiques (80 mm) imprimables en natif.
              // Chacune expose un endpoint /print (POST) et un /pdf (GET) frère.
              // Le X/Z utilise le rendu ticket dédié (/pdf?ticket=1). Les
              // factures restent en A4 : non interceptées.
              const printFamilies = [
                { re: /^\/api\/receipts\/(?:by-sale\/[^/]+|[^/]+)\/print$/, gift: true },
                { re: /^\/api\/credit-notes\/[^/]+\/print$/, copies: true },
                { re: /^\/api\/gift-cards\/[^/]+\/print$/, copies: true },
                { re: /^\/api\/reports\/day\/print$/, report: true }
              ];

              const printFamily = method === 'POST'
                ? printFamilies.find((f) => f.re.test(url.pathname))
                : null;

              const isDrawerOpen =
                method === 'POST' &&
                url.pathname === '/api/cash-sessions/open-drawer';

              if (printFamily) {
                console.log(
                  '### HELLOPOS NATIVE PRINT INTERCEPT ###',
                  url.pathname
                );

                const cfg = await helloposPrinterConfig();

                if (!cfg) {
                  console.log('### HELLOPOS PRINTER NOT CONFIGURED ###');
                  return jsonResponse({ ok: false, error: 'PRINTER_NOT_CONFIGURED' }, 409);
                }

                let printBody = {};

                try {
                  printBody =
                    init && typeof init.body === 'string'
                      ? JSON.parse(init.body)
                      : {};
                } catch {
                  printBody = {};
                }

                const pdfUrl = new URL(
                  url.pathname.replace(/\/print$/, '/pdf'),
                  window.location.origin
                );

                // Ticket cadeau (sans prix) : uniquement pour les tickets de vente.
                if (printFamily.gift && printBody.gift === true) {
                  pdfUrl.searchParams.set('gift', '1');

                  if (Array.isArray(printBody.lines) && printBody.lines.length > 0) {
                    pdfUrl.searchParams.set('lines', printBody.lines.join(','));
                  }
                }

                // X/Z : rendu ticket 80 mm dédié, avec date/boutique du corps.
                if (printFamily.report) {
                  pdfUrl.searchParams.set('ticket', '1');
                  if (printBody.date) pdfUrl.searchParams.set('date', String(printBody.date));
                  if (printBody.store_id) pdfUrl.searchParams.set('store_id', String(printBody.store_id));
                }

                // Nombre d'exemplaires (avoirs / cartes cadeaux). 1 par défaut.
                let copies = 1;
                if (printFamily.copies) {
                  const requested = Number(printBody.copies);
                  if (Number.isInteger(requested) && requested >= 1 && requested <= 5) {
                    copies = requested;
                  }
                }

                console.log(
                  '### HELLOPOS NATIVE PDF FETCH ###',
                  pdfUrl.pathname + pdfUrl.search,
                  'x' + copies
                );

                const pdfResponse = await originalFetch(
                  pdfUrl.toString(),
                  {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'no-store'
                  }
                );

                if (!pdfResponse.ok) {
                  console.log(
                    '### HELLOPOS NATIVE PDF ERROR ###',
                    pdfResponse.status
                  );

                  return jsonResponse({ ok: false, error: 'PDF_FETCH_FAILED' }, 500);
                }

                const buffer = await pdfResponse.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                console.log(
                  '### HELLOPOS NATIVE PDF OK ###',
                  bytes.length,
                  'bytes'
                );

                let binary = '';
                const chunkSize = 0x8000;

                for (let i = 0; i < bytes.length; i += chunkSize) {
                  binary += String.fromCharCode(
                    ...bytes.subarray(i, i + chunkSize)
                  );
                }

                const pdfBase64 = btoa(binary);

                try {
                  for (let copy = 0; copy < copies; copy++) {
                    const nativeResult = await nativePrintWithRetry({
                      host: cfg.host,
                      port: cfg.port,
                      widthDots: cfg.widthDots,
                      pdfBase64
                    });

                    console.log(
                      '### HELLOPOS NATIVE PRINT SUCCESS ###',
                      (copy + 1) + '/' + copies,
                      JSON.stringify(nativeResult)
                    );
                  }

                  return jsonResponse({ ok: true, printer_label: 'Imprimante réseau HelloPos', copies }, 200);

                } catch (error) {
                  console.log(
                    '### HELLOPOS NATIVE PRINT ERROR ###',
                    String(error)
                  );

                  return jsonResponse({ ok: false, error: 'NATIVE_PRINT_FAILED' }, 500);
                }
              }

              if (isDrawerOpen) {
                console.log(
                  '### HELLOPOS NATIVE DRAWER INTERCEPT ###'
                );

                // On exécute d'abord la route Web pour conserver
                // l'audit réglementaire de l'ouverture.
                const webResponse = await originalFetch(input, init);

                if (!webResponse.ok) {
                  return webResponse;
                }

                let responseData = {};

                try {
                  responseData = await webResponse.clone().json();
                } catch {
                  responseData = {};
                }

                // Si CloudPRNT a déjà envoyé l'impulsion,
                // ne pas ouvrir une seconde fois.
                if (responseData.drawer_kick_queued !== true) {
                  const cfg = await helloposPrinterConfig();

                  if (cfg) {
                    try {
                      const nativeResult =
                        await window.Capacitor.Plugins.HelloPosPrinter.openDrawer({
                          host: cfg.host,
                          port: cfg.port
                        });

                      console.log(
                        '### HELLOPOS NATIVE DRAWER SUCCESS ###',
                        JSON.stringify(nativeResult)
                      );

                    } catch (error) {
                      console.log(
                        '### HELLOPOS NATIVE DRAWER ERROR ###',
                        String(error)
                      );
                    }
                  } else {
                    console.log('### HELLOPOS DRAWER PRINTER NOT CONFIGURED ###');
                  }
                } else {
                  console.log(
                    '### HELLOPOS DRAWER CLOUDPRNT ALREADY QUEUED ###'
                  );
                }

                return webResponse;
              }

            } catch (error) {
              console.log(
                '### HELLOPOS NATIVE PRINT INTERCEPT ERROR ###',
                String(error)
              );
            }

            return originalFetch(input, init);
          };

          // Entrée « Imprimante réseau » ajoutée au menu Paramètres. Ce script
          // n'étant injecté que par la coque iOS, l'entrée est invisible pour
          // les utilisateurs du site web (aucune modification côté serveur).
          function findSettingsNav() {
            // 1) barre latérale des réglages (classe Tailwind connue).
            const byClass = document.querySelector('nav[class~="space-y-0.5"]');
            if (byClass) return byClass;
            // 2) repli robuste : on remonte au conteneur d'un lien /settings/.
            const link = document.querySelector('aside a[href^="/settings/"]')
              || document.querySelector('a[href^="/settings/"]');
            if (link) return link.closest('nav') || link.parentElement;
            return null;
          }

          function injectPrinterSettingsEntry() {
            try {
              if (document.getElementById('hellopos-native-printer-entry')) return;

              const nav = findSettingsNav();
              if (!nav) return;

              const entry = document.createElement('a');
              entry.id = 'hellopos-native-printer-entry';
              entry.href = '#';
              entry.textContent = '🖨 Imprimante réseau (IP)';
              entry.style.cssText =
                'display:flex;align-items:center;gap:12px;margin:2px 0;' +
                'padding:10px 12px;border-radius:12px;font-size:14px;' +
                'font-weight:600;color:#fff;background:#8a1538;' +
                'text-decoration:none;cursor:pointer;';

              entry.addEventListener('click', function (e) {
                e.preventDefault();
                try {
                  window.Capacitor.Plugins.HelloPosPrinter.openSettings();
                } catch (err) {
                  console.log('### HELLOPOS OPEN SETTINGS ERROR ###', String(err));
                }
              });

              // En tête du menu pour être vu sans faire défiler.
              nav.insertBefore(entry, nav.firstChild);
              console.log('### HELLOPOS PRINTER MENU ENTRY INJECTED ###');
            } catch (err) {
              console.log('### HELLOPOS MENU INJECT ERROR ###', String(err));
            }
          }

          function startMenuObserver() {
            injectPrinterSettingsEntry();
            try {
              const observer = new MutationObserver(function () {
                injectPrinterSettingsEntry();
              });
              observer.observe(document.body, { childList: true, subtree: true });
            } catch (err) {
              console.log('### HELLOPOS OBSERVER ERROR ###', String(err));
            }
          }

          if (document.body) {
            startMenuObserver();
          } else {
            document.addEventListener('DOMContentLoaded', startMenuObserver);
          }

          console.log(
            '### HELLOPOS NATIVE PRINT INTERCEPTOR INSTALLED (build 9) ###'
          );
        })();
        """#

        let userScript = WKUserScript(
            source: printInterceptScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )

        webView?.configuration.userContentController.addUserScript(userScript)
    }

    /// Bouton flottant permettant de revenir à tout moment sur l'écran de
    /// réglages imprimante (changement d'IP, test, etc.).
    private func installSettingsButton() {
        // Évite les doublons quand viewDidAppear est rappelé.
        if view.viewWithTag(9911) != nil { return }

        let button = UIButton(type: .system)
        button.tag = 9911
        button.setTitle("⚙", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 22)
        button.setTitleColor(.white, for: .normal)
        button.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        button.layer.cornerRadius = 22
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(openPrinterSettings), for: .touchUpInside)

        view.addSubview(button)

        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(equalToConstant: 44),
            button.heightAnchor.constraint(equalToConstant: 44),
            button.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            button.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12)
        ])
    }

    @objc private func openPrinterSettings() {
        webView?.load(URLRequest(url: settingsURL))
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
