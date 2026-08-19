import Foundation
import Capacitor
import Network

@objc(HelloPosPrinterPlugin)
public class HelloPosPrinterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HelloPosPrinterPlugin"
    public let jsName = "HelloPosPrinter"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "testConnection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printTest", returnType: CAPPluginReturnPromise)
    ]

    @objc func testConnection(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), !host.isEmpty else {
            call.reject("host manquant")
            return
        }

        let portValue = call.getInt("port") ?? 9100

        guard let port = NWEndpoint.Port(rawValue: UInt16(portValue)) else {
            call.reject("port invalide")
            return
        }

        let connection = NWConnection(
            host: NWEndpoint.Host(host),
            port: port,
            using: .tcp
        )

        let queue = DispatchQueue(label: "fr.hellopos.printer")
        var finished = false

        func finish(_ result: Result<Void, Error>) {
            guard !finished else { return }
            finished = true
            connection.cancel()

            switch result {
            case .success:
                call.resolve([
                    "connected": true,
                    "host": host,
                    "port": portValue
                ])

            case .failure(let error):
                call.resolve([
                    "connected": false,
                    "host": host,
                    "port": portValue,
                    "error": error.localizedDescription
                ])
            }
        }

        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                finish(.success(()))

            case .failed(let error):
                finish(.failure(error))

            default:
                break
            }
        }

        connection.start(queue: queue)

        queue.asyncAfter(deadline: .now() + 4) {
            if !finished {
                finished = true
                connection.cancel()

                call.resolve([
                    "connected": false,
                    "host": host,
                    "port": portValue,
                    "error": "timeout"
                ])
            }
        }
    }

    @objc func printTest(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), !host.isEmpty else {
            call.reject("host manquant")
            return
        }

        let portValue = call.getInt("port") ?? 9100

        guard let port = NWEndpoint.Port(rawValue: UInt16(portValue)) else {
            call.reject("port invalide")
            return
        }

        let connection = NWConnection(
            host: NWEndpoint.Host(host),
            port: port,
            using: .tcp
        )

        let queue = DispatchQueue(label: "fr.hellopos.printer.print")
        var finished = false

        func finish(_ result: Result<Void, Error>) {
            guard !finished else { return }
            finished = true
            connection.cancel()

            switch result {
            case .success:
                call.resolve([
                    "printed": true,
                    "host": host,
                    "port": portValue
                ])

            case .failure(let error):
                call.reject("Impression impossible : \(error.localizedDescription)")
            }
        }

        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                var data = Data()

                // Initialisation ESC/POS
                data.append(contentsOf: [0x1B, 0x40])

                // Centré
                data.append(contentsOf: [0x1B, 0x61, 0x01])

                let text = """
                HELLOPOS
                Test impression native
                19/08/2026


                """

                if let textData = text.data(using: .utf8) {
                    data.append(textData)
                }

                // Avance papier avant coupe : ESC d n
                // 5 lignes pour dégager correctement le ticket.
                data.append(contentsOf: [0x1B, 0x64, 0x05])

                // Coupe complète ESC/POS
                data.append(contentsOf: [0x1D, 0x56, 0x00])

                connection.send(
                    content: data,
                    completion: .contentProcessed { error in
                        if let error {
                            finish(.failure(error))
                        } else {
                            finish(.success(()))
                        }
                    }
                )

            case .failed(let error):
                finish(.failure(error))

            default:
                break
            }
        }

        connection.start(queue: queue)

        queue.asyncAfter(deadline: .now() + 5) {
            if !finished {
                finished = true
                connection.cancel()
                call.reject("timeout")
            }
        }
    }
}
