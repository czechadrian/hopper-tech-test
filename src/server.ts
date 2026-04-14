import http from 'http';
import { CallHandler } from './call-handler';
import { CsvParserService } from './services/csv-parser.service';
import { EnricherService } from './services/enricher.service';
import { DbRepository } from './repositories/db.repository';
import { SearchRepository } from './repositories/search.repository';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const handler = new CallHandler(
  new CsvParserService(),
  new EnricherService(),
  new DbRepository(),
  new SearchRepository(),
);

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/batches') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    return;
  }

  const body = await readBody(req);
  const result = await handler.handleBatch(body);

  res.writeHead(result.ok ? 202 : 400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
});

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`POST http://localhost:${PORT}/batches  — body: CSV text`);
});
