// Cloudflare Pages Function — /api/cupom
// Banco: D1 ligado com o nome "DB". Senha do admin: variável de ambiente ADMIN_SENHA.
const VALIDADE_DIAS = 7;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});
const limpar = (s, max) => String(s || '').replace(/[<>=]/g, '').trim().slice(0, max);
function statusAtual(r) {
  if (r.status === 'usado') return 'usado';
  if (new Date(r.expira_em).getTime() < Date.now()) return 'vencido';
  return 'ativo';
}
function novoCodigo() {
  const a = new Uint32Array(4); crypto.getRandomValues(a);
  let s = 'DEDICA-'; for (const n of a) s += CHARS[n % CHARS.length]; return s;
}
async function senhaOk(env, senha) {
  const certa = env.ADMIN_SENHA || '';
  if (!certa || typeof senha !== 'string') return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(senha)), crypto.subtle.digest('SHA-256', enc.encode(certa))]);
  const x = new Uint8Array(a), y = new Uint8Array(b); let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
async function garantirTabela(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS cupons (
    codigo TEXT PRIMARY KEY, nome TEXT NOT NULL, whatsapp TEXT NOT NULL,
    criado_em TEXT NOT NULL, expira_em TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ativo',
    usado_em TEXT, aceite_lgpd TEXT NOT NULL, origem TEXT)`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cupons_whats ON cupons(whatsapp)').run();
}

export async function onRequestGet() { return json({ ok: true, servico: 'cupons-dedicacao' }); }

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, erro: 'banco não configurado' }, 500);
  let req; try { req = JSON.parse(await request.text()); } catch { return json({ ok: false, erro: 'pedido inválido' }, 400); }
  const db = env.DB; await garantirTabela(db);
  const acao = req.acao;

  if (acao === 'cadastrar') {
    const nome = limpar(req.nome, 60);
    const whats = String(req.whatsapp || '').replace(/\D/g, '').slice(0, 13);
    if (nome.length < 2 || whats.length < 10) return json({ ok: false, erro: 'dados inválidos' }, 400);
    if (req.aceite !== true) return json({ ok: false, erro: 'aceite obrigatório' }, 400);
    const { results } = await db.prepare('SELECT * FROM cupons WHERE whatsapp = ? ORDER BY criado_em DESC').bind(whats).all();
    const ativo = results.find(r => statusAtual(r) === 'ativo');
    if (ativo) return json({ ok: true, repetido: true, cupom: { codigo: ativo.codigo, nome: ativo.nome, expira_em: ativo.expira_em } });
    const agora = new Date(), expira = new Date(agora.getTime() + VALIDADE_DIAS * 864e5);
    for (let t = 0; t < 5; t++) {
      const codigo = novoCodigo();
      try {
        await db.prepare('INSERT INTO cupons (codigo,nome,whatsapp,criado_em,expira_em,status,aceite_lgpd,origem) VALUES (?,?,?,?,?,?,?,?)')
          .bind(codigo, nome, whats, agora.toISOString(), expira.toISOString(), 'ativo', agora.toISOString(), limpar(req.origem, 80)).run();
        return json({ ok: true, cupom: { codigo, nome, expira_em: expira.toISOString() } });
      } catch (e) { if (!String(e).includes('UNIQUE')) throw e; }
    }
    return json({ ok: false, erro: 'tente de novo' }, 500);
  }

  if (!(await senhaOk(env, req.senha))) return json({ ok: false, erro: 'senha incorreta' }, 401);

  if (acao === 'login') return json({ ok: true });
  if (acao === 'listar') {
    const { results } = await db.prepare('SELECT * FROM cupons ORDER BY criado_em DESC').all();
    return json({ ok: true, cupons: results.map(r => ({ ...r, status: statusAtual(r) })) });
  }
  const cod = String(req.codigo || '').toUpperCase().trim();
  const alvo = await db.prepare('SELECT * FROM cupons WHERE codigo = ?').bind(cod).first();
  if (acao === 'consultar') return alvo ? json({ ok: true, cupom: { ...alvo, status: statusAtual(alvo) } }) : json({ ok: false, erro: 'cupom não encontrado' });
  if (acao === 'usar') {
    if (!alvo) return json({ ok: false, erro: 'cupom não encontrado' });
    const st = statusAtual(alvo); if (st !== 'ativo') return json({ ok: false, erro: 'cupom ' + st });
    await db.prepare("UPDATE cupons SET status='usado', usado_em=? WHERE codigo=?").bind(new Date().toISOString(), cod).run();
    return json({ ok: true });
  }
  if (acao === 'excluir') {
    if (!alvo) return json({ ok: false, erro: 'cupom não encontrado' });
    await db.prepare('DELETE FROM cupons WHERE codigo=?').bind(cod).run();
    return json({ ok: true });
  }
  return json({ ok: false, erro: 'ação desconhecida' }, 400);
}
