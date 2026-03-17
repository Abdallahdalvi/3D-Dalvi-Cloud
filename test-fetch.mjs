import fs from 'fs';

async function test() {
  const fileStream = fs.createReadStream('package.json');
  
  try {
    const response = await fetch('https://httpbin.org/post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: fileStream,
      duplex: 'half'
    });
    console.log(response.status);
    const data = await response.json();
    console.log('Success');
  } catch (e) {
    console.error('Fetch failed:', e.message);
  }
}

test();
