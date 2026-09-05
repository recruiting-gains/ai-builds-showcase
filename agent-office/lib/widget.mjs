// Display-only input; it never changes task scope or authorizes a connection.
export function wantsWidget(search, nativeView) {
  if (nativeView === 'widget' || nativeView === 'full') return nativeView === 'widget';
  return new URLSearchParams(search).get('view') === 'widget';
}
export function widgetStatus(mode, connected, stale, hasFloor) {
  if (mode === 'demo') return 'Demo · sample activity';
  if (!connected) return 'Local · disconnected';
  if (stale) return 'Local · no recent signal';
  return hasFloor ? 'Local activity' : 'Local · waiting for a project';
}
