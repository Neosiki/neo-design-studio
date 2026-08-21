import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { nowIso, writeJson, readJson } from './util.mjs';

function dir(ctx) { const d = path.join(ctx.dir, '.design', 'jobs'); fs.mkdirSync(d, { recursive: true }); return d; }
function file(ctx, id) { return path.join(dir(ctx), `${id}.json`); }
function id() { return `job-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`; }
export function createJob(ctx, { kind = 'render', artifacts = [] } = {}) {
  const job = { id: id(), kind, state: 'queued', createdAt: nowIso(), updatedAt: nowIso(), progress: { done: 0, total: artifacts.length, percent: 0 }, artifacts: artifacts.map((artifact) => ({ artifact, state: 'queued' })) };
  writeJson(file(ctx, job.id), job); return job;
}
export function loadJob(ctx, jobId) { const p = file(ctx, jobId); return fs.existsSync(p) ? readJson(p) : null; }
export function saveJob(ctx, job) { job.updatedAt = nowIso(); writeJson(file(ctx, job.id), job); return job; }
export function updateJob(ctx, job, patch = {}) { Object.assign(job, patch); return saveJob(ctx, job); }
export function startJob(ctx, job) {
  if (job.state === 'cancelled') return job;
  const total = job.progress?.total ?? job.artifacts?.length ?? 0;
  const done = (job.artifacts || []).filter((item) => item.state === 'done' || item.state === 'skipped').length;
  return updateJob(ctx, job, {
    state: 'running',
    startedAt: job.startedAt || nowIso(),
    progress: { done, total, percent: total ? Math.round(done / total * 100) : 100 },
  });
}
export function setJobProgress(ctx, job, done, total = job.progress?.total ?? job.artifacts?.length ?? 0) {
  const boundedDone = Math.max(0, Math.min(Number(done) || 0, Number(total) || 0));
  job.progress = { done: boundedDone, total, percent: total ? Math.round(boundedDone / total * 100) : 100 };
  return saveJob(ctx, job);
}
export function isJobCancelled(ctx, job) { return job.state === 'cancelled' || fs.existsSync(path.join(dir(ctx), `${job.id}.cancel`)); }
export function cancelJob(ctx, job) {
  if (job.state === 'completed' || job.state === 'failed') return job;
  fs.writeFileSync(path.join(dir(ctx), `${job.id}.cancel`), nowIso(), 'utf8');
  for (const item of job.artifacts || []) if (item.state === 'queued' || item.state === 'running') item.state = 'cancelled';
  return updateJob(ctx, job, { state: 'cancelled', cancelledAt: nowIso(), cancelRequestedAt: job.cancelRequestedAt || nowIso() });
}
export function retryJob(ctx, job) {
  const marker = path.join(dir(ctx), `${job.id}.cancel`);
  if (fs.existsSync(marker)) fs.rmSync(marker, { force: true });
  for (const item of job.artifacts || []) if (item.state === 'failed' || item.state === 'cancelled' || item.state === 'running') item.state = 'queued';
  const done = (job.artifacts || []).filter((item) => item.state === 'done' || item.state === 'skipped').length;
  job.state = 'queued'; job.error = undefined; job.failedArtifact = undefined; job.cancelledAt = undefined;
  job.progress = { ...(job.progress || {}), done, total: job.artifacts?.length || 0, percent: job.artifacts?.length ? Math.round(done / job.artifacts.length * 100) : 100 };
  return saveJob(ctx, job);
}
export function listJobs(ctx) { return fs.readdirSync(dir(ctx)).filter((n) => n.endsWith('.json')).map((n) => readJson(path.join(dir(ctx), n))).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
