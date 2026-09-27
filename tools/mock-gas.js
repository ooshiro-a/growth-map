// 手元で画面を試すための作り物の GAS（本物の gas/Code.gs をメモリの中のシートで動かす）
//   node tools/mock-gas.js            → http://localhost:8787 （合言葉：test）
//   .env.local に VITE_GAS_URL_TEST=http://localhost:8787 と書いて npm run dev
// 記録はメモリの中だけ（止めると消える）
import http from 'node:http';
import { makeGasSim } from './gas-sim.js';

const PORT = Number(process.env.PORT || 8787);
const sim = makeGasSim({ pass: process.env.MOCK_PASS || 'test' });
const delay = Number(process.env.MOCK_DELAY || 300);

http
  .createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (req.method !== 'POST') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(sim.ctx.doGet().text);
      return;
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      setTimeout(() => {
        const out = sim.postRaw(body);
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(out.text);
      }, delay);
    });
  })
  .listen(PORT, () => console.log(`作り物の GAS：http://localhost:${PORT}（合言葉：${process.env.MOCK_PASS || 'test'}）`));
