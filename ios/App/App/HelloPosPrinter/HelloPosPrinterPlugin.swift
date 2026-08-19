import Foundation
import Capacitor
import Network
import PDFKit
import UIKit

@objc(HelloPosPrinterPlugin)
public class HelloPosPrinterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HelloPosPrinterPlugin"
    public let jsName = "HelloPosPrinter"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "testConnection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printPdf", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openDrawer", returnType: CAPPluginReturnPromise)
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

    @objc func printPdf(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), !host.isEmpty else {
            call.reject("host manquant")
            return
        }

        let portValue = call.getInt("port") ?? 9100
        let widthDots = call.getInt("widthDots") ?? 576

        guard let base64 = call.getString("pdfBase64"),
              let pdfData = Data(base64Encoded: base64),
              let document = PDFDocument(data: pdfData),
              let page = document.page(at: 0) else {
            call.reject("PDF invalide")
            return
        }

        guard let port = NWEndpoint.Port(rawValue: UInt16(portValue)) else {
            call.reject("port invalide")
            return
        }

        let pageBounds = page.bounds(for: .mediaBox)

        // PDFKit produit lui-même une image correctement orientée.
        // On conserve strictement le ratio du ticket.
        let targetWidth = CGFloat(widthDots)
        let targetHeight = max(
            1,
            ceil(targetWidth * pageBounds.height / max(pageBounds.width, 1))
        )

        let thumbnail = page.thumbnail(
            of: CGSize(
                width: targetWidth,
                height: targetHeight
            ),
            for: .mediaBox
        )

        let renderFormat = UIGraphicsImageRendererFormat.default()
        renderFormat.scale = 1
        renderFormat.opaque = true

        let renderer = UIGraphicsImageRenderer(
            size: CGSize(
                width: targetWidth,
                height: targetHeight
            ),
            format: renderFormat
        )

        let renderedImage = renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(
                CGRect(
                    x: 0,
                    y: 0,
                    width: targetWidth,
                    height: targetHeight
                )
            )

            thumbnail.draw(
                in: CGRect(
                    x: 0,
                    y: 0,
                    width: targetWidth,
                    height: targetHeight
                )
            )
        }

        guard let rendered = renderedImage.cgImage,
              let providerData = rendered.dataProvider?.data,
              let bytes = CFDataGetBytePtr(providerData) else {
            call.reject("Image ticket impossible")
            return
        }

        let sourceWidth = rendered.width
        let sourceHeight = rendered.height
        let sourceBytesPerRow = rendered.bytesPerRow
        let bytesPerPixel = max(1, rendered.bitsPerPixel / 8)

        func grayAt(x: Int, y: Int) -> UInt8 {
            let offset = y * sourceBytesPerRow + x * bytesPerPixel

            if bytesPerPixel >= 3 {
                let a = Int(bytes[offset])
                let b = Int(bytes[offset + 1])
                let c = Int(bytes[offset + 2])
                return UInt8((a + b + c) / 3)
            }

            return bytes[offset]
        }

        // Cherche uniquement la zone verticale contenant réellement
        // de l'encre. Cela supprime les grandes zones blanches du PDF.
        var firstInkRow: Int?
        var lastInkRow: Int?

        for y in 0..<sourceHeight {
            var rowHasInk = false

            for x in 0..<sourceWidth {
                if grayAt(x: x, y: y) < 235 {
                    rowHasInk = true
                    break
                }
            }

            if rowHasInk {
                if firstInkRow == nil {
                    firstInkRow = y
                }
                lastInkRow = y
            }
        }

        guard let firstInk = firstInkRow,
              let lastInk = lastInkRow else {
            call.reject("Ticket PDF vide")
            return
        }

        // Petite marge thermique avant/après le contenu.
        let topPadding = 16
        let bottomPadding = 24

        let contentHeight = lastInk - firstInk + 1
        let heightDots = topPadding + contentHeight + bottomPadding

        let bytesPerRow = (widthDots + 7) / 8
        var raster = Data(count: bytesPerRow * heightDots)

        raster.withUnsafeMutableBytes { rawBuffer in
            guard let out = rawBuffer
                .bindMemory(to: UInt8.self)
                .baseAddress else {
                return
            }

            for outputY in 0..<heightDots {
                let contentY = outputY - topPadding

                // Marges haut/bas : on laisse les octets à zéro.
                if contentY < 0 || contentY >= contentHeight {
                    continue
                }

                let sourceY = firstInk + contentY

                for x in 0..<min(widthDots, sourceWidth) {
                    let gray = grayAt(x: x, y: sourceY)

                    if gray < 180 {
                        let byteIndex =
                            outputY * bytesPerRow + (x / 8)

                        out[byteIndex] |=
                            UInt8(0x80 >> (x % 8))
                    }
                }
            }
        }

        var payload = Data()

        // Initialisation ESC/POS
        payload.append(contentsOf: [0x1B, 0x40])

        // Raster GS v 0
        payload.append(contentsOf: [
            0x1D, 0x76, 0x30, 0x00,
            UInt8(bytesPerRow & 0xFF),
            UInt8((bytesPerRow >> 8) & 0xFF),
            UInt8(heightDots & 0xFF),
            UInt8((heightDots >> 8) & 0xFF)
        ])

        payload.append(raster)

        // Avance + coupe
        payload.append(contentsOf: [0x1B, 0x64, 0x0A])
        payload.append(contentsOf: [0x1D, 0x56, 0x00])

        let connection = NWConnection(
            host: NWEndpoint.Host(host),
            port: port,
            using: .tcp
        )

        let queue = DispatchQueue(label: "fr.hellopos.printer.pdf")
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
                call.reject(
                    "Impression impossible : \(error.localizedDescription)"
                )
            }
        }

        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                connection.send(
                    content: payload,
                    completion: .contentProcessed { error in
                        if let error = error {
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

        queue.asyncAfter(deadline: .now() + 10) {
            if !finished {
                finished = true
                connection.cancel()
                call.reject("timeout")
            }
        }
    }


    @objc func openDrawer(_ call: CAPPluginCall) {
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

        let queue = DispatchQueue(label: "fr.hellopos.printer.drawer")
        var finished = false

        func finish(_ result: Result<Void, Error>) {
            guard !finished else { return }
            finished = true
            connection.cancel()

            switch result {
            case .success:
                call.resolve([
                    "opened": true,
                    "host": host,
                    "port": portValue
                ])

            case .failure(let error):
                call.reject(
                    "Ouverture tiroir impossible : \(error.localizedDescription)"
                )
            }
        }

        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                // ESC p : impulsion tiroir standard ESC/POS.
                let payload = Data([
                    0x1B, 0x70, 0x00, 0x19, 0xFA
                ])

                connection.send(
                    content: payload,
                    completion: .contentProcessed { error in
                        if let error = error {
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
