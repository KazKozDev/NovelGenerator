import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logToTerminal, logStreamProgress, installConsoleBridge } from '../utils/terminalLogger';

describe('Terminal Logger', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends log message to /api/terminal-log via fetch', () => {
    logToTerminal('Test log message', 'TestAgent', 'info', { key: 'val' });

    expect(fetch).toHaveBeenCalledWith('/api/terminal-log', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('Test log message')
    }));
  });

  it('formats entry object correctly', () => {
    logToTerminal({
      message: 'Structured entry message',
      agent: 'Coordinator',
      level: 'stage',
      details: 'Chapter 1'
    });

    expect(fetch).toHaveBeenCalledWith('/api/terminal-log', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"agent":"Coordinator"')
    }));
  });

  it('throttles stream progress logs', () => {
    logStreamProgress('Generating Chapter 1', 100, 'Synthesis', true);
    expect(fetch).toHaveBeenCalledTimes(1);

    // Calling immediately without force should be throttled
    logStreamProgress('Generating Chapter 1', 110, 'Synthesis', false);
    expect(fetch).toHaveBeenCalledTimes(1);

    // Forcing bypasses throttle
    logStreamProgress('Generating Chapter 1', 250, 'Synthesis', true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('installs console bridge without crashing', () => {
    expect(() => installConsoleBridge()).not.toThrow();
  });
});
