import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function terminalLoggerPlugin(): Plugin {
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

              // ANSI color formatting
              const reset = '\x1b[0m';
              const dim = '\x1b[2m';
              const bold = '\x1b[1m';
              const cyan = '\x1b[36m';
              const magenta = '\x1b[35m';
              const blue = '\x1b[34m';
              const yellow = '\x1b[33m';
              const green = '\x1b[32m';
              const red = '\x1b[31m';
              const gray = '\x1b[90m';

              let levelColor = cyan;
              if (level === 'STAGE') levelColor = magenta;
              else if (level === 'AGENT') levelColor = blue;
              else if (level === 'LLM') levelColor = yellow;
              else if (level === 'STREAM') levelColor = cyan;
              else if (level === 'SUCCESS') levelColor = green;
              else if (level === 'WARN') levelColor = yellow;
              else if (level === 'ERROR') levelColor = red;

              const formattedLevel = `${levelColor}${bold}${level.padEnd(7)}${reset}`;
              const formattedAgent = `${blue}${bold}${agent.padEnd(18)}${reset}`;

              let detailStr = '';
              if (data.details !== undefined && data.details !== null && data.details !== '') {
                detailStr = ` ${dim}${typeof data.details === 'object' ? JSON.stringify(data.details) : data.details}${reset}`;
              }

              console.log(`${gray}${timeStr}${reset} ${dim}│${reset} ${formattedLevel} ${dim}│${reset} ${formattedAgent} ${message}${detailStr}`);
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

