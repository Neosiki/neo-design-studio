/** Portable handoff graph and packaging regressions; no network or model calls. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkHandoff, packHandoff } from '../scripts/design/lib/handoff.mjs';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const has = (report, check) => report.errors.some(item => item.check === check);
const write = (dir, relative, value) => {
  const file = path.join(dir, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2));
};

function fixture(fn) {
  const area = fs.mkdtempSync(path.join(os.tmpdir(), 'neodesign-handoff-test-'));
  const root = path.join(area, 'project');
  fs.mkdirSync(root);
  try { fn({ area, root, out: path.join(area, 'delivery') }); }
  finally {
    const absolute = path.resolve(area);
    const tempRoot = fs.realpathSync(os.tmpdir());
    const real = fs.realpathSync(area);
    const relative = path.relative(tempRoot, real);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(absolute).startsWith('neodesign-handoff-test-')) throw new Error('Refusing unsafe fixture cleanup.');
    // The exact mkdtemp directory is the cleanup boundary; nested junctions are removed, not followed.
    fs.rmSync(absolute, { recursive: true, force: true });
  }
}

function film(root, html = '<section locked><iframe id="shot" src="scenes/shot.html#t=0,4"></iframe></section>') {
  write(root, 'film.html', html);
  write(root, 'scenes/shot.html', '<h1 id="title">Local shot</h1>');
}

export function run(test, assert) {
  test('handoff collects Design IR, assets, outputs, locked references, sources and approval evidence', () => fixture(({ root }) => {
    write(root, 'design-project.json', {
      assets: [{ id: 'logo', path: 'assets/logo.svg', sha256: hash('<svg></svg>') }],
      references: [{ path: 'refs/locked.html', locked: true }], sources: [{ path: 'refs/source.md' }],
      style: { candidates: [{ preview: 'refs/a.html' }] }, approvals: { direction: { evidence: ['refs/a.html'] } },
      artifacts: [{ id: 'deck', ir: 'ir/deck.json', outputs: [{ path: 'out/deck.html' }, { path: 'out/deck.pptx' }] }],
    });
    write(root, 'assets/logo.svg', '<svg></svg>');
    write(root, 'ir/deck.json', { audio: { voiceover: { path: 'assets/voice.wav' } }, captions: { srt: 'assets/voice.srt' } });
    for (const file of ['refs/locked.html', 'refs/source.md', 'refs/a.html', 'out/deck.html', 'out/deck.pptx', 'assets/voice.wav', 'assets/voice.srt']) write(root, file, 'local content');
    const report = checkHandoff(root);
    assert(report.ok, JSON.stringify(report.errors));
    assert(['assets/logo.svg', 'refs/locked.html', 'refs/source.md', 'refs/a.html', 'ir/deck.json', 'out/deck.pptx', 'assets/voice.wav', 'assets/voice.srt'].every(file => report.files.includes(file)), 'Declared project source files were omitted.');
  }));

  test('handoff recursively follows HTML CSS and cyclic relative JavaScript imports', () => fixture(({ root }) => {
    film(root);
    write(root, 'scenes/shot.html', '<link href="../css/main.css"><img src="../media/a.png"><script type="module" src="../src/a.js"></script>');
    write(root, 'css/main.css', '@import "./more.css"; body { background: url("../media/bg.png"); }');
    write(root, 'css/more.css', '@font-face { src: url("../media/font.woff2"); }');
    write(root, 'src/a.js', 'import { b } from "./b.js"; export { c } from "./c.js";');
    write(root, 'src/b.js', 'import "./a.js"; export const b = 1;');
    write(root, 'src/c.js', 'export const c = 2;');
    for (const file of ['media/a.png', 'media/bg.png', 'media/font.woff2']) write(root, file, Buffer.from([0, 1, 2]));
    const report = checkHandoff(root);
    assert(report.ok, JSON.stringify(report.errors));
    assert(report.files.includes('src/c.js') && report.files.includes('media/font.woff2'), 'Transitive imports or font URLs were omitted.');
    assert(new Set(report.files).size === report.files.length, 'Cycle caused duplicated files.');
  }));

  test('handoff follows literal inline new URL/fetch, style URL, root-relative srcset and HTML entities', () => fixture(({ root }) => {
    film(root);
    write(root, 'scenes/shot.html', '<img srcset="/media/a.png 1x, /media/b.png 2x"><img src="../media/a.png?v=1&amp;x=2"><div style="background:url(\'../media/bg.png\')"></div><script>const u = new URL("../media/a.png", import.meta.url); fetch("../data.json");</script>');
    for (const file of ['media/a.png', 'media/b.png', 'media/bg.png', 'data.json']) write(root, file, '{}');
    const report = checkHandoff(root);
    assert(report.ok, JSON.stringify(report.errors));
    assert(report.files.includes('data.json') && report.files.includes('media/b.png') && report.files.includes('media/bg.png'), 'Static inline resource references were omitted.');
  }));

  test('handoff copies Film plan references and preserves locked/overrides edit bytes', () => fixture(({ root, out }) => {
    const edit = '<section locked><iframe id="shot" src="scenes/shot.html#t=0,4" size="1920x1080" overrides=\'[{"at":"#title","text":"Owner edit"}]\'></iframe></section>';
    film(root, edit);
    write(root, 'film-plan.json', { shots: [{ page: 'scenes/shot.html' }], assets: [{ path: 'media/original.wav', sha256: hash('original') }] });
    write(root, 'media/original.wav', 'original');
    const report = packHandoff(root, out);
    assert(report.ok, JSON.stringify(report.errors));
    assert(fs.readFileSync(path.join(out, 'film.html'), 'utf8') === edit && fs.existsSync(path.join(out, 'media/original.wav')), 'Human edits or original media were changed/omitted.');
  }));

  test('handoff warns for external and dynamic paths without requesting or exposing URL queries', () => fixture(({ root }) => {
    film(root);
    write(root, 'scenes/shot.html', '<img src="https://media.example.org/a.png?private=not-for-report"><script>import "library"; fetch(assetName); import(`./${name}.js`);</script>');
    const report = checkHandoff(root);
    assert(report.ok, JSON.stringify(report.errors));
    assert(['handoff.external', 'handoff.dynamic', 'handoff.package'].every(check => report.warnings.some(item => item.check === check)), 'Static scanner limits must be reported.');
    assert(!JSON.stringify(report.warnings).includes('not-for-report'), 'External URL query leaked into the report.');
  }));

  test('handoff rejects a missing required local reference before creating the output', () => fixture(({ root, out }) => {
    film(root);
    write(root, 'scenes/shot.html', '<img src="../media/missing.png">');
    const report = packHandoff(root, out);
    assert(!report.ok && has(report, 'handoff.missing') && !fs.existsSync(out), 'Missing file was packaged as success.');
  }));

  test('handoff rejects literal and encoded traversal outside the source boundary', () => fixture(({ root, area }) => {
    write(area, 'outside.png', 'outside');
    for (const src of ['../outside.png', '%2e%2e/outside.png']) {
      film(root, `<section><img src="${src}"></section>`);
      assert(has(checkHandoff(root), 'handoff.path'), 'A source escaped through traversal.');
    }
  }));

  test('handoff refuses explicitly referenced credentials, environment and tool files', () => fixture(({ root }) => {
    for (const file of ['.env', 'credentials.json', '.film/chat/session.json', '.design/jobs/job.json', 'node_modules/pkg/index.js']) {
      write(root, file, 'private data');
      film(root, `<section><iframe src="${file}"></iframe></section>`);
      assert(has(checkHandoff(root), 'handoff.excluded'), `Excluded reference was accepted: ${file}`);
    }
  }));

  test('handoff ignores unrelated history, packages, keys and other project files', () => fixture(({ root, out }) => {
    film(root);
    for (const file of ['.git/config', '.film/chat/session.json', '.design/jobs/job.json', 'node_modules/pkg/a.js', '.env.local', 'credentials.json', 'unrelated.txt']) write(root, file, 'unrelated private content');
    const report = packHandoff(root, out);
    assert(report.ok, JSON.stringify(report.errors));
    assert(report.files.length === 4, `Only two project files and two metadata files expected: ${report.files.join(', ')}`);
    assert(!fs.existsSync(path.join(out, '.film')) && !fs.existsSync(path.join(out, 'unrelated.txt')), 'The project folder was recursively copied.');
  }));

  test('handoff rejects actual external directory junctions and secret-file aliases', () => fixture(({ root, area }) => {
    film(root);
    write(area, 'outside/a.png', 'outside');
    fs.symlinkSync(path.join(area, 'outside'), path.join(root, 'linked'), 'junction');
    write(root, 'scenes/shot.html', '<img src="../linked/a.png">');
    assert(has(checkHandoff(root), 'handoff.path'), 'External directory junction was followed.');
    write(root, '.design/secret.json', '{}');
    fs.symlinkSync(path.join(root, '.design'), path.join(root, 'alias'), 'junction');
    write(root, 'scenes/shot.html', '<script src="../alias/secret.json"></script>');
    assert(has(checkHandoff(root), 'handoff.excluded'), 'An alias bypassed the tool-state exclusion.');
  }));

  test('handoff materializes internal directory junctions as ordinary files', () => fixture(({ root, out }) => {
    film(root);
    write(root, 'media/a.png', 'inside');
    fs.symlinkSync(path.join(root, 'media'), path.join(root, 'alias'), 'junction');
    write(root, 'scenes/shot.html', '<img src="../alias/a.png">');
    const report = packHandoff(root, out);
    assert(report.ok, JSON.stringify(report.errors));
    assert(fs.readFileSync(path.join(out, 'alias/a.png'), 'utf8') === 'inside' && !fs.lstatSync(path.join(out, 'alias')).isSymbolicLink(), 'Package must contain media bytes instead of a symlink.');
  }));

  test('handoff inventory hashes match every delivered source and the restart guide; originals stay unchanged', () => fixture(({ root, out }) => {
    film(root);
    const before = hash(fs.readFileSync(path.join(root, 'film.html')));
    const report = packHandoff(root, out);
    assert(report.ok, JSON.stringify(report.errors));
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'handoff-manifest.json'), 'utf8'));
    assert(manifest.files.length === 3 && manifest.files.every(item => hash(fs.readFileSync(path.join(out, item.path))) === item.sha256), 'Delivered bytes differ from the inventory.');
    assert(hash(fs.readFileSync(path.join(root, 'film.html'))) === before, 'Source was modified.');
    assert(!JSON.stringify(manifest).includes(root), 'Absolute source paths must not be written into the portable manifest.');
  }));

  test('handoff refuses an existing output even when it is empty or contains someone else\'s files', () => fixture(({ root, out }) => {
    film(root);
    fs.mkdirSync(out);
    assert(has(packHandoff(root, out), 'handoff.output.exists'), 'An existing empty directory was reused.');
    write(out, 'keep.txt', 'keep');
    assert(has(packHandoff(root, out), 'handoff.output.exists') && fs.readFileSync(path.join(out, 'keep.txt'), 'utf8') === 'keep', 'Existing output was overwritten.');
  }));

  test('handoff refuses output inside the project or through a junction into it', () => fixture(({ root, area }) => {
    film(root);
    assert(has(packHandoff(root, path.join(root, 'delivery')), 'handoff.output.inside'), 'Nested source output was allowed.');
    fs.symlinkSync(root, path.join(area, 'source-alias'), 'junction');
    assert(has(packHandoff(root, path.join(area, 'source-alias', 'delivery')), 'handoff.output.inside'), 'Output parent symlink bypassed the source boundary.');
    assert(!fs.existsSync(path.join(root, 'delivery')), 'Source directory was changed.');
  }));

  test('handoff supports explicit additional files without treating directories as include-all', () => fixture(({ root }) => {
    film(root);
    write(root, 'notes/approved.txt', 'approved source notes');
    const report = checkHandoff(root, { include: ['notes/approved.txt'] });
    assert(report.ok && report.files.includes('notes/approved.txt'), JSON.stringify(report.errors));
    assert(!checkHandoff(root, { include: ['notes'] }).ok && !checkHandoff(root, { include: ['missing.txt'] }).ok, 'Include must name real files.');
  }));

  test('handoff rejects malformed project JSON and absent project entry files', () => fixture(({ root }) => {
    assert(has(checkHandoff(root), 'handoff.entry'), 'An arbitrary folder was treated as a supported project.');
    write(root, 'design-project.json', '{ invalid');
    assert(has(checkHandoff(root), 'handoff.json'), 'Malformed manifest JSON was accepted.');
  }));

  test('handoff blocks embedded issued-key patterns and masks reports', () => fixture(({ root, out }) => {
    film(root);
    const fake = 'sk-' + 'abcdefghij'.repeat(4);
    write(root, 'scenes/shot.html', `<script>const key = "${fake}";</script>`);
    const report = packHandoff(root, out);
    assert(!report.ok && report.errors.some(item => item.check.startsWith('secret.')), 'Embedded key was packaged.');
    assert(!JSON.stringify(report).includes(fake) && !fs.existsSync(out), 'Unmasked key appeared in the report or on disk.');
  }));

  test('handoff warns when oversized text cannot be scanned completely', () => fixture(({ root }) => {
    film(root);
    write(root, 'large.txt', 'x'.repeat(4 * 1024 * 1024 + 1));
    const report = checkHandoff(root, { include: ['large.txt'] });
    assert(report.ok && report.warnings.some(item => item.check === 'handoff.scan.limit'), 'Large-file scan limitation was hidden.');
  }));

  test('handoff rejects stale declared SHA-256 values and reserved metadata filenames', () => fixture(({ root }) => {
    write(root, 'design-project.json', { assets: [{ path: 'asset.txt', sha256: '0'.repeat(64) }], artifacts: [] });
    write(root, 'asset.txt', 'changed source');
    assert(has(checkHandoff(root), 'handoff.hash'), 'Stale declared asset hash was accepted.');
    write(root, 'design-project.json', { artifacts: [] });
    write(root, 'HANDOFF_README.md', 'owner file');
    assert(has(checkHandoff(root, { include: ['HANDOFF_README.md'] }), 'handoff.reserved'), 'Generated metadata would overwrite an owner file.');
  }));

  test('handoff discovers only exact media-stem WebVTT sidecars and language variants without hrefs', () => fixture(({ root, out }) => {
    film(root, '<section><video src="media/lecture.final.mp4#t=0,4"></video></section><section><audio src="media/bed.mp3"></audio></section>');
    write(root, 'media/lecture.final.mp4', 'footage');
    write(root, 'media/bed.mp3', 'instrumental music without words');
    const expected = ['lecture.final.vtt', 'lecture.final.ko.vtt', 'lecture.final.en-US.vtt', 'lecture.final.zh-Hant.vtt'];
    for (const file of [...expected, 'lecture.vtt', 'lecture.final-extra.vtt', 'lecture.final2.ko.vtt', 'lecture.final.x.vtt', 'lecture.final.en_US.vtt']) write(root, `media/${file}`, 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nCaption\n');
    const report = packHandoff(root, out);
    assert(report.ok, JSON.stringify(report.errors));
    const captions = report.files.filter(file => file.endsWith('.vtt')).sort();
    assert(JSON.stringify(captions) === JSON.stringify(expected.map(file => `media/${file}`).sort()), `Wrong companion set: ${captions.join(', ')}`);
    assert(expected.every(file => fs.existsSync(path.join(out, 'media', file))), 'Automatic subtitles were omitted from delivery.');
  }));

  test('handoff routes discovered subtitle sidecars through the same secret and path checks', () => fixture(({ root, area, out }) => {
    film(root, '<section><video src="media/voice.mp4"></video></section>');
    write(root, 'media/voice.mp4', 'footage');
    const fake = 'sk-' + 'abcdefghij'.repeat(4);
    write(root, 'media/voice.ko.vtt', `WEBVTT\n\n${fake}\n`);
    let report = packHandoff(root, out);
    assert(!report.ok && report.errors.some(item => item.check.startsWith('secret.')) && !JSON.stringify(report).includes(fake), 'Discovered subtitle bypassed masked secret scanning.');
    fs.unlinkSync(path.join(root, 'media/voice.ko.vtt'));
    write(area, 'outside/escape.vtt', 'WEBVTT\n');
    // A same-name directory junction is not a subtitle file and must fail normal file validation.
    fs.symlinkSync(path.join(area, 'outside'), path.join(root, 'media/voice.vtt'), 'junction');
    report = checkHandoff(root);
    assert(!report.ok && has(report, 'handoff.path'), 'Discovered sidecar bypassed the external-link boundary.');
  }));

  test('handoff does not resolve external-JS document-relative fetch and DOM paths against the module', () => fixture(({ root }) => {
    film(root);
    write(root, 'scenes/shot.html', '<script type="module" src="../js/app.js"></script>');
    write(root, 'js/app.js', 'fetch("./data.json"); image.src = "./photo.png"; const u = new URL("./module-data.json", import.meta.url);');
    write(root, 'js/module-data.json', '{}');
    write(root, 'scenes/data.json', '{}');
    write(root, 'scenes/photo.png', 'image');
    const report = checkHandoff(root, { include: ['scenes/data.json', 'scenes/photo.png'] });
    assert(report.ok, JSON.stringify(report.errors));
    assert(report.warnings.some(item => item.check === 'handoff.documentRelative'), 'Document-dependent paths must be reported.');
    assert(report.files.includes('js/module-data.json') && report.files.includes('scenes/data.json') && report.files.includes('scenes/photo.png'), 'Module-relative URL or explicit document assets were omitted.');
    assert(!report.files.includes('js/data.json') && !report.files.includes('js/photo.png'), 'Document-relative resources were guessed relative to the JS file.');
  }));
}
