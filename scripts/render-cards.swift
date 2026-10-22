// Renders poster / backdrop / title-card PNGs for the mock library.
// Usage: swift render-cards.swift specs.json
// specs.json: [{ "out": "...png", "w": 400, "h": 600, "title": "...", "subtitle": "...", "hue": 0.6 }]
import AppKit
import Foundation

struct Spec: Decodable {
    let out: String
    let w: Int
    let h: Int
    let title: String
    let subtitle: String
    let hue: Double
}

let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let specs = try JSONDecoder().decode([Spec].self, from: data)

for spec in specs {
    let size = NSSize(width: spec.w, height: spec.h)
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: spec.w, pixelsHigh: spec.h,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    ) else { continue }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    let top = NSColor(hue: CGFloat(spec.hue), saturation: 0.75, brightness: 0.55, alpha: 1)
    let bottom = NSColor(hue: CGFloat(fmod(spec.hue + 0.08, 1)), saturation: 0.9, brightness: 0.12, alpha: 1)
    NSGradient(starting: top, ending: bottom)?.draw(in: NSRect(origin: .zero, size: size), angle: -90)

    // A few soft circles so posters don't look flat.
    for i in 0..<3 {
        let r = CGFloat(spec.w) * CGFloat(0.35 + 0.15 * Double(i))
        let cx = CGFloat(spec.w) * CGFloat([0.15, 0.85, 0.5][i])
        let cy = CGFloat(spec.h) * CGFloat([0.8, 0.55, 0.15][i])
        NSColor(white: 1, alpha: 0.05).setFill()
        NSBezierPath(ovalIn: NSRect(x: cx - r / 2, y: cy - r / 2, width: r, height: r)).fill()
    }

    let para = NSMutableParagraphStyle()
    para.alignment = .center
    para.lineBreakMode = .byWordWrapping

    let base = CGFloat(min(spec.w, spec.h))
    let titleAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: base * 0.11, weight: .heavy),
        .foregroundColor: NSColor.white,
        .paragraphStyle: para,
    ]
    let subAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: base * 0.05, weight: .medium),
        .foregroundColor: NSColor(white: 1, alpha: 0.8),
        .paragraphStyle: para,
    ]

    let inset = CGFloat(spec.w) * 0.08
    let width = CGFloat(spec.w) - inset * 2
    let titleRect = NSAttributedString(string: spec.title, attributes: titleAttrs)
        .boundingRect(with: NSSize(width: width, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin])
    let titleY = CGFloat(spec.h) * 0.45
    spec.title.draw(with: NSRect(x: inset, y: titleY, width: width, height: titleRect.height),
                    options: [.usesLineFragmentOrigin], attributes: titleAttrs)
    spec.subtitle.draw(with: NSRect(x: inset, y: titleY - base * 0.1, width: width, height: base * 0.08),
                       options: [.usesLineFragmentOrigin], attributes: subAttrs)

    NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: spec.out))
}
print("rendered \(specs.count) images")
