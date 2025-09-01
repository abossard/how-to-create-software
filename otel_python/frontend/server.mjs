#!/usr/bin/env node
import Fastify from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ logger: true });

// Directories
const distDir = path.join(__dirname, 'dist');

// Register static plugin
await fastify.register(fastifyStatic, {
  root: distDir,
  prefix: '/',
  decorateReply: false
});

// CSP removed per request. If needed again later, reintroduce directives here.

fastify.addHook('onSend', async (request, reply, payload) => {
  // Retaining a few lightweight security headers; CSP intentionally omitted.
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'geolocation=()');
  return payload;
});

// SPA fallback: serve index.html for non-file routes
async function renderIndex(reply) {
  const html = await import('node:fs/promises').then(fs => fs.readFile(path.join(distDir, 'index.html'), 'utf8'));
  const apiUrl = process.env.API_URL || 'http://localhost:8000';
  const injection = `<script>window.API_BASE = ${JSON.stringify(apiUrl)};</script>`;
  const modified = html.includes('<head>')
    ? html.replace(/<head>/i, `<head>\n${injection}`)
    : `${injection}\n${html}`;
  return reply.type('text/html').send(modified);
}

// Explicit root route to ensure injection (static plugin would otherwise serve raw file)
fastify.get('/', async (request, reply) => {
  return renderIndex(reply);
});

fastify.setNotFoundHandler(async (request, reply) => {
  // If path has a dot, treat as missing static asset
  if (/\.[a-zA-Z0-9]+$/.test(request.raw.url)) {
    reply.code(404).type('text/plain').send('Not Found');
    return;
  }
  return renderIndex(reply);
});

const port = process.env.PORT || 5173;
const host = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port, host });
  console.log(`Frontend served at http://${host}:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
