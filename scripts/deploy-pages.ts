/**
 * Publica `dist/` en la rama `gh-pages` del remoto `origin` (GitHub Pages, origen: rama).
 * Uso: npm run deploy (compila y verifica antes).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';

const git = (args: string[], cwd = '.'): string => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

if (!existsSync('dist/index.html')) throw new Error('Falta dist/: ejecuta npm run build.');
const remote = git(['remote', 'get-url', 'origin']);
const rev = git(['rev-parse', '--short', 'HEAD']);
writeFileSync('dist/.nojekyll', '');
rmSync('dist/.git', { recursive: true, force: true });
try {
  git(['init', '-q', '-b', 'gh-pages'], 'dist');
  git(['add', '-A'], 'dist');
  git(['commit', '-q', '-m', `Despliegue ${rev}`], 'dist');
  git(['push', '-q', '-f', remote, 'gh-pages'], 'dist');
  console.log(`Publicado ${rev} en gh-pages.`);
} finally {
  rmSync('dist/.git', { recursive: true, force: true });
}
