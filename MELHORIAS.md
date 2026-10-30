# Tomodachi Player — Melhorias de UI, usabilidade e correções (1.1 → 1.3)

## Como abrir

**Jeito mais fácil:** dê dois cliques em **`Gerar executavel e atalhos.bat`** (na pasta do projeto). Ele compila, gera `release\win-unpacked\Tomodachi Player.exe` com o ícone novo e cria atalhos na Área de Trabalho e no Menu Iniciar. Depois é só clicar com o botão direito no atalho → **Fixar na barra de tarefas**. Rode o `.bat` de novo sempre que quiser atualizar o executável.

Pelo terminal:

```bash
npm run dev        # modo desenvolvimento
npm run pack       # gera o executável em release/win-unpacked (sem instalador)
npm run atalhos    # (re)cria os atalhos
npm run dist       # gera o instalador em release/
```

O app agora se chama **Tomodachi Player** (nome da janela, do executável e dos atalhos). Seus dados (biblioteca, progresso, logins) continuam na mesma pasta de antes.

Os arquivos originais (antes destas mudanças) ficaram em `_backup_v1.0.0/` caso queira comparar ou reverter algo.

---

## Correções de erros

| Problema | O que acontecia | Correção |
|---|---|---|
| **Perda de dados da biblioteca** | Abrir uma obra em "Detalhes" gravava no disco o resumo do localStorage (sem capítulos, descrições e categorias), apagando dados do backup importado. | `library:save` agora normaliza o formato, preserva categorias e grava de forma atômica; a tela de detalhes usa o novo `utils/libraryStore.ts`, que só altera a obra certa. |
| Fechar a última aba | Tela ficava em branco (a aba nova não era ativada). | Sempre existe uma aba ativa válida. |
| Atalhos do leitor em abas ocultas | Todas as abas de leitura (mesmo escondidas) reagiam a ←/→/A/D/F — inclusive ao digitar em campos de busca. | Atalhos só na aba ativa e nunca ao digitar (`context/TabContext.tsx`). |
| Trailer no lugar do vídeo | Se o AniList encontrasse um trailer, o player mostrava o YouTube em vez do arquivo local/episódio. | Trailer só para links do YouTube ou páginas do AniList. |
| Vídeo tocando em segundo plano | Trocar de aba deixava o áudio tocando. | Pausa automática e salva a posição ao sair da aba. |
| Navegador recarregando sozinho | Cada navegação alterava o `src` do `<webview>`, recarregando a página (quebrava sites SPA como MangaDex/AniList). | `src` definido uma vez; navegação via `loadURL`. |
| Abrir capítulo já lido o marcava como **não lido** | O botão "Ler" alternava o estado. | Leitura nunca desmarca; o leitor marca como lido ao chegar na última página. |
| "0" solto na lista de capítulos | `{lastPageRead && ...}` renderizava `0`. | Condição corrigida. |
| Atualizar capítulos zerava o progresso | A lista nova substituía tudo como não lido. | Estado lido/página é preservado e mesclado com o progresso salvo. |
| Extensões de anime no catálogo de mangá | A lista de fontes de mangá incluía extensões de anime. | Filtro por tipo. |
| Links externos não abriam | `target="_blank"` era bloqueado pela janela. | Abrem no navegador do sistema (`shell:openExternal`). |
| Ctrl+R / Ctrl+W do menu padrão | Recarregavam o app inteiro / fechavam a janela, perdendo todas as abas. | Menu enxuto (editar, zoom, tela cheia, DevTools); Ctrl+W/Ctrl+T agora são das abas. |
| Uma tela com erro derrubava o app | Qualquer exceção deixava tudo em branco. | `ErrorBoundary` por aba, com "Recarregar tela". |
| Classes do Tailwind v4 num projeto v3 | `shadow-xs`, `bg-linear-to-*`, `scrollbar-none`, `animate-in`… não existiam. | Definidas no `tailwind.config.js`. |
| Temas aplicados pela metade | Só algumas cores hex eram trocadas por `!important`. | Todo o app usa tokens semânticos; os temas mudam a interface inteira. |
| AniList offline mostrava "nenhum anime encontrado" | Erro de rede parecia busca vazia. | Mensagem de erro com "Tentar novamente". |
| Botões de uBlock dessincronizados | Barra de título e navegador tinham estados diferentes. | Sincronizados por evento. |

## Interface

- **Barra de título com abas** (estilo navegador): ganha uma linha inteira de espaço vertical. Clique do meio fecha, roda do mouse rola as abas, novas abas abrem ao lado da atual.
- **Barra lateral organizada por seção** (estilo Mihon/Aniyomi): Biblioteca, Explorar, Extensões, Repositórios, Pasta local e Backup — para mangás e animes — além de Navegador e Configurações. Recolhível (Ctrl+B) e lembrada entre sessões.
- **Cabeçalho de página** compacto com a seção atual; as fontes do catálogo viraram chips.
- **Visões preservadas**: alternar entre Biblioteca/Explorar/etc. não perde busca, rolagem nem resultados.
- **Biblioteca**: capas maiores em grade adaptável, selo de não lidos, barra de progresso, favorito no hover, barra única de busca/filtros/categorias, novas ordenações (lidos recentemente, adicionados recentemente, mais não lidos), estado de carregamento e estados vazios com ações.
- **Sistema de cores por tokens** (`canvas`, `surface`, `subtle`, `line`, `fg`, `accent`…) com canais RGB — opacidades funcionam com qualquer tema, inclusive os criados pelo usuário. Os botões nativos da janela acompanham o tema.
- Sub-abas só aparecem quando há mais de uma.

## Leitor de mangá (reescrito)

- Modos contínuo (webtoon), página única e página dupla; ajuste à altura/largura/original; direção LTR/RTL (mangá japonês).
- **Próximo/anterior capítulo** dentro do próprio leitor (o título da aba acompanha).
- Retoma da última página lida; salva o progresso e marca como lido ao terminar.
- Página atual acompanha a rolagem no modo contínuo; miniaturas levam à página certa.
- Clique nas laterais vira a página; clique no centro esconde as barras.
- Páginas com erro mostram "Tentar novamente" (com espelho e resolvedor de imagens).
- Pré-carregamento das próximas páginas; preferências lembradas.
- O leitor do NHentai passou a usar o mesmo leitor.

**Atalhos:** ←/→ ou A/D (páginas), Espaço/PageDown, Home/End, F (tela cheia), +/− (zoom), Esc.

## Player de vídeo

- Retoma de onde parou; lembra volume e velocidade; marca o episódio como visto aos 90%.
- Duplo clique = tela cheia; estado de tela cheia sincronizado com Esc.

**Atalhos:** Espaço/K, ←/→ (5 s), J/L (10 s), Shift+←/→ (30 s), ↑/↓ volume, M mudo, F tela cheia, `<`/`>` velocidade, 0–9 pular para 0–90%.

## Navegador integrado

- Links "abrir em nova aba" viram abas do app.
- F5/Ctrl+R recarrega, Ctrl+L foca o endereço, Alt+←/→ volta/avança; Esc no endereço desfaz a edição.

## Atalhos globais

| Atalho | Ação |
|---|---|
| Ctrl+T | Nova aba do navegador |
| Ctrl+Shift+T | Reabrir aba fechada |
| Ctrl+W | Fechar aba |
| Ctrl+Tab / Ctrl+Shift+Tab | Próxima / anterior aba |
| Ctrl+1…9 | Ir para a aba N (9 = última) |
| Ctrl+B | Recolher/expandir a barra lateral |

## Arquivos novos

- `src/context/TabContext.tsx` — aba ativa e detecção de digitação
- `src/components/ErrorBoundary.tsx`
- `src/components/SectionChrome.tsx` — cabeçalho, chips e visões preservadas
- `src/utils/progress.ts` — progresso de leitura/vídeo unificado
- `src/utils/libraryStore.ts` — leitura/escrita segura da biblioteca

---

# Versão 1.2.0

## Novidades

- **Tema "Tomodachi Rosa"** com as cores do ícone, agora o padrão. Os outros temas continuam em Configurações → Aparência (o antigo padrão virou "Tomodachi Azul").
- **Atualizações** (mangás e animes): o botão "Verificar agora" consulta as fontes das obras da biblioteca e lista os capítulos/episódios novos, com selo na barra lateral. Dá para limitar a uma categoria. Os capítulos novos entram na biblioteca automaticamente.
  - Por segurança, se a fonte devolve endereços num formato diferente do salvo no backup, a obra é ignorada em vez de duplicar capítulos.
- **Histórico**: uma linha por obra com o último capítulo/episódio, agrupado por dia, com "Continuar" (abre o próximo se o atual já foi concluído). Vídeos locais assistidos também aparecem. *O histórico começa a contar a partir desta versão.*
- **Busca global (Ctrl+K)**: obras da biblioteca, todas as telas do app, abas abertas e pesquisa na web.
- **Abas restauradas** ao reabrir o app (seções, configurações, navegador, detalhes de obras). Leitores e players não são restaurados porque os links das páginas expiram.
- **Biblioteca**: modos grade, grade compacta e lista, e controle do tamanho das capas.
- **Downloads offline**: em Detalhes, cada capítulo tem um botão de download e há "Baixar não lidos". Capítulos baixados abrem sem internet. Ficam em *Configurações → Sistema → Abrir pasta de downloads*.
- **Player**:
  - legendas `.srt`, `.vtt`, `.ass/.ssa` (botão "Legenda" ou automaticamente, se houver uma legenda com o mesmo nome do vídeo); `C` liga/desliga;
  - **próximo episódio**: botão, tecla `N` e reprodução automática ao terminar (com contagem de 8 s e opção de cancelar).
- **Leitor (página dupla)**: opção "1+2" para alinhar páginas duplas (capa sozinha ou junto).
- **Avisos e confirmações** do próprio app no lugar das janelas nativas do Windows.
- **Tela de boas-vindas** no primeiro uso.
- **Registro de erros** em arquivo (*Configurações → Sistema → Abrir pasta de logs*) — envie esse arquivo se algo der errado.

## Não incluído (e por quê)

- **Extensões reais via Suwayomi**: exige Java e um servidor externo de ~100 MB; precisa ser testado no seu Windows antes de virar padrão.
- **Sincronização com AniList/MyAnimeList**: exige registrar um aplicativo OAuth com a sua conta.
- **Faixas de áudio de MKV** e **detalhes de anime em aba**: ficam para a próxima rodada.
- **Criptografia do token do NHentai**: o app lê o token de forma síncrona em vários lugares; mudar isso sem testar o login real poderia quebrá-lo.

---

# Versão 1.3.0

## Novidades

- **Extensões reais do Mihon via Suwayomi** (*Mangás → Explorar → Suwayomi*):
  - Na aba **Conexão** há o passo a passo. Baixe o Suwayomi-Server para Windows (já vem com Java), indique o executável e marque "Iniciar automaticamente". O Tomodachi liga o servidor junto com o app e o desliga ao fechar.
  - **Extensões**: instalar, atualizar e remover as extensões oficiais, com filtros por idioma e +18. "Usar meus repositórios" envia ao servidor os repositórios que você já tinha cadastrado.
  - **Catálogo**: escolha a fonte, veja Populares/Recentes ou pesquise. As obras abrem na tela de detalhes normal (biblioteca, downloads, leitor, atualizações), com capítulos e páginas vindos da extensão oficial.
- **Detalhes de anime em aba própria** (antes era uma janelinha):
  - "Continuar" retoma o episódio em andamento a partir do minuto em que parou.
  - Mostra a barra de progresso de cada episódio, a busca, a marcação de vistos e os favoritos.
  - A aba também abre pelo Histórico e pela busca global (Ctrl+K).
- **Player: MKV com busca, faixas de áudio e legendas embutidas**:
  - **Avançar e voltar em MKV/AVI agora funciona**: a barra, as setas, as teclas 0–9 e a retomada de onde parou. Antes esses vídeos só tocavam do começo, sem barra de tempo.
  - Botão **Áudio e legendas**: troca a faixa de áudio (ex.: japonês ↔ português) e liga legendas embutidas no MKV (.ass/.srt). Legendas em imagem (PGS) aparecem desativadas.
  - O idioma de áudio e de legenda escolhido é lembrado nos próximos episódios. Sem preferência, o app escolhe uma legenda em português.
  - Se um MP4 tiver um codec que o Chromium não abre (ex.: HEVC), a conversão automática mantém a busca funcionando.
- **Segurança**: o token do NHentai e a senha do Suwayomi são guardados **criptografados** com o cofre do Windows (DPAPI), e não mais em texto puro. A migração dos valores antigos é automática.
- Status das obras com os nomes do Mihon (em hiato, cancelado, licenciado…).

## Correções

| Problema | Correção |
|---|---|
| **"Atualizar capítulos" na tela de detalhes travava** com *Maximum call stack size exceeded* (a função chamava a si mesma), então nunca atualizava a lista. | Corrigido. Agora salva a lista e mantém lido/página. |
| **Leitor preso no "carregando"** quando a página já estava em cache (capítulos baixados, páginas revisitadas). | O leitor detecta imagens já carregadas. |


## Sincronização com o AniList (1.3.0)

- *Configurações → Contas & Chaves de API → Entrar com AniList*: abre o login do AniList numa janela do app. O token fica criptografado no cofre do Windows.
- Ao marcar capítulos/episódios como lidos ou vistos (no leitor, no player ou nas telas de detalhes), o progresso vai para a sua lista do AniList em poucos segundos. **Só avança**: se no AniList o número já for maior, nada muda. Ao chegar no último, a obra vira "Completo".
- Cada obra é vinculada automaticamente pelo título. Nas telas de detalhes, o selo **AniList** mostra o vínculo e permite **Trocar** (buscar outra obra), **Sincronizar agora** ou **Não sincronizar esta obra**.
- As últimas sincronizações (e erros) aparecem no cartão do AniList em Configurações.

## Navegador: favoritos com pastas (1.3.0)

- **Importar mantendo as pastas**: aceita o HTML exportado por Chrome, Edge, Firefox, Brave, Opera ou Safari, o arquivo `Bookmarks` do Chrome e o backup `.json/.jsonlz4` do Firefox.
  - A "Barra de favoritos" do outro navegador vira a barra do Tomodachi.
  - "Outros favoritos" e as demais pastas e subpastas são recriadas.
  - Importar o mesmo arquivo de novo não duplica nada.
- **Pastas na barra**: clicar numa pasta abre um menu com o conteúdo e permite entrar nas subpastas.
- **Estrela (☆ ou Ctrl+D)**: salva a página e abre um balão para escolher o nome e a pasta, criar uma pasta nova ou remover o favorito.
- **Gerenciador** (botão "Favoritos"):
  - navegação por pastas com o caminho no topo;
  - **Nova pasta** e **Novo favorito** dentro da pasta aberta;
  - editar nome/endereço e **mover** para outra pasta;
  - **arrastar e soltar** itens em pastas ou no caminho;
  - pesquisa em todas as pastas;
  - excluir pasta (com aviso do que tem dentro).
- **Exportar** gera um HTML com as pastas, que abre em qualquer navegador.
- Corrigido: depois de ocultar a barra de favoritos não havia como mostrá-la de novo. Agora há um botão ao lado de "Favoritos" e o atalho **Ctrl+Shift+B**.

## Navegador: proteção contra anúncios e extensões (1.3.0)

- **Correção importante**: o bloqueador de anúncios **não agia no navegador integrado**. Ele estava ligado só na sessão interna do app, e as páginas do navegador usam outra sessão. Agora ele vale para todas as páginas.
- **Proteção integrada** (ícone de peça ao lado de "Favoritos"):
  - bloqueio de rede com as listas do uBlock Origin (EasyList, EasyPrivacy, uBlock filters);
  - **esconde os espaços de anúncio** e roda os "scriptlets" contra avisos de "desative seu bloqueador";
  - **bloqueia pop-ups/pop-unders** de propaganda;
  - opção de bloquear **avisos de cookies e incômodos**;
  - as listas se atualizam sozinhas a cada 7 dias (antes nunca atualizavam), e há o botão "Atualizar agora".
- **Extensões do Chrome**:
  - instale colando o link da Chrome Web Store, por arquivo `.crx/.zip` ou por pasta descompactada;
  - ative/desative, remova, abra o painel e as opções;
  - extensões com painel ganham um ícone na barra do navegador.
- **Limitação do Electron**: ele só tem parte dos recursos de extensão do Chrome. Funcionam melhor as extensões que alteram páginas (modo escuro, pular patrocínios, ajustes de sites). Bloqueadores do Chrome atual, como o **uBlock Origin Lite**, usam um recurso (`declarativeNetRequest`) que o Electron não tem e **não bloqueiam nada aqui**. O app avisa isso ao instalar, e a proteção integrada cobre esse papel.

## Idioma da interface (1.3.0)

- *Configurações → Aparência & Idioma*: **Português (Brasil)**, **English** e **Español**. A tela de boas-vindas também tem a escolha.
- Trocar o idioma recarrega a interface. As abas abertas voltam, mas leitores e players abertos fecham.
- Ficam como estão: os dados das suas obras, como títulos, categorias que você criou e nomes de capítulos vindos das fontes. Também ficam os nomes de produtos (MangaDex, AniList…).
- Como funciona: `src/i18n/` usa o texto em português como chave, e as traduções ficam em `src/i18n/parts/*.ts`. Um texto sem tradução aparece em português, sem quebrar nada.

## Atualização automática de extensões (1.3.0)

- Toda vez que o app abre (alguns segundos depois de iniciar), as **extensões de mangá e de anime** são conferidas nos repositórios:
  - atualiza a versão, o ícone e, principalmente, o **endereço do site** quando a fonte muda de domínio (isso quebrava a leitura e os episódios);
  - o vínculo com as obras da biblioteca não muda.
- **Suwayomi**: se estiver configurado, as extensões do Mihon com atualização pendente são instaladas (espera o servidor iniciar, se ele abre junto com o app).
- Aparece um aviso só quando algo foi atualizado.
- *Configurações → Repositórios de Extensões*: tem o botão para **ligar/desligar**, o **Verificar agora** e o resultado da última verificação.

## Menu lateral enxuto e abas internas (1.3.0)

- O menu lateral agora tem só **Mangás & Comics** e **Animes & Vídeos** (com o selo de novidades), além de Navegador e Configurações. Embaixo do nome aparece a aba aberta.
- Dentro de cada seção há três abas: **Biblioteca · Explorar · Local**.
  - **Biblioteca**:
    - botão **Atualizar**, que abre "Atualizações" já procurando capítulos/episódios novos;
    - botão **Histórico** (ele também saiu do menu lateral).
  - **Explorar**:
    - as fontes continuam na faixa "Fontes";
    - o botão **Extensões** abre Extensões + Repositórios na mesma tela, com as abas *Instaladas | Repositórios*;
    - o botão **Backup** abre um modal com **Importar Backup** e **Exportar Backup**.
  - **Local**: a pasta local de mangás (ou de vídeos).
- **Exportar Backup** gera um `.tachibk` de verdade, no formato do Mihon/Tachiyomi para mangás e do Aniyomi para animes. Ele leva:
  - obras e categorias;
  - capítulos/episódios lidos ou assistidos, marcadores e a página ou o segundo em que você parou;
  - histórico e rastreamento.

  O arquivo pode ser reimportado aqui ou levado para o app do celular.
- **Correção no backup**: os IDs de fonte do Mihon têm 19 dígitos e perdiam os últimos dígitos na importação, porque o JavaScript arredonda números grandes. Agora são lidos e gravados com precisão. Obras importadas antes desta versão podem ter o ID arredondado; reimportar o backup do celular corrige.

## Player de vídeo: busca na barra e prévia da cena (1.3.0)

- **Correção: arrastar a barra fazia o vídeo voltar ao início.**
  - **Arquivos locais grandes** (acima de 25 MB): o app entregava o vídeo sem suporte a "Range" e o Chromium não conseguia pular. Agora o protocolo `media-file://` responde com 206 e `Content-Range` (veja `electron/fileResponse.ts`).
  - **Episódios online convertidos pelo FFmpeg** (ex.: HLS/m3u8): antes não era possível pular. Agora o app descobre a duração do stream e reinicia a conversão no ponto escolhido (`?ss=`), igual aos MKV locais.
  - Ao soltar a barra, a busca é aplicada na hora.
- **Prévia ao passar o mouse na barra**: mostra o quadro da cena e o tempo daquele ponto.
  - MP4/WebM e streams diretos: o quadro vem de um segundo vídeo, mudo e escondido.
  - Vídeos convertidos (MKV, HLS…): o FFmpeg gera miniaturas, guardadas em cache a cada 5–10 s.

## Integração com o Nuvio (1.3.0)

Nova aba **Nuvio** em *Animes & Vídeos* (Biblioteca · Explorar · **Nuvio** · Local).

- **Plugins**: cole o link do `manifest.json`, como no app Nuvio (Configurações → Plugins). Links de página do GitHub também servem.
  - Cada repositório mostra os plugins com versão, tipos, idiomas e formatos.
  - Dá para ligar ou desligar cada plugin, ativar ou desativar todos, atualizar e remover.
  - Há também um interruptor geral "Usar plugins".
- **Catálogo** (Séries · Filmes · Animes, com busca e gêneros):
  - vem do Cinemeta, o catálogo do Stremio;
  - ele já traz o ID do TMDB, que é o que os plugins usam para buscar os links.
- **Tela da obra**:
  - temporadas, episódios com miniatura e marcar como assistido;
  - botão "Assistir" no próximo episódio não visto;
  - painel **Fontes**, que roda os plugins em paralelo e mostra os links por qualidade conforme chegam;
  - o player toca os links com os cabeçalhos exigidos (Referer etc.). HLS passa pelo FFmpeg, com busca na barra, e as legendas enviadas pela fonte são carregadas.
- **Favoritar** usa as tags do Tomodachi:
  - as tags que você já tem e que combinam com a obra vêm marcadas;
  - novas tags são **indicadas** (ex.: "Animes", "Séries", "Filmes") e entram com um clique.
- A obra fica na **Biblioteca** como qualquer outra:
  - "Atualizar" encontra episódios novos;
  - Histórico e Atualizações abrem direto no episódio.
- **Segurança**:
  - os plugins (JavaScript de terceiros) rodam numa janela oculta do Chromium com sandbox e sessão própria, sem acesso ao Node nem a arquivos;
  - recebem `fetch`, `axios`, `cheerio` e `crypto-js` compatíveis, implementados pelo app;
  - a rede passa pelo processo principal (só http/https, com limite de tempo e tamanho);
  - o código de cada plugin fica em cache e só é baixado de novo quando a versão muda.
- **Correção**: favoritar uma obra regravava a biblioteca a partir do resumo do localStorage, que não tem capítulos, e podia apagar os capítulos das outras obras no disco. Agora lê e grava a biblioteca completa.

## Addons do Stremio na aba Nuvio (1.3.0)

- O mesmo campo de **Plugins** aceita o link `manifest.json` de **addons do Stremio**, inclusive links `stremio://`. O tipo é detectado sozinho: repositório de plugins do Nuvio ou addon.
- **Importar .json**: aceita lista de addons exportada (`[{ transportUrl, manifest }, …]`), lista de links ou manifesto com endereço. Os itens com problema aparecem listados com o motivo.
- Cada addon tem liga/desliga, copiar link e remover, e mostra os recursos que oferece: fontes, catálogo, detalhes e legendas.
- **Fontes**: addons com `stream` entram no painel Fontes junto com os plugins (selo "addon").
  - Links diretos HTTP/HLS tocam no player, com os cabeçalhos `proxyHeaders`.
  - Links externos e YouTube abrem no navegador do app.
  - **Torrents são ignorados**, porque o player não toca torrent. O painel mostra quantos foram pulados.
- **Catálogos**: os catálogos de filmes e séries dos addons aparecem no seletor de catálogo, ao lado do Cinemeta, com busca e gênero quando o addon oferece.
  - Obras com IDs próprios (ex.: `kitsu:123`) usam os detalhes do próprio addon e funcionam na biblioteca, em "Atualizar" e no Histórico.
- **Legendas**: addons de legenda (ex.: OpenSubtitles) são consultados ao abrir o vídeo e a melhor legenda já é carregada.

## Ajuda do Nuvio e configuração do Suwayomi (1.3.0)

- **Nuvio → "Como funciona?"**: um painel com os pontos principais. Ele abre sozinho na primeira visita, quando ainda não há nada instalado.
  - o que é o Nuvio e a diferença entre plugins e addons;
  - sem plugins não há vídeo;
  - torrents não tocam (use debrid);
  - pode demorar, e o que fazer quando um plugin falha;
  - animes (catálogo Kitsu), favoritos e segurança.
- **Configurações → Suwayomi** (nova seção). A mesma tela aparece em Explorar → Suwayomi → Conexão.
  - Explica por que o Suwayomi é necessário para as extensões do Mihon e dá o passo a passo.
  - **Executável do Suwayomi** + "Iniciar automaticamente ao abrir o Tomodachi Player", com botão **Iniciar agora**.
  - **Repositórios de extensões** com botão **Copiar**: Keiyoushi, FAKKU (+18), Kavita e Suwayomi. Com o servidor conectado, o botão **Adicionar** cadastra o repositório direto no Suwayomi.
- Em Mangás → Explorar → Extensões, um aviso (que pode ser fechado) explica que as extensões do Mihon precisam do Suwayomi, com o botão **Configurar Suwayomi**.

## Animes & Vídeos: painel de Fontes, legendas online e só formatos suportados (1.3.0)

- **Explorar com cards maiores**: pôsteres em proporção 2:3, menos colunas e mais espaço. No modal do AniList, a lista de episódios ficou mais alta e mostra os nomes completos.
- **Painel lateral "Fontes"**: abre ao clicar em assistir, venha a obra de onde vier (AniList, catálogos das extensões, biblioteca, Nuvio).
  - **Extensões**: procura o título (e os nomes alternativos) em todas as extensões de anime, lista os resultados por semelhança e carrega os episódios do site. O episódio pedido já fica pronto para assistir.
  - **Plugins (Nuvio)**: acha a obra no catálogo (Cinemeta), converte o número do episódio do AniList em temporada/episódio (dá para corrigir) e roda os plugins e addons.
  - O progresso volta para o episódio certo da biblioteca.
  - Na biblioteca, a tela do anime ganhou o botão "Fontes". Na tela do Nuvio, o botão "Extensões" abre o painel na aba de extensões.
- **Legendas online**:
  - no player, "Legendas → Buscar legendas online…" procura no OpenSubtitles (sem chave, pelo addon público) e nos addons de legenda instalados;
  - o título, a temporada e o episódio são lidos do nome do arquivo, e há filtro por idioma;
  - ao assistir pelos plugins, a melhor legenda no seu idioma já é carregada automaticamente.
- **Só aparece o que o player toca**: torrents, DASH (.mpd), páginas externas e YouTube não aparecem mais nas fontes. Plugins cujo formato o app não suporta são marcados e ignorados. Fontes sem links compatíveis aparecem resumidas numa linha só.

## Torrents no player, fontes limpas e Configurações → Extensões simplificada (1.3.1)

- **Torrents tocam direto no app**. Antes, os links de torrent dos addons do Stremio (ex.: Torrentio) e dos plugins do Nuvio eram descartados.
  - Um motor de torrent (WebTorrent) roda num processo separado, então um torrent travado não trava o app.
  - Ele baixa só o arquivo de vídeo escolhido, priorizando o trecho que está sendo assistido, e serve o vídeo localmente com suporte a busca (Range).
  - MKV com codecs que o Chromium não toca passa pela conversão do FFmpeg, como os outros links.
  - Usa os trackers informados pelo addon mais trackers públicos.
  - Os arquivos ficam numa pasta temporária, apagada ao abrir e ao fechar o app. No máximo 3 torrents ficam ativos; fechar a aba para o torrent.
  - Ao clicar em "Assistir", a aba do player abre na hora com "Procurando peers…". Depois, um selo discreto mostra peers, velocidade e progresso. Se demorar ou falhar, há uma explicação e o botão **Tentar de novo**.
  - Nas fontes, os links aparecem com o formato **TORRENT**.
  - Os plugins do Nuvio podem devolver links `magnet:` ou `infoHash`.
  - **Build à prova de falhas**:
    - nova dependência opcional `webtorrent@1.9.7`;
    - script `scripts/build-torrent.cjs`, que tenta empacotar tudo, depois tenta com dependências externas e, em último caso, gera um motor "indisponível";
    - se o motor não estiver disponível, os torrents simplesmente não aparecem (como antes) e o resto do app segue normal.
- **Extensões "embutidas" removidas**: BetterAnime, AnimeFire, HiAnime e GogoAnime não aparecem mais em Fontes nem em Explorar sem o usuário instalar.
- **Configurações → Extensões**: saiu a lista duplicada de repositórios e extensões. Ficaram:
  - a atualização automática;
  - um cartão que leva direto a Mangás → Repositórios, Animes → Repositórios ou à configuração do Suwayomi.

## Animes & Vídeos redesenhado: Descobrir, Fontes e "Onde assistir" (1.4.0)

A seção ficou com 4 abas: **Biblioteca · Descobrir · Fontes · Local**. A aba "Nuvio", o botão "Extensões" e as abas "Instaladas / Repositórios" saíram. Tudo isso agora está em Fontes.

- **Fontes**: um lugar só para os três tipos.
  - **Adicionar fonte**: um único campo onde se cola qualquer link. O app descobre o tipo sozinho:
    - repositório de extensões (`index.min.json` / `.pb`) → Extensões (sites, como no Aniyomi);
    - `manifest.json` do Nuvio → Plugins;
    - `manifest.json` / `stremio://` de addon → Addons.
    Também aceita importar um `.json`.
  - **Suas fontes**: lista única com selo de tipo (Extensão / Plugin / Addon) e filtro por tipo.
    - Ligar e desligar, remover.
    - Em extensões, o botão "Navegar" abre o catálogo do site no Descobrir.
    - Em plugins, dá para expandir e ligar/desligar cada script.
  - **Extensões para instalar**: o que existe nos repositórios adicionados (sem duplicadas), com filtro e "Instalar". Os repositórios aparecem como etiquetas removíveis.
  - O interruptor geral "Usar plugins" saiu: o que está instalado e ligado é usado.
- **Descobrir**: uma barra de busca e uma fileira de catálogos.
  - Animes (AniList), Séries e Filmes (Cinemeta), os catálogos dos addons e os sites das extensões.
  - A mesma busca vale para o catálogo escolhido.
  - Sem nenhuma fonte, um aviso explica como adicionar.
- **Onde assistir** (o painel que abre ao clicar em Assistir, e o quadro na página de séries e filmes):
  - procura em **todas** as fontes de uma vez e mostra numa lista só;
  - primeiro os **Links prontos** (plugins e addons, inclusive torrents), depois os **Sites** (extensões), já com o episódio pedido;
  - a obra identificada aparece em uma linha, com "Corrigir" para trocar a obra ou a temporada/episódio;
  - sites sem resultado ficam resumidos.
  Não existem mais abas "Extensões / Plugins".
- **Repositórios padrão não voltam mais sozinhos**: se o usuário remove todos, a lista fica vazia (antes, os padrões reapareciam).

## Animes & Vídeos: página inteira para toda obra, abas ao lado da busca e "Navegar" em todas as fontes (1.4.1)

- **Toda obra abre numa página inteira**, igual à da Biblioteca. Saíram os modais do AniList e do catálogo dos sites.
  - Vale para obras do AniList, dos catálogos de séries/filmes e dos sites das extensões.
  - Obras de sites carregam a lista de episódios na própria página.
  - Dá para favoritar direto dela.
- **"Assistir" sempre abre "Onde assistir"**: o usuário escolhe entre os sites encontrados e os links dos plugins/addons. Só arquivos locais tocam direto.
  - Na página de séries/filmes, o quadro lateral de fontes saiu: clicar num episódio abre o mesmo painel "Onde assistir".
- **Sem o nome da fonte na obra**:
  - a etiqueta da fonte (ex.: "Nuvio", "AniList", nome do site) saiu da página da obra;
  - nos cards da biblioteca de vídeos, o nome da fonte embaixo do título virou "X de Y vistos".
- **Descobrir**:
  - Animes · Séries · Filmes ficam ao lado da busca;
  - a navegação por sites e catálogos de addons saiu daqui;
  - a categoria "Filmes" do AniList virou "Filmes de anime".
- **Fontes → Navegar** em extensões, plugins e addons, sempre numa aba própria.
  - Extensão: catálogo do site.
  - Addon com catálogo: os catálogos dele.
  - Addon sem catálogo (ex.: Torrentio) e plugins: o catálogo de séries e filmes que eles atendem.

## "Onde assistir" encontra a obra em mais fontes (1.4.2)

Problema: obras da Biblioteca (com nomes como "Jujutsu Kaisen 2nd Season (Dublado)" ou títulos em português/romaji) não apareciam em todas as extensões e addons, mesmo existindo neles.

- **Busca com várias formas do nome**, da mais limpa para a mais curta:
  - sem "Dublado/Legendado/(TV)/[..]";
  - sem subtítulo;
  - sem a marca de temporada.
  Vale para os sites (extensões) e para o catálogo de filmes e séries.
- **Nomes alternativos automáticos**: antes de buscar, o app consulta o AniList e acrescenta o nome em inglês, o romaji e os sinônimos, além do ano. Exemplo: "Sousou no Frieren" → "Frieren: Beyond Journey's End".
- **Comparação de títulos mais esperta**:
  - ignora palavras de ruído;
  - entende "2nd Season", "Season 2", "2ª Temporada", "Part 2" e título terminando em número;
  - penaliza temporada diferente.
- **Temporada certa nos addons**: "Obra 2nd Season", episódio 3 → T2 E3 no catálogo, em vez do episódio 3 da 1ª temporada.
- Se a obra não aparece como série no catálogo, o app tenta como filme (e vice-versa).
- **Addons de anime que só aceitam IDs do Kitsu**: o app acha a obra no Kitsu e busca neles também. Antes eles nunca eram consultados para obras do catálogo.
- **Mais transparência**:
  - a lista dos sites sem resultado (e dos que não responderam) pode ser aberta;
  - novo campo "Não achou? Busque com outro nome" refaz a busca em todas as fontes.

## Descobrir: botões ao lado das abas e paginação no rodapé (1.4.3)

- "Atualizar Capas" e "Webview" foram para a barra principal, ao lado de Animes · Séries · Filmes. A linha extra que ficava acima das categorias saiu.
  - Em Séries/Filmes, "Atualizar Capas" recarrega o catálogo e "Webview" abre o IMDb (com a busca, se houver).
- A paginação dos animes virou um rodapé fixo da página. Ela some quando não há resultados ou quando o carregamento dá erro. Trocar de página volta ao topo da lista.

## Continuar de onde parou + melhorias gerais (1.5.0)

**Animes & Vídeos: continuar de onde parou**
- **A posição agora é salva por episódio**, não pelo link do vídeo. Antes, ao voltar a um episódio, o vídeo recomeçava do zero porque o link muda a cada fonte ou sessão (plugins, addons, torrent). Agora retoma no ponto certo, qualquer que seja a fonte usada.
- **Faixa "Continuar assistindo"** no topo da Biblioteca e do Descobrir: capa, episódio, tempo ("10:12 de 24:00") e barra de progresso.
  - Um clique reabre o mesmo vídeo, da mesma fonte, no ponto salvo.
  - "Outras fontes" abre o painel para trocar de fonte; ✕ remove o item; dá para recolher a faixa.
  - Episódios concluídos saem sozinhos.
- **Páginas das obras**:
  - o botão principal vira "Continuar T1 E3 · 10:12" e retoma direto;
  - episódios em andamento mostram "Parou em …" e uma barra de progresso.
- **Player**: novo botão "Outras fontes" para trocar de fonte sem sair do episódio (útil quando um link para de funcionar).
- **Episódio certo**: no painel "Onde assistir", trocar de episódio (setas) agora marca como visto e salva a posição do episódio escolhido. Antes, ficava no que abriu o painel.
- O Histórico não mostra mais links de streaming como se fossem arquivos locais.

**Outras melhorias**
- **Mangás: faixa "Continuar lendo"** no topo da Biblioteca. Mostra o capítulo em andamento (abre na página onde parou) ou o próximo depois do último lido, com progresso da obra.
- **Página do anime mais limpa**: "Assistir na web" saiu do topo e virou um link no fim do painel "Onde assistir".
- **MangaDex sem conexão**: mensagem clara e botão "Tentar de novo".

## Configurações: idioma no topo e cartão de apoio (1.5.1)

- **Idioma** virou um menu compacto (bandeira + nome) no canto superior direito das Configurações, na linha das abas, ao lado de "Sistema & Reset". A aba "Aparência & Idioma" passou a se chamar "Aparência".
- **Cartão "Apoie o Tomodachi Player"** no lugar do antigo cartão de idioma. A imagem é clicável e abre o seu checkout (Lemon Squeezy ou Paddle) no navegador.
  - Link: `SUPPORT_URL` em `src/constants/support.ts`. Sem link, o cartão não aparece.
  - Imagem: `public/support/banner.png` (sugestão: 1200 × 300 px). Sem imagem, aparece um cartão padrão com o botão "Apoiar".

## Banner com a Ina e a Jun + botão "Doar" (1.5.2)

- **Banner em slides nas Configurações**, acima das abas (Aparência, Extensões, Suwayomi…). Usa as artes de `src/img/characters`, recortadas e otimizadas em `src/img/banner/*.webp` (cerca de 40 KB cada).
  - 1 · **Feito com amor (e café)**: Jun envergonhada + Ina com sorriso suave → "Ver no GitHub".
  - 2 · **Ajude a manter o app no ar** (o principal): as duas com as mãos no peito/coração, juntinhas, com corações → "Fazer uma doação".
  - 3 · **Novidades toda semana**: as duas animadas apontando → "Ver novidades" (releases do GitHub).
  - Funcionamento:
    - troca sozinho a cada 8 s e pausa com o mouse em cima;
    - tem setas e pontos para navegar;
    - os textos seguem o idioma do app (PT/EN/ES).
- **Botão "Doar"** (texto rosa, mesmo estilo de "Extensões"):
  - em Mangás → Explorar, ao lado de "Extensões";
  - em Animes & Vídeos → Descobrir e Fontes.
  Com link configurado, abre o checkout; sem link, leva ao slide de doação nas Configurações.
- Links em `src/constants/support.ts`:
  - `SUPPORT_URL` (Lemon Squeezy/Paddle);
  - `GITHUB_URL`.
  Sem link, o botão correspondente do banner não aparece.
- O cartão "Apoie" com imagem (versão anterior) foi substituído pelo banner.

## Banner: artes v3 sem fundo e nova composição (1.5.3)

- **Artes novas (pasta `characters/v3`) com o fundo removido**: o xadrez e o fundo branco saíram, inclusive nos vãos entre braço, corpo e rabo. As personagens agora "flutuam" sobre o brilho rosa do banner, com um leve halo neon.
  - Arquivos em `src/img/banner/`: `jun_shy`, `jun_heart`, `ina_wink`, `ina_heart`, `ina_point` (.webp, 67–84 KB).
- **Nova distribuição**:
  - 1 · GitHub: Jun envergonhada no canto esquerdo, Ina com piscadinha no direito, texto centralizado.
  - 2 · Doação: Jun fazendo coração com as mãos à esquerda, Ina com as mãos no peito à direita, corações ao redor, texto e botão no centro.
  - 3 · Novidades: só a Ina, à esquerda, apontando para o texto à direita.
- As asas de fora podem sair pela borda; as bordas internas e a base se dissolvem no fundo, sem cortes retos.
- Em janelas estreitas, a segunda personagem some primeiro; no celular, fica só o texto.
- Os pontos de navegação foram para o centro.

## Banner: recorte refeito e enquadramento (1.5.4)

- **Remoção de fundo refeita**: em vez de "tudo que é claro", o app remove só o cinza neutro perfeito do xadrez/fundo branco. O cabelo branco da Ina tem um leve tom e agora fica inteiro, inclusive o rabo de cavalo; os vãos de xadrez entre mechas, braço e rabo continuam sendo removidos.
- **Cabeças inteiras**: as artes ficam presas ao topo do banner (com 6 px de folga), e o corpo sai pela base, que esfuma no fundo. Horns, cabelo e rosto nunca são cortados.
- **Slide 2**: a Jun ficou menor e o tronco aparece.
- **Slide 3**: o texto fica a 42 px da Ina.

## Pente fino (1.5.5)

Revisão geral: verificação de tipos, compilação do Electron, traduções (0 textos sem tradução), navegação por todas as telas sem erros no console e teste em janela menor (1000 px).

**Erros corrigidos**
- **Navegador integrado: links que abrem em nova aba não funcionavam.** O React descartava o atributo `allowpopups` do `<webview>` (era passado como booleano), então o Electron bloqueava qualquer `target="_blank"`/`window.open`. Agora o atributo chega certo: links de nova aba abrem em uma aba do app, e pop-ups de anúncio continuam bloqueados.
- **Configurações em janelas menores**: as abas quebravam em várias linhas ("Contas & Chaves de API" em 4 linhas, "Configurações do Komga" cortado). Agora ficam numa linha só, com rolagem lateral.
- **Banner em janelas menores** (abaixo de 1024 px): só a primeira personagem aparece, e o texto, que ficava centralizado em cima dela, passa a ficar ao lado dela.
- **Barra das seções em janelas menores**: o rótulo "Mangás & Comics / Animes & Vídeos" (repetido no menu lateral) só aparece em telas largas. Assim sobra espaço e as abas (Biblioteca, Descobrir, Fontes, Local) e os botões não se espremem nem são cortados.

**Melhorias**
- O banner para de trocar de slide quando as Configurações não estão visíveis (não gasta processamento à toa).
- Tela de boas-vindas: nova opção "Assistir animes, séries e filmes", que leva direto ao Descobrir.

## Preparação para o GitHub (1.5.5-beta)

- README em inglês (`README.md`) e português (`README.pt-BR.md`): proposta, aviso de beta com melhorias semanais, link de download, recursos, como compilar e aviso legal.
- Licença MIT (`LICENSE`).
- `.gitignore`: não sobe `node_modules`, builds (`dist`, `dist-electron`, `release`), executáveis, backups locais, `scratch` nem as artes originais em alta resolução.
- `.github/workflows/release.yml`: ao enviar para a main um package.json com versão nova (ex.: `1.5.6-beta`), o GitHub gera o instalador e a versão portátil num Windows limpo e cria a Release `v<versão>` (versões com "beta" saem como pré-lançamento).
- Modelos de issue para erros e sugestões.
- Versão passou para `1.5.5-beta` (package.json e Configurações → Sistema). O botão "Ver no GitHub" do banner agora abre o repositório.

## Doações pelo Buy Me a Coffee (1.5.6-beta)

- Os botões "Doar" (Mangás e Animes & Vídeos) e o "Fazer uma doação" do banner das Configurações abrem https://buymeacoffee.com/tomodachiplayer no navegador.
- README (EN/PT) com a seção "Apoie o projeto" e o selo do Buy Me a Coffee.
- `.github/FUNDING.yml`: mostra o botão "Sponsor" no repositório do GitHub.

## Abas móveis e favoritar em lote (1.5.7-beta)

- **Abas móveis:** arraste uma aba para mudar a ordem; uma linha rosa mostra onde ela vai cair, e a faixa rola sozinha perto das bordas. Pelo teclado: Ctrl+Shift+PageUp/PageDown move a aba ativa. A ordem fica salva na sessão.
- **Favoritar em lote:** nos catálogos (Descobrir: Animes, Séries e Filmes; Navegar em addons; catálogos das extensões), o coração da capa agora marca a obra. Com uma ou mais marcadas aparece a barra "N obras marcadas · Favoritar · ✕"; "Favoritar" abre as tags uma vez só e salva todas. Esc desmarca tudo.
  - Obra que já é favorita: o coração continua abrindo as tags dela.
  - As tags escolhidas são somadas às que cada obra já tem.
  - Séries e filmes do Nuvio/Stremio: os detalhes (episódios) de cada obra são buscados antes de salvar.

## Doações pelo Ko-fi (1.5.8-beta)

- O Buy Me a Coffee foi trocado pelo Ko-fi: os botões "Doar", o "Fazer uma doação" do banner, o README (EN/PT) e o botão "Sponsor" do GitHub agora levam a https://ko-fi.com/tomodachiplayer.

## Instalador corrigido + teste automático no Windows (1.5.9-beta)

- **Instalador:** num Windows limpo (build 26100, a base do Windows 11 24H2), o `Setup.exe` fechava em 3 segundos com erro de memória (0xC0000005 no `System.dll` do NSIS) ao instalar só para o usuário. A causa era o NSIS antigo do electron-builder 25. Atualizado para o electron-builder 26.18, que instala normalmente (testado no GitHub Actions: por usuário e para todos).
- **MangaDex:** a sinopse vinha com Markdown cru (`[nome](https://...)`); agora aparece só o texto, e no idioma do app quando o MangaDex tiver.
- **Teste de ponta a ponta (branch `e2e`):** instala a última versão publicada num Windows limpo e usa o app com internet real — Descobrir (AniList e Cinemeta), busca, página da obra, "Onde assistir", favoritar em lote, instalar e navegar num addon, MangaDex, vídeo local, navegador, abas, Ctrl+K, Configurações, botão Doar, reabrir o app e trocar o idioma. Prints e relatório vão para a branch `e2e-results`.

## Busca por tags e "Talvez você goste" (1.6.0-beta)

- **Biblioteca (Mangás e Animes):** a busca aceita vários termos separados por vírgula, e todos precisam bater: título, autor, gêneros ou suas tags (ex.: `Seinen, Monster`). Entende gêneros em PT/EN/ES (`Ação` acha `Action`). Embaixo aparecem os termos ativos (clique para tirar) e as tags mais comuns do que está na tela, já respeitando a categoria e o status escolhidos — clique para afunilar.
- **Sem a aba "Favoritos":** tudo na biblioteca já é favorito, então a aba e o filtro de status "Favoritos" saíram. Obras só com essa categoria aparecem em "Sem categoria".
- **Descobrir:** gêneros e tags do AniList viram filtros (`Seinen, Monster` = tag Seinen + texto "monster"); em Séries/Filmes, gêneros do Cinemeta (`Drama, Crime`). Uma linha mostra como a busca foi entendida, com cada termo removível.
- **Tags clicáveis nas páginas das obras:** gêneros + as principais tags do AniList (sem spoilers). Em animes, séries e filmes, clicar abre o Descobrir buscando aquela tag; em mangás, filtra a sua biblioteca.
- **"Talvez você goste":** carrossel embaixo dos episódios/capítulos.
  - Animes e mangás: relações oficiais do AniList (continuação, anterior, história principal, paralela, spin-off, outra versão) primeiro, depois as recomendações da comunidade mais bem avaliadas.
  - Séries e filmes: obras da mesma franquia (pelo título) e parecidas (gêneros em comum, nota e época próxima) no Cinemeta.
  - Clicar abre a obra; mangás abrem direto no MangaDex.
- **MangaDex:** quando a obra não tem capítulos, explica que obras licenciadas costumam ficar sem capítulos lá.

## Atualização automática (1.6.1-beta)

- **Configurações → Sistema & Reset → Atualizações:** chave "Atualizar automaticamente" (ligada por padrão), status, versão atual, "Procurar atualizações" e "Reiniciar e atualizar".
- **App instalado pelo Setup:** procura versão nova 15 s depois de abrir e a cada 6 h, baixa em segundo plano e instala ao fechar (ou na hora, em "Reiniciar e atualizar"). Usa o GitHub Releases (`electron-updater`), inclusive versões beta.
- **Com a chave desligada:** ao abrir, só avisa que há versão nova; baixar fica a critério do usuário.
- **Versão portátil / build local:** não dá para se atualizar sozinha; o app avisa e abre a página de download.
- Aviso flutuante no canto quando a atualização está pronta ("Reiniciar e atualizar" / "Depois").
- O GitHub Actions passou a publicar também os arquivos `beta.yml`/`latest.yml` e `.blockmap` que o atualizador usa.

## Aviso "Atualizado para a versão X" (1.6.2-beta)

- Depois que o app se atualiza, aparece no canto "Atualizado para a versão X · Ver o que mudou" (some sozinho em 15 s). Também serve de primeira versão para testar a atualização automática de ponta a ponta (1.6.1 → 1.6.2).

## Cópias antigas não "roubam" mais a janela (1.6.3-beta)

- **Atualização automática testada de ponta a ponta:** num Windows limpo, a 1.6.1 instalada achou a 1.6.2 em 15 s, baixou sozinha e, em "Reiniciar e atualizar", instalou e abriu de novo já na 1.6.2.
- **Duas cópias instaladas:** se uma versão mais nova é aberta enquanto uma mais antiga (de outra pasta) já está aberta, a antiga avisa e oferece fechar e abrir a nova. Antes a antiga só vinha para a frente, e parecia que a instalação nova não tinha funcionado.
- **Configurações → Sistema → Atualizações:** mostra o caminho da cópia em uso ("Esta cópia está em: …").

## Busca em todas as fontes + Doar em todas as telas (1.6.4-beta)

- **Descobrir busca também nas suas fontes:** além do AniList/Cinemeta, a busca procura em todas as extensões (sites) e addons com busca instalados, ao mesmo tempo (até 4 por vez). Aparece no topo uma seção "Nas suas fontes" com uma fileira por fonte (pode recolher); clicar abre a obra direto daquela fonte. Gêneros/tags não entram nessa busca, só o texto. Plugins do Nuvio não têm catálogo, então continuam aparecendo só no "Onde assistir".
- **Botão "Doar"** agora aparece em todas as telas de Mangás & Comics e de Animes & Vídeos (Biblioteca, Explorar/Descobrir, Fontes e Local).

## Busca em todos os addons + fim das áreas vazias (1.6.5-beta)

- **Addons de catálogo sem busca** (ex.: alguns catálogos de anime): o app procura o nome nas primeiras páginas do catálogo, em vez de ignorar o addon.
- **Addons só de links** (Torrentio, Comet, MediaFusion…) e **plugins do Nuvio**: como não têm catálogo, a obra é achada pelo Cinemeta (IMDb), que é o que esses addons entendem. Aparece a fileira "Torrentio · links · obras achadas pelo Cinemeta"; ao abrir, "Assistir" usa esses addons.
- **Sem áreas vazias**:
  - fontes sem resultado não ocupam mais espaço;
  - se o AniList/Cinemeta não acha nada, a grade some e os resultados das fontes ocupam a tela, com o aviso "nada no AniList para essa busca";
  - se nada é achado em lugar nenhum, aparece um aviso só, com "Buscar em Séries/Filmes/Animes", "Limpar busca" e "Adicionar fontes".

## MyAnimeList na busca (1.6.6-beta)

- **Descobrir → Animes:** a busca também mostra os resultados do **MyAnimeList**, com a nota do MAL em cada capa.
  - Funciona sem configurar nada, pelo **Jikan** (espelho público do MAL); se ele estiver fora do ar, usa a busca rápida do próprio site do MAL.
  - Ao abrir um resultado, o app acha a mesma obra no AniList e abre a página completa (episódios, "Assistir", "Talvez você goste"); se ela não existir no AniList, abre a página do MAL no navegador do app.
- **Configurações → Contas → MyAnimeList:** liga/desliga a busca no MAL e aceita (opcional) um **Client ID** para usar a API oficial.
  - O Client ID fica guardado criptografado no computador (nunca no código).
  - Se o MAL recusar o Client ID, a busca continua pelo Jikan e avisa.
  - O app avisa se alguém colar o Client Secret por engano (ele não é usado para nada).

## Modo anônimo, "Assistir" sempre no app e busca só nas suas fontes (1.6.7-beta)

- **Modo anônimo** (botão ao lado de Doar, em Animes & Vídeos e em Mangás & Comics): enquanto ligado, o que você assiste/lê naquela seção não fica salvo (posição do vídeo, "Continuar", histórico, episódios/capítulos vistos e AniList). Vale até desligar ou fechar o app; o player e o leitor mostram o selo "Anônimo".
- **"Assistir" nunca abre o site da fonte:**
  - o app abre a página do episódio escondida, aperta play nos players (inclusive dentro de iframes) e captura o vídeo (m3u8/mp4) direto da rede, para tocar no player do app;
  - se o site não entregar o vídeo, o player avisa e oferece "Tentar de novo" e "Procurar em outras fontes" (antes mostrava a página do site);
  - saíram todos os botões "Assistir na web/Webview" (biblioteca, página da obra, cards do AniList, "Onde assistir");
  - links de addons que apontam para páginas também tocam pelo player.
- **Busca do Descobrir:**
  - mostra só obras que as suas fontes (extensões, addons, plugins) têm;
  - em uma lista única, ordenada pelo que mais bate com o texto (título exato, depois "começa com", depois "contém");
  - o que não bate com a busca não aparece (ex.: "The Bad Guys: Breaking In" ao buscar "Breaking Bad");
  - a mesma obra achada em várias fontes vira um card só, com "+N" para escolher a fonte;
  - AniList e MyAnimeList completam capa, nota e nomes alternativos (buscar "Attack on Titan" acha "Shingeki no Kyojin");
  - sem fontes instaladas, a busca avisa e leva para adicionar fontes; gêneros/tags sozinhos (ex.: tag clicada numa obra) continuam navegando pelo catálogo.
