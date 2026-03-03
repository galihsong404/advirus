const fs = require('fs');
const path = require('path');

function cleanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const cleaned = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    fs.writeFileSync(filePath, cleaned, 'utf8');
    console.log('Cleaned file:', filePath);
}

cleanFile(path.join(__dirname, '.env'));
cleanFile(path.join(__dirname, 'prisma/schema.prisma'));
