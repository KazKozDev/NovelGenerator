/**
 * Terminal Logger Utility
 * Bridges client-side generation events, specialist agent activities,
 * and streaming metrics directly to the user's terminal running the dev server.
 */

export type TerminalLogLevel = 
  | 'info' 
  | 'stage' 
  | 'agent' 
  | 'llm' 
  | 'stream' 
  | 'success' 
  | 'warn' 
  | 'error';

export interface TerminalLogEntry {
  message: string;
  agent?: string;
  level?: TerminalLogLevel;
  details?: any;
  timestamp?: number;
}

const originalConsoleLog = typeof window !== 'undefined' ? window.console.log : console.log;
const originalConsoleWarn = typeof window !== 'undefined' ? window.console.warn : console.warn;
const originalConsoleError = typeof window !== 'undefined' ? window.console.error : console.error;

let bridgeInstalled = false;
let lastStreamLogTime = 0;
const STREAM_THROTTLE_MS = 1200;

/**
 * Send a structured log message to the terminal via the Vite backend middleware
 */
export function logToTerminal(
  entryOrMessage: TerminalLogEntry | string,
  agent: string = 'System',
  level: TerminalLogLevel = 'info',
  details?: any
): void {
  let entry: TerminalLogEntry;

  if (typeof entryOrMessage === 'string') {
    entry = {
      message: entryOrMessage,
      agent,
      level,
      details,
      timestamp: Date.now()
    };
  } else {
    entry = {
      agent: entryOrMessage.agent || agent,
      level: entryOrMessage.level || level,
      message: entryOrMessage.message,
      details: entryOrMessage.details ?? details,
      timestamp: entryOrMessage.timestamp || Date.now()
    };
  }

  // Print to browser console using original method to avoid recursion
  if (entry.level === 'error') {
    originalConsoleError(`[${entry.agent}] ${entry.message}`, entry.details || '');
  } else if (entry.level === 'warn') {
    originalConsoleWarn(`[${entry.agent}] ${entry.message}`, entry.details || '');
  } else {
    originalConsoleLog(`[${entry.agent}] ${entry.message}`, entry.details || '');
  }

  // Send to backend dev server
  const fetchFn = typeof window !== 'undefined' ? window.fetch : (typeof globalThis !== 'undefined' ? globalThis.fetch : undefined);
  if (fetchFn) {
    try {
      fetchFn('/api/terminal-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(entry),
        keepalive: true
      }).catch(() => {
        // Silently ignore if dev server is unreachable or disabled
      });
    } catch {
      // Ignore network errors

    }
  }
}

/**
 * Throttled stream logger for token generation so terminal updates frequently without flooding
 */
export function logStreamProgress(
  task: string,
  currentWords: number,
  agent: string = 'LLM',
  force: boolean = false
): void {
  const now = Date.now();
  if (force || now - lastStreamLogTime >= STREAM_THROTTLE_MS) {
    lastStreamLogTime = now;
    logToTerminal({
      message: `${task}: ~${currentWords} words generated`,
      agent,
      level: 'stream'
    });
  }
}

/**
 * Automatically intercepts console logs and forwards generation / agent messages
 * to the terminal window.
 */
export function installConsoleBridge(): void {
  if (bridgeInstalled || typeof window === 'undefined') return;
  bridgeInstalled = true;

  const extractAgentAndClean = (rawMsg: string): { agent: string; message: string; level: TerminalLogLevel } => {
    let clean = rawMsg.trim();
    let agent = 'System';
    let level: TerminalLogLevel = 'info';

    // Check for explicit brackets [AgentName]
    const bracketMatch = clean.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (bracketMatch) {
      agent = bracketMatch[1];
      clean = bracketMatch[2];
    } else if (clean.includes('Agent') || clean.includes('agent')) {
      if (clean.includes('Structure')) agent = 'StructureAgent';
      else if (clean.includes('Character')) agent = 'CharacterAgent';
      else if (clean.includes('Scene')) agent = 'SceneAgent';
      else if (clean.includes('Synthesis')) agent = 'SynthesisAgent';
      else if (clean.includes('Editing') || clean.includes('Polish')) agent = 'PolishAgent';
      else if (clean.includes('Coordinator') || clean.includes('hybrid')) agent = 'Coordinator';
      else agent = 'Agent';
    } else if (clean.includes('Ollama')) {
      agent = 'Ollama';
    } else if (clean.includes('Gemini')) {
      agent = 'Gemini';
    } else if (clean.includes('Coherence')) {
      agent = 'CoherenceManager';
    }

    if (clean.startsWith('✅') || clean.toLowerCase().includes('complete') || clean.toLowerCase().includes('success')) {
      level = 'success';
    } else if (clean.startsWith('⚠️') || clean.toLowerCase().includes('warn')) {
      level = 'warn';
    } else if (clean.startsWith('❌') || clean.toLowerCase().includes('error') || clean.toLowerCase().includes('failed')) {
      level = 'error';
    } else if (clean.startsWith('🚀') || clean.startsWith('📋') || clean.toLowerCase().includes('phase') || clean.toLowerCase().includes('starting')) {
      level = 'stage';
    }

    // Strip leading emojis for terminal clarity if present
    clean = clean.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]\s*/u, '');

    return { agent, message: clean, level };
  };

  const shouldForward = (msg: string): boolean => {
    if (!msg || typeof msg !== 'string') return false;
    // Filter out vite HMR spam
    if (msg.startsWith('[vite]') || msg.includes('hot updated')) return false;
    // Forward all generation, coordinator, agent, or error/warning logs
    if (
      msg.includes('Chapter') ||
      msg.includes('Agent') ||
      msg.includes('Phase') ||
      msg.includes('Ollama') ||
      msg.includes('Gemini') ||
      msg.includes('coherence') ||
      msg.includes('synthesis') ||
      msg.includes('generation') ||
      msg.includes('slots') ||
      msg.includes('outline') ||
      msg.includes('Starting') ||
      msg.includes('complete') ||
      msg.startsWith('🚀') ||
      msg.startsWith('📋') ||
      msg.startsWith('🏗️') ||
      msg.startsWith('👥') ||
      msg.startsWith('🎬') ||
      msg.startsWith('✨') ||
      msg.startsWith('🌟') ||
      msg.startsWith('🔗') ||
      msg.startsWith('✅') ||
      msg.startsWith('⚠️') ||
      msg.startsWith('❌') ||
      msg.startsWith('🔧')
    ) {
      return true;
    }
    return false;
  };

  window.console.log = function (...args: any[]) {
    originalConsoleLog.apply(console, args);
    try {
      const firstArg = typeof args[0] === 'string' ? args[0] : '';
      if (shouldForward(firstArg)) {
        const { agent, message, level } = extractAgentAndClean(firstArg);
        const details = args.length > 1 ? args.slice(1).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') : undefined;
        logToTerminal({ message, agent, level, details });
      }
    } catch {
      // Safe fallback
    }
  };

  window.console.warn = function (...args: any[]) {
    originalConsoleWarn.apply(console, args);
    try {
      const firstArg = typeof args[0] === 'string' ? args[0] : '';
      if (shouldForward(firstArg)) {
        const { agent, message } = extractAgentAndClean(firstArg);
        const details = args.length > 1 ? args.slice(1).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') : undefined;
        logToTerminal({ message, agent, level: 'warn', details });
      }
    } catch {
      // Safe fallback
    }
  };

  window.console.error = function (...args: any[]) {
    originalConsoleError.apply(console, args);
    try {
      const firstArg = typeof args[0] === 'string' ? args[0] : '';
      const { agent, message } = extractAgentAndClean(firstArg || 'Application Error');
      const details = args.length > 1 ? args.slice(1).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') : undefined;
      logToTerminal({ message, agent, level: 'error', details });
    } catch {
      // Safe fallback
    }
  };
}

/**
 * What blocked the page, and for how long.
 *
 * A tab offering to close itself has held its main thread for seconds, and every guess about which
 * seconds those are costs a full run to test. The browser already knows: a long task is any block over
 * 50ms, and the browser reports it with a duration. This records them, names what the application was
 * doing at the time, and sends the bad ones to the terminal next to the step lines already there — so
 * the next freeze arrives with a measurement instead of a theory.
 *
 * Cheap by construction: the observer is the platform's, it fires after the block is over, and
 * anything under the floor is counted and never reported. Browsers without the entry type — Safari at
 * the time of writing — get nothing and lose nothing.
 */
export interface StallWatch {
  stop(): void;
  worst(): { ms: number; doing: string } | undefined;
  all(): { ms: number; doing: string; at: number }[];
}

export function watchMainThreadStalls(doing: () => string, floorMs = 400): StallWatch {
  const stalls: { ms: number; doing: string; at: number }[] = [];
  let observer: PerformanceObserver | undefined;
  try {
    observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const ms = Math.round(entry.duration);
        if (ms < 50) continue;
        const context = doing();
        stalls.push({ ms, doing: context, at: Date.now() });
        if (ms >= floorMs) {
          logToTerminal({
            message: `Main thread blocked ${ms}ms while: ${context}`,
            agent: 'Performance',
            level: ms >= 2000 ? 'error' : 'warn',
          });
        }
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // A browser that does not report long tasks reports nothing; the run is unaffected.
  }
  return {
    stop: () => observer?.disconnect(),
    worst: () => stalls.reduce<{ ms: number; doing: string } | undefined>(
      (worst, stall) => !worst || stall.ms > worst.ms ? { ms: stall.ms, doing: stall.doing } : worst, undefined),
    all: () => [...stalls],
  };
}
