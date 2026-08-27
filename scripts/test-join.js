const http = require('http');

http.get('http://localhost:3000/socket.io/?EIO=4&transport=polling', (res) => {
  let data = '';
  res.on('data', (c) => { data += c; });
  res.on('end', () => {
    const sid = JSON.parse(data.slice(data.indexOf('{'))) .sid;
    console.log('socket ok, sid:', sid);
    process.exit(0);
  });
}).on('error', (err) => {
  console.error('failed:', err.message);
  process.exit(1);
});
