import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Cover AI Engine Integration', () => {
  const scriptPath = path.resolve(__dirname, '../scripts/cover_ai.py');
  const tmpDir = os.tmpdir();

  it('runs depth estimation and outputs depth map and mask', async () => {
    const inputPath = path.join(tmpDir, `test_ai_in_${Date.now()}.png`);
    const outputPath = path.join(tmpDir, `test_ai_depth_${Date.now()}.png`);
    const maskPath = path.join(tmpDir, `test_ai_mask_${Date.now()}.png`);

    // Create a 64x64 test image
    await new Promise<void>((resolve, reject) => {
      execFile(
        'python3',
        ['-c', `from PIL import Image; Image.new('RGB', (80, 80), 'darkred').save('${inputPath}')`],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const result = await new Promise<any>((resolve, reject) => {
      execFile(
        'python3',
        [scriptPath, 'depth', '--input', inputPath, '--output', outputPath, '--mask', maskPath, '--threshold', '120'],
        (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          const lines = stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          try {
            resolve(JSON.parse(lastLine));
          } catch {
            reject(new Error(`Failed to parse: ${stdout}`));
          }
        }
      );
    });

    expect(result.status).toBe('ok');
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.existsSync(maskPath)).toBe(true);

    // Clean up
    try {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
      fs.unlinkSync(maskPath);
    } catch {}
  }, 30000);

  it('runs aesthetic scorer and returns a valid 0-10 score', async () => {
    const inputPath = path.join(tmpDir, `test_ai_aes_${Date.now()}.png`);

    await new Promise<void>((resolve, reject) => {
      execFile(
        'python3',
        ['-c', `from PIL import Image; Image.new('RGB', (80, 80), 'navy').save('${inputPath}')`],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const result = await new Promise<any>((resolve, reject) => {
      execFile('python3', [scriptPath, 'aesthetic', '--input', inputPath], (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        try {
          resolve(JSON.parse(lastLine));
        } catch {
          reject(new Error(`Failed to parse: ${stdout}`));
        }
      });
    });

    expect(result.status).toBe('ok');
    expect(typeof result.aesthetic_score).toBe('number');
    expect(result.aesthetic_score).toBeGreaterThanOrEqual(0);
    expect(result.aesthetic_score).toBeLessThanOrEqual(10);

    try {
      fs.unlinkSync(inputPath);
    } catch {}
  }, 30000);
});
