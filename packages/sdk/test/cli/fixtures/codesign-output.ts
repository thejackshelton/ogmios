/**
 * `codesign -dvvv <path>` prints its detail to STDERR (not stdout) on macOS.
 * These fixtures mirror the exact format — spacing and ordering matter.
 */

export const CODESIGN_DEVELOPER_ID = `Executable=/path/to/OgmiosRunner.app/Contents/MacOS/OgmiosRunner
Identifier=org.ogmios.runner
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20400 size=1024 flags=0x10000(runtime) hashes=28+7 location=embedded
Hash type=sha256 size=32
CandidateCDHash sha256=1234567890abcdef
CandidateCDHashFull sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
Hash choices=sha256
CMSDigest=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
CMSDigestType=2
CDHash=1234567890abcdef1234567890abcdef12345678
Signature size=9000
Authority=Developer ID Application: Jack Shelton (TEAMIDXYZ)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
Timestamp=May 1, 2026 at 12:00:00 PM
Info.plist entries=20
TeamIdentifier=TEAMIDXYZ
Runtime Version=15.0.0
Sealed Resources version=2 rules=13 files=5
Internal requirements count=1 size=196
`;

export const CODESIGN_ADHOC = `Executable=/path/to/OgmiosRunner.app/Contents/MacOS/OgmiosRunner
Identifier=org.ogmios.runner
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20400 size=512 flags=0x2(adhoc) hashes=16+7 location=embedded
Hash type=sha256 size=32
CDHash=abcdef1234567890abcdef1234567890abcdef12
Signature=adhoc
Info.plist entries=20
TeamIdentifier=not set
Sealed Resources version=2 rules=13 files=5
Internal requirements count=0 size=12
`;

export const CODESIGN_UNSIGNED_ERROR = `Executable=/path/to/OgmiosRunner.app/Contents/MacOS/OgmiosRunner
/path/to/OgmiosRunner.app/Contents/MacOS/OgmiosRunner: code object is not signed at all
`;
