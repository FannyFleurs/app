//
// HelloPosNativePrintScript.swift
//
// Couche d'interception d'impression de l'application native HelloPos.
// Ce fichier ne modifie pas le comportement de la PWA.
//

import Foundation

enum HelloPosNativePrintScript {
    static let source = #"""
        (() => {
          if (window.__helloPosNativePrintInterceptorInstalled) return;
          window.__helloPosNativePrintInterceptorInstalled = true;

          const originalFetch = window.fetch.bind(window);
          const originalOpen = window.open.bind(window);

          /*
           * Configuration imprimante ticket native.
           *
           * LECTURE SEULE :
           * - aucune modification des réglages PWA ;
           * - aucun PATCH ;
           * - la boutique est celle du poste appairé ;
           * - aucune imprimante de secours arbitraire.
           */
          let helloPosNativePrinterCache = null;
          let helloPosNativePrinterCacheAt = 0;

          async function getHelloPosNativePrinter() {
            const now = Date.now();

            if (
              helloPosNativePrinterCache &&
              now - helloPosNativePrinterCacheAt < 60000
            ) {
              return helloPosNativePrinterCache;
            }

            console.log(
              '### HELLOPOS NATIVE PRINTER RESOLVE ###'
            );

            /*
             * La configuration IP du poste est résolue côté serveur.
             * Cette route nécessite uniquement la permission pos.use.
             */
            const settingsUrl = new URL(
              '/api/pos/ip-printer',
              window.location.origin
            );

            const settingsResponse = await originalFetch(
              settingsUrl.toString(),
              {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store'
              }
            );

            if (!settingsResponse.ok) {
              throw new Error(
                'NATIVE_PRINTER_SETTINGS_FAILED_' +
                settingsResponse.status
              );
            }

            const settings =
              await settingsResponse.json();

            console.log(
              '### HELLOPOS NATIVE PRINTER API ###',
              JSON.stringify(settings)
            );

            if (settings.configured !== true) {
              throw new Error(
                'NATIVE_PRINTER_NOT_CONFIGURED'
              );
            }

            const host =
              String(settings.host || '').trim();

            const port =
              Number(settings.port || 9100);

            const widthDots =
              Number(settings.widthDots || 576);

            if (!host) {
              throw new Error(
                'NATIVE_PRINTER_IP_MISSING'
              );
            }

            if (
              !Number.isInteger(port) ||
              port < 1 ||
              port > 65535
            ) {
              throw new Error(
                'NATIVE_PRINTER_PORT_INVALID'
              );
            }

            const printer = {
              storeId: settings.store_id || null,
              storeName: settings.store_name || null,
              host,
              port,
              widthDots
            };

            helloPosNativePrinterCache = printer;
            helloPosNativePrinterCacheAt = now;

            console.log(
              '### HELLOPOS NATIVE PRINTER READY ###',
              JSON.stringify({
                storeId: printer.storeId,
                host: printer.host,
                port: printer.port,
                paperWidth: printer.paperWidth,
                widthDots: printer.widthDots
              })
            );

            return printer;
          }

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

                /*
                 * window.open ne peut pas attendre une Promise.
                 * L'impression native est donc lancée en arrière-plan
                 * et l'ouverture du PDF est neutralisée.
                 */
                printGiftCardPdfNative(url)
                  .catch((error) => {
                    console.log(
                      '### HELLOPOS NATIVE GIFT PRINT ERROR ###',
                      String(error)
                    );
                  });

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

          async function printZNative(url) {
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
                .replace('.', ',');
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

            const ticketWidth = 42;

            const center = value => {
              const text = String(value || '');

              if (text.length >= ticketWidth) {
                return text;
              }

              const left = Math.floor(
                (ticketWidth - text.length) / 2
              );

              return ' '.repeat(left) + text;
            };

            const leftRight = (label, value) => {
              const left = String(label || '');
              const right = String(value || '');

              const spaces = Math.max(
                1,
                ticketWidth - left.length - right.length
              );

              add(
                left +
                ' '.repeat(spaces) +
                right
              );
            };

            const separator = () => {
              add('-'.repeat(ticketWidth));
            };

            const section = title => {
              separator();
              add(center(title));
            };

            const amountLine = (label, value) => {
              leftRight(
                label,
                euro(value)
              );
            };

            /*
             * EN-TETE
             */
            add(
              center(
                report.identity?.name ||
                report.store_name ||
                'HelloPos'
              )
            );

            if (report.identity?.line1) {
              add(
                center(report.identity.line1)
              );
            }

            if (report.identity?.line2) {
              add(
                center(report.identity.line2)
              );
            }

            if (report.identity?.city) {
              add(
                center(report.identity.city)
              );
            }

            if (report.identity?.phone) {
              add(
                center(
                  'Tel : ' +
                  report.identity.phone
                )
              );
            }

            if (report.identity?.siret) {
              add(
                center(
                  'SIRET : ' +
                  report.identity.siret
                )
              );
            }

            if (report.identity?.vat_number) {
              add(
                center(
                  'TVA : ' +
                  report.identity.vat_number
                )
              );
            }

            separator();
            add(center('FINANCIER'));
            add(center('Z'));
            separator();

            leftRight(
              'Numero de journee',
              report.journee_number ?? '-'
            );

            leftRight(
              'Ouverture',
              dateTime(report.opened_at)
            );

            leftRight(
              'Fermeture',
              dateTime(
                webData.sealed_at ||
                report.closed_at
              )
            );

            leftRight(
              'Date impression',
              dateTime(new Date())
            );

            /*
             * TOTAUX
             */
            section('TOTAUX');

            amountLine(
              'CA TOTAL',
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

            leftRight(
              'Nombre de tickets',
              number(
                report.totals?.ticket_count
              )
            );

            amountLine(
              'Ticket moyen TTC',
              report.totals?.ticket_moyen_ttc
            );

            amountLine(
              'Total reduction',
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
             * REGLEMENTS
             */
            if (
              Array.isArray(report.payments) &&
              report.payments.length
            ) {
              section('Modes de reglement');

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
              section('Reglements en compte');

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
            section("Entrees d'argent / especes");

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
              section('Donnees par vendeur');

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
              section('CA TTC familles');

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
              section('CA TTC Modes de ventes');

              report.by_mode.forEach(row => {
                amountLine(
                  row.mode,
                  row.ca_ttc
                );
              });
            }

            section('Nombre de tickets');

            leftRight(
              'Tickets normal',
              number(
                report.tickets?.normal_count
              )
            );

            amountLine(
              'Total ticket NORMAL',
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
            add('HelloPos');

            const reportText =
              lines.join('\n');

            console.log(
              '### HELLOPOS NATIVE Z TEXT READY ###',
              reportText.length
            );

            try {
              const printer =
                await getHelloPosNativePrinter();

              const nativeResult =
                await window.Capacitor
                  .Plugins
                  .HelloPosPrinter
                  .printDayReport({
                    host: printer.host,
                    port: printer.port,
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

          async function printCreditNoteNative(url) {
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

              const printer =
                await getHelloPosNativePrinter();

              const nativeResult =
                await window.Capacitor
                  .Plugins
                  .HelloPosPrinter
                  .printPdf({
                    host: printer.host,
                    port: printer.port,
                    widthDots: printer.widthDots,
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

          async function printGiftCardPdfNative(pdfUrl) {
            const nativePdfUrl = new URL(
              pdfUrl.toString(),
              window.location.origin
            );

            nativePdfUrl.searchParams.set(
              'native',
              '1'
            );

            console.log(
              '### HELLOPOS NATIVE GIFT PDF FETCH ###',
              nativePdfUrl.pathname
            );

            const pdfResponse = await originalFetch(
              nativePdfUrl.toString(),
              {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store'
              }
            );

            if (!pdfResponse.ok) {
              throw new Error(
                'GIFT_PDF_FETCH_FAILED_' +
                pdfResponse.status
              );
            }

            const buffer =
              await pdfResponse.arrayBuffer();

            const bytes =
              new Uint8Array(buffer);

            console.log(
              '### HELLOPOS NATIVE GIFT PDF OK ###',
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

            const printer =
              await getHelloPosNativePrinter();

            const nativeResult =
              await window.Capacitor
                .Plugins
                .HelloPosPrinter
                .printPdf({
                  host: printer.host,
                  port: printer.port,
                  widthDots: printer.widthDots,
                  pdfBase64
                });

            console.log(
              '### HELLOPOS NATIVE GIFT PRINT SUCCESS ###',
              JSON.stringify(nativeResult)
            );

            return nativeResult;
          }

          async function printGiftCardNative(url) {
            console.log(
              '### HELLOPOS NATIVE GIFT PRINT INTERCEPT ###',
              url.pathname
            );

            const pdfUrl = new URL(
              url.pathname.replace(/\/print$/, '/pdf'),
              window.location.origin
            );

            try {
              /*
               * IMPORTANT :
               * on n'appelle PAS la route /print serveur.
               *
               * La route /print mettrait sinon également le document
               * en file CloudPRNT sur l'imprimante enregistrée.
               */
              await printGiftCardPdfNative(pdfUrl);

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
                  error: String(error)
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

          async function printReceiptNative(url, init) {
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
              const printer =
                await getHelloPosNativePrinter();

              const nativeResult =
                await window.Capacitor.Plugins.HelloPosPrinter.printPdf({
                  host: printer.host,
                  port: printer.port,
                  widthDots: printer.widthDots,
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
                return printCreditNoteNative(url);
              }

              if (isGiftCardPrint) {
                return printGiftCardNative(url);
              }

              if (isReceiptPrint) {
                return printReceiptNative(url, init);
              }
              if (isZPrint) {
                return printZNative(url);
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

                // Conserve l'appel backend pour l'audit, mais indique
                // que l'ouverture physique sera effectuée nativement en IP.
                const nativeHeaders = new Headers(init?.headers || {});

                nativeHeaders.set(
                  'x-hellopos-native-ip',
                  '1'
                );

                const nativeInit = {
                  ...init,
                  headers: nativeHeaders
                };

                const webResponse =
                  await originalFetch(input, nativeInit);

                if (!webResponse.ok) {
                  return webResponse;
                }

                try {
                  const printer =
                    await getHelloPosNativePrinter();

                  const nativeResult =
                    await window.Capacitor.Plugins.HelloPosPrinter.openDrawer({
                      host: printer.host,
                      port: printer.port
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
}
