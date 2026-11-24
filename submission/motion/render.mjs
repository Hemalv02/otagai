// Deterministic renderer: calls window.seek(t) for every frame, screenshots, pipes into ffmpeg.
//   node render.mjs --still 1.5,7.6          → out/stills/t0001.500.png …
//   node render.mjs --sheet 0:150:2          → out/contact_sheet.png (one frame every 2s)
//   node render.mjs --video [--from 0 --to 150 --fps 60 --scale 1 --workers 3 --out out/medwise_16x9.mp4]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, [])
);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;

const scale = Number(args.scale || 1);
const browser = await chromium.launch({ args: ['--disable-gpu-compositing', '--disable-gpu-vsync', '--force-color-profile=srgb', '--font-render-hinting=none'] });

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(URL_);
  try {
    await page.waitForFunction(() => window.ready, null, { timeout: 15000 });
    await page.evaluate(() => window.ready);
    await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
  } catch (e) {
    console.error('Page failed to become ready:', errs.join('\n') || e.message);
    process.exit(1);
  }
  if (errs.length) console.error('page errors:', errs.join('\n'));
  return page;
}

async function shot(page, t, file) {
  await page.evaluate((t) => window.seek(t), t);
  return page.screenshot({ path: file, type: 'png', animations: 'allow', caret: 'initial' });
}

fs.mkdirSync(path.join(ROOT, 'out/stills'), { recursive: true });

if (args.still) {
  const page = await openPage();
  for (const s of String(args.still).split(',')) {
    const t = Number(s);
    const f = path.join(ROOT, `out/stills/t${t.toFixed(3).padStart(8, '0')}.png`);
    await shot(page, t, f);
    console.log(f);
  }
} else if (args.sheet) {
  const [a, b, step] = String(args.sheet).split(':').map(Number);
  const dir = path.join(ROOT, 'out/sheet');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const page = await openPage();
  let i = 0;
  for (let t = a; t <= b + 1e-6; t += step) await shot(page, t, path.join(dir, `f${String(i++).padStart(4, '0')}.png`));
  const cols = Number(args.cols || 5);
  const rows = Math.ceil(i / cols);
  const out = path.join(ROOT, args.out || 'out/contact_sheet.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, 'f%04d.png'), '-vf', `scale=480:-1,drawtext=text='%{n}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5,tile=${cols}x${rows}:padding=6:color=black`, '-frames:v', '1', out]);
  console.log(out, `${i} frames, t=${a}..${b} step ${step}`);
} else if (args.video) {
  const fps = Number(args.fps || 60);
  const from = Number(args.from || 0);
  const to = Number(args.to || (await (async () => { const p = await openPage(); const d = await p.evaluate(() => window.DURATION); await p.close(); return d; })()));
  const total = Math.round((to - from) * fps);
  const workers = Math.max(1, Number(args.workers || 3));
  const out = path.join(ROOT, args.out || 'out/medwise_16x9.mp4');
  const tmp = path.join(ROOT, 'out/segs');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const per = Math.ceil(total / workers);
  const started = Date.now();
  let done = 0;
  await Promise.all(
    Array.from({ length: workers }, async (_, w) => {
      const f0 = w * per, f1 = Math.min(total, f0 + per);
      if (f0 >= f1) return;
      const page = await openPage();
      // The direct capture path is lossless at native resolution. Playwright applies device scaling.
      const cdp = scale === 1 ? await page.context().newCDPSession(page) : null;
      const seg = path.join(tmp, `seg${w}.mp4`);
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', args.preset || 'medium', '-crf', String(args.crf || 16), '-pix_fmt', 'yuv420p', '-r', String(fps), seg]);
      const encoded = once(ff, 'close');
      for (let f = f0; f < f1; f++) {
        await page.evaluate((t) => window.seek(t), from + f / fps);
        let buf;
        if (cdp) {
          const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
          buf = Buffer.from(data, 'base64');
        } else {
          buf = await page.screenshot({ type: 'png' });
        }
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        done++;
        if (done % (fps * 2) === 0) {
          const el = (Date.now() - started) / 1000;
          process.stdout.write(`\r${done}/${total} frames · ${(done / el).toFixed(1)} fps · eta ${(((total - done) / done) * el / 60).toFixed(1)} min   `);
        }
      }
      ff.stdin.end();
      const [status, signal] = await encoded;
      if (status !== 0) throw new Error(`Encoder failed for segment ${w} (${signal ?? status})`);
      await page.close();
    })
  );
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, Array.from({ length: workers }, (_, w) => `file 'seg${w}.mp4'`).filter((_, w) => fs.existsSync(path.join(tmp, `seg${w}.mp4`))).join('\n'));
  const audio = path.join(ROOT, 'audio/score.wav');
  const withAudio = fs.existsSync(audio) && !args.mute;
  const ffArgs = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
  if (withAudio) ffArgs.push('-ss', String(from), '-t', String(to - from), '-i', audio, '-c:a', 'aac', '-b:a', '320k', '-shortest');
  ffArgs.push('-c:v', 'copy', '-movflags', '+faststart', out);
  execFileSync('ffmpeg', ffArgs);
  const frameCount = Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames', '-of', 'default=nw=1:nk=1', out], { encoding: 'utf8' }).trim());
  if (frameCount !== total) throw new Error(`Export has ${frameCount} frames, expected ${total}`);
  console.log(`\n${out} (${((Date.now() - started) / 1000).toFixed(0)}s${withAudio ? ', with audio' : ''})`);
}

await browser.close();
server.close();
