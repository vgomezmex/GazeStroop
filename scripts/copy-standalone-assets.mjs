// Copia los assets estáticos al output standalone después de `next build`.
// Reemplaza el `cp -r ...` que se usaba antes en package.json — ese comando
// no existe de forma nativa en PowerShell/cmd de Windows ("cp no se
// reconoce como un comando..."). fs.cpSync es parte de Node.js desde la
// v16.7, así que funciona igual en Windows, macOS y Linux sin instalar
// nada adicional.
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const pairs = [
  ['.next/static', '.next/standalone/.next/static'],
  ['public', '.next/standalone/public'],
];

for (const [src, dest] of pairs) {
  const srcPath = join(process.cwd(), src);
  if (!existsSync(srcPath)) {
    console.warn(`[copy-standalone-assets] Aviso: no existe "${src}", se omite.`);
    continue;
  }
  cpSync(srcPath, join(process.cwd(), dest), { recursive: true });
  console.log(`[copy-standalone-assets] Copiado ${src} -> ${dest}`);
}
