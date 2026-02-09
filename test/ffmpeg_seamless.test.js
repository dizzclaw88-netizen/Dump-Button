const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSeamlessRelayArgs } = require('../ffmpeg_seamless');

test('buildSeamlessRelayArgs: includes zmq/azmq filters and named instances', () => {
  const args = buildSeamlessRelayArgs({
    STREAMURI: 'rtmp://example/live',
    DUMPVIDEO: './media/dump.flv',
    LIVE_INPUT_URL: 'rtmp://localhost/live',
    ZMQ_VIDEO: 'tcp://127.0.0.1:5555',
    ZMQ_AUDIO: 'tcp://127.0.0.1:5556',
  });

  const joined = args.join(' ');
  assert.match(joined, /zmq=bind_address=tcp\\:\/\/127\.0\.0\.1\\:5555/);
  assert.match(joined, /azmq=bind_address=tcp\\:\/\/127\.0\.0\.1\\:5556/);
  assert.match(joined, /colorchannelmixer@dumpalpha/);
  assert.match(joined, /volume@live/);
  assert.match(joined, /volume@dump/);
});
