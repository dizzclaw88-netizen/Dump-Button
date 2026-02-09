// Minimal ZMQ control sender.
//
// NOTE: We do not vendor a ZMQ lib here yet to keep install simple.
// This uses the external `zmqsend` tool that ships with FFmpeg source tree *or* `zmqsend` if present.
// For production we probably want a native Node zmq library or a small bundled helper binary.

const { execFile } = require('child_process');

function execFileP(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: opts.timeoutMs || 2000, maxBuffer: opts.maxBuffer || 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

/**
 * Send a command to a zmq/azmq-enabled FFmpeg filtergraph.
 *
 * Expected format: "TARGET COMMAND [ARG]" (single line).
 */
async function sendZmqCommand(commandLine, settings) {
  const tool = settings.ZMQSEND_BIN || 'zmqsend';
  const address = settings.ZMQ_CONTROL_ADDRESS || 'tcp://127.0.0.1:5555';

  // Many zmqsend implementations take the message on stdin; but arg formats vary.
  // For now, we only support a very simple "echo ... | zmqsend" style by invoking a shell.
  // We avoid shell here; so we require a zmqsend that supports: zmqsend <bind_address> <message>
  // If not available, we will report not supported.

  // Try: zmqsend tcp://127.0.0.1:5555 "overlay@my x 150"
  const { stdout, stderr } = await execFileP(tool, [address, commandLine]);
  return { stdout, stderr };
}

module.exports = { sendZmqCommand };
