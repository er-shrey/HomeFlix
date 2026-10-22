// Renders HomeFlix's Android launcher icons, TV banner and splash screens.
// Usage: swift render-app-icons.swift specs.json
// specs.json: [{ "out": "...png", "w": 192, "h": 192, "kind": "icon" | "round" | "foreground" | "banner" | "splash" }]
import AppKit
import Foundation

struct Spec: Decodable {
    let out: String
    let w: Int
    let h: Int
    let kind: String
}

let red = NSColor(red: 229 / 255, green: 9 / 255, blue: 20 / 255, alpha: 1)
let dark = NSColor(red: 20 / 255, green: 20 / 255, blue: 20 / 255, alpha: 1)

func drawText(_ text: String, size: CGFloat, in rect: NSRect) {
    let para = NSMutableParagraphStyle()
    para.alignment = .center
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: size, weight: .black),
        .foregroundColor: red,
        .paragraphStyle: para,
        .kern: size * 0.02,
    ]
    let str = NSAttributedString(string: text, attributes: attrs)
    let bounds = str.boundingRect(with: rect.size, options: [.usesLineFragmentOrigin])
    str.draw(in: NSRect(x: rect.minX, y: rect.midY - bounds.height / 2, width: rect.width, height: bounds.height))
}

let specs = try JSONDecoder().decode([Spec].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
for spec in specs {
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: spec.w, pixelsHigh: spec.h, bitsPerSample: 8, samplesPerPixel: 4,
        hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    ) else { continue }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let full = NSRect(x: 0, y: 0, width: spec.w, height: spec.h)
    let s = CGFloat(min(spec.w, spec.h))

    switch spec.kind {
    case "icon":
        dark.setFill()
        NSBezierPath(roundedRect: full, xRadius: s * 0.18, yRadius: s * 0.18).fill()
        drawText("F", size: s * 0.72, in: full)
    case "round":
        dark.setFill()
        NSBezierPath(ovalIn: full).fill()
        drawText("F", size: s * 0.66, in: full)
    case "foreground":
        // Adaptive icon foreground: keep the letter inside the central safe zone.
        drawText("F", size: s * 0.46, in: full)
    case "banner":
        dark.setFill()
        full.fill()
        drawText("HOMEFLIX", size: CGFloat(spec.h) * 0.22, in: full.insetBy(dx: CGFloat(spec.w) * 0.06, dy: 0))
    default: // splash
        dark.setFill()
        full.fill()
        drawText("HOMEFLIX", size: s * 0.12, in: full.insetBy(dx: CGFloat(spec.w) * 0.1, dy: 0))
    }
    NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: spec.out))
}
print("rendered \(specs.count) images")
