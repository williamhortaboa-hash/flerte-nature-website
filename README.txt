FLERTE NATURE LDA — VERSÃO 2.0

ALTERAÇÕES
- Novo serviço: LAVANDARIA.
- Nova secção GALERIA.
- Painel administrativo em /admin/.
- Upload, listagem e eliminação de fotografias.
- As fotografias do painel aparecem automaticamente na galeria.
- O programador pode escolher, no painel, qual fotografia será usada como background visual do hero.
- Backend preparado para Netlify Functions + Netlify Blobs.

IMPORTANTE — CONFIGURAÇÃO DO LOGIN
O login NÃO guarda a palavra-passe no HTML/JavaScript. Para ativar o acesso seguro no Netlify:
1. Abra o painel do site no Netlify.
2. Vá a Site configuration / Environment variables.
3. Crie estas três variáveis:
   ADMIN_USER = escolha o seu utilizador
   ADMIN_PASSWORD = escolha uma palavra-passe forte
   ADMIN_SECRET = uma sequência longa e aleatória, diferente da palavra-passe
4. Faça um novo deploy.
5. Abra https://www.flertenature.co.mz/admin/
6. Entre com ADMIN_USER e ADMIN_PASSWORD.

ARMAZENAMENTO
As fotografias são guardadas no Netlify Blobs. O primeiro upload cria/usa o armazenamento configurado pela função.
O painel otimiza as fotos para JPEG antes do envio e limita a imagem final a 4 MB.

NOTA SOBRE SEGURANÇA
Não coloque ADMIN_PASSWORD ou ADMIN_SECRET em nenhum ficheiro HTML, CSS ou JavaScript. Use apenas variáveis de ambiente do Netlify.

DESENVOLVIMENTO LOCAL
O site público pode ser aberto normalmente no Eclipse, mas o painel e as funções administrativas precisam de um ambiente Netlify Functions para funcionar plenamente.

CONTACTOS MANTIDOS
878 172 422 | 828 179 422 | flertenature@hotmail.com
