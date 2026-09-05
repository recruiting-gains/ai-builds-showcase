import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { wantsWidget, widgetStatus } from '../lib/widget.mjs';
test('widget mode accepts only the display enum and preserves full view',()=>{
  assert.equal(wantsWidget('?view=widget'),true);
  assert.equal(wantsWidget('?view=widget','full'),false);
  assert.equal(wantsWidget('','widget'),true);
  for(const value of ['', '?view=anything', '?widget=1'])assert.equal(wantsWidget(value),false);
});
test('native widget retains one observer, hides on close and restricts navigation',async()=>{
  const source=await readFile(new URL('../native/AgentOffice.swift',import.meta.url),'utf8');
  assert.equal((source.match(/WKWebView\(frame:/g)||[]).length,1);
  assert.equal((source.match(/let child = Process\(\)/g)||[]).length,1);
  assert.ok(source.includes('.nonactivatingPanel'));
  assert.ok(source.includes('widget.hidesOnDeactivate = false'));
  assert.ok(source.includes('visible.maxX - frame.width - margin'));
  assert.ok(source.includes('visible.maxY - frame.height - margin'));
  assert.ok(source.includes('sender.orderOut(nil);return false'));
  assert.ok(source.includes('url.port == initialURL?.port'));
  assert.ok(source.includes('URLComponents(url: url'));
  assert.ok(!source.includes('joinAllSpaces'));
});
test('widget never labels disconnected or stale events as active',()=>{
  assert.match(widgetStatus('demo',true,false,true),/sample/);
  assert.match(widgetStatus('live',false,false,true),/disconnected/);
  assert.match(widgetStatus('live',true,true,true),/no recent signal/);
  assert.match(widgetStatus('live',true,false,false),/waiting/);
});
test('compact display shares the authenticated event state and strips only the fragment',async()=>{
  const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  const widget=source.slice(source.indexOf('if (compact) return'),source.indexOf("<main className={'office-app"));
  assert.ok(widget.includes('Widget project'));assert.ok(widget.includes('Pause agent motion'));
  assert.ok(widget.includes('setFloorId(String(value)); setSelectedAgentId(null)'));
  for(const absent of ['floor-rail','activity-rail','control-bar','topbar'])assert.ok(!widget.includes(absent),absent);
  assert.ok(source.includes("history.replaceState(null, '', location.pathname + location.search)"));
  assert.ok(source.includes("window.removeEventListener('agent-office-view', onDisplayMode)"));
});
