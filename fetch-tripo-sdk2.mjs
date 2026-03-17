import https from 'https';

https.get('https://raw.githubusercontent.com/VAST-AI-Research/tripo-python-sdk/master/tripo3d/tripo3d.py', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    const multiviewIdx = lines.findIndex(l => l.includes('multiview'));
    if (multiviewIdx !== -1) {
      console.log(lines.slice(multiviewIdx - 10, multiviewIdx + 30).join('\n'));
    } else {
      console.log("Not found");
    }
  });
});
