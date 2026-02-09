const path = require('path');

/**
 * Builds a single-process FFmpeg graph intended to allow seamless "dump" switching.
 *
 * REQUIREMENT:
 * - FFmpeg must be built with libzmq so that `zmq` and `azmq` filters exist.
 *
 * Control concept:
 * - dump video layer alpha is controlled via `colorchannelmixer@dumpalpha aa <0..1>`
 * - live + dump audio are controlled via `volume@live volume <0..1>` and `volume@dump volume <0..1>`
 */
function buildSeamlessRelayArgs(settings) {
  const liveInput = settings.LIVE_INPUT_URL || 'rtmp://localhost/live';
  const dumpVideo = settings.DUMPVIDEO;
  const outputUrl = settings.STREAMURI;
  if (!dumpVideo) throw new Error('Missing DUMPVIDEO (placeholder video path)');
  if (!outputUrl) throw new Error('Missing STREAMURI (output RTMP URL)');

  const zmqBindV = settings.ZMQ_VIDEO || 'tcp://127.0.0.1:5555';
  const zmqBindA = settings.ZMQ_AUDIO || 'tcp://127.0.0.1:5556';

  // Encode settings must remain constant through switching.
  const gop = Number(settings.GOP || 60);

  const common = [
    '-hide_banner',
    '-loglevel', settings.FFMPEG_LOGLEVEL || 'warning',
    // Live input
    '-i', liveInput,
    // Dump input (loop)
    '-stream_loop', '-1',
    '-re',
    '-i', path.resolve(dumpVideo),
  ];

  // Filtergraph:
  // - Video: dump video alpha starts at 0 (invisible), overlay on top of live.
  // - Audio: two volumes into amix; live=1, dump=0.
  // - ZMQ/azmq inserted so commands can be sent.
  const filter = [
    // Video chain
    `[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v0]`,
    `[1:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=rgba,colorchannelmixer@dumpalpha=aa=0,zmq=bind_address=${escapeFilterArg(zmqBindV)}[vd]`,
    `[v0][vd]overlay=format=auto[vout]`,

    // Audio chain (be conservative: if one input lacks audio this will fail; we’ll need robustness work)
    `[0:a]volume@live=volume=1,azmq=bind_address=${escapeFilterArg(zmqBindA)}[a0]`,
    `[1:a]volume@dump=volume=0,azmq=bind_address=${escapeFilterArg(zmqBindA)}[a1]`,
    `[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0[aout]`,
  ].join(';');

  const videoEnc = [
    '-c:v', 'libx264',
    '-preset', settings.X264_PRESET || 'veryfast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-g', String(gop),
    '-keyint_min', String(gop),
    '-b:v', settings.VIDEO_BITRATE || '4500k',
    '-maxrate', settings.VIDEO_MAXRATE || '4500k',
    '-bufsize', settings.VIDEO_BUFSIZE || '9000k',
  ];

  const audioEnc = [
    '-c:a', 'aac',
    '-b:a', settings.AUDIO_BITRATE || '160k',
    '-ar', String(settings.AUDIO_RATE || 48000),
  ];

  return [
    ...common,
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '[aout]',
    ...videoEnc,
    ...audioEnc,
    '-f', 'flv',
    outputUrl,
  ];
}

function escapeFilterArg(s) {
  // In filtergraphs, ':' is a special character and often must be escaped.
  // We keep this conservative for tcp://127.0.0.1:5555 style addresses.
  return String(s).replace(/:/g, '\\:');
}

module.exports = { buildSeamlessRelayArgs };
