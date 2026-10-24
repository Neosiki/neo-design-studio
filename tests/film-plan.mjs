/** Film sidecar regression tests; no provider, browser or npm dependency is required. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { scaffoldFilm, checkFilmPlan } from '../scripts/design/lib/film/plan.mjs';

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const has = (report, check) => report.errors.some((finding) => finding.check === check);
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'neodesign-film-test-'));

function cleanup(dir) {
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(dir));
  if (relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(dir).startsWith('neodesign-film-test-')) {
    throw new Error('Refusing to remove a path outside this test fixture.');
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

function withFilm(fn) {
  const dir = temp();
  try {
    scaffoldFilm(dir);
    const file = path.join(dir, 'film-plan.json');
    const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
    const save = () => fs.writeFileSync(file, JSON.stringify(plan, null, 2));
    fn({ dir, file, plan, save });
  } finally { cleanup(dir); }
}

function asset(dir, id = 'portrait', content = 'frozen reference', origin = 'user-supplied') {
  const relative = `media/${id}.txt`;
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  fs.writeFileSync(path.join(dir, relative), content);
  return { id, path: relative, sha256: hash(content), provenance: { origin, source: 'Test fixture supplied by the project owner', license: 'Owner-authorized test content' } };
}

const character = () => ({ id: 'lead', referenceAssetIds: ['portrait'], invariants: ['Keep the same outfit and face.'] });
const attempt = (overrides = {}) => ({
  id: 'take-1', shotId: 'title', provider: 'test-only', model: 'no-network', promptVersion: 'v1',
  referenceAssetIds: [], selected: false, ...overrides,
});

export function run(test, assert) {
  test('film scaffold creates a valid independent local plan with pending review', () => withFilm(({ dir, plan }) => {
    const report = checkFilmPlan(dir);
    assert(report.ok, JSON.stringify(report.errors));
    assert(report.warnings.length === 2 && report.warnings.every((item) => item.check === 'film.review.pending'), 'Pending human review must remain visible.');
    assert(plan.shots[0].duration === 4 && fs.existsSync(path.join(dir, 'scenes/title.html')), 'Four-second local scene is missing.');
    assert(!fs.existsSync(path.join(dir, 'design-project.json')), 'The optional scaffold must not invent or change a project manifest.');
  }));

  test('film scaffold refuses existing files before creating any new file', () => {
    const dir = temp();
    try {
      fs.writeFileSync(path.join(dir, 'film-plan.json'), 'keep this exact content');
      let error;
      try { scaffoldFilm(dir); } catch (caught) { error = caught; }
      assert(error, 'Existing files must cause refusal.');
      assert(fs.readFileSync(path.join(dir, 'film-plan.json'), 'utf8') === 'keep this exact content', 'An existing file was changed.');
      assert(!fs.existsSync(path.join(dir, 'film.html')), 'Refusal must happen before partial file writes.');
    } finally { cleanup(dir); }
  });

  test('film scaffold refuses an external scenes directory junction', () => {
    const dir = temp();
    const outside = temp();
    try {
      fs.symlinkSync(outside, path.join(dir, 'scenes'), 'junction');
      let error;
      try { scaffoldFilm(dir); } catch (caught) { error = caught; }
      assert(error, 'External scene symlinks must be refused.');
      assert(!fs.existsSync(path.join(dir, 'film.html')) && !fs.existsSync(path.join(outside, 'title.html')), 'A file escaped the project or the refusal wrote partial files.');
    } finally { cleanup(dir); cleanup(outside); }
  });

  test('film checker reports a missing plan without throwing', () => {
    const dir = temp();
    try { assert(has(checkFilmPlan(dir), 'film.plan.file'), 'Missing plan was not reported.'); } finally { cleanup(dir); }
  });

  test('film checker reports malformed JSON without throwing', () => withFilm(({ dir, file }) => {
    fs.writeFileSync(file, '{ invalid');
    assert(has(checkFilmPlan(dir), 'film.plan.json'), 'Malformed JSON was not reported.');
  }));

  test('film schema requires character continuity states and rejects unknown fields', () => withFilm(({ dir, plan, save }) => {
    delete plan.shots[0].startState;
    plan.unapprovedExtension = true;
    save();
    const report = checkFilmPlan(dir);
    assert(!report.ok && report.errors.filter((item) => item.check === 'film.schema').length >= 2, 'Required/closed schema validation did not run.');
  }));

  for (const collection of ['shots', 'characters', 'assets', 'generationAttempts']) {
    test(`film checker rejects duplicate ${collection} ids`, () => withFilm(({ dir, plan, save }) => {
      if (collection === 'characters') {
        plan.assets.push(asset(dir));
        plan.characters.push(character());
      } else if (collection === 'assets') plan.assets.push(asset(dir));
      else if (collection === 'generationAttempts') plan.generationAttempts.push(attempt());
      plan[collection].push(structuredClone(plan[collection][0]));
      save();
      assert(has(checkFilmPlan(dir), 'film.id.duplicate'), `Duplicate ${collection} id was not detected.`);
    }));
  }

  test('film checker rejects dangling shot character ids', () => withFilm(({ dir, plan, save }) => {
    plan.shots[0].characterIds = ['missing-character'];
    save();
    assert(has(checkFilmPlan(dir), 'film.ref.missing'), 'Dangling character was accepted.');
  }));

  test('film checker rejects dangling character reference assets', () => withFilm(({ dir, plan, save }) => {
    plan.characters.push(character());
    save();
    assert(has(checkFilmPlan(dir), 'film.ref.missing'), 'Dangling reference image was accepted.');
  }));

  test('film checker rejects dangling attempt reference assets and shots', () => withFilm(({ dir, plan, save }) => {
    plan.generationAttempts.push(attempt({ shotId: 'missing-shot', referenceAssetIds: ['missing-reference'] }));
    save();
    assert(checkFilmPlan(dir).errors.filter((item) => item.check === 'film.ref.missing').length === 2, 'Both dangling references must be reported.');
  }));

  test('film checker rejects repeated references within a character', () => withFilm(({ dir, plan, save }) => {
    plan.assets.push(asset(dir));
    plan.characters.push({ ...character(), referenceAssetIds: ['portrait', 'portrait'] });
    save();
    assert(has(checkFilmPlan(dir), 'film.ref.duplicate'), 'Duplicate references were accepted.');
  }));

  for (const unsafe of ['../outside.txt', '..\\outside.txt', 'C:\\outside.txt', '/outside.txt', 'media/file.txt:stream']) {
    test(`film checker rejects unsafe asset path ${unsafe}`, () => withFilm(({ dir, plan, save }) => {
      const frozen = asset(dir);
      frozen.path = unsafe;
      plan.assets.push(frozen);
      save();
      assert(has(checkFilmPlan(dir), 'film.asset.file'), 'Unsafe asset path was accepted.');
    }));
  }

  test('film checker rejects assets escaping through an actual directory junction', () => withFilm(({ dir, plan, save }) => {
    const outside = temp();
    try {
      fs.writeFileSync(path.join(outside, 'outside.txt'), 'outside content');
      fs.symlinkSync(outside, path.join(dir, 'linked'), 'junction');
      plan.assets.push({ id: 'escape', path: 'linked/outside.txt', sha256: hash('outside content'), provenance: { origin: 'user-supplied', source: 'fixture', license: 'fixture' } });
      save();
      assert(has(checkFilmPlan(dir), 'film.asset.file'), 'The checker followed a symlink outside the project.');
    } finally { cleanup(outside); }
  }));

  test('film checker permits an internal asset directory junction', () => withFilm(({ dir, plan, save }) => {
    const frozen = asset(dir);
    fs.symlinkSync(path.join(dir, 'media'), path.join(dir, 'linked'), 'junction');
    frozen.path = 'linked/portrait.txt';
    plan.assets.push(frozen);
    save();
    assert(checkFilmPlan(dir).ok, JSON.stringify(checkFilmPlan(dir).errors));
  }));

  test('film checker rejects changed frozen asset contents', () => withFilm(({ dir, plan, save }) => {
    const frozen = asset(dir);
    plan.assets.push(frozen);
    fs.writeFileSync(path.join(dir, frozen.path), 'changed after approval');
    save();
    assert(has(checkFilmPlan(dir), 'film.asset.hash'), 'Hash mismatch was not detected.');
  }));

  test('film checker rejects missing asset files', () => withFilm(({ dir, plan, save }) => {
    const frozen = asset(dir);
    plan.assets.push(frozen);
    fs.unlinkSync(path.join(dir, frozen.path));
    save();
    assert(has(checkFilmPlan(dir), 'film.asset.file'), 'Missing asset file was accepted.');
  }));

  test('film checker rejects traversal in a shot page', () => withFilm(({ dir, plan, save }) => {
    plan.shots[0].page = '../outside.html';
    save();
    assert(has(checkFilmPlan(dir), 'film.shot.page'), 'Unsafe shot page was accepted.');
  }));

  test('film checker rejects missing shot pages', () => withFilm(({ dir, plan, save }) => {
    plan.shots[0].page = 'scenes/missing.html';
    save();
    assert(has(checkFilmPlan(dir), 'film.shot.page'), 'Missing shot page was accepted.');
  }));

  for (const duration of [0, -1]) {
    test(`film checker rejects duration ${duration}`, () => withFilm(({ dir, plan, save }) => {
      plan.shots[0].duration = duration;
      save();
      assert(!checkFilmPlan(dir).ok, 'Nonpositive duration was accepted.');
    }));
  }

  test('film checker rejects infinite duration encoded as a JSON exponent', () => withFilm(({ dir, file }) => {
    const source = fs.readFileSync(file, 'utf8').replace('"duration": 4', '"duration": 1e400');
    fs.writeFileSync(file, source);
    assert(has(checkFilmPlan(dir), 'film.duration'), 'Infinite duration was accepted.');
  }));

  test('film schema rejects a selected attempt without outputAssetId', () => withFilm(({ dir, plan, save }) => {
    plan.generationAttempts.push(attempt({ selected: true }));
    save();
    assert(has(checkFilmPlan(dir), 'film.schema'), 'Selected attempt with no output was accepted.');
  }));

  test('film checker rejects a selected attempt referencing an absent output asset', () => withFilm(({ dir, plan, save }) => {
    plan.generationAttempts.push(attempt({ selected: true, outputAssetId: 'absent' }));
    save();
    assert(has(checkFilmPlan(dir), 'film.attempt.output'), 'Missing selected output record was accepted.');
  }));

  test('film checker rejects a selected output whose recorded file was removed', () => withFilm(({ dir, plan, save }) => {
    const output = asset(dir, 'output', 'generated result', 'generated');
    plan.assets.push(output);
    plan.generationAttempts.push(attempt({ selected: true, outputAssetId: output.id }));
    fs.unlinkSync(path.join(dir, output.path));
    save();
    assert(has(checkFilmPlan(dir), 'film.asset.file'), 'Removed selected output file was accepted.');
  }));

  test('film checker permits only one selected attempt per shot', () => withFilm(({ dir, plan, save }) => {
    const output = asset(dir, 'output', 'generated result', 'generated');
    plan.assets.push(output);
    plan.generationAttempts.push(attempt({ selected: true, outputAssetId: output.id }), attempt({ id: 'take-2', selected: true, outputAssetId: output.id }));
    save();
    assert(has(checkFilmPlan(dir), 'film.attempt.selection'), 'Two selected attempts were accepted.');
  }));

  test('film checker accepts a frozen selected output with resolved character references', () => withFilm(({ dir, plan, save }) => {
    plan.assets.push(asset(dir), asset(dir, 'output', 'generated result', 'generated'));
    plan.characters.push(character());
    plan.shots[0].characterIds.push('lead');
    plan.generationAttempts.push(attempt({ selected: true, outputAssetId: 'output', referenceAssetIds: ['portrait'], seed: 42 }));
    save();
    const report = checkFilmPlan(dir);
    assert(report.ok, JSON.stringify(report.errors));
    assert(report.warnings.some((item) => item.check === 'film.review.pending'), 'A generation seed must not waive human review.');
  }));

  test('film checker rejects unknown provenance and empty license data', () => withFilm(({ dir, plan, save }) => {
    plan.assets.push(asset(dir, 'unknown', 'content', 'unknown'));
    save();
    assert(has(checkFilmPlan(dir), 'film.asset.provenance'), 'Unknown provenance was accepted.');
    plan.assets[0].provenance.license = '';
    save();
    assert(has(checkFilmPlan(dir), 'film.schema'), 'Empty license was accepted.');
  }));

  test('film checker blocks failed human review and clears warnings only after both reviews pass', () => withFilm(({ dir, plan, save }) => {
    plan.shots[0].visualReview = { status: 'failed', notes: 'Wrong outfit.' };
    save();
    assert(has(checkFilmPlan(dir), 'film.review.failed'), 'Failed visual review was accepted.');
    plan.visualReview.status = 'passed';
    plan.shots[0].visualReview.status = 'passed';
    save();
    const report = checkFilmPlan(dir);
    assert(report.ok && report.warnings.length === 0, JSON.stringify(report));
  }));

  test('film edit document stays script-free and points to the exact four-second scene', () => withFilm(({ dir }) => {
    const source = fs.readFileSync(path.join(dir, 'film.html'), 'utf8');
    assert(!/<script\b/i.test(source), 'The edit document must not install a parent runtime.');
    assert(source.includes('src="scenes/title.html#t=0,4"') && source.includes('id="title"'), 'OpenFilm edit document reference is wrong.');
    assert(/content="width=1920, height=1080"/.test(source) && !/<iframe[^>]+\s(?:width|height)=/.test(source), 'Edit must use OpenFilm stage dimensions and allowed clip attributes.');
    assert(!/https?:\/\//.test(source), 'Local scaffold must not fetch network resources.');
  }));

  test('film scene exposes a deterministic seekable four-second window.film contract', () => withFilm(({ dir }) => {
    const source = fs.readFileSync(path.join(dir, 'scenes/title.html'), 'utf8');
    const script = source.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
    const elements = new Map();
    const context = { window: {}, document: { getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, { style: {} });
      return elements.get(id);
    } } };
    vm.runInNewContext(script, context);
    const film = context.window.film;
    assert(film.duration === 4 && typeof film.frame === 'function' && typeof film.ready?.then === 'function', 'Scene runtime contract is missing.');
    const state = () => JSON.stringify([...elements]);
    film.frame(0);
    const opening = state();
    film.frame(2);
    assert(state() !== opening, 'Scene is not animated.');
    film.frame(0);
    assert(state() === opening, 'Seeking backward changed the first frame.');
    film.frame(4);
    const ending = state();
    film.frame(99);
    assert(state() === ending, 'Scene time must clamp to its duration.');
    assert(!/https?:\/\/|requestAnimationFrame|setInterval|setTimeout|Math\.random|Date\.now/.test(source), 'A scene must not depend on network, wall time or unseeded randomness.');
  }));
}
