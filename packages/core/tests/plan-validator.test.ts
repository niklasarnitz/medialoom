import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Operation } from '@medialoom/contracts';
import { PlanValidator } from '../src';

describe('PlanValidator', () => {
  const validator = new PlanValidator();
  let tempDir: string;
  let sourceDir: string;
  let destinationDir: string;
  let sampleSourceFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'medialoom-val-test-'));
    sourceDir = path.join(tempDir, 'incoming');
    destinationDir = path.join(tempDir, 'movies');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(destinationDir, { recursive: true });

    sampleSourceFile = path.join(sourceDir, 'The.Matrix.1999.mkv');
    await fs.writeFile(sampleSourceFile, 'dummy video data');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('validates a valid, well-ordered plan without errors', async () => {
    const targetFolder = path.join(destinationDir, 'The Matrix (1999) [tmdbid-603]');
    const targetMedia = path.join(targetFolder, 'The Matrix (1999) [tmdbid-603].mkv');
    const targetNfo = path.join(targetFolder, 'movie.nfo');

    const operations: Operation[] = [
      {
        type: 'mkdir',
        path: targetFolder,
      },
      {
        type: 'move',
        source: sampleSourceFile,
        destination: targetMedia,
      },
      {
        type: 'writeText',
        path: targetNfo,
        content: '<movie></movie>',
      },
    ];

    const result = await validator.validate({
      operations,
      destinationRoot: destinationDir,
    });

    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('reports error when source file is missing', async () => {
    const targetFolder = path.join(destinationDir, 'Missing (2020)');
    const nonExistentSource = path.join(sourceDir, 'non-existent-video.mkv');

    const operations: Operation[] = [
      {
        type: 'mkdir',
        path: targetFolder,
      },
      {
        type: 'move',
        source: nonExistentSource,
        destination: path.join(targetFolder, 'Missing (2020).mkv'),
      },
    ];

    const result = await validator.validate({
      operations,
      destinationRoot: destinationDir,
    });

    expect(result.valid).toBe(false);
    const issue = result.issues.find((i) => i.code === 'SOURCE_NOT_FOUND');
    expect(issue).toBeDefined();
    expect(issue?.path).toBe(nonExistentSource);
  });

  it('reports error when destination media file already exists (collision)', async () => {
    const targetFolder = path.join(destinationDir, 'The Matrix (1999) [tmdbid-603]');
    await fs.mkdir(targetFolder, { recursive: true });

    const existingDestination = path.join(targetFolder, 'The Matrix (1999) [tmdbid-603].mkv');
    await fs.writeFile(existingDestination, 'already exists');

    const operations: Operation[] = [
      {
        type: 'mkdir',
        path: targetFolder,
      },
      {
        type: 'move',
        source: sampleSourceFile,
        destination: existingDestination,
      },
    ];

    const result = await validator.validate({
      operations,
      destinationRoot: destinationDir,
    });

    expect(result.valid).toBe(false);
    const issue = result.issues.find((i) => i.code === 'DESTINATION_COLLISION');
    expect(issue).toBeDefined();
    expect(issue?.path).toBe(existingDestination);
  });

  it('reports error on path traversal sequence ("..") or null byte', async () => {
    const operations: Operation[] = [
      {
        type: 'mkdir',
        path: `${destinationDir}/subdir/../escaped`,
      },
      {
        type: 'writeText',
        path: path.join(destinationDir, 'bad\0file.nfo'),
        content: 'data',
      },
    ];

    const result = await validator.validate({
      operations,
      destinationRoot: destinationDir,
    });

    expect(result.valid).toBe(false);
    const traversalIssues = result.issues.filter((i) => i.code === 'PATH_TRAVERSAL');
    expect(traversalIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('reports error when target path escapes destination root', async () => {
    const outsideTarget = path.join(tempDir, 'outside', 'movie.nfo');

    const operations: Operation[] = [
      {
        type: 'writeText',
        path: outsideTarget,
        content: '<movie></movie>',
      },
    ];

    const result = await validator.validate({
      operations,
      destinationRoot: destinationDir,
    });

    expect(result.valid).toBe(false);
    const issue = result.issues.find((i) => i.code === 'DESTINATION_ROOT_ESCAPE');
    expect(issue).toBeDefined();
  });

  it('reports error when duplicate destination paths are targeted within the same plan', async () => {
    const targetFolder = path.join(destinationDir, 'The Matrix (1999)');
    const duplicatePath = path.join(targetFolder, 'file.nfo');

    const operations: Operation[] = [
      {
        type: 'mkdir',
        path: targetFolder,
      },
      {
        type: 'writeText',
        path: duplicatePath,
        content: 'content 1',
      },
      {
        type: 'writeText',
        path: duplicatePath,
        content: 'content 2',
      },
    ];

    const result = await validator.validate({
      operations,
      destinationRoot: destinationDir,
    });

    expect(result.valid).toBe(false);
    const issue = result.issues.find((i) => i.code === 'DUPLICATE_DESTINATION');
    expect(issue).toBeDefined();
  });

  it('reports error on invalid operation ordering (file write before directory creation)', async () => {
    const targetFolder = path.join(destinationDir, 'Uncreated Folder');
    const targetFile = path.join(targetFolder, 'movie.nfo');

    const operations: Operation[] = [
      {
        type: 'writeText',
        path: targetFile,
        content: '<movie></movie>',
      },
      {
        type: 'mkdir',
        path: targetFolder,
      },
    ];

    const result = await validator.validate({
      operations,
      destinationRoot: destinationDir,
    });

    expect(result.valid).toBe(false);
    const issue = result.issues.find((i) => i.code === 'INVALID_OPERATION_ORDER');
    expect(issue).toBeDefined();
  });
});
