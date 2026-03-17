import https from 'https';

https.get('https://html.duckduckgo.com/html/?q=site:github.com+tripo-api-python', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const snippets = data.match(/class="result__snippet[^>]*>(.*?)<\/a>/g);
    console.log("Snippets:", snippets ? snippets.map(s => s.replace(/<[^>]+>/g, '')).join('\n') : "None");
  });
});
