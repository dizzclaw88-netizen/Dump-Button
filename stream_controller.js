const { logger } = require('./logger');
const { terminateFfmpegProcess, startFfmpegProcess } = require('./stream_utils');
const { buildLiveRelayArgs, buildDumpArgs } = require('./ffmpeg_args');
const { buildSeamlessRelayArgs } = require('./ffmpeg_seamless');

/**
 * Minimal stateful controller around the single ffmpeg process.
 *
 * Current strategy:
 * - LIVE: relay OBS/NMS input to platform, optionally with a delay (re-encode when delayed).
 * - DUMP: restart ffmpeg to loop a placeholder video (stream-copy).
 *
 * NOTE: This does NOT yet guarantee a perfect seamless transition. It is an incremental step.
 */
class StreamController {
  constructor(getSettings) {
    this.getSettings = getSettings;
    this.mode = 'STOPPED';
    this.lastActionAt = null;
  }

  status() {
    const s = this.getSettings();
    return {
      mode: this.mode,
      lastActionAt: this.lastActionAt,
      delaySeconds: Number(s.DELAY_SECONDS || 0),
      liveInputUrl: s.LIVE_INPUT_URL || 'rtmp://localhost/live',
      output: s.STREAMURI || null,
      dumpVideo: s.DUMPVIDEO || null,
    };
  }

  async startLive() {
    const settings = this.getSettings();

    const seamless = String(settings.SEAMLESS_SWITCHING || '').toLowerCase();
    const useSeamless = seamless === '1' || seamless === 'true' || seamless === 'yes';

    const args = useSeamless ? buildSeamlessRelayArgs(settings) : buildLiveRelayArgs(settings);

    logger.info({
      action: 'startLive',
      mode: useSeamless ? 'SEAMLESS' : 'BASIC',
      delaySeconds: Number(settings.DELAY_SECONDS || 0),
      args: [...args.slice(0, -1), 'STREAMURI'],
    });

    await terminateFfmpegProcess();
    await startFfmpegProcess(args);
    this.mode = useSeamless ? 'LIVE_SEAMLESS' : 'LIVE';
    this.lastActionAt = new Date().toISOString();
    return this.status();
  }

  async dumpStream() {
    const settings = this.getSettings();
    const args = buildDumpArgs(settings);
    logger.info({ action: 'dumpStream', args: [...args.slice(0, -1), 'STREAMURI'] });
    await terminateFfmpegProcess();
    await startFfmpegProcess(args);
    this.mode = 'DUMP';
    this.lastActionAt = new Date().toISOString();
    return this.status();
  }

  async stopStream() {
    logger.info({ action: 'stopStream' });
    await terminateFfmpegProcess();
    this.mode = 'STOPPED';
    this.lastActionAt = new Date().toISOString();
    return this.status();
  }
}

module.exports = { StreamController };
