# Diretório de usuários

Execute `20261015_owner_user_directory.sql` no SQL Editor do projeto Supabase antes de publicar a nova gestão de usuários.

A função consulta o cadastro de autenticação, inclusive contas que nunca fizeram login, e retorna a data real de confirmação do e-mail. Somente contas com papel global `owner` podem executá-la. Ela não confirma e-mails, não modifica contas e não concede permissões.

Sem esta migração, a interface mantém a consulta anterior e separa os vínculos conhecidos em “Com acesso” e “Sem restaurante”. O filtro “Aguardando e-mail” só é exibido quando há dados reais de confirmação. No editor da conta, a confirmação fica como “Não consultada”, sem presumir que a conta foi ativada.
