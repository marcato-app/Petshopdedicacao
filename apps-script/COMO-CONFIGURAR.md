# Como ligar o cupom à planilha (uns 5 minutos)

1. Crie uma Planilha Google nova (ex.: "Cupons DedicaÇÃO").
2. Menu **Extensões > Apps Script**. Apague o que tiver e cole todo o conteúdo de `Code.gs`. Salve.
3. Na engrenagem **Configurações do projeto > Propriedades do script > Adicionar propriedade**:
   `ADMIN_SENHA` = a senha que a loja vai usar no /admin.
4. **Implantar > Nova implantação > tipo "App da Web"**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   Clique em Implantar, autorize com a sua conta Google e copie o link que termina em `/exec`.
5. Cole esse link em `cupom-config.js`, em `window.CUPOM_API = "..."`.

Pronto: cada cupom pego aparece na aba **Cupons** da planilha, e a loja usa `petshopdedicacao.com.br/admin` pra validar no caixa.

Se mudar o `Code.gs` depois, use **Implantar > Gerenciar implantações > editar > Nova versão** pra manter o mesmo link.
