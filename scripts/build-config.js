import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });

const apiKey = process.env.GOOGLE_API_KEY || '';
const clientId = process.env.GOOGLE_CLIENT_ID || '';
const sheetId = process.env.GOOGLE_SHEET_ID || '';

const configContent = `// Generado automáticamente — no editar manualmente
window.APP_CONFIG = {
  apiKey: ${JSON.stringify(apiKey)},
  clientId: ${JSON.stringify(clientId)},
  sheetId: ${JSON.stringify(sheetId)}
};
`;

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

fs.mkdirSync(path.join(root, 'js'), { recursive: true });
fs.writeFileSync(path.join(root, 'js', 'config.js'), configContent);

const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
copyDir(path.join(root, 'css'), path.join(dist, 'css'));
fs.mkdirSync(path.join(dist, 'js'), { recursive: true });
fs.copyFileSync(path.join(root, 'js', 'app.js'), path.join(dist, 'js', 'app.js'));
fs.writeFileSync(path.join(dist, 'js', 'config.js'), configContent);

console.log('✓ js/config.js generado');
console.log('✓ dist/ listo para GitHub Pages');
