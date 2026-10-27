<div align="center">

<img src="build/icon.png" width="96" alt="Ícone do Tomodachi Player" />

# Tomodachi Player

**Leia mangás e assista animes, séries e filmes em um só app para desktop.**

[![Download](https://img.shields.io/github/v/release/CaioDoc/Tomodachi_Player?include_prereleases&label=download&color=ec4899)](https://github.com/CaioDoc/Tomodachi_Player/releases/latest)
![Plataforma](https://img.shields.io/badge/plataforma-Windows%2010%20%7C%2011-blue)
![Status](https://img.shields.io/badge/status-beta-orange)
[![Licença](https://img.shields.io/github/license/CaioDoc/Tomodachi_Player)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-apoiar-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/tomodachiplayer)

[English](README.md) · Português

</div>

---

> [!NOTE]
> **O Tomodachi Player está em beta.** Ainda pode aparecer um erro ou outro, e lançamos melhorias **toda semana**. Se algo der errado, [abra uma issue](https://github.com/CaioDoc/Tomodachi_Player/issues). Isso ajuda muito.

## A proposta

O Tomodachi Player traz para o desktop do Windows a experiência do [Mihon](https://mihon.app) (mangás) e do [Aniyomi](https://aniyomi.org) (animes), num app só.

- **Uma biblioteca** para tudo o que você lê e assiste.
- **Um botão "Assistir"** que procura em todas as suas fontes de uma vez: extensões no estilo Aniyomi, plugins do Nuvio e addons do Stremio.
- **Continuar de onde parou**, tanto no leitor quanto no player.

O app não hospeda nem traz nenhum conteúdo. É você quem escolhe as fontes que quer adicionar.

## Download

**[⬇ Baixar a versão mais recente](https://github.com/CaioDoc/Tomodachi_Player/releases/latest)**

Na página da versão, em **Assets**, escolha um destes arquivos:

| Arquivo | O que é |
| --- | --- |
| `Tomodachi-Player-Setup-x.y.z.exe` | **Instalador** (recomendado). Cria atalhos no Menu Iniciar e na Área de Trabalho. |
| `Tomodachi-Player-Portable-x.y.z.exe` | Versão **portátil**. Um arquivo só, sem precisar instalar. |

Os executáveis são gerados automaticamente pelo GitHub Actions direto do código deste repositório. É um build limpo, sem dados pessoais e sem nada a mais.

> [!IMPORTANT]
> O app ainda não tem assinatura digital, então o Windows pode mostrar o aviso **"O Windows protegeu o computador"** (SmartScreen). Para continuar, clique em **Mais informações → Executar assim mesmo**.

**Requisitos:** Windows 10 ou 11 (64 bits).

## Recursos

**Mangás & Comics**
- Biblioteca com categorias, filtros, contador de não lidos e busca por capítulos novos.
- Leitor com modos webtoon (contínuo), página única e página dupla.
- **Continuar lendo** reabre a página exata em que você parou.
- Fontes: MangaDex, extensões do Mihon/Tachiyomi (via [Suwayomi](https://github.com/Suwayomi/Suwayomi-Server)), Komga e pastas ou arquivos locais.

**Animes & Vídeos**
- Aba **Descobrir** com catálogos de Animes, Séries e Filmes, além de busca.
- Página da obra em tela cheia, com temporadas e episódios.
- **Onde assistir** junta os links de todas as suas fontes numa lista só.
- **Fontes:** cole qualquer link e o app descobre o tipo sozinho.
  - Extensões do Aniyomi (`index.min.json`)
  - Plugins do Nuvio (`manifest.json`)
  - Addons do Stremio (`manifest.json` ou `stremio://`)
- **Navegar** pelo catálogo de qualquer plugin ou addon instalado.
- **Continuar assistindo** retoma o mesmo episódio, da mesma fonte, no mesmo segundo.
- Player com legendas (embutidas ou externas), faixas de áudio e HLS. Links de torrent tocam direto no app.
- Biblioteca de vídeos locais.

**Geral**
- Abas, para deixar várias obras, leitores e players abertos ao mesmo tempo. Arraste para mudar a ordem (ou use Ctrl+Shift+PageUp/PageDown).
- Favoritar várias obras de uma vez: toque no coração de cada capa e clique em **Favoritar** na barra que aparece.
- Navegador integrado com bloqueador de anúncios.
- Sincronização com o AniList.
- Importar e exportar backups compatíveis com o Mihon e o Aniyomi (`.tachibk`), para trazer a biblioteca do celular.
- Temas.
- Interface em **Português (Brasil), English e Español**.

## Próximos passos

O projeto está andando rápido. Na fila:

- Atualização automática dentro do app.
- Mais ajustes e correções toda semana, guiados pelo seu feedback.

## Apoie o projeto

O Tomodachi Player é gratuito e vai continuar sendo. Se ele deixa o seu dia melhor, você pode ajudar a mantê-lo no ar (e o café em dia):

**[☕ Me pague um café](https://buymeacoffee.com/tomodachiplayer)**

Dá para doar também por dentro do app: tem um botão **Doar** no topo de cada seção e nas Configurações.

## Feedback e erros

Achou um erro ou tem uma ideia? [Abra uma issue](https://github.com/CaioDoc/Tomodachi_Player/issues/new/choose). Se puder, conte:
- o que você fez;
- o que esperava que acontecesse;
- o que aconteceu de verdade (um print ajuda muito).

## Compilar a partir do código

Você precisa do [Node.js](https://nodejs.org) 20 ou mais recente.

```bash
git clone https://github.com/CaioDoc/Tomodachi_Player.git
cd Tomodachi_Player
npm install

npm run dev            # modo desenvolvimento
npm run dist           # instalador do Windows (na pasta release/)
npm run dist:portable  # .exe portátil (na pasta release/)
```

Feito com Electron, React, TypeScript, Vite e Tailwind CSS.

## Aviso

O Tomodachi Player é um player e leitor. Ele **não tem vínculo** com nenhum provedor de conteúdo e não hospeda, armazena nem distribui nenhum conteúdo. Extensões, plugins e addons são feitos por terceiros e adicionados pelo próprio usuário. Você é responsável pelo uso que faz deles e por respeitar as leis do seu país.

## Licença

[MIT](LICENSE) © CaioDoc
