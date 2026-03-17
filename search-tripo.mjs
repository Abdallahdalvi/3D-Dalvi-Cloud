import https from 'https';

https.get('https://html.duckduckgo.com/html/?q=tripo3d+api+model_version', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const matches = data.match(/v[0-9]\.[0-9]-[0-9]+/g);
    console.log("Matches:", matches);
    const snippets = data.match(/class="result__snippet[^>]*>(.*?)<\/a>/g);
    console.log("Snippets:", snippets ? snippets.map(s => s.replace(/<[^>]+>/g, '')).join('\n') : "None");
  });
});
