import http from 'http';

// Simple HTTP health check endpoint
export function createHealthServer(port = 3000) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        timestamp: Date.now(),
      }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  
  server.listen(port, () => {
    console.log(`Health check server running on port ${port}`);
  });
  
  return server;
}

