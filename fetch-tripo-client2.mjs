import https from 'https';

https.get('https://raw.githubusercontent.com/VAST-AI-Research/tripo-python-sdk/master/tripo3d/client.py', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    const multiviewIdx = lines.findIndex(l => l.includes('def multiview_to_model'));
    if (multiviewIdx !== -1) {
      console.log(lines.slice(multiviewIdx, multiviewIdx + 80).join('\n'));
    } else {
      console.log("Not found");
    }
  });
});
