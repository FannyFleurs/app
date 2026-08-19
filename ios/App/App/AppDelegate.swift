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
        installSettingsButton()

        // Première ouverture non configurée : on laisse Capacitor afficher
        // l'écran de réglages local (webDir). Sinon on charge directement
        // l'application hébergée.
        if HelloPosPrinterPlugin.loadSettings().configured {
            webView?.load(URLRequest(url: appURL))
        }
    }

    private func installPrintInterceptor() {
        let printInterceptScript = #"""
        (() => {
          if (window.__helloPosNativePrintInterceptorInstalled) return;
          window.__helloPosNativePrintInterceptorInstalled = true;

          const originalFetch = window.fetch.bind(window);

          async function helloposPrinterConfig() {
            try {
              const plugin = window.Capacitor
                && window.Capacitor.Plugins
                && window.Capacitor.Plugins.HelloPosPrinter;

              if (!plugin) return null;

              const s = await plugin.getSettings();

              if (s && s.configured && s.host) {
                return {
                  host: s.host,
                  port: s.port || 9100,
                  widthDots: s.widthDots || 576
                };
              }
            } catch (error) {
              console.log('### HELLOPOS CONFIG ERROR ###', String(error));
            }

            return null;
          }

          function jsonResponse(body, status) {
            return new Response(JSON.stringify(body), {
              status,
              headers: { 'Content-Type': 'application/json' }
            });
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

              const isReceiptPrint =
                method === 'POST' &&
                /^\/api\/receipts\/(?:by-sale\/[^/]+|[^/]+)\/print$/.test(url.pathname);

              const isDrawerOpen =
                method === 'POST' &&
                url.pathname === '/api/cash-sessions/open-drawer';

              if (isReceiptPrint) {
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

                if (printBody.gift === true) {
                  pdfUrl.searchParams.set('gift', '1');

                  if (Array.isArray(printBody.lines) && printBody.lines.length > 0) {
                    pdfUrl.searchParams.set('lines', printBody.lines.join(','));
                  }
                }

                console.log(
                  '### HELLOPOS NATIVE PDF FETCH ###',
                  pdfUrl.pathname + pdfUrl.search
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
                  const nativeResult =
                    await window.Capacitor.Plugins.HelloPosPrinter.printPdf({
                      host: cfg.host,
                      port: cfg.port,
                      widthDots: cfg.widthDots,
                      pdfBase64
                    });

                  console.log(
                    '### HELLOPOS NATIVE PRINT SUCCESS ###',
                    JSON.stringify(nativeResult)
                  );

                  return jsonResponse({ ok: true, printer_label: 'Imprimante réseau HelloPos' }, 200);

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

          console.log(
            '### HELLOPOS NATIVE PRINT INTERCEPTOR INSTALLED ###'
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
        let button = UIButton(type: .system)
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
