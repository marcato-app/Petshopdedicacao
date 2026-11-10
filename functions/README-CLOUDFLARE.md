# Cupons no Cloudflare (Pages + D1)

- `functions/api/cupom.js` vira o endereço `/api/cupom` quando o site roda no **Cloudflare Pages**.
- Ligações no projeto Pages (Configurações > Ligações): D1 com o nome **DB**.
- Variável de ambiente (Configurações > Variáveis): **ADMIN_SENHA** (tipo Secreto).
- Depois disso, em `cupom-config.js`: `window.CUPOM_API = "/api/cupom";`
