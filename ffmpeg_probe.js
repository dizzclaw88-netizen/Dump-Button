const { execFile } = require('child_process');

function execFileP(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: opts.timeoutMs || 4000, maxBuffer: opts.maxBuffer || 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function probeFfmpeg() {
  const result = {
    ok: false,
    ffmpegFound: false,
    version: null,
    hasZmqFilters: false,
    filtersSample: null,
    error: null,
  };

  try {
    const v = await execFileP('ffmpeg', ['-version']);
    result.ffmpegFound = true;
    result.ok = true;

    // First line: "ffmpeg version x.y..."
    const first = v.stdout.split('\n')[0] || '';
    result.version = first.trim();

    // Filters list (may be large)
    const f = await execFileP('ffmpeg', ['-filters'], { timeoutMs: 6000, maxBuffer: 8 * 1024 * 1024 });
    const out = f.stdout;
    result.hasZmqFilters = /\bzmq\b/.test(out) && /\bazmq\b/.test(out);
    result.filtersSample = out.split('\n').slice(0, 25).join('\n');

    return result;
  } catch (e) {
    result.error = {
      message: e.message,
      code: e.code,
    };
    return result;
  }
}

module.exports = { probeFfmpeg };
