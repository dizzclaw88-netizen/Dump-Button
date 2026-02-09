# Dump-Button Notes (Dev Log)

## 2026-02-09

### Initial code read
- Electron UI with 3 buttons.
- Node-Media-Server listens RTMP 1935; HTTP 8200.
- A single ffmpeg process is (re)started for live relay or placeholder loop.
- No real delayed buffer/dump-yanking mechanism implemented yet (just switching sources).

### Change: introduce a StreamController + ffmpeg arg builders
Goal: make it easier to iterate on FFmpeg strategies, add tests, and expose status to UI.

Changes:
- Added `ffmpeg_args.js`:
  - `buildLiveRelayArgs(settings)`
    - If `DELAY_SECONDS=0` -> stream-copy.
    - If `DELAY_SECONDS>0` -> uses setpts/adelay filtergraph and re-encodes (libx264+aac).
  - `buildDumpArgs(settings)` -> stream-loop placeholder, stream-copy.
- Added `stream_controller.js`:
  - state machine: STOPPED | LIVE | DUMP.
  - methods: startLive/stopStream/dumpStream/status.
- UI (`index.html`): added a status panel and periodic status refresh.
- Tests: `test/ffmpeg_args.test.js` using Node's built-in test runner.

What this does *not* solve yet:
- Seamless, artifact-free in-band switching without RTMP reconnect.
- True "discard buffered content" semantics (currently restart-based, which discards but may glitch).

Next experiments to try:
1) Investigate in-process switching using `-filter_complex` + `zmq`/`sendcmd` to toggle an overlay input.
2) Investigate whether `-itsoffset` + queue-based buffering can keep stream-copy while delaying.
3) Explore SRT as an internal transport (OBS->SRT->ffmpeg) for more controllable buffering.
