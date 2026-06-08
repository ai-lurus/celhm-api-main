import * as fs from 'fs';
import * as path from 'path';

const srcDir = path.join(__dirname, '../src');

function walk(dir: string, fileList: string[] = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      walk(path.join(dir, file), fileList);
    } else if (file.endsWith('.ts')) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const allTsFiles = walk(srcDir);

for (const file of allTsFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Replace enum values in decorators and other places
  // We'll replace Role.ADMON with Role.ADMINISTRADOR
  // Since Role.ADMINISTRADOR might already be there, we'll clean up duplicates later
  
  if (content.includes('Role.ADMON')) {
    content = content.replace(/Role\.ADMON/g, 'Role.ADMINISTRADOR');
    changed = true;
  }
  if (content.includes('Role.LABORATORIO')) {
    content = content.replace(/Role\.LABORATORIO/g, 'Role.TECNICO');
    changed = true;
  }
  if (content.includes('Role.VENTAS')) {
    content = content.replace(/Role\.VENTAS/g, 'Role.VENDEDOR');
    changed = true;
  }
  if (content.includes("'LABORATORIO'")) {
    content = content.replace(/'LABORATORIO'/g, "'TECNICO'");
    changed = true;
  }
  if (content.includes("'VENTAS'")) {
    content = content.replace(/'VENTAS'/g, "'VENDEDOR'");
    changed = true;
  }
  if (content.includes("'ADMON'")) {
    content = content.replace(/'ADMON'/g, "'ADMINISTRADOR'");
    changed = true;
  }

  // Cleanup duplicate Role.ADMINISTRADOR in @Roles(...)
  if (changed) {
    content = content.replace(/(@Roles\([^)]+\))/g, (match) => {
      // match is something like @Roles(Role.ADMINISTRADOR, Role.ADMINISTRADOR, Role.VENDEDOR)
      const roles = match.replace('@Roles(', '').replace(')', '').split(',').map(s => s.trim());
      const uniqueRoles = [...new Set(roles)];
      return `@Roles(${uniqueRoles.join(', ')})`;
    });

    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
