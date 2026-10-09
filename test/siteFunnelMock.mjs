/**
 * The Gemini mock for test/siteFunnel.e2e.mjs: lists one model and answers
 * `understand` the way the real model is asked to — a custom project with its
 * own question for the unusual request, a plain reading for the rest.
 */
import http from 'node:http';

const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

export function startGeminiMock(port) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const u = new URL(req.url, `http://127.0.0.1:${port}`);
      if (req.method === 'GET' && u.pathname === '/v1beta/models') {
        return send(res, 200, { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
      }
      if (req.method === 'POST' && /:generateContent$/.test(u.pathname)) {
        calls.push(raw.slice(0, 200));
        let answer;
        if (/yoga/i.test(raw)) {
          answer = {
            summary: 'A custom project that keeps yoga members renewing and sends a birthday offer.',
            name: 'Member Renewal Autopilot', objective: 'Remind members before their membership ends and send a birthday offer.',
            solutionKeys: ['custom'], match: 'custom', facts: {},
            profile: { companyName: '', description: '' },
            extraQuestions: [{ id: 'renewWhen', prompt: 'How long before a membership ends should the first reminder go?', type: 'single', need: 'required', options: [{ value: '14', label: 'Two weeks before' }, { value: '7', label: 'One week before' }] }],
            customWorkflows: [{ name: 'Membership renewal reminders', purpose: 'Remind members before renewal', kind: 'contact', instruction: 'When a membership is 14 days from ending, email a reminder; if not renewed after 7 days, send a second one.' }],
            unsupported: [],
          };
        } else {
          answer = { summary: 'I read your request.', name: '', objective: '', solutionKeys: [], match: 'partial', facts: {}, profile: {}, extraQuestions: [], customWorkflows: [], unsupported: [] };
        }
        return send(res, 200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
      }
      send(res, 404, { error: { code: 404, message: `mock has no ${req.method} ${u.pathname}` } });
    });
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r({ server, calls })));
}
