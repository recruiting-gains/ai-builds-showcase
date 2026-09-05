#!/bin/bash
# Build a local experimental app. This script never launches it or grants access.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
native_dir="$(cd -- "$script_dir/.." && pwd -P)"
dist_dir="$native_dir/dist"
app_name="Airframe Mac.app"
app_path="$dist_dir/$app_name"
zip_path="$dist_dir/Airframe-Mac-apple-silicon.zip"
lock_dir="$dist_dir/.airframe-package.lock"

fail() { printf '%s\n' "$1" >&2; exit 1; }

[[ "$(uname -s)" == 'Darwin' ]] || fail 'Airframe Mac requires macOS and the Apple SDKs.'
macos_version="$(sw_vers -productVersion)"
[[ "${macos_version%%.*}" -ge 14 ]] || fail 'Build on macOS 14 or later.'
xcrun --find swift >/dev/null || fail 'Install Xcode or Apple Command Line Tools before building.'
for tool in /usr/bin/codesign /usr/bin/plutil /usr/bin/ditto /usr/bin/lipo; do
  [[ -x "$tool" ]] || fail "Required Apple tool not found: $tool"
done
/usr/bin/plutil -lint "$native_dir/Info.plist" "$native_dir/entitlements.plist"

[[ ! -L "$dist_dir" ]] || fail 'Refusing to publish build artifacts through a dist symlink.'
mkdir -p "$dist_dir"
[[ ! -L "$app_path" && ! -L "$zip_path" ]] || fail 'Refusing to replace a symlink at a build output path.'
if [[ -e "$app_path" || -e "$zip_path" ]]; then
  [[ -d "$app_path" ]] || fail 'An unrecognized output exists. It was not changed; move it aside before building.'
  existing_id="$(/usr/bin/plutil -extract CFBundleIdentifier raw "$app_path/Contents/Info.plist" 2>/dev/null || true)"
  existing_marker="$(/usr/bin/plutil -extract AirframeBuildManagedArtifact raw "$app_path/Contents/Info.plist" 2>/dev/null || true)"
  [[ "$existing_id" == 'io.thenfold.airframe.mac' && "$existing_marker" == 'airframe-native-build-v1' ]] || fail 'An unrecognized app exists in dist. It was not changed; move it aside before building.'
fi
mkdir "$lock_dir" 2>/dev/null || fail 'Another packaging run may be active. Existing artifacts were not changed.'
trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT

printf '%s\n' 'Running the deterministic core harness. No application, camera, or operating-system input is launched.'
# Apple Command Line Tools can build the app but may not contain XCTest.
# The dependency-free checks run locally; CI also runs XCTest using full Xcode.
xcrun swift run --package-path "$native_dir" AirframeChecks
printf '%s\n' 'Building the Apple silicon release executable.'
xcrun swift build --package-path "$native_dir" --configuration release --arch arm64 --product AirframeMac
binary_dir="$(xcrun swift build --package-path "$native_dir" --configuration release --arch arm64 --show-bin-path)"
binary_path="$binary_dir/AirframeMac"
[[ -x "$binary_path" ]] || fail 'The expected AirframeMac executable was not produced.'
[[ "$(/usr/bin/lipo -archs "$binary_path")" == 'arm64' ]] || fail 'The executable must contain only the expected arm64 architecture.'

stage_dir="$(mktemp -d "$dist_dir/.airframe-stage.XXXXXX")"
stage_app="$stage_dir/$app_name"
stage_zip="$stage_dir/Airframe-Mac-apple-silicon.zip"
mkdir -p "$stage_app/Contents/MacOS" "$stage_app/Contents/Resources/docs"
/usr/bin/ditto "$binary_path" "$stage_app/Contents/MacOS/AirframeMac"
/usr/bin/ditto "$native_dir/Info.plist" "$stage_app/Contents/Info.plist"
/usr/bin/ditto "$native_dir/README.md" "$stage_app/Contents/Resources/README.md"
/usr/bin/ditto "$native_dir/docs/SAFETY.md" "$stage_app/Contents/Resources/SAFETY.md"
/usr/bin/ditto "$native_dir/docs/SAFETY.md" "$stage_app/Contents/Resources/docs/SAFETY.md"
/usr/bin/ditto "$native_dir/docs/RELEASE-0.1.1.md" "$stage_app/Contents/Resources/docs/RELEASE-0.1.1.md"

# '-' is an ad-hoc local signature. It is not a Developer ID certificate and
# does not notarize the app. Do not add hardened runtime without camera QA.
/usr/bin/codesign --force --sign - --timestamp=none --entitlements "$native_dir/entitlements.plist" "$stage_app"
/usr/bin/codesign --verify --strict --verbose=2 "$stage_app"
/usr/bin/codesign --display --verbose=2 "$stage_app"
/usr/bin/plutil -lint "$stage_app/Contents/Info.plist"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$stage_app" "$stage_zip"

# Only bundles bearing this build system's identifier and marker may be moved.
# Existing generated artifacts are preserved, never deleted or overwritten.
if [[ -e "$app_path" || -e "$zip_path" ]]; then
  archive_dir="$(mktemp -d "$dist_dir/archive-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
  [[ ! -e "$app_path" ]] || mv "$app_path" "$archive_dir/$app_name"
  [[ ! -e "$zip_path" ]] || mv "$zip_path" "$archive_dir/Airframe-Mac-apple-silicon.zip"
  printf 'Previous generated build preserved at: %s\n' "$archive_dir"
fi
mv "$stage_app" "$app_path"
mv "$stage_zip" "$zip_path"
rmdir "$stage_dir"

printf '\nApp: %s\nZIP: %s\n' "$app_path" "$zip_path"
printf '%s\n' 'LOCAL EXPERIMENTAL BUILD: ad-hoc signed; NOT Developer ID signed; NOT notarized.'
printf '%s\n' 'Nothing was installed or launched. No permissions, quarantine attributes, or Gatekeeper settings were changed.'
