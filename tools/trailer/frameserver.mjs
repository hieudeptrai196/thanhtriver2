// Receives trailer frames from the game page: POST /frame?shot=s01&i=12 (body: JPEG data URL).
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = process.argv[2];
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET') {
    // The director script, loaded by the page with import().
    res.setHeader('Content-Type', 'text/javascript');
    return res.end(readFileSync(new URL('./director.js', import.meta.url)));
  }
  if (req.method !== 'POST') return res.end('ok');
  const q = new URL(req.url, 'http://x').searchParams;
  const shot = q.get('shot').replace(/[^\w-]/g, '');
  const i = String(Number(q.get('i'))).padStart(4, '0');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    mkdirSync(`${dir}/${shot}`, { recursive: true });
    writeFileSync(`${dir}/${shot}/${i}.jpg`, Buffer.from(body.slice(body.indexOf(',') + 1), 'base64'));
    res.end('ok');
  });
}).listen(5199, '127.0.0.1');
