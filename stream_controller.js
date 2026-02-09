const { logger } = require('./logger');
const { terminateFfmpegProcess, startFfmpegProcess } = require('./stream_utils');
const { buildLiveRelayArgs, buildDumpArgs } = require('./ffmpeg_args');
const { buildSeamlessRelayArgs } = require('./ffmpeg_seamless');
const { probeFfmpeg } = require('./ffmpeg_probe');

let sendZmqCommand;
try {
  ({ sendZmqCommand } = require('./zmq_control'));
} catch (e) {
  // optional
}

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
    this.lastDumpAt = null;
    this.ffmpegProbe = null;
  }

  async refreshProbe() {
    this.ffmpegProbe = await probeFfmpeg();
    return this.ffmpegProbe;
  }

  status() {
    const s = this.getSettings();
    const seamless = String(s.SEAMLESS_SWITCHING || '').toLowerCase();
    const useSeamless = seamless === '1' || seamless === 'true' || seamless === 'yes';

    return {
      mode: this.mode,
      lastActionAt: this.lastActionAt,
      lastDumpAt: this.lastDumpAt,
      delaySeconds: Number(s.DELAY_SECONDS || 0),
      seamlessRequested: useSeamless,
      liveInputUrl: s.LIVE_INPUT_URL || 'rtmp://localhost/live',
      output: s.STREAMURI || null,
      dumpVideo: s.DUMPVIDEO || null,
      ffmpeg: this.ffmpegProbe,
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
    const seamless = String(settings.SEAMLESS_SWITCHING || '').toLowerCase();
    const useSeamless = seamless === '1' || seamless === 'true' || seamless === 'yes';

    // If we're in seamless mode, prefer in-band dump overlay.
    if (useSeamless) {
      return this.dumpOn();
    }

    const args = buildDumpArgs(settings);
    logger.info({ action: 'dumpStream', args: [...args.slice(0, -1), 'STREAMURI'] });
    await terminateFfmpegProcess();
    await startFfmpegProcess(args);
    this.mode = 'DUMP';
    this.lastActionAt = new Date().toISOString();
    this.lastDumpAt = this.lastActionAt;
    return this.status();
  }

  async _send(addr, line) {
    const settings = this.getSettings();
    if (!sendZmqCommand) {
      throw new Error('ZMQ control not available (missing zmq_control.js sender)');
    }
    const s2 = { ...settings, ZMQ_CONTROL_ADDRESS: addr };
    return sendZmqCommand(line, s2);
  }

  async dumpOn() {
    const settings = this.getSettings();

    // Ensure probe exists for UI.
    if (!this.ffmpegProbe) await this.refreshProbe();

    // Preconditions: we need ffmpeg + zmq filters. If missing, fall back to restart-dump.
    if (!this.ffmpegProbe?.ffmpegFound || !this.ffmpegProbe?.hasZmqFilters) {
      logger.warn({ action: 'dumpOn', msg: 'No zmq-enabled ffmpeg detected; falling back to restart-based dump.' });
      const args = buildDumpArgs(settings);
      await terminateFfmpegProcess();
      await startFfmpegProcess(args);
      this.mode = 'DUMP';
      this.lastActionAt = new Date().toISOString();
      this.lastDumpAt = this.lastActionAt;
      return this.status();
    }

    const videoAddr = settings.ZMQ_VIDEO || 'tcp://127.0.0.1:5555';
    const audioAddr = settings.ZMQ_AUDIO || 'tcp://127.0.0.1:5556';

    // "Cover" quickly; mute live audio.
    // Note: we do not yet do a fancy crossfade; keep it simple + reliable.
    await this._send(videoAddr, 'colorchannelmixer@dumpalpha aa 1.0');
    await this._send(audioAddr, 'volume@live volume 0.0');
    await this._send(audioAddr, 'volume@dump volume 1.0');

    this.mode = 'DUMP_SEAMLESS';
    this.lastActionAt = new Date().toISOString();
    this.lastDumpAt = this.lastActionAt;
    return this.status();
  }

  async resumeLive() {
    const settings = this.getSettings();
    if (!this.ffmpegProbe) await this.refreshProbe();

    // If we can't control seamlessly, just restart live.
    if (!this.ffmpegProbe?.ffmpegFound || !this.ffmpegProbe?.hasZmqFilters) {
      logger.warn({ action: 'resumeLive', msg: 'No zmq-enabled ffmpeg detected; restarting live relay.' });
      return this.startLive();
    }

    const videoAddr = settings.ZMQ_VIDEO || 'tcp://127.0.0.1:5555';
    const audioAddr = settings.ZMQ_AUDIO || 'tcp://127.0.0.1:5556';

    // Reveal live; restore audio.
    await this._send(audioAddr, 'volume@dump volume 0.0');
    await this._send(audioAddr, 'volume@live volume 1.0');
    await this._send(videoAddr, 'colorchannelmixer@dumpalpha aa 0.0');

    this.mode = 'LIVE_SEAMLESS';
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
