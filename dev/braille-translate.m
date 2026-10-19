// Runs one of VoiceOver's own braille translators on text, the way VoiceOver
// turns what is on screen into cells. Development only; it loads private
// macOS frameworks, so it may break with a new macOS.
//
//   clang -fobjc-arc -framework Foundation dev/braille-translate.m -o dev/braille-translate
//   dev/braille-translate system eng-xueb_g2 "text" ...      (or: liblouis eng-xueb_g1 ...)
//
// Prints one line of Unicode braille per text. Tables (macOS 27): eng-xueb_g1
// and eng-xueb_g2 are English (Unified), uncontracted and contracted;
// eng-8dot is eight-dot computer braille. "system" is the Duxbury translator
// VoiceOver uses by default; "liblouis" is the Liblouis one.
#import <Foundation/Foundation.h>
#import <objc/message.h>

int main(int argc, char **argv) {
  @autoreleasepool {
    if (argc < 3) {
      fprintf(stderr, "usage: braille-translate system|liblouis TABLE TEXT...\n");
      return 2;
    }
    [[NSBundle bundleWithPath:@"/System/Library/PrivateFrameworks/ScreenReader.framework/Versions/A/Frameworks/BrailleTranslation.framework"] load];
    NSString *path = strcmp(argv[1], "liblouis") == 0
      ? @"/System/Library/ScreenReader/BrailleTables/LiblouisBrailleTranslator.brailletable"
      : @"/System/Library/ScreenReader/BrailleTables/Duxbury.brailletable";
    NSBundle *bundle = [NSBundle bundleWithPath:path];
    if (![bundle load]) {
      fprintf(stderr, "cannot load %s\n", path.UTF8String);
      return 1;
    }
    id translator = [[bundle.principalClass alloc] init];
    ((void (*)(id, SEL, id))objc_msgSend)(translator, sel_registerName("setActiveTable:"), [NSString stringWithUTF8String:argv[2]]);
    SEL print = sel_registerName("printBrailleForText:mode:locations:textPositionsRange:textFormattingRanges:");
    for (int i = 3; i < argc; i++) {
      id locations = nil;
      NSString *out = ((id (*)(id, SEL, id, unsigned long long, id *, NSRange, id))objc_msgSend)(
        translator, print, [NSString stringWithUTF8String:argv[i]], 0, &locations, NSMakeRange(NSNotFound, 0), nil);
      printf("%s\n", out ? out.UTF8String : "");
    }
  }
}
