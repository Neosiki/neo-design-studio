import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJob, loadJob, cancelJob, retryJob, listJobs, startJob, setJobProgress } from '../scripts/design/lib/jobs.mjs';
import { artifactFreshness } from '../scripts/design/lib/freshness.mjs';
import { buildSuggestions, previewSuggestion, applySuggestion } from '../scripts/design/lib/suggestions.mjs';

export function run(test, assert) {
  console.log('\\nP0 작업·캐시·검수 제안');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-p0-'));
  const ctx = { dir: root, manifest: { artifacts: [] } };
  test('작업을 만들고 목록·상태로 조회한다', () => {
    const job = createJob(ctx, { kind: 'render', artifacts: ['scene-a', 'scene-b'] });
    assert(job.state === 'queued' && job.progress.total === 2, '작업 초기 상태가 잘못됨');
    assert(loadJob(ctx, job.id).id === job.id, '작업 로드 실패');
    assert(listJobs(ctx).some((x) => x.id === job.id), '작업 목록 누락');
  });
  test('작업 취소 후 재시도 상태로 되돌린다', () => {
    const job = createJob(ctx, { artifacts: ['scene-a'] });
    cancelJob(ctx, job);
    assert(loadJob(ctx, job.id).state === 'cancelled', '취소 상태 누락');
    retryJob(ctx, job);
    assert(loadJob(ctx, job.id).state === 'queued', '재시도 상태 누락');
  });
  test('완료 산출물을 보존한 채 실패 작업을 재개한다', () => {
    const job = createJob(ctx, { artifacts: ['scene-a', 'scene-b'] });
    job.artifacts[0].state = 'done'; job.artifacts[1].state = 'failed';
    startJob(ctx, job); setJobProgress(ctx, job, 1, 2);
    assert(loadJob(ctx, job.id).progress.percent === 50, '진행률 계산 누락');
    retryJob(ctx, job);
    const resumed = loadJob(ctx, job.id);
    assert(resumed.artifacts[0].state === 'done' && resumed.artifacts[1].state === 'queued', '재개 대상 상태가 잘못됨');
  });
  test('산출물 해시가 다르면 stale 사유를 제공한다', () => {
    const output = path.join(root, 'out.html'); fs.writeFileSync(output, 'a');
    const ref = { id: 'a', outputs: [{ path: 'out.html', sha256: 'wrong' }] };
    const r = artifactFreshness(ctx, ref, false);
    assert(r.stale && r.reasons.some((x) => x.includes('산출물 변경')), `stale 사유 누락: ${r.reasons}`);
  });
  test('검수 오류를 자동 수정 제안과 미리보기로 변환한다', () => {
    const report = { groups: [{ findings: [{ check: 'color.contrast', level: 'error', where: 'scene-a.title', message: '대비 부족' }] }] };
    const list = buildSuggestions(report);
    assert(list.length === 1 && list[0].requiresApproval, '제안 생성 실패');
    const preview = previewSuggestion(list[0]);
    assert(preview.applied === false && preview.patch.previewOnly, '미리보기 안전 속성 누락');
  });
  test('승인 전에는 원본을 바꾸지 않고 승인 후 JSON을 백업·적용한다', () => {
    const report = { groups: [{ findings: [{ check: 'content.placeholder', level: 'warn', where: 'scene-a.title', message: '자리표시자' }] }] };
    const suggestion = buildSuggestions(report)[0];
    const source = path.join(root, 'source.json'); fs.writeFileSync(source, JSON.stringify({ scene: { title: '초안' } }));
    const before = applySuggestion(ctx, suggestion, { sourceFile: 'source.json', jsonPath: '/scene/title', value: '새 제목' });
    assert(before.applied === false && JSON.parse(fs.readFileSync(source)).scene.title === '초안', '승인 전 원본이 변경됨');
    const applied = applySuggestion(ctx, suggestion, { sourceFile: 'source.json', jsonPath: '/scene/title', value: '새 제목', approved: true });
    assert(applied.applied && applied.backup && JSON.parse(fs.readFileSync(source)).scene.title === '새 제목', '승인 적용 또는 백업 실패');
  });
  fs.rmSync(root, { recursive: true, force: true });
}
