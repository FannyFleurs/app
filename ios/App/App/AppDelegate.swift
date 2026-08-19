import UIKit
import Capacitor
import WebKit


final class HelloPosBridgeViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        print("### HELLOPOS capacitorDidLoad APPELE ###")
        bridge?.registerPluginInstance(HelloPosPrinterPlugin())
        print("### HELLOPOS PLUGIN ENREGISTRE ###")
    }

    override public func viewDidLoad() {
        super.viewDidLoad()

        let printInterceptScript = #"""
        (() => {
          if (window.__helloPosNativePrintInterceptorInstalled) return;
          window.__helloPosNativePrintInterceptorInstalled = true;

          const originalFetch = window.fetch.bind(window);
          const originalOpen = window.open.bind(window);

          document.addEventListener(
            'click',
            function(event) {
              try {
                const target = event.target;
                const anchor =
                  target && typeof target.closest === 'function'
                    ? target.closest('a[href]')
                    : null;

                if (!anchor) return;

                const url = new URL(
                  anchor.getAttribute('href'),
                  window.location.href
                );

                const isGiftCardPdf =
                  /^\/api\/gift-cards\/[^/]+\/pdf$/.test(
                    url.pathname
                  );

                if (!isGiftCardPdf) return;

                event.preventDefault();
                event.stopPropagation();

                console.log(
                  '### HELLOPOS NATIVE GIFT LINK INTERCEPT ###',
                  url.pathname
                );

                window.open(
                  url.toString(),
                  '_blank'
                );

              } catch (error) {
                console.log(
                  '### HELLOPOS NATIVE GIFT LINK ERROR ###',
                  String(error)
                );
              }
            },
            true
          );

          window.open = function(rawUrl, target, features) {
            try {
              const url = new URL(
                String(rawUrl || ''),
                window.location.href
              );

              const isGiftCardPdf =
                /^\/api\/gift-cards\/[^/]+\/pdf$/.test(
                  url.pathname
                );

              if (isGiftCardPdf) {
                console.log(
                  '### HELLOPOS NATIVE GIFT PDF INTERCEPT ###',
                  url.pathname
                );

                (async () => {
                  try {
                    const pdfResponse =
                      await originalFetch(
                        url.toString(),
                        {
                          method: 'GET',
                          credentials: 'include',
                          cache: 'no-store'
                        }
                      );

                    if (!pdfResponse.ok) {
                      console.log(
                        '### HELLOPOS NATIVE GIFT PDF ERROR ###',
                        pdfResponse.status
                      );
                      return;
                    }

                    const buffer =
                      await pdfResponse.arrayBuffer();

                    const bytes =
                      new Uint8Array(buffer);

                    let binary = '';
                    const chunkSize = 0x8000;

                    for (
                      let i = 0;
                      i < bytes.length;
                      i += chunkSize
                    ) {
                      binary += String.fromCharCode(
                        ...bytes.subarray(
                          i,
                          i + chunkSize
                        )
                      );
                    }

                    const pdfBase64 = btoa(binary);

                    console.log(
                      '### HELLOPOS NATIVE GIFT PDF OK ###',
                      bytes.length,
                      'bytes'
                    );

                    const nativeResult =
                      await window.Capacitor
                        .Plugins
                        .HelloPosPrinter
                        .printPdf({
                          host: '192.168.10.119',
                          port: 9100,
                          widthDots: 576,
                          pdfBase64
                        });

                    console.log(
                      '### HELLOPOS NATIVE GIFT PRINT SUCCESS ###',
                      JSON.stringify(nativeResult)
                    );

                  } catch (error) {
                    console.log(
                      '### HELLOPOS NATIVE GIFT PRINT ERROR ###',
                      String(error)
                    );
                  }
                })();

                return null;
              }

            } catch (error) {
              console.log(
                '### HELLOPOS NATIVE WINDOW OPEN ERROR ###',
                String(error)
              );
            }

            return originalOpen(
              rawUrl,
              target,
              features
            );
          };

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

              const isZPrint =
                method === 'POST' &&
                /^\/api\/closures\/[^/]+\/z-print$/.test(url.pathname);

              const isSaleValidation =
                method === 'POST' &&
                /^\/api\/sales\/[^/]+\/validate$/.test(url.pathname);

              const isGiftCardPrint =
                method === 'POST' &&
                /^\/api\/gift-cards\/[^/]+\/print$/.test(url.pathname);

              const isCreditNotePrint =
                method === 'POST' &&
                /^\/api\/credit-notes\/[^/]+\/print$/.test(url.pathname);

              if (isCreditNotePrint) {
                console.log(
                  '### HELLOPOS NATIVE CREDIT NOTE PRINT INTERCEPT ###',
                  url.pathname
                );

                const pdfUrl = new URL(
                  url.pathname.replace(/\/print$/, '/pdf'),
                  window.location.origin
                );

                console.log(
                  '### HELLOPOS NATIVE CREDIT NOTE PDF FETCH ###',
                  pdfUrl.pathname
                );

                try {
                  /*
                   * IMPORTANT :
                   * on n'appelle PAS la route /print serveur.
                   * Sinon elle enverrait aussi le job à CloudPRNT.
                   */
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
                      '### HELLOPOS NATIVE CREDIT NOTE PDF ERROR ###',
                      pdfResponse.status
                    );

                    return new Response(
                      JSON.stringify({
                        ok: false,
                        error: 'CREDIT_NOTE_PDF_FETCH_FAILED'
                      }),
                      {
                        status: 500,
                        headers: {
                          'Content-Type': 'application/json'
                        }
                      }
                    );
                  }

                  const buffer =
                    await pdfResponse.arrayBuffer();

                  const bytes =
                    new Uint8Array(buffer);

                  console.log(
                    '### HELLOPOS NATIVE CREDIT NOTE PDF OK ###',
                    bytes.length,
                    'bytes'
                  );

                  let binary = '';
                  const chunkSize = 0x8000;

                  for (
                    let i = 0;
                    i < bytes.length;
                    i += chunkSize
                  ) {
                    binary += String.fromCharCode(
                      ...bytes.subarray(
                        i,
                        i + chunkSize
                      )
                    );
                  }

                  const pdfBase64 = btoa(binary);

                  const nativeResult =
                    await window.Capacitor
                      .Plugins
                      .HelloPosPrinter
                      .printPdf({
                        host: '192.168.10.119',
                        port: 9100,
                        widthDots: 576,
                        pdfBase64
                      });

                  console.log(
                    '### HELLOPOS NATIVE CREDIT NOTE PRINT SUCCESS ###',
                    JSON.stringify(nativeResult)
                  );

                  return new Response(
                    JSON.stringify({
                      ok: true,
                      native: true,
                      printer_label: 'HelloPos iPad'
                    }),
                    {
                      status: 200,
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    }
                  );

                } catch (error) {
                  console.log(
                    '### HELLOPOS NATIVE CREDIT NOTE PRINT ERROR ###',
                    String(error)
                  );

                  return new Response(
                    JSON.stringify({
                      ok: false,
                      error: 'NATIVE_CREDIT_NOTE_PRINT_FAILED'
                    }),
                    {
                      status: 500,
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    }
                  );
                }
              }

              if (isGiftCardPrint) {
                console.log(
                  '### HELLOPOS NATIVE GIFT PRINT INTERCEPT ###',
                  url.pathname
                );

                const pdfUrl = new URL(
                  url.pathname.replace(/\/print$/, '/pdf'),
                  window.location.origin
                );

                console.log(
                  '### HELLOPOS NATIVE GIFT PRINT PDF FETCH ###',
                  pdfUrl.pathname
                );

                try {
                  /*
                   * IMPORTANT :
                   * on n'appelle PAS originalFetch(input, init).
                   *
                   * La route /print mettrait sinon également le document
                   * en file CloudPRNT sur l'imprimante enregistrée.
                   */
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
                      '### HELLOPOS NATIVE GIFT PRINT PDF ERROR ###',
                      pdfResponse.status
                    );

                    return new Response(
                      JSON.stringify({
                        ok: false,
                        error: 'GIFT_PDF_FETCH_FAILED'
                      }),
                      {
                        status: 500,
                        headers: {
                          'Content-Type': 'application/json'
                        }
                      }
                    );
                  }

                  const buffer =
                    await pdfResponse.arrayBuffer();

                  const bytes =
                    new Uint8Array(buffer);

                  console.log(
                    '### HELLOPOS NATIVE GIFT PRINT PDF OK ###',
                    bytes.length,
                    'bytes'
                  );

                  let binary = '';
                  const chunkSize = 0x8000;

                  for (
                    let i = 0;
                    i < bytes.length;
                    i += chunkSize
                  ) {
                    binary += String.fromCharCode(
                      ...bytes.subarray(
                        i,
                        i + chunkSize
                      )
                    );
                  }

                  const pdfBase64 = btoa(binary);

                  const nativeResult =
                    await window.Capacitor
                      .Plugins
                      .HelloPosPrinter
                      .printPdf({
                        host: '192.168.10.119',
                        port: 9100,
                        widthDots: 576,
                        pdfBase64
                      });

                  console.log(
                    '### HELLOPOS NATIVE GIFT PRINT SUCCESS ###',
                    JSON.stringify(nativeResult)
                  );

                  /*
                   * TicketPrintButton vérifie uniquement r.ok.
                   * On lui renvoie donc exactement un succès HTTP.
                   */
                  return new Response(
                    JSON.stringify({
                      ok: true,
                      native: true,
                      printer_label: 'HelloPos iPad'
                    }),
                    {
                      status: 200,
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    }
                  );

                } catch (error) {
                  console.log(
                    '### HELLOPOS NATIVE GIFT PRINT ERROR ###',
                    String(error)
                  );

                  return new Response(
                    JSON.stringify({
                      ok: false,
                      error: 'NATIVE_GIFT_PRINT_FAILED'
                    }),
                    {
                      status: 500,
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    }
                  );
                }
              }

              if (isReceiptPrint) {
                console.log(
                  '### HELLOPOS NATIVE PRINT INTERCEPT ###',
                  url.pathname
                );

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

                  return new Response(
                    JSON.stringify({
                      ok: false,
                      error: 'PDF_FETCH_FAILED'
                    }),
                    {
                      status: 500,
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    }
                  );
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
                      host: '192.168.10.119',
                      port: 9100,
                      widthDots: 576,
                      pdfBase64
                    });

                  console.log(
                    '### HELLOPOS NATIVE PRINT SUCCESS ###',
                    JSON.stringify(nativeResult)
                  );

                  return new Response(
                    JSON.stringify({
                      ok: true,
                      printer_label: 'HelloPos iPad'
                    }),
                    {
                      status: 200,
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    }
                  );

                } catch (error) {
                  console.log(
                    '### HELLOPOS NATIVE PRINT ERROR ###',
                    String(error)
                  );

                  return new Response(
                    JSON.stringify({
                      ok: false,
                      error: 'NATIVE_PRINT_FAILED'
                    }),
                    {
                      status: 500,
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    }
                  );
                }
              }
              if (isZPrint) {
                console.log(
                  '### HELLOPOS NATIVE Z PRINT INTERCEPT ###',
                  url.pathname
                );

                const closureIdMatch = url.pathname.match(
                  /^\/api\/closures\/([^/]+)\/z-print$/
                );
                const closureId = closureIdMatch
                  ? closureIdMatch[1]
                  : null;

                if (!closureId) {
                  return new Response(
                    JSON.stringify({
                      ok: false,
                      error: 'Z_CLOSURE_ID_MISSING'
                    }),
                    {
                      status: 500,
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    }
                  );
                }

                let webData = {};


                /*
                 * La route z-print peut déjà fournir certaines
                 * informations utiles. On tente d'abord celles-ci.
                 */
                let storeId = null;
                let businessDate = null;

                /*
                 * Si la route z-print ne renvoie pas boutique/date,
                 * on récupère la liste des clôtures.
                 *
                 * /api/reports/day sans paramètres sait résoudre
                 * la boutique du poste.
                 */
                if (!storeId) {
                  const currentReportUrl = new URL(
                    '/api/reports/day',
                    window.location.origin
                  );

                  const currentReportResponse =
                    await originalFetch(
                      currentReportUrl.toString(),
                      {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store'
                      }
                    );

                  if (currentReportResponse.ok) {
                    try {
                      const currentData =
                        await currentReportResponse.json();

                      storeId =
                        currentData.store_id ||
                        currentData.storeId ||
                        null;
                    } catch {
                      // résolution suivante
                    }
                  }
                }

                if (!storeId || !businessDate) {
                  const closuresUrl = new URL(
                    '/api/closures/daily',
                    window.location.origin
                  );

                  if (storeId) {
                    closuresUrl.searchParams.set(
                      'store_id',
                      storeId
                    );
                  }

                  const closuresResponse =
                    await originalFetch(
                      closuresUrl.toString(),
                      {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store'
                      }
                    );

                  if (closuresResponse.ok) {
                    try {
                      const closuresData =
                        await closuresResponse.json();

                      const candidates =
                        Array.isArray(closuresData)
                          ? closuresData
                          : (
                              closuresData.closures ||
                              closuresData.items ||
                              []
                            );

                      const closure =
                        Array.isArray(candidates)
                          ? candidates.find(
                              item =>
                                item &&
                                String(item.id) ===
                                  String(closureId)
                            )
                          : null;

                      if (closure) {
                        storeId =
                          storeId ||
                          closure.store_id ||
                          closure.storeId ||
                          null;

                        businessDate =
                          businessDate ||
                          closure.business_date ||
                          closure.businessDate ||
                          closure.date ||
                          null;
                      }
                    } catch {
                      // contrôlé juste après
                    }
                  }
                }

                if (!storeId || !businessDate) {
                  console.log(
                    '### HELLOPOS NATIVE Z CONTEXT ERROR ###',
                    JSON.stringify({
                      closureId,
                      storeId,
                      businessDate,
                      webData
                    })
                  );

                  return new Response(
                    JSON.stringify({
                      ok: false,
                      error: 'Z_CONTEXT_NOT_FOUND'
                    }),
                    {
                      status: 500,
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    }
                  );
                }

                businessDate =
                  String(businessDate).slice(0, 10);

                console.log(
                  '### HELLOPOS NATIVE Z CONTEXT ###',
                  JSON.stringify({
                    closureId,
                    storeId,
                    businessDate
                  })
                );

                const reportUrl = new URL(
                  '/api/reports/day',
                  window.location.origin
                );

                reportUrl.searchParams.set(
                  'store_id',
                  String(storeId)
                );

                reportUrl.searchParams.set(
                  'date',
                  businessDate
                );

                console.log(
                  '### HELLOPOS NATIVE Z REPORT FETCH ###',
                  reportUrl.pathname + reportUrl.search
                );

                const reportResponse =
                  await originalFetch(
                    reportUrl.toString(),
                    {
                      method: 'GET',
                      credentials: 'include',
                      cache: 'no-store'
                    }
                  );

                if (!reportResponse.ok) {
                  console.log(
                    '### HELLOPOS NATIVE Z REPORT ERROR ###',
                    reportResponse.status
                  );

                  return new Response(
                    JSON.stringify({
                      ok: false,
                      error: 'Z_REPORT_FETCH_FAILED'
                    }),
                    {
                      status: 500,
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    }
                  );
                }

                const reportPayload =
                  await reportResponse.json();

                const report =
                  reportPayload.report ||
                  reportPayload;

                console.log(
                  '### HELLOPOS NATIVE Z REPORT OK ###'
                );

                const euro = value => {
                  const n = Number(value || 0);

                  return n
                    .toFixed(2)
                    .replace('.', ',') + ' EUR';
                };

                const number = value =>
                  String(Number(value || 0));

                const dateTime = value => {
                  if (!value) return '-';

                  try {
                    return new Intl.DateTimeFormat(
                      'fr-FR',
                      {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      }
                    ).format(new Date(value));
                  } catch {
                    return String(value);
                  }
                };

                const paymentLabels = {
                  cash: 'Especes',
                  card: 'Carte bancaire',
                  check: 'Cheque',
                  transfer: 'Virement',
                  gift_card: 'Carte cadeau',
                  credit_note: 'Avoir',
                  deferred: 'En compte',
                  payment_link: 'Lien paiement',
                  other: 'Autre'
                };

                const lines = [];

                const add = value => {
                  lines.push(
                    value == null ? '' : String(value)
                  );
                };

                const separator = () => {
                  add(
                    '------------------------------------------'
                  );
                };

                const section = title => {
                  add('');
                  separator();
                  add(title);
                  separator();
                };

                const amountLine = (label, value) => {
                  add(
                    String(label) +
                    ' : ' +
                    euro(value)
                  );
                };

                /*
                 * EN-TETE
                 */
                add(
                  report.identity?.name ||
                  report.store_name ||
                  'HelloPos'
                );

                if (report.identity?.line1) {
                  add(report.identity.line1);
                }

                if (report.identity?.line2) {
                  add(report.identity.line2);
                }

                if (report.identity?.city) {
                  add(report.identity.city);
                }

                if (report.identity?.phone) {
                  add(
                    'Tel : ' +
                    report.identity.phone
                  );
                }

                if (report.identity?.siret) {
                  add(
                    'SIRET : ' +
                    report.identity.siret
                  );
                }

                if (report.identity?.vat_number) {
                  add(
                    'TVA : ' +
                    report.identity.vat_number
                  );
                }

                section('TICKET Z');

                add(
                  'Journee : ' +
                  (
                    report.journee_number ??
                    '-'
                  )
                );

                add(
                  'Date : ' +
                  businessDate
                );

                add(
                  'Ouverture : ' +
                  dateTime(report.opened_at)
                );

                add(
                  'Fermeture : ' +
                  dateTime(
                    webData.sealed_at ||
                    report.closed_at
                  )
                );

                /*
                 * TOTAUX
                 */
                section('TOTAUX');

                amountLine(
                  'CA TTC',
                  report.totals?.ca_ttc
                );

                amountLine(
                  'CA HT',
                  report.totals?.ca_ht
                );

                amountLine(
                  'TVA',
                  report.totals?.ca_tva
                );

                add(
                  'Tickets : ' +
                  number(
                    report.totals?.ticket_count
                  )
                );

                amountLine(
                  'Ticket moyen',
                  report.totals?.ticket_moyen_ttc
                );

                amountLine(
                  'Remises',
                  report.totals?.discounts_total
                );

                if (
                  report.totals?.marge_brute_ht != null
                ) {
                  amountLine(
                    'Marge brute HT',
                    report.totals.marge_brute_ht
                  );
                }

                /*
                 * TVA
                 */
                if (
                  Array.isArray(report.tva_by_rate) &&
                  report.tva_by_rate.length
                ) {
                  section('TVA');

                  report.tva_by_rate.forEach(row => {
                    add(
                      'Taux ' +
                      Number(row.rate)
                        .toFixed(2)
                        .replace('.', ',') +
                      ' %'
                    );

                    amountLine(
                      '  HT',
                      row.ht
                    );

                    amountLine(
                      '  TVA',
                      row.tva
                    );

                    amountLine(
                      '  TTC',
                      row.ttc
                    );
                  });
                }

                /*
                 * REGLEMENTS
                 */
                if (
                  Array.isArray(report.payments) &&
                  report.payments.length
                ) {
                  section('REGLEMENTS');

                  report.payments.forEach(row => {
                    const label =
                      paymentLabels[row.method] ||
                      row.method;

                    add(
                      label +
                      ' (' +
                      number(row.count) +
                      ') : ' +
                      euro(row.amount)
                    );
                  });
                }

                /*
                 * EN COMPTE HORS CA
                 */
                if (
                  Array.isArray(report.settlements) &&
                  report.settlements.length
                ) {
                  section('REGLEMENTS EN COMPTE');

                  report.settlements.forEach(row => {
                    const label =
                      paymentLabels[row.method] ||
                      row.method;

                    add(
                      label +
                      ' (' +
                      number(row.count) +
                      ') : ' +
                      euro(row.amount)
                    );
                  });
                }

                /*
                 * ESPECES
                 */
                section('ESPECES');

                amountLine(
                  'Fonds de caisse',
                  report.cash?.fonds_de_caisse
                );

                amountLine(
                  'Entrees argent',
                  report.cash?.entrees_argent
                );

                amountLine(
                  'Remise banque',
                  report.cash?.remise_banque
                );

                amountLine(
                  'Especes fermeture',
                  report.cash
                    ?.total_espece_fermeture
                );

                const counted =
                  webData.cash_counted ??
                  report.cash?.counted;

                const variance =
                  webData.cash_variance ??
                  report.cash?.variance;

                if (counted != null) {
                  amountLine(
                    'Especes comptees',
                    counted
                  );
                }

                if (variance != null) {
                  amountLine(
                    'Ecart',
                    variance
                  );
                }

                /*
                 * VENDEURS
                 */
                if (
                  Array.isArray(report.by_vendor) &&
                  report.by_vendor.length
                ) {
                  section('PAR VENDEUR');

                  report.by_vendor.forEach(row => {
                    amountLine(
                      row.name,
                      row.ca_ttc
                    );
                  });
                }

                /*
                 * FAMILLES
                 */
                if (
                  Array.isArray(report.by_category) &&
                  report.by_category.length
                ) {
                  section('PAR FAMILLE');

                  report.by_category.forEach(row => {
                    amountLine(
                      row.name,
                      row.ca_ttc
                    );
                  });
                }

                /*
                 * MODES DE VENTE
                 */
                if (
                  Array.isArray(report.by_mode) &&
                  report.by_mode.length
                ) {
                  section('MODES DE VENTE');

                  report.by_mode.forEach(row => {
                    amountLine(
                      row.mode,
                      row.ca_ttc
                    );
                  });
                }

                section('TICKETS');

                add(
                  'Nombre : ' +
                  number(
                    report.tickets?.normal_count
                  )
                );

                amountLine(
                  'Total',
                  report.tickets?.normal_total
                );

                const fiscalHash =
                  webData.fiscal_hash ||
                  report.fiscal_hash;

                if (fiscalHash) {
                  section('EMPREINTE FISCALE');
                  add(fiscalHash);
                }

                add('');
                separator();
                add('HelloPos');
                add('');

                const reportText =
                  lines.join('\n');

                console.log(
                  '### HELLOPOS NATIVE Z TEXT READY ###',
                  reportText.length
                );

                try {
                  const nativeResult =
                    await window.Capacitor
                      .Plugins
                      .HelloPosPrinter
                      .printDayReport({
                        host: '192.168.10.119',
                        port: 9100,
                        text: reportText
                      });

                  console.log(
                    '### HELLOPOS NATIVE Z PRINT SUCCESS ###',
                    JSON.stringify(nativeResult)
                  );

                  return new Response(
                    JSON.stringify({
                      ok: true,
                      printer_label:
                        'HelloPos iPad'
                    }),
                    {
                      status: 200,
                      headers: {
                        'Content-Type':
                          'application/json'
                      }
                    }
                  );

                } catch (error) {
                  console.log(
                    '### HELLOPOS NATIVE Z PRINT ERROR ###',
                    String(error)
                  );

                  return new Response(
                    JSON.stringify({
                      ok: false,
                      error:
                        'NATIVE_Z_PRINT_FAILED'
                    }),
                    {
                      status: 500,
                      headers: {
                        'Content-Type':
                          'application/json'
                      }
                    }
                  );
                }
              }

              if (isSaleValidation) {
                console.log(
                  '### HELLOPOS NATIVE SALE VALIDATION INTERCEPT ###',
                  url.pathname
                );

                let saleBody = {};

                try {
                  saleBody =
                    init && typeof init.body === 'string'
                      ? JSON.parse(init.body)
                      : {};
                } catch {
                  saleBody = {};
                }

                const hasCashPayment =
                  Array.isArray(saleBody.payments) &&
                  saleBody.payments.some(
                    (payment) => payment && payment.method === 'cash'
                  );

                console.log(
                  '### HELLOPOS NATIVE SALE CASH ###',
                  hasCashPayment
                );

                const validationResponse =
                  await originalFetch(input, init);

                return validationResponse;
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
                  try {
                    const nativeResult =
                      await window.Capacitor.Plugins.HelloPosPrinter.openDrawer({
                        host: '192.168.10.119',
                        port: 9100
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

        guard let url = URL(string: "https://app.hellopos.fr") else { return }
        webView?.load(URLRequest(url: url))
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
