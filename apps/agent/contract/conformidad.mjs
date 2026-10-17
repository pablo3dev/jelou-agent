// Conformidad db-design.dbml <-> colecciones reales de Datum (esquemas de `collections show`).
// Uso: node conformidad.mjs <db-design.dbml> <directorio-con-un-json-por-coleccion>
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const TIPO_TEXT = new Set(['ref', 'text', 'char', 'time', 'varchar']);
const TIPO_DATE = new Set(['date', 'timestamp', 'datetime']);
const TIPO_INT = new Set(['int', 'integer']);
const TIPO_DEC = new Set(['decimal', 'numeric', 'float']);

export function parsearDbml(texto) {
  const limpio = texto
    .replace(/'''[\s\S]*?'''/g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'[^'\n]*'/g, "''");
  const enums = {};
  const tablas = {};
  const reBloque = /\b(Enum|Table)\s+(\w+)\s*\{/g;
  let m;
  while ((m = reBloque.exec(limpio))) {
    const [, kind, nombre] = m;
    const ini = reBloque.lastIndex;
    let i = ini;
    let prof = 1;
    while (prof > 0 && i < limpio.length) {
      if (limpio[i] === '{') prof++;
      else if (limpio[i] === '}') prof--;
      i++;
    }
    const cuerpo = limpio.slice(ini, i - 1);
    reBloque.lastIndex = i;
    if (kind === 'Enum') {
      enums[nombre] = cuerpo.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s+/)[0]);
    } else {
      tablas[nombre] = parsearColumnas(cuerpo);
    }
  }
  return { enums, tablas };
}

function parsearColumnas(cuerpo) {
  // Quita bloques anidados (indexes { ... }) y las lineas Note.
  const sinBloques = cuerpo.replace(/\b\w+\s*\{[^}]*\}/g, '');
  const columnas = [];
  for (const linea of sinBloques.split('\n')) {
    const l = linea.trim();
    if (!l || /^Note\s*:/i.test(l)) continue;
    const c = l.match(/^(\w+)\s+(\w+)(?:\([^)]*\))?\s*(?:\[([^\]]*)\])?\s*$/);
    if (!c) continue;
    const attrs = (c[3] ?? '').toLowerCase();
    columnas.push({
      nombre: c[1],
      tipo: c[2],
      pk: /\bpk\b/.test(attrs),
      notNull: /\bnot null\b/.test(attrs),
    });
  }
  return columnas;
}

function tipoEsperado(col, enums) {
  if (enums[col.tipo]) return 'select';
  const t = col.tipo.toLowerCase();
  if (TIPO_TEXT.has(t)) return 'text';
  if (TIPO_INT.has(t) || TIPO_DEC.has(t)) return 'number';
  if (TIPO_DATE.has(t)) return 'date';
  if (t === 'json') return 'json';
  return `?${col.tipo}`;
}

const mismoConjunto = (a, b) => a.length === b.length && new Set(b).size === b.length && a.every((v) => b.includes(v));

export function compararConEsquema({ enums, tablas }, colecciones) {
  const dif = [];
  for (const [tabla, columnas] of Object.entries(tablas)) {
    const col = colecciones[tabla];
    if (!col) { dif.push(`coleccion faltante: ${tabla}`); continue; }
    const campos = col.fields ?? [];
    const usuario = new Map(campos.filter((f) => !f.system).map((f) => [f.name, f]));
    const esperados = new Set();
    for (const c of columnas) {
      if (c.pk && c.nombre === 'id') {
        if (!campos.some((f) => f.system && f.name === 'id' && f.primaryKey)) dif.push(`${tabla}.id: falta el campo de sistema id`);
        if (usuario.has('id')) dif.push(`${tabla}.id: no debe ser campo de usuario`);
        continue;
      }
      esperados.add(c.nombre);
      const f = usuario.get(c.nombre);
      if (!f) { dif.push(`campo faltante: ${tabla}.${c.nombre}`); continue; }
      const tipo = tipoEsperado(c, enums);
      if (f.type !== tipo) { dif.push(`tipo distinto: ${tabla}.${c.nombre} esperado ${tipo}, real ${f.type}`); continue; }
      const t = c.tipo.toLowerCase();
      if (tipo === 'select') {
        const vals = enums[c.tipo];
        if (f.maxSelect !== 1) dif.push(`select ${tabla}.${c.nombre}: maxSelect esperado 1, real ${f.maxSelect}`);
        if (!mismoConjunto(vals, f.values ?? [])) dif.push(`enum distinto: ${tabla}.${c.nombre} esperado [${vals}] real [${f.values ?? []}]`);
      }
      if (TIPO_INT.has(t) && f.onlyInt !== true) dif.push(`tipo distinto: ${tabla}.${c.nombre} int requiere onlyInt=true`);
      if (TIPO_DEC.has(t) && f.onlyInt === true) dif.push(`tipo distinto: ${tabla}.${c.nombre} decimal no debe ser onlyInt`);
      // number y json NO se exigen required: en Datum required significa distinto de 0 / vacio (json {} o null).
      if ((c.notNull || c.pk) && tipo !== 'number' && tipo !== 'json' && f.required !== true) dif.push(`required distinto: ${tabla}.${c.nombre} not null requiere required=true`);
    }
    for (const nombre of usuario.keys()) if (!esperados.has(nombre)) dif.push(`campo extra: ${tabla}.${nombre}`);
  }
  return dif;
}

function main() {
  const [dbmlPath, dir] = process.argv.slice(2);
  if (!dbmlPath || !dir) { console.error('uso: node conformidad.mjs <db-design.dbml> <directorio>'); process.exit(2); }
  const dbml = parsearDbml(readFileSync(dbmlPath, 'utf8'));
  const colecciones = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    colecciones[basename(f, '.json')] = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  }
  const dif = compararConEsquema(dbml, colecciones);
  const nTablas = Object.keys(dbml.tablas).length;
  if (dif.length) {
    console.log(`NO CONFORME: ${dif.length} diferencia(s) en ${nTablas} tablas`);
    dif.forEach((d) => console.log(`- ${d}`));
    process.exit(1);
  }
  console.log(`CONFORME: ${nTablas} tablas sin diferencias`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
