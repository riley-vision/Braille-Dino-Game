// Types text the way VoiceOver delivers braille keys, for the VoiceOver
// drivers. Development only.
//
//   swiftc dev/ax-type.swift -o ax-type
//   ./ax-type " "            a key press carrying the text (as in the
//                            player's logs: key code 0 with a Unicode string;
//                            a space uses the space bar's key code)
//   ./ax-type " " --ax       insert it through the accessibility system
import AppKit
import ApplicationServices

let text = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : " "
let viaAX = CommandLine.arguments.contains("--ax")

if !viaAX {
  for ch in text {
    let s = String(ch)
    let code: CGKeyCode = s == " " ? 49 : 0
    for down in [true, false] {
      guard let e = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down) else { exit(1) }
      let units = Array(s.utf16)
      e.keyboardSetUnicodeString(stringLength: units.count, unicodeString: units)
      e.post(tap: .cghidEventTap)
      usleep(20_000)
    }
  }
  print("typed \(text.debugDescription) as key presses")
  exit(0)
}

guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.Safari").first else {
  print("Safari is not running")
  exit(1)
}
var focused: CFTypeRef?
let found = AXUIElementCopyAttributeValue(AXUIElementCreateApplication(app.processIdentifier), kAXFocusedUIElementAttribute as CFString, &focused)
guard found == .success, let element = focused else {
  print("no focused element (\(found.rawValue))")
  exit(1)
}
let result = AXUIElementSetAttributeValue(element as! AXUIElement, kAXSelectedTextAttribute as CFString, text as CFString)
print("inserted through accessibility: \(result == .success ? "yes" : "error \(result.rawValue)")")
