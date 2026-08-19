import Foundation
import Capacitor
import Network

@objc(HelloPosPrinterPlugin)
public class HelloPosPrinterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HelloPosPrinterPlugin"
    public let jsName = "HelloPosPrinter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "testConnection", returnType: CAPPluginReturnPromise)
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

            case .cancelled:
                if !finished {
                    call.resolve([
                        "connected": false,
                        "host": host,
                        "port": portValue,
                        "error": "connexion annulée"
                    ])
                    finished = true
                }

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
}
