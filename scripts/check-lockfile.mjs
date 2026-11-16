import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function validateLockfile(pkg, lock) {
  const errors = [];
  const packages = lock?.packages || {};
  const rootPkg = packages[''];

  if (!rootPkg) {
    errors.push('package-lock.json ไม่มี root entry (packages[""])');
    return { ok: false, errors, missingOptional: [] };
  }

  if (pkg.version !== lock.version || pkg.version !== rootPkg.version) {
    errors.push(`version ไม่ตรงกัน: package.json=${pkg.version}, lock=${lock.version}`);
  }

  for (const section of ['dependencies', 'devDependencies']) {
    const pkgDeps = pkg[section] || {};
    const lockDeps = rootPkg[section] || {};
    for (const [name, spec] of Object.entries(pkgDeps)) {
      if (lockDeps[name] !== spec) {
        errors.push(`${section}.${name} ไม่ตรงกัน (package.json="${spec}", lock="${lockDeps[name] || 'missing'}")`);
      }
    }
    for (const name of Object.keys(lockDeps)) {
      if (!(name in pkgDeps)) {
        errors.push(`${section}.${name} มีเกินใน package-lock.json`);
      }
    }
  }

  const missingOptional = [];
  for (const [pkgPath, meta] of Object.entries(packages)) {
    const optDeps = meta?.optionalDependencies;
    if (!optDeps || typeof optDeps !== 'object') continue;
    for (const dep of Object.keys(optDeps)) {
      const nestedKey = pkgPath ? `${pkgPath}/node_modules/${dep}` : `node_modules/${dep}`;
      const topKey = `node_modules/${dep}`;
      if (!packages[nestedKey] && !packages[topKey]) {
        missingOptional.push(`${dep} (required optionally by ${pkgPath || 'root'})`);
      }
    }
  }

  if (missingOptional.length) {
    errors.push(
      `พบ optionalDependencies หายไป ${missingOptional.length} รายการ (มักเกิดจากการรัน npm install บน Linux แล้วตัด non-Linux packages ออก):\n`
      + missingOptional.slice(0, 15).map(x => `  - ${x}`).join('\n')
      + (missingOptional.length > 15 ? `\n  ... และอีก ${missingOptional.length - 15} รายการ` : '')
    );
  }

  return { ok: errors.length === 0, errors, missingOptional };
}

async function main() {
  const pkg = JSON.parse(await readFile(resolve(rootDir, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(resolve(rootDir, 'package-lock.json'), 'utf8'));
  const result = validateLockfile(pkg, lock);
  if (!result.ok) {
    console.error('❌ Lockfile validation failed:\n' + result.errors.join('\n'));
    console.error('\nคำแนะนำ: ใช้ `npm ci --no-audit --no-fund` สำหรับติดตั้ง และหลีกเลี่ยงการ commit `package-lock.json` ที่ตัด optional platform packages ออก');
    process.exit(1);
  }
  console.log(`✅ Lockfile OK (${Object.keys(lock.packages || {}).length} entries, 0 missing optionalDependencies)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('❌ Could not check lockfile:', err?.message || err);
    process.exit(1);
  });
}
