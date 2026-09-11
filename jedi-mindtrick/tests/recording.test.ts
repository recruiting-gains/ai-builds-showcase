import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasRecorder, RECORDING_LIMITS, type RecordingDependencies, type RecordingSnapshot } from '../src/recording';
class FakeRecorder {
  state: RecordingState = 'inactive'; mimeType = 'video/mp4'; stops = 0; throwStart = false; throwStop = false;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  start() { if (this.throwStart) throw Error('start rejected'); this.state = 'recording'; }
  stop() { this.stops++; if (this.throwStop) throw Error('stop rejected'); this.state = 'inactive'; }
  data(blob: Blob) { this.ondataavailable?.({ data: blob } as BlobEvent); }
  complete(blob?: Blob) { if (blob) this.data(blob); this.state = 'inactive'; this.onstop?.(new Event('stop')); }
  error() { this.onerror?.(new Event('error')); }
}
function fixture(options: { supported?: string[]; available?: boolean; throwCreate?: boolean; throwCapture?: boolean; throwStart?: boolean; throwURL?: boolean; throwFile?: boolean } = {}) {
  let now = 0, id = 0;
  const tasks = new Map<number, { at: number; callback: () => void }>();
  const recorders: FakeRecorder[] = [], tracks: { readyState: string; stops: number; stop(): void }[] = [];
  const rates: number[] = [], mimeRequests: string[] = [], urls: string[] = [], revoked: string[] = [], snapshots: RecordingSnapshot[] = [];
  const canvas = {} as HTMLCanvasElement;
  const dependencies: RecordingDependencies = {
    available: () => options.available !== false,
    supportsMime: mime => (options.supported ?? ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm']).includes(mime),
    capture: (target, fps) => { assert.equal(target, canvas); rates.push(fps); if (options.throwCapture) throw Error('capture denied'); const track = { readyState: 'live', stops: 0, stop() { this.stops++; this.readyState = 'ended'; } }; tracks.push(track); return { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] } as unknown as MediaStream; },
    createRecorder: (_stream, config) => { if (options.throwCreate) throw Error('encoder unavailable'); mimeRequests.push(config.mimeType!); const recorder = new FakeRecorder(); recorder.mimeType = config.mimeType!; recorder.throwStart = options.throwStart ?? false; recorders.push(recorder); return recorder as unknown as MediaRecorder; },
    now: () => now,
    schedule: (callback, delay) => { const next = ++id; tasks.set(next, { at: now + delay, callback }); return next as unknown as ReturnType<typeof setTimeout>; },
    cancel: timer => { tasks.delete(timer as unknown as number); },
    createURL: () => { if (options.throwURL) throw Error('URL unavailable'); const url = `blob:clip-${urls.length}`; urls.push(url); return url; },
    revokeURL: url => { revoked.push(url); },
    createFile: (blob, filename) => { if (options.throwFile) throw Error('File unavailable'); return new File([blob], filename, { type: blob.type }); },
  };
  const controller = new CanvasRecorder(canvas, snapshot => snapshots.push(snapshot), dependencies);
  function advance(duration: number) { const target = now + duration; for (let step = 0; step < 1000; step++) { const next = [...tasks].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) { now = target; return; } now = next[1].at; tasks.delete(next[0]); next[1].callback(); } throw Error('timer loop exceeded'); }
  return { controller, recorders, tracks, rates, mimeRequests, urls, revoked, snapshots, advance, tasks, options };
}
const data = (text = 'encoded frame', type = 'video/mp4') => new Blob([text], { type });

test('records the canvas at 30 fps, combines chunks, and retains the take until cleared', async () => {
  const f = fixture(); assert.equal(f.controller.supported, true); assert.equal(f.controller.start(), true); assert.deepEqual(f.rates, [30]); assert.equal(f.mimeRequests[0], 'video/mp4;codecs=avc1');
  f.recorders[0].data(data('first')); f.advance(1250); f.controller.stop(); assert.equal(f.controller.snapshot.phase, 'stopping'); assert.equal(f.controller.snapshot.clip, undefined);
  f.advance(500); f.recorders[0].complete(data('last')); const clip = f.controller.snapshot.clip!;
  assert.equal(f.controller.snapshot.phase, 'ready'); assert.equal(await clip.blob.text(), 'firstlast'); assert.equal(clip.durationMs, 1250); assert.match(clip.file.name, /\.mp4$/); assert.equal(clip.file.type, 'video/mp4');
  assert.equal(f.tracks[0].stops, 1); assert.equal(f.tasks.size, 0); assert.equal(f.controller.start(), false); assert.equal(f.controller.snapshot.clip, clip); assert.equal(f.rates.length, 1);
  f.controller.clear(); assert.deepEqual(f.revoked, [clip.url]); assert.equal(f.controller.start(), true); f.controller.dispose();
});

test('selects supported MP4/WebM and uses the actual emitted MIME for the file', () => {
  for (const [supported, chosen] of [[['video/mp4','video/webm'],'video/mp4'],[['video/webm;codecs=vp8','video/webm'],'video/webm;codecs=vp8'],[['video/webm'],'video/webm']] as [string[],string][]) {
    const f = fixture({supported}); f.controller.start(); assert.equal(f.mimeRequests[0], chosen); f.controller.stop(); f.recorders[0].complete(data('webm container','video/webm;codecs=vp8'));
    assert.match(f.controller.snapshot.clip!.file.name,/\.webm$/); assert.equal(f.controller.snapshot.clip!.blob.type,'video/webm'); assert.equal(f.controller.snapshot.clip!.file.type,'video/webm'); f.controller.dispose();
  }
});

test('uses recorder MIME when chunks omit their type',()=>{const f=fixture({supported:['video/mp4']});f.controller.start();f.controller.stop();f.recorders[0].complete(data('bytes',''));assert.equal(f.controller.snapshot.clip?.blob.type,'video/mp4');f.controller.dispose();});

test('unavailable recording fails before capture and supports a later capability retry',()=>{for(const options of [{available:false},{supported:[] as string[]}]){const f=fixture(options);assert.equal(f.controller.supported,false);assert.equal(f.controller.start(),false);assert.equal(f.controller.snapshot.phase,'error');assert.equal(f.tracks.length,0);f.options.available=true;f.options.supported=['video/mp4'];assert.equal(f.controller.start(),true);f.controller.dispose();}});

test('capture, constructor and start failures release the owned track and allow retry',()=>{for(const failure of ['throwCapture','throwCreate','throwStart'] as const){const f=fixture({[failure]:true});assert.equal(f.controller.start(),false);assert.equal(f.controller.snapshot.phase,'error');for(const track of f.tracks)assert.equal(track.stops,1);assert.equal(f.tasks.size,0);f.options[failure]=false;assert.equal(f.controller.start(),true);f.controller.dispose();}});

test('duplicate start/stop cannot create another stream or finalize twice',()=>{const f=fixture();f.controller.start();assert.equal(f.controller.start(),false);f.controller.stop();f.controller.stop();assert.equal(f.recorders[0].stops,1);f.recorders[0].complete(data());f.recorders[0].complete(data());assert.equal(f.urls.length,1);assert.equal(f.tracks[0].stops,1);f.controller.dispose();});

test('stops at 60 seconds and accepts final data within the five-second completion window',()=>{const f=fixture();f.controller.start();f.advance(RECORDING_LIMITS.durationMs-1);assert.equal(f.controller.snapshot.phase,'recording');f.advance(1);assert.equal(f.controller.snapshot.phase,'stopping');assert.equal(f.recorders[0].stops,1);f.advance(4999);f.recorders[0].complete(data());assert.equal(f.controller.snapshot.phase,'ready');assert.equal(f.controller.snapshot.clip?.durationMs,60000);assert.match(f.controller.snapshot.message,/60-second/);f.controller.dispose();});

test('stop timeout expires once; late old callbacks cannot resurrect an abandoned take',()=>{const f=fixture();f.controller.start();const lateData=f.recorders[0].ondataavailable,lateStop=f.recorders[0].onstop;f.controller.stop();f.advance(5000);assert.equal(f.controller.snapshot.phase,'error');assert.equal(f.tracks[0].stops,1);lateData?.({data:data()} as BlobEvent);lateStop?.(new Event('stop'));assert.equal(f.controller.snapshot.clip,undefined);assert.equal(f.controller.start(),true);lateStop?.(new Event('stop'));assert.equal(f.controller.snapshot.phase,'recording');f.controller.dispose();});

test('zero-byte capture is an error rather than an empty download',()=>{const f=fixture();f.controller.start();f.recorders[0].data(new Blob());f.controller.stop();f.recorders[0].complete(new Blob());assert.equal(f.controller.snapshot.phase,'error');assert.equal(f.urls.length,0);assert.match(f.controller.snapshot.message,/No video/);assert.equal(f.controller.start(),true);f.controller.dispose();});

test('recorder error discards incomplete data, releases capture, and permits a clean retry',()=>{const f=fixture();f.controller.start();f.recorders[0].data(data());f.recorders[0].error();assert.equal(f.controller.snapshot.phase,'error');assert.equal(f.controller.snapshot.clip,undefined);assert.equal(f.tasks.size,0);assert.equal(f.tracks[0].stops,1);f.recorders[0].complete(data());assert.equal(f.urls.length,0);assert.equal(f.controller.start(),true);f.controller.dispose();});

test('throwing stop is recoverable and does not leave a canvas track live',()=>{const f=fixture();f.controller.start();f.recorders[0].throwStop=true;f.controller.stop();assert.equal(f.controller.snapshot.phase,'error');assert.equal(f.tracks[0].stops,1);assert.equal(f.tasks.size,0);assert.equal(f.controller.start(),true);f.controller.dispose();});

test('oversized final chunk is rejected without creating a truncated file',()=>{const f=fixture();f.controller.start();f.recorders[0].data(data('first'));f.controller.stop();const oversize=new Blob();Object.defineProperty(oversize,'size',{value:RECORDING_LIMITS.bytes});f.recorders[0].complete(oversize);assert.equal(f.controller.snapshot.phase,'error');assert.equal(f.controller.snapshot.clip,undefined);assert.match(f.controller.snapshot.message,/48 MB/);assert.equal(f.urls.length,0);assert.equal(f.tracks[0].stops,1);assert.equal(f.controller.start(),true);f.controller.dispose();});

test('exact byte limit initiates stop; extra final bytes fail safely',()=>{const f=fixture();f.controller.start();const full=new Blob();Object.defineProperty(full,'size',{value:RECORDING_LIMITS.bytes});f.recorders[0].data(full);assert.equal(f.controller.snapshot.phase,'stopping');f.recorders[0].complete(data('more'));assert.equal(f.controller.snapshot.phase,'error');assert.equal(f.controller.snapshot.clip,undefined);assert.equal(f.tasks.size,0);});

test('invalid MIME, URL or File preparation cannot produce a false successful take',()=>{for(const kind of ['mime','throwURL','throwFile'] as const){const f=fixture(kind==='mime'?{}:{[kind]:true});f.controller.start();f.controller.stop();f.recorders[0].complete(data('encoded',kind==='mime'?'application/octet-stream':'video/mp4'));assert.equal(f.controller.snapshot.phase,'error');assert.equal(f.controller.snapshot.clip,undefined);assert.equal(f.tracks[0].stops,1);if(kind!=='mime')f.options[kind]=false;assert.equal(f.controller.start(),true);f.controller.dispose();}});

test('clear cancels active callbacks; dispose revokes a finished URL once',()=>{const f=fixture();f.controller.start();const lateStop=f.recorders[0].onstop;f.controller.clear();assert.equal(f.controller.snapshot.phase,'idle');assert.equal(f.tracks[0].stops,1);assert.equal(f.tasks.size,0);lateStop?.(new Event('stop'));assert.equal(f.controller.snapshot.phase,'idle');f.controller.start();f.controller.stop();f.recorders[1].complete(data());const url=f.controller.snapshot.clip!.url;f.controller.dispose();f.controller.dispose();f.controller.clear();assert.deepEqual(f.revoked,[url]);assert.equal(f.controller.start(),false);assert.equal(f.controller.supported,false);assert.equal(f.controller.snapshot.clip,undefined);});

test('natural recorder stop still produces a clip and releases timers',()=>{const f=fixture();f.controller.start();f.advance(1500);f.recorders[0].complete(data());assert.equal(f.controller.snapshot.phase,'ready');assert.equal(f.controller.snapshot.clip?.durationMs,1500);assert.equal(f.tasks.size,0);f.controller.dispose();});

 test('codec-bearing MP4 output becomes a native-share-friendly video/mp4 File',()=>{const f=fixture();f.controller.start();f.controller.stop();f.recorders[0].complete(data('encoded','video/mp4;codecs=avc1.42E01E'));const clip=f.controller.snapshot.clip!;assert.equal(clip.blob.type,'video/mp4');assert.equal(clip.file.type,'video/mp4');assert.match(clip.file.name,/\.mp4$/);f.controller.dispose();});
