const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;
// In pkg, __dirname refers to the virtual directory in the snapshot
const PUBLIC_DIR = path.join(__dirname, 'out');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Clean query and hash params
  const questionMarkIndex = req.url.indexOf('?');
  const pathname = questionMarkIndex !== -1 ? req.url.substring(0, questionMarkIndex) : req.url;

  // Next.js trailing slash routing support
  let filePath = path.join(PUBLIC_DIR, pathname);

  // If the path corresponds to a directory or ends with '/', append index.html
  if (pathname.endsWith('/')) {
    filePath = path.join(filePath, 'index.html');
  } else {
    // If it has no file extension, look for directory/index.html or append .html
    const ext = path.extname(filePath);
    if (!ext) {
      const tryDirIndex = path.join(filePath, 'index.html');
      if (fs.existsSync(tryDirIndex)) {
        filePath = tryDirIndex;
      } else if (fs.existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      }
    }
  }

  // Serve the file
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Serve Next.js static 404 page if not found
      const path404 = path.join(PUBLIC_DIR, '404', 'index.html');
      fs.readFile(path404, (err404, data404) => {
        if (!err404) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data404);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
        }
      });
    } else {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`===================================================`);
  console.log(`        Sistema Contable Cafetería Yanaloma        `);
  console.log(`===================================================`);
  console.log(`Servidor iniciado exitosamente.`);
  console.log(`Accede en tu navegador: ${url}`);
  console.log(`Presiona Ctrl+C para cerrar el servidor.`);
  console.log(`===================================================`);

  // Open default browser depending on platform
  if (process.platform === 'win32') {
    exec(`start ${url}`);
  } else if (process.platform === 'darwin') {
    exec(`open ${url}`);
  } else {
    exec(`xdg-open ${url}`);
  }
});
