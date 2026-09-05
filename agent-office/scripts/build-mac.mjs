import { mkdir, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd(),
  app = resolve(root, 'native/build/Agent Office.app'),
  contents = resolve(app, 'Contents');
await mkdir(resolve(contents, 'MacOS'), { recursive: true });
await mkdir(resolve(contents, 'Resources'), { recursive: true });
await cp(resolve(root, 'bridge'), resolve(contents, 'Resources/bridge'), {
  recursive: true,
});
await cp(resolve(root, 'dist/client'), resolve(contents, 'Resources/site'), {
  recursive: true,
});
await writeFile(
  resolve(contents, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleName</key><string>Agent Office</string><key>CFBundleDisplayName</key><string>Agent Office</string><key>CFBundleIdentifier</key><string>io.recruiting-gains.agent-office</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>CFBundleExecutable</key><string>AgentOffice</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>LSUIElement</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict><key>NSHighResolutionCapable</key><true/></dict></plist>`,
);
for (const [cmd, args] of [
  [
    'swiftc',
    [
      '-parse-as-library',
      '-swift-version',
      '5',
      '-O',
      '-framework',
      'AppKit',
      '-framework',
      'WebKit',
      resolve(root, 'native/AgentOffice.swift'),
      '-o',
      resolve(contents, 'MacOS/AgentOffice'),
    ],
  ],
  ['codesign', ['--force', '--deep', '--sign', '-', app]],
]) {
  const out = spawnSync(cmd, args, { stdio: 'inherit' });
  if (out.status !== 0) process.exit(out.status ?? 1);
}
console.log('Built local, ad-hoc signed Agent Office.app (not notarized).');
