/**
 * DedicaÇÃO Pet Shop — backend dos cupons
 * Cole este arquivo no Apps Script de uma Planilha Google (Extensões > Apps Script).
 * Os dados ficam na aba "Cupons" da sua planilha, só na sua conta Google.
 *
 * Senha do admin: Configurações do projeto (engrenagem) > Propriedades do script >
 *   ADMIN_SENHA = a senha que você quiser
 */

var ABA = 'Cupons';
var COLUNAS = ['codigo', 'nome', 'whatsapp', 'criado_em', 'expira_em', 'status', 'usado_em', 'aceite_lgpd', 'origem'];
var VALIDADE_DIAS = 7;

function aba_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ABA);
  if (!sh) {
    sh = ss.insertSheet(ABA);
    sh.appendRow(COLUNAS);
    sh.setFrozenRows(1);
    sh.getRange('C:C').setNumberFormat('@'); // WhatsApp como texto
  }
  return sh;
}

function linhas_() {
  var sh = aba_();
  var v = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var o = { _linha: i + 1 };
    for (var c = 0; c < COLUNAS.length; c++) o[COLUNAS[c]] = v[i][c];
    out.push(o);
  }
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function iso_(d) { return d instanceof Date ? d.toISOString() : (d || ''); }

function limpar_(s, max) { return String(s || '').replace(/[<>=]/g, '').trim().slice(0, max); }

function novoCodigo_(existentes) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var t = 0; t < 50; t++) {
    var s = 'DEDICA-';
    for (var i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    if (!existentes[s]) return s;
  }
  throw new Error('não consegui gerar código');
}

function senhaOk_(senha) {
  var certa = PropertiesService.getScriptProperties().getProperty('ADMIN_SENHA');
  return !!certa && String(senha || '') === certa;
}

function publico_(r) {
  return {
    codigo: r.codigo, nome: r.nome, whatsapp: String(r.whatsapp), criado_em: iso_(r.criado_em),
    expira_em: iso_(r.expira_em), status: r.status, usado_em: iso_(r.usado_em), aceite_lgpd: iso_(r.aceite_lgpd), origem: r.origem
  };
}

function statusAtual_(r) {
  if (r.status === 'usado') return 'usado';
  if (r.expira_em instanceof Date && r.expira_em.getTime() < Date.now()) return 'vencido';
  return 'ativo';
}

function doGet() {
  return json_({ ok: true, servico: 'cupons-dedicacao' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var acao = req.acao;

    // ---------- público: pegar cupom ----------
    if (acao === 'cadastrar') {
      var nome = limpar_(req.nome, 60);
      var whats = String(req.whatsapp || '').replace(/\D/g, '').slice(0, 13);
      if (nome.length < 2 || whats.length < 10) return json_({ ok: false, erro: 'dados inválidos' });
      if (req.aceite !== true) return json_({ ok: false, erro: 'aceite obrigatório' });

      var todas = linhas_();
      // mesma pessoa (WhatsApp) com cupom ainda válido: devolve o mesmo cupom
      for (var i = todas.length - 1; i >= 0; i--) {
        var r = todas[i];
        if (String(r.whatsapp) === whats && statusAtual_(r) === 'ativo') {
          return json_({ ok: true, repetido: true, cupom: { codigo: r.codigo, nome: r.nome, expira_em: iso_(r.expira_em) } });
        }
      }
      var existentes = {};
      todas.forEach(function (r) { existentes[r.codigo] = true; });
      var agora = new Date();
      var expira = new Date(agora.getTime() + VALIDADE_DIAS * 864e5);
      var codigo = novoCodigo_(existentes);
      aba_().appendRow([codigo, nome, whats, agora, expira, 'ativo', '', agora, limpar_(req.origem, 80)]);
      return json_({ ok: true, cupom: { codigo: codigo, nome: nome, expira_em: expira.toISOString() } });
    }

    // ---------- admin (precisa de senha) ----------
    if (!senhaOk_(req.senha)) return json_({ ok: false, erro: 'senha incorreta' });

    if (acao === 'listar') {
      var lista = linhas_().map(function (r) { var p = publico_(r); p.status = statusAtual_(r); return p; });
      lista.reverse();
      return json_({ ok: true, cupons: lista });
    }

    var cod = String(req.codigo || '').toUpperCase().trim();
    var alvo = null;
    linhas_().forEach(function (r) { if (String(r.codigo).toUpperCase() === cod) alvo = r; });

    if (acao === 'consultar') {
      if (!alvo) return json_({ ok: false, erro: 'cupom não encontrado' });
      var p = publico_(alvo); p.status = statusAtual_(alvo);
      return json_({ ok: true, cupom: p });
    }
    if (acao === 'usar') {
      if (!alvo) return json_({ ok: false, erro: 'cupom não encontrado' });
      var st = statusAtual_(alvo);
      if (st !== 'ativo') return json_({ ok: false, erro: 'cupom ' + st });
      var sh = aba_();
      sh.getRange(alvo._linha, COLUNAS.indexOf('status') + 1).setValue('usado');
      sh.getRange(alvo._linha, COLUNAS.indexOf('usado_em') + 1).setValue(new Date());
      return json_({ ok: true });
    }
    if (acao === 'excluir') { // pedido de exclusão (LGPD)
      if (!alvo) return json_({ ok: false, erro: 'cupom não encontrado' });
      aba_().deleteRow(alvo._linha);
      return json_({ ok: true });
    }
    if (acao === 'login') return json_({ ok: true });

    return json_({ ok: false, erro: 'ação desconhecida' });
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}
