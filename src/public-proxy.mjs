import http from 'node:http';
import net from 'node:net';
import {randomBytes} from 'node:crypto';

// yt-dlp's own redirects and extractor subrequests also pass this DNS-pinned gate.
// This loopback-only proxy is private to the unprivileged service.
export async function startPublicProxy(validateUrl) {
  const sockets = new Set();
  const password=randomBytes(24).toString('hex'),authorization='Basic '+Buffer.from('turbosave:'+password).toString('base64');
  const server = http.createServer(async (request, response) => {
    // Extractors occasionally use HTTP. Validate/pin those addresses too.
    try {
      if(request.headers['proxy-authorization']!==authorization){response.writeHead(407,{'Proxy-Authenticate':'Basic realm="TurboSave"'});response.end();return;}
      const source = new URL(request.url);
      if (source.protocol !== 'http:' || source.port || source.username || source.password || !['GET', 'HEAD'].includes(request.method)) throw new Error();
      const target = await validateUrl(`https://${source.host}${source.pathname}${source.search}`);
      const selected = target.addresses[0];
      const headers={...request.headers,host:source.host};delete headers['proxy-authorization'];delete headers['proxy-connection'];delete headers.connection;
      const upstream = http.request(source, { method: request.method, headers,
        lookup(_h, options, callback) { options?.all ? callback(null, target.addresses) : callback(null, selected.address, selected.family); } }, reply => {
        response.writeHead(reply.statusCode, reply.headers); reply.pipe(response);
      });
      upstream.setTimeout(15_000, () => upstream.destroy());
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      response.on('close', () => upstream.destroy()); upstream.end();
    } catch { response.writeHead(403); response.end(); }
  });
  server.maxConnections=32;server.headersTimeout=10_000;server.requestTimeout=30_000;server.keepAliveTimeout=5000;
  server.on('clientError',(_error,socket)=>socket.destroy());
  server.on('connection', socket => { sockets.add(socket);socket.on('error',()=>socket.destroy()); socket.on('close', () => sockets.delete(socket)); });
  server.on('connect', async (request, client, head) => {
    try {
      if(request.headers['proxy-authorization']!==authorization){client.end('HTTP/1.1 407 Proxy Authentication Required\r\nConnection: close\r\n\r\n');return;}
      if (!/^[A-Za-z0-9.\[\]:-]+:443$/.test(request.url)) throw new Error();
      const target = await validateUrl(`https://${request.url.replace(/:443$/, '')}/`);
      const selected = target.addresses[0];
      const upstream = net.connect({ host: selected.address, port: 443, family: selected.family });
      sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
      upstream.setTimeout(20_000, () => upstream.destroy()); client.setTimeout(20_000, () => client.destroy());
      upstream.once('connect', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); client.pipe(upstream); upstream.pipe(client); });
      upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy());
      client.on('close', () => upstream.destroy()); upstream.on('close', () => client.destroy());
    } catch { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://turbosave:${password}@127.0.0.1:${server.address().port}`, close() { for (const socket of sockets) socket.destroy(); server.close(); } };
}
