const { Client } = require('pg');

const run = async () => {
    const url = 'postgresql://postgres.aoxsobfhawlsnwjqhfox:Gacor123gacor@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

    const client = new Client({
        connectionString: url,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('Connecting to Supabase Pooler...');
        await client.connect();
        console.log('✅ Connection Successful!');

        const res = await client.query('SELECT NOW()');
        console.log('Database time:', res.rows[0].now);

    } catch (err) {
        console.error('❌ Connection Failed:');
        console.error(err.message);
    } finally {
        await client.end();
    }
};

run();
