# Seamless switching design (target: 100k live viewers)

This project’s differentiator is *preventing* bad content from ever reaching the platform by introducing a delay buffer and a **dump** action that discards buffered content.

For a streamer with 100k concurrent viewers, "dump" must **not** look like:
- an RTMP disconnect/reconnect
- a visible freeze
- a keyframe/reset glitch
- audio popping/silence

That means we must keep the platform ingest connection stable and switch content **in-band**.

## Key constraints

1) **True delay requires buffering**
- Stream-copy relay cannot introduce a real 10–30s delay unless the input itself is delayed.
- If we implement delay inside FFmpeg, we almost certainly **re-encode** (CPU cost).

2) **Seamless switching implies one long-running encoder/output**
- Killing/restarting FFmpeg is likely to produce a viewer-visible glitch.
- Preferred: a single FFmpeg process that always outputs to the platform.

3) **Switching must control BOTH video + audio**
- Video-only switching is not enough; audio leaks are also "mistakes".

## Recommended approach (FFmpeg single-process + runtime control)

### A) One FFmpeg process with 2 inputs
- Input 0: live feed (from OBS → local RTMP ingest)
- Input 1: dump/placeholder video (looped)

Both inputs are always available inside the same FFmpeg process.

### B) A filtergraph that *mixes* both and allows runtime toggling

We can layer dump video on top of live video and control the dump layer’s alpha at runtime.
For audio, we can keep both streams present but control volumes at runtime.

A workable shape:

- Video:
  - scale/format both streams to match
  - apply `colorchannelmixer` to the dump video so its alpha (aa) can be changed
  - overlay dump onto live

- Audio:
  - apply `volume` filters to live + dump audio
  - mix with `amix`

### C) Runtime control channel
To hit the "seamless" requirement, we need runtime control of filter parameters.

FFmpeg supports command injection to filters via **libzmq** filters:
- `zmq` (video) and `azmq` (audio)

They receive messages of the form:

`TARGET COMMAND [ARG]`

Where TARGET can be a named filter instance like `volume@live` or `colorchannelmixer@dumpalpha`.

**Important:** this requires an FFmpeg build configured with `--enable-libzmq`.

Ref: FFmpeg docs for `zmq/azmq` (external) describe the message format and behavior.

## Proposed dump semantics

When dump is pressed:
- Immediately:
  - set dump video alpha to 1.0 (cover live)
  - set live audio volume to 0.0
  - set dump audio volume to 1.0 (optional)
- Then:
  - discard the buffered live content by advancing the delay buffer (implementation-specific)
- When safe to return:
  - fade alpha back to 0.0
  - restore live volume

## Open problems / research questions

1) **Where does the true delay live?**
- FFmpeg filters (`setpts`/`adelay`) are a basic approach but require re-encode.
- Alternative: use a segment buffer (e.g. HLS-style internally) and always stream from segments. This can enable real "discard" by dropping segments.

2) **Does Twitch/YouTube ingest tolerate alpha/volume toggles without artifacts?**
- Likely yes if encoder settings remain constant and we don’t break timestamps.

3) **FFmpeg build requirements**
- We need FFmpeg installed.
- For runtime switching: FFmpeg must include `zmq/azmq` filters.

## Next implementation steps (incremental)

1) Add a `SEAMLESS_SWITCHING=1` mode that runs one FFmpeg process with both inputs and a fixed filtergraph.
2) Implement a Node-side ZMQ client to send commands:
   - `colorchannelmixer@dumpalpha aa 1.0` (cover)
   - `colorchannelmixer@dumpalpha aa 0.0` (reveal)
   - `volume@live volume 0.0/1.0`
3) Add integration tests:
   - record the output stream locally and confirm no RTMP reconnect
   - analyze timestamps/bitrate/keyframe cadence

