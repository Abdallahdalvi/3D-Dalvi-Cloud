import http from 'http';

const server = http.createServer(async (req, res) => {
  try {
    const response = await fetch('https://httpbin.org/post', {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json'
      },
      body: req,
      duplex: 'half'
    });
    console.log('Proxy status:', response.status);
    res.end('Success');
  } catch (e) {
    console.error('Proxy fetch failed:', e.message);
    res.statusCode = 500;
    res.end(e.message);
  }
});

server.listen(3001, () => {
  console.log('Server running on 3001');
  
  const req = http.request('http://localhost:3001', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Client received:', data);
      server.close();
    });
  });
  
  req.write('Hello World');
  req.end();
});
