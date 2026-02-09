const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLiveRelayArgs, buildDumpArgs } = require('../ffmpeg_args');

test('buildLiveRelayArgs: stream-copy when no delay', () => {
  const args = buildLiveRelayArgs({ STREAMURI: 'rtmp://example/live', DELAY_SECONDS: 0, LIVE_INPUT_URL: 'rtmp://localhost/live' });
  const joined = args.join(' ');
  assert.match(joined, /-c:v copy/);
  assert.match(joined, /-c:a copy/);
  assert.ok(args.includes('rtmp://example/live'));
});

test('buildLiveRelayArgs: re-encode when delay>0', () => {
  const args = buildLiveRelayArgs({ STREAMURI: 'rtmp://example/live', DELAY_SECONDS: 10 });
  const joined = args.join(' ');
  assert.match(joined, /-filter_complex/);
  assert.match(joined, /libx264/);
  assert.match(joined, /aac/);
});

test('buildDumpArgs: loops placeholder', () => {
  const args = buildDumpArgs({ STREAMURI: 'rtmp://example/live', DUMPVIDEO: './media/dump.flv' });
  const joined = args.join(' ');
  assert.match(joined, /-stream_loop -1/);
  assert.ok(args.includes('rtmp://example/live'));
});
