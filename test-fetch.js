const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/auth/sync',
    method: 'POST',
    headers: {
        'X-TG-Init-Data': ''
    }
};

const req = http.request(options, res => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    let rawData = '';
    res.on('data', chunk => { rawData += chunk; });
    res.on('end', () => {
        console.log(`BODY: ${rawData}`);
    });
});

req.on('error', e => {
    console.error(`problem with request: ${e.message}`);
});
req.end();
