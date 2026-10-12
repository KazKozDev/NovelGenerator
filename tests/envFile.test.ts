import { describe, expect, it } from 'vitest';
import { setEnvLine } from '../utils/envFile';

describe('a setting written into an env file', () => {
  it('replaces its own line, adds one when there is none, and leaves every other line alone', () => {
    const file = '# keys\nQWEN_API_KEY=old\nHF_TOKEN=keep\n';
    expect(setEnvLine(file, 'QWEN_API_KEY', ' new ')).toBe('# keys\nQWEN_API_KEY=new\nHF_TOKEN=keep\n');
    expect(setEnvLine(file, 'ANTHROPIC_API_KEY', 'abc')).toBe('# keys\nQWEN_API_KEY=old\nHF_TOKEN=keep\nANTHROPIC_API_KEY=abc\n');
    expect(setEnvLine('', 'HF_TOKEN', 'abc')).toBe('HF_TOKEN=abc\n');
  });
  it('removes the line for an empty value, and a doubled line is left once', () => {
    expect(setEnvLine('A_KEY=1\nB_KEY=2\n', 'A_KEY', '')).toBe('B_KEY=2\n');
    expect(setEnvLine('A_KEY=1\nB_KEY=2\nA_KEY=3\n', 'A_KEY', '9')).toBe('A_KEY=9\nB_KEY=2\n');
  });
  it('refuses a name that is not a setting and a value of more than one line', () => {
    expect(() => setEnvLine('', 'bad name', 'x')).toThrow(); expect(() => setEnvLine('', 'A_KEY', 'x\nB_KEY=y')).toThrow();
  });
});
