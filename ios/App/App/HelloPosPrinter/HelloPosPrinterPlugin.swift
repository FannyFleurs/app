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
        CAPPluginMethod(name: "printRaw", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printDayReport", returnType: CAPPluginReturnPromise),
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


    @objc func printRaw(_ call: CAPPluginCall) {
        guard let host = call.getString("host"),
              !host.isEmpty else {
            call.reject("host manquant")
            return
        }

        let portValue = call.getInt("port") ?? 9100

        guard let rawBase64 = call.getString("dataBase64"),
              let payload = Data(base64Encoded: rawBase64),
              !payload.isEmpty else {
            call.reject("donnees d'impression invalides")
            return
        }

        guard let port = NWEndpoint.Port(
            rawValue: UInt16(portValue)
        ) else {
            call.reject("port invalide")
            return
        }

        let connection = NWConnection(
            host: NWEndpoint.Host(host),
            port: port,
            using: .tcp
        )

        let queue = DispatchQueue(
            label: "fr.hellopos.printer.raw"
        )

        var finished = false

        func finish(
            _ result: Result<Void, Error>
        ) {
            guard !finished else { return }

            finished = true
            connection.cancel()

            switch result {
            case .success:
                call.resolve([
                    "printed": true,
                    "host": host,
                    "port": portValue,
                    "bytes": payload.count
                ])

            case .failure(let error):
                call.reject(
                    "Impression brute impossible : \(error.localizedDescription)"
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
            guard !finished else { return }

            finished = true
            connection.cancel()
            call.reject("timeout")
        }
    }

    @objc func printPdf(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), !host.isEmpty else {
            call.reject("host manquant")
            return
        }

        let portValue = call.getInt("port") ?? 9100
        let widthDots = call.getInt("widthDots") ?? 576
        let fitContentWidth = call.getBool("fitContentWidth") ?? false

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

        // Image de référence haute résolution permettant de détecter
        // les limites réelles du contenu du PDF.
        let probeWidth = 1400
        let probeScale = CGFloat(probeWidth) / max(pageBounds.width, 1)
        let probeHeight = max(
            1,
            Int(ceil(pageBounds.height * probeScale))
        )

        let probeThumbnail = page.thumbnail(
            of: CGSize(
                width: probeWidth,
                height: probeHeight
            ),
            for: .mediaBox
        )

        let probeFormat = UIGraphicsImageRendererFormat.default()
        probeFormat.scale = 1
        probeFormat.opaque = true

        let probeRenderer = UIGraphicsImageRenderer(
            size: CGSize(
                width: probeWidth,
                height: probeHeight
            ),
            format: probeFormat
        )

        let probeImage = probeRenderer.image { ctx in
            UIColor.white.setFill()

            ctx.fill(
                CGRect(
                    x: 0,
                    y: 0,
                    width: probeWidth,
                    height: probeHeight
                )
            )

            probeThumbnail.draw(
                in: CGRect(
                    x: 0,
                    y: 0,
                    width: probeWidth,
                    height: probeHeight
                )
            )
        }

        guard let probeCG = probeImage.cgImage,
              let probeData = probeCG.dataProvider?.data,
              let probeBytes = CFDataGetBytePtr(probeData) else {
            call.reject("Image ticket impossible")
            return
        }

        let probeBytesPerRow = probeCG.bytesPerRow
        let probeBytesPerPixel = max(
            1,
            probeCG.bitsPerPixel / 8
        )

        func probeGrayAt(x: Int, y: Int) -> UInt8 {
            let offset =
                y * probeBytesPerRow +
                x * probeBytesPerPixel

            if probeBytesPerPixel >= 3 {
                let a = Int(probeBytes[offset])
                let b = Int(probeBytes[offset + 1])
                let c = Int(probeBytes[offset + 2])

                return UInt8((a + b + c) / 3)
            }

            return probeBytes[offset]
        }

        var minInkX: Int?
        var maxInkX: Int?
        var minInkY: Int?
        var maxInkY: Int?

        for y in 0..<probeCG.height {
            for x in 0..<probeCG.width {
                if probeGrayAt(x: x, y: y) < 235 {
                    minInkX = min(minInkX ?? x, x)
                    maxInkX = max(maxInkX ?? x, x)
                    minInkY = min(minInkY ?? y, y)
                    maxInkY = max(maxInkY ?? y, y)
                }
            }
        }

        guard let firstInkX = minInkX,
              let lastInkX = maxInkX,
              let firstInkY = minInkY,
              let lastInkY = maxInkY else {
            call.reject("Ticket PDF vide")
            return
        }

        let contentProbeWidth =
            max(1, lastInkX - firstInkX + 1)

        let contentProbeHeight =
            max(1, lastInkY - firstInkY + 1)

        let horizontalPadding = 12
        let topPadding = 16
        let bottomPadding = 24

        let targetContentWidth =
            max(1, widthDots - horizontalPadding * 2)

        let contentScale: CGFloat

        if fitContentWidth {
            // Z / X : agrandit le contenu utile sur toute la largeur.
            contentScale =
                CGFloat(targetContentWidth) /
                CGFloat(contentProbeWidth)
        } else {
            // Tickets classiques : conserve leur taille actuelle.
            contentScale =
                CGFloat(widthDots) /
                CGFloat(probeCG.width)
        }

        let contentWidth = max(
            1,
            min(
                targetContentWidth,
                Int(
                    round(
                        CGFloat(contentProbeWidth) *
                        contentScale
                    )
                )
            )
        )

        let contentHeight = max(
            1,
            Int(
                round(
                    CGFloat(contentProbeHeight) *
                    contentScale
                )
            )
        )

        let heightDots =
            topPadding +
            contentHeight +
            bottomPadding

        let cropRect = CGRect(
            x: CGFloat(firstInkX),
            y: CGFloat(firstInkY),
            width: CGFloat(contentProbeWidth),
            height: CGFloat(contentProbeHeight)
        )

        guard let cropped =
            probeCG.cropping(to: cropRect) else {
            call.reject("Recadrage ticket impossible")
            return
        }

        let renderFormat =
            UIGraphicsImageRendererFormat.default()

        renderFormat.scale = 1
        renderFormat.opaque = true

        let renderer = UIGraphicsImageRenderer(
            size: CGSize(
                width: contentWidth,
                height: contentHeight
            ),
            format: renderFormat
        )

        let renderedImage = renderer.image { ctx in
            UIColor.white.setFill()

            ctx.fill(
                CGRect(
                    x: 0,
                    y: 0,
                    width: contentWidth,
                    height: contentHeight
                )
            )

            UIImage(cgImage: cropped).draw(
                in: CGRect(
                    x: 0,
                    y: 0,
                    width: contentWidth,
                    height: contentHeight
                )
            )
        }

        guard let rendered = renderedImage.cgImage,
              let providerData =
                rendered.dataProvider?.data,
              let bytes =
                CFDataGetBytePtr(providerData) else {
            call.reject("Image ticket impossible")
            return
        }

        let sourceWidth = rendered.width
        let sourceHeight = rendered.height
        let sourceBytesPerRow = rendered.bytesPerRow
        let bytesPerPixel =
            max(1, rendered.bitsPerPixel / 8)

        func grayAt(x: Int, y: Int) -> UInt8 {
            let offset =
                y * sourceBytesPerRow +
                x * bytesPerPixel

            if bytesPerPixel >= 3 {
                let a = Int(bytes[offset])
                let b = Int(bytes[offset + 1])
                let c = Int(bytes[offset + 2])

                return UInt8((a + b + c) / 3)
            }

            return bytes[offset]
        }

        let bytesPerRow = (widthDots + 7) / 8

        var raster =
            Data(count: bytesPerRow * heightDots)

        raster.withUnsafeMutableBytes { rawBuffer in
            guard let out = rawBuffer
                .bindMemory(to: UInt8.self)
                .baseAddress else {
                return
            }

            let leftOffset =
                max(0, (widthDots - sourceWidth) / 2)

            for y in 0..<sourceHeight {
                let outputY = topPadding + y

                for x in 0..<min(
                    sourceWidth,
                    widthDots - leftOffset
                ) {
                    let gray = grayAt(x: x, y: y)

                    if gray < 180 {
                        let outputX =
                            leftOffset + x

                        let byteIndex =
                            outputY * bytesPerRow +
                            (outputX / 8)

                        out[byteIndex] |=
                            UInt8(
                                0x80 >>
                                (outputX % 8)
                            )
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


    @objc func printDayReport(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), !host.isEmpty else {
            call.reject("host manquant")
            return
        }

        let portValue = call.getInt("port") ?? 9100

        guard let text = call.getString("text"), !text.isEmpty else {
            call.reject("rapport vide")
            return
        }

        guard let port = NWEndpoint.Port(rawValue: UInt16(portValue)) else {
            call.reject("port invalide")
            return
        }

        let widthDots = 576

        // Rouleau 80 mm : on exploite pratiquement toute
        // la largeur imprimable de 576 dots.
        let horizontalPadding: CGFloat = 4
        let topPadding: CGFloat = 12
        let bottomPadding: CGFloat = 20

        let availableWidth =
            CGFloat(widthDots) - horizontalPadding * 2

        /*
         * Le ticket Z est construit sur 42 colonnes.
         *
         * On calcule automatiquement la plus grande police
         * monospace possible pour que les 42 caractères
         * tiennent exactement dans la largeur imprimable.
         *
         * Cela évite :
         * - une police arbitrairement petite ;
         * - les retours à la ligne avec une police trop grande ;
         * - les tickets n'utilisant qu'une partie des 80 mm.
         */
        let targetColumns: CGFloat = 42
        let preferredFontSize: CGFloat = 22

        let probeFont = UIFont.monospacedSystemFont(
            ofSize: preferredFontSize,
            weight: .regular
        )

        let probeCharacterWidth =
            ("0" as NSString).size(
                withAttributes: [
                    .font: probeFont
                ]
            ).width

        let fittedFontSize =
            preferredFontSize *
            (
                availableWidth /
                (probeCharacterWidth * targetColumns)
            )

        let fontSize =
            min(
                preferredFontSize,
                fittedFontSize
            )

        let font = UIFont.monospacedSystemFont(
            ofSize: fontSize,
            weight: .regular
        )

        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byWordWrapping
        paragraph.alignment = .left
        paragraph.lineSpacing = 0
        paragraph.paragraphSpacing = 0

        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: UIColor.black,
            .paragraphStyle: paragraph
        ]

        let bounding = (text as NSString).boundingRect(
            with: CGSize(
                width: availableWidth,
                height: .greatestFiniteMagnitude
            ),
            options: [
                .usesLineFragmentOrigin,
                .usesFontLeading
            ],
            attributes: attributes,
            context: nil
        )

        let contentHeight =
            max(1, Int(ceil(bounding.height)))

        let heightDots =
            Int(topPadding) +
            contentHeight +
            Int(bottomPadding)

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true

        let renderer = UIGraphicsImageRenderer(
            size: CGSize(
                width: widthDots,
                height: heightDots
            ),
            format: format
        )

        let image = renderer.image { ctx in
            UIColor.white.setFill()

            ctx.fill(
                CGRect(
                    x: 0,
                    y: 0,
                    width: widthDots,
                    height: heightDots
                )
            )

            (text as NSString).draw(
                with: CGRect(
                    x: horizontalPadding,
                    y: topPadding,
                    width: availableWidth,
                    height: CGFloat(contentHeight)
                ),
                options: [
                    .usesLineFragmentOrigin,
                    .usesFontLeading
                ],
                attributes: attributes,
                context: nil
            )
        }

        guard let cgImage = image.cgImage,
              let providerData = cgImage.dataProvider?.data,
              let bytes = CFDataGetBytePtr(providerData) else {
            call.reject("Rendu rapport impossible")
            return
        }

        let sourceBytesPerRow = cgImage.bytesPerRow
        let bytesPerPixel =
            max(1, cgImage.bitsPerPixel / 8)

        let rasterBytesPerRow =
            (widthDots + 7) / 8

        var raster =
            Data(count: rasterBytesPerRow * heightDots)

        func grayAt(x: Int, y: Int) -> UInt8 {
            let offset =
                y * sourceBytesPerRow +
                x * bytesPerPixel

            if bytesPerPixel >= 3 {
                let a = Int(bytes[offset])
                let b = Int(bytes[offset + 1])
                let c = Int(bytes[offset + 2])

                return UInt8((a + b + c) / 3)
            }

            return bytes[offset]
        }

        raster.withUnsafeMutableBytes { rawBuffer in
            guard let out = rawBuffer
                .bindMemory(to: UInt8.self)
                .baseAddress else {
                return
            }

            for y in 0..<heightDots {
                for x in 0..<widthDots {
                    if grayAt(x: x, y: y) < 180 {
                        let byteIndex =
                            y * rasterBytesPerRow +
                            (x / 8)

                        out[byteIndex] |=
                            UInt8(0x80 >> (x % 8))
                    }
                }
            }
        }

        var payload = Data()

        payload.append(contentsOf: [0x1B, 0x40])

        payload.append(contentsOf: [
            0x1D, 0x76, 0x30, 0x00,
            UInt8(rasterBytesPerRow & 0xFF),
            UInt8((rasterBytesPerRow >> 8) & 0xFF),
            UInt8(heightDots & 0xFF),
            UInt8((heightDots >> 8) & 0xFF)
        ])

        payload.append(raster)

        payload.append(
            contentsOf: [0x1B, 0x64, 0x0A]
        )

        payload.append(
            contentsOf: [0x1D, 0x56, 0x00]
        )

        let connection = NWConnection(
            host: NWEndpoint.Host(host),
            port: port,
            using: .tcp
        )

        let queue =
            DispatchQueue(
                label: "fr.hellopos.printer.dayreport"
            )

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
                    "Impression Z impossible : \(error.localizedDescription)"
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

}
