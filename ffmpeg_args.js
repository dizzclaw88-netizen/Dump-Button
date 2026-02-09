const path = require('path');

/**
 * Build ffmpeg args for relaying a live RTMP input to a platform output.
 *
 * Notes:
 * - If delaySeconds > 0, we must apply timestamp delay filters which require re-encoding.
 * - If delaySeconds === 0, we can stream-copy for best quality/lowest CPU.
 */
function buildLiveRelayArgs(settings) {
  const inputUrl = settings.LIVE_INPUT_URL || 'rtmp://localhost/live';
  const outputUrl = settings.STREAMURI;
  if (!outputUrl) throw new Error('Missing STREAMURI (output RTMP URL)');

  const delaySeconds = Number(settings.DELAY_SECONDS || 0);
  const formatArgs = ['-f', 'flv'];

  // Common flags: keep logs sane for parsing + reduce buffering where possible.
  const common = [
    '-hide_banner',
    '-loglevel', settings.FFMPEG_LOGLEVEL || 'warning',
    // Be careful with aggressive low-latency flags; keep them opt-in.
  ];

  if (!delaySeconds) {
    return [
      ...common,
      '-i', inputUrl,
      '-c:v', 'copy',
      '-c:a', 'copy',
      ...formatArgs,
      outputUrl,
    ];
  }

  const delayMs = Math.max(0, Math.floor(delaySeconds * 1000));

  // Delay requires buffering and re-encode.
  // Video: setpts shifts timestamps. Audio: adelay shifts audio timestamps.
  // We also normalize audio timestamps with asetpts.
  const filter = [
    `[0:v]setpts=PTS+${delaySeconds}/TB[v]`,
    `[0:a]adelay=${delayMs}|${delayMs},asetpts=N/SR/TB[a]`,
  ].join('; ');

  const videoEnc = [
    '-c:v', 'libx264',
    '-preset', settings.X264_PRESET || 'veryfast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-g', String(settings.GOP || 60),
    '-keyint_min', String(settings.GOP || 60),
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
    '-i', inputUrl,
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '[a]',
    ...videoEnc,
    ...audioEnc,
    ...formatArgs,
    outputUrl,
  ];
}

function buildDumpArgs(settings) {
  const dumpVideo = settings.DUMPVIDEO;
  const outputUrl = settings.STREAMURI;
  if (!dumpVideo) throw new Error('Missing DUMPVIDEO (path to placeholder video)');
  if (!outputUrl) throw new Error('Missing STREAMURI (output RTMP URL)');

  const common = [
    '-hide_banner',
    '-loglevel', settings.FFMPEG_LOGLEVEL || 'warning',
  ];

  // Loop forever, read at native rate.
  return [
    ...common,
    '-stream_loop', '-1',
    '-re',
    '-i', path.resolve(dumpVideo),
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-f', 'flv',
    outputUrl,
  ];
}

module.exports = {
  buildLiveRelayArgs,
  buildDumpArgs,
};
