import fs from 'node:fs/promises';
import path from 'node:path';
import type { Operation, PlanValidationResult, ValidationIssue } from '@medialoom/contracts';

export interface PlanValidationOptions {
  operations: Operation[];
  destinationRoot: string;
}

export class PlanValidator {
  async validate(options: PlanValidationOptions): Promise<PlanValidationResult> {
    const { operations, destinationRoot } = options;
    const issues: ValidationIssue[] = [];

    const resolvedRoot = path.resolve(destinationRoot);

    // Track state for cross-operation checks
    const targetFilePaths = new Map<string, number>(); // normalized path -> operation index
    const createdDirectories = new Set<string>(); // normalized path
    const scheduledDirectories = new Map<string, number>(); // normalized path -> operation index

    // First pass: collect scheduled directories
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (!op) continue;
      if (op.type === 'mkdir') {
        const norm = path.normalize(path.resolve(op.path));
        scheduledDirectories.set(norm, i);
      }
    }

    // Main validation pass
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (!op) continue;

      if (op.type === 'mkdir') {
        this.validatePathTraversal(op.path, i, issues);
        this.validateDestinationRootContainment(op.path, resolvedRoot, i, issues);

        const normPath = path.normalize(path.resolve(op.path));

        // Check duplicate directory operations
        if (createdDirectories.has(normPath)) {
          issues.push({
            severity: 'warning',
            code: 'DUPLICATE_MKDIR',
            message: `Directory mkdir operation is duplicated: ${op.path}`,
            operationIndex: i,
            path: op.path,
          });
        }
        createdDirectories.add(normPath);

        // Check if a regular file already exists at this directory path
        try {
          const stat = await fs.stat(normPath);
          if (!stat.isDirectory()) {
            issues.push({
              severity: 'error',
              code: 'DESTINATION_COLLISION',
              message: `A non-directory file already exists at target directory path: ${op.path}`,
              operationIndex: i,
              path: op.path,
            });
          }
        } catch {
          // Path does not exist, which is expected for mkdir
        }
      } else if (op.type === 'move') {
        this.validatePathTraversal(op.source, i, issues);
        this.validatePathTraversal(op.destination, i, issues);
        this.validateDestinationRootContainment(op.destination, resolvedRoot, i, issues);

        const normDest = path.normalize(path.resolve(op.destination));

        // Check duplicate / conflicting destinations
        if (targetFilePaths.has(normDest)) {
          const prevIndex = targetFilePaths.get(normDest);
          issues.push({
            severity: 'error',
            code: 'DUPLICATE_DESTINATION',
            message: `Destination path is already targeted by operation #${(prevIndex ?? 0) + 1}: ${op.destination}`,
            operationIndex: i,
            path: op.destination,
          });
        }
        targetFilePaths.set(normDest, i);

        // Check source existence
        try {
          const stat = await fs.stat(op.source);
          if (stat.isDirectory()) {
            issues.push({
              severity: 'error',
              code: 'SOURCE_IS_DIRECTORY',
              message: `Source media path is a directory, expected a file: ${op.source}`,
              operationIndex: i,
              path: op.source,
            });
          }
        } catch {
          issues.push({
            severity: 'error',
            code: 'SOURCE_NOT_FOUND',
            message: `Source media file does not exist: ${op.source}`,
            operationIndex: i,
            path: op.source,
          });
        }

        // Check destination collision
        try {
          await fs.stat(normDest);
          issues.push({
            severity: 'error',
            code: 'DESTINATION_COLLISION',
            message: `Destination file already exists on filesystem: ${op.destination}`,
            operationIndex: i,
            path: op.destination,
          });
        } catch {
          // Expected: destination does not exist
        }

        // Check operation ordering (parent directory must be created before move or pre-exist)
        await this.validateDirectoryOrdering(
          path.dirname(normDest),
          i,
          resolvedRoot,
          scheduledDirectories,
          issues,
        );
      } else if (op.type === 'writeText') {
        this.validatePathTraversal(op.path, i, issues);
        this.validateDestinationRootContainment(op.path, resolvedRoot, i, issues);

        const normPath = path.normalize(path.resolve(op.path));

        // Check duplicate / conflicting destinations
        if (targetFilePaths.has(normPath)) {
          const prevIndex = targetFilePaths.get(normPath);
          issues.push({
            severity: 'error',
            code: 'DUPLICATE_DESTINATION',
            message: `Destination path is already targeted by operation #${(prevIndex ?? 0) + 1}: ${op.path}`,
            operationIndex: i,
            path: op.path,
          });
        }
        targetFilePaths.set(normPath, i);

        // Check destination collision
        try {
          await fs.stat(normPath);
          issues.push({
            severity: 'error',
            code: 'DESTINATION_COLLISION',
            message: `Destination sidecar file already exists on filesystem: ${op.path}`,
            operationIndex: i,
            path: op.path,
          });
        } catch {
          // Expected: destination does not exist
        }

        // Check operation ordering
        await this.validateDirectoryOrdering(
          path.dirname(normPath),
          i,
          resolvedRoot,
          scheduledDirectories,
          issues,
        );
      }
    }

    const hasErrors = issues.some((issue) => issue.severity === 'error');
    return {
      valid: !hasErrors,
      issues,
    };
  }

  private validatePathTraversal(
    filePath: string,
    operationIndex: number,
    issues: ValidationIssue[],
  ): void {
    if (filePath.includes('\0')) {
      issues.push({
        severity: 'error',
        code: 'PATH_TRAVERSAL',
        message: `Path contains forbidden null byte: ${filePath}`,
        operationIndex,
        path: filePath,
      });
      return;
    }

    // Detect explicit "../" path traversal sequences
    const segments = filePath.split(/[/\\]/);
    if (segments.includes('..')) {
      issues.push({
        severity: 'error',
        code: 'PATH_TRAVERSAL',
        message: `Path contains suspicious traversal segment (".."): ${filePath}`,
        operationIndex,
        path: filePath,
      });
    }
  }

  private validateDestinationRootContainment(
    targetPath: string,
    resolvedRoot: string,
    operationIndex: number,
    issues: ValidationIssue[],
  ): void {
    const resolvedTarget = path.resolve(targetPath);
    const isContained =
      resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep);

    if (!isContained) {
      issues.push({
        severity: 'error',
        code: 'DESTINATION_ROOT_ESCAPE',
        message: `Target path "${targetPath}" escapes destination root "${resolvedRoot}".`,
        operationIndex,
        path: targetPath,
      });
    }
  }

  private async validateDirectoryOrdering(
    parentDir: string,
    operationIndex: number,
    resolvedRoot: string,
    scheduledDirectories: Map<string, number>,
    issues: ValidationIssue[],
  ): Promise<void> {
    if (parentDir === resolvedRoot) {
      return;
    }

    // Check if parent directory was scheduled in an operation
    const mkdirIndex = scheduledDirectories.get(parentDir);
    if (mkdirIndex !== undefined) {
      if (mkdirIndex > operationIndex) {
        issues.push({
          severity: 'error',
          code: 'INVALID_OPERATION_ORDER',
          message: `Operation attempts to write into directory "${parentDir}" before its mkdir operation #${mkdirIndex + 1}.`,
          operationIndex,
          path: parentDir,
        });
      }
      return;
    }

    // If not scheduled in operations, verify if it already exists on disk
    try {
      const stat = await fs.stat(parentDir);
      if (!stat.isDirectory()) {
        issues.push({
          severity: 'error',
          code: 'INVALID_OPERATION_ORDER',
          message: `Parent path "${parentDir}" exists but is not a directory.`,
          operationIndex,
          path: parentDir,
        });
      }
    } catch {
      issues.push({
        severity: 'error',
        code: 'INVALID_OPERATION_ORDER',
        message: `Parent directory "${parentDir}" is neither scheduled for creation nor existing on disk.`,
        operationIndex,
        path: parentDir,
      });
    }
  }
}

export const defaultPlanValidator = new PlanValidator();
