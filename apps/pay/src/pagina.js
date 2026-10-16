import { createHash } from 'node:crypto';

const TEXTOS = {
  es: {
    titulo: 'Pago de tu reserva',
    monto: 'Monto a pagar',
    estado: 'Estado de la transacción',
    aprobar: 'Aprobar',
    rechazar: 'Rechazar',
    procesando: 'Procesando…',
    mock: 'Pasarela de demostración: no se realiza ningún cobro real.',
    PENDIENTE: 'Pendiente',
    APROBADA: 'Aprobada',
    RECHAZADA: 'Rechazada',
    EXPIRADA: 'Expirada',
  },
  en: {
    titulo: 'Pay for your booking',
    monto: 'Amount due',
    estado: 'Transaction status',
    aprobar: 'Approve',
    rechazar: 'Reject',
    procesando: 'Processing…',
    mock: 'Demo gateway: no real charge is made.',
    PENDIENTE: 'Pending',
    APROBADA: 'Approved',
    RECHAZADA: 'Rejected',
    EXPIRADA: 'Expired',
  },
};

const SCRIPT =
  "document.querySelectorAll('form').forEach(function(f){f.addEventListener('submit',function(){" +
  "document.querySelectorAll('button').forEach(function(b){b.disabled=true;});" +
  "var s=document.getElementById('estado-envio');if(s){s.hidden=false;}});});";

const SCRIPT_HASH = createHash('sha256').update(SCRIPT).digest('base64');

export const CSP =
  `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${SCRIPT_HASH}'; form-action 'self'; base-uri 'none'`;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function resolveLang(acceptLanguage = '') {
  return /^\s*en/i.test(acceptLanguage) ? 'en' : 'es';
}

export function formatCop(total, lang) {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(total);
}

const ESTILOS = `
:root{color-scheme:light dark;--bg:#f4f2ee;--fg:#26282b;--card:#fbfaf8;--bd:#b9b5ad;--ok:#1e6b3a;--ko:#a32a2a}
@media(prefers-color-scheme:dark){:root{--bg:#1e2124;--fg:#d9dbde;--card:#2a2d31;--bd:#6b7077;--ok:#7fcf9a;--ko:#f09a9a}}
body{margin:0;padding:1rem;background:var(--bg);color:var(--fg);font-family:system-ui,sans-serif;line-height:1.5}
main{max-width:32rem;margin:0 auto;padding:1.25rem;background:var(--card);border:1px solid var(--bd);border-radius:.5rem}
h1{font-size:1.4rem;margin-top:0}
.monto{font-size:2rem;font-weight:700;overflow-wrap:anywhere}
.acciones{display:flex;flex-wrap:wrap;gap:.75rem}
form{flex:1 1 8rem}
button{width:100%;min-height:48px;padding:.5rem 1rem;font:inherit;font-weight:600;background:transparent;color:var(--fg);border:2px solid var(--bd);border-radius:.4rem;cursor:pointer}
button.aprobar{border-color:var(--ok);color:var(--ok)}
button.rechazar{border-color:var(--ko);color:var(--ko)}
button:focus-visible{outline:3px solid currentColor;outline-offset:2px}
button:disabled{opacity:.6;cursor:wait}
`;

function documento(lang, cuerpo) {
  const t = TEXTOS[lang];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.titulo)}</title>
<style>${ESTILOS}</style>
</head>
<body>
<main>
<h1>${esc(t.titulo)}</h1>
${cuerpo}
<p><small>${esc(t.mock)}</small></p>
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}

// Página de pago: con botones solo si `pagable` (PENDIENTE y no expirada).
export function renderPago({ id, estado, totalCop, pagable, lang }) {
  const t = TEXTOS[lang];
  const base = `/pagar/${encodeURIComponent(id)}`;
  const nombreEstado = t[estado] ?? estado;
  if (!pagable) {
    return documento(
      lang,
      `<p role="status">${esc(t.estado)}: <strong>${esc(nombreEstado)}</strong></p>`,
    );
  }
  return documento(
    lang,
    `<p>${esc(t.monto)}</p>
<p class="monto">${esc(formatCop(totalCop, lang))}</p>
<div class="acciones">
<form method="post" action="${esc(base)}/aprobar"><button class="aprobar" type="submit">${esc(t.aprobar)}</button></form>
<form method="post" action="${esc(base)}/rechazar"><button class="rechazar" type="submit">${esc(t.rechazar)}</button></form>
</div>
<p id="estado-envio" role="status" hidden>${esc(t.procesando)}</p>`,
  );
}
