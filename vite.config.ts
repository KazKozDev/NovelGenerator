import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function terminalLoggerPlugin(): Plugin {
  let lastKey = '';
  let lastTime = 0;

  return {
    name: 'terminal-logger',
    configureServer(server) {
      server.middlewares.use('/api/terminal-log', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const now = new Date();
              const timeStr = now.toTimeString().split(' ')[0];

              const level = (data.level || 'INFO').toUpperCase();
              const agent = data.agent ? `[${data.agent}]` : '[System]';
              const message = data.message || '';

              const key = `${agent}|${level}|${message}`;
              const nowMs = Date.now();
              if (key === lastKey && (nowMs - lastTime) < 600) {
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({ ok: true, deduplicated: true }));
                return;
              }
              lastKey = key;
              lastTime = nowMs;

              // ANSI color formatting - strict, cohesive slate/gray aesthetic
              const reset = '\x1b[0m';
              const dim = '\x1b[90m';
              const slate = '\x1b[38;5;110m';
              const muted = '\x1b[38;5;244m';
              const text = '\x1b[38;5;252m';
              const ok = '\x1b[38;5;108m';
              const warn = '\x1b[38;5;179m';
              const err = '\x1b[38;5;203m';

              let levelColor = muted;
              if (level === 'ERROR' || level === 'ERR') levelColor = err;
              else if (level === 'WARN' || level === 'WARNING') levelColor = warn;
              else if (level === 'SUCCESS' || level === 'OK') levelColor = ok;
              else if (level === 'STAGE' || level === 'AGENT') levelColor = slate;

              const formattedLevel = `${levelColor}${level.padEnd(7)}${reset}`;
              const formattedAgent = `${slate}${agent.padEnd(18)}${reset}`;

              let detailStr = '';
              if (data.details !== undefined && data.details !== null && data.details !== '') {
                detailStr = ` ${dim}${typeof data.details === 'object' ? JSON.stringify(data.details) : data.details}${reset}`;
              }

              console.log(`  ${dim}${timeStr}${reset} ${dim}│${reset} ${formattedLevel} ${dim}│${reset} ${formattedAgent} ${text}${message}${reset}${detailStr}`);
            } catch {
              console.log('[TerminalLog]', body);
            }
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }
        res.statusCode = 404;
        res.end();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const apiKey = env.GEMINI_API_KEY || env.API_KEY || '';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/ollama': {
            target: env.OLLAMA_HOST || 'http://127.0.0.1:11434',
            rewrite: (p) => p.replace(/^\/api\/ollama/, ''),
            changeOrigin: true,
          }
        }
      },
      plugins: [react(), terminalLoggerPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(apiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(apiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

