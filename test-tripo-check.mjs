fetch('http://localhost:3000/api/tripo-check')
  .then(res => res.text())
  .then(console.log)
  .catch(console.error);
