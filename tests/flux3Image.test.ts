import { describe, expect, it } from 'vitest';
import { flux3Args } from '../services/flux3ImagePlugin';

describe('FLUX 3 on this Mac', () => {
  it('asks mflux for a 2:3 picture at the distilled checkpoint\'s 16 steps', () => {
    const args = flux3Args({ prompt: ' A key. ', seed: 7 }, '/tmp/out.png', '/models/flux3');
    expect(args).toEqual(['--model', '/models/flux3', '--prompt', 'A key.', '--width', '1024', '--height', '1536', '--steps', '16', '--seed', '7', '--output', '/tmp/out.png']);
  });

  it('keeps sizes and steps in what the model takes, and draws a new seed when none is given', () => {
    const args = flux3Args({ prompt: 'x', width: 1000, height: 99999, steps: 500 }, '/o.png', '/m');
    expect(args.slice(4, 10)).toEqual(['--width', '1008', '--height', '1536', '--steps', '16']);
    expect(Number(args[11])).toBeGreaterThanOrEqual(0);
  });
});
