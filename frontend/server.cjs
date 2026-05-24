// Production static server with SPA fallback for React Router
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DIST = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
};

function serveFile(res, filePath) {
  const ext  = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type':   type,
    'Content-Length': stat.size,
    'Cache-Control':  ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
  });
  fs.createReadStream(filePath).pipe(res);
}

http.createServer((req, res) => {
  const urlPath  = req.url.split('?')[0].split('#')[0];
  let   filePath = path.join(DIST, urlPath);

  // Resolve directory → index.html inside it
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    serveFile(res, filePath);
  } else {
    // SPA fallback — let React Router handle the route
    serveFile(res, path.join(DIST, 'index.html'));
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Reachify frontend listening on port ${PORT}`);
});
