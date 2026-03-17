import http from 'http';

const server = http.createServer(async (req, res) => {
  try {
    const headers = {
      'Content-Type': req.headers['content-type']
    };
    if (req.headers['content-length']) {
      headers['Content-Length'] = req.headers['content-length'];
    }
    
    const response = await fetch('https://api.tripo3d.ai/v2/openapi/upload', {
      method: 'POST',
      headers: headers,
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

server.listen(3002, () => {
  console.log('Server running on 3002');
});
