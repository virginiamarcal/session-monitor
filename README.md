# Session Monitor · Claude Code

Dashboard local para monitorar todas as suas sessões do Claude Code em tempo real.

![dashboard](https://img.shields.io/badge/Claude_Code-Session_Monitor-00ff41?style=for-the-badge)

## O que é

Painel estilo Matrix que mostra:
- Sessões **ativas** (busy / idle / shell)
- Projetos **em repouso** com botão de retomar
- Inferência automática de projeto pelo histórico de mensagens
- Renomear sessões com clique
- Abrir novo terminal direto pelo dashboard

## Pré-requisitos

- [Node.js](https://nodejs.org) instalado
- [Claude Code](https://claude.ai/code) instalado e já utilizado ao menos uma vez

## Instalação

**1. Baixe o repositório**

Clique em **Code → Download ZIP** e extraia a pasta.

**2. Peça pro Claude instalar**

Abra o Claude Code, arraste a pasta para o chat e mande:

> *"instala o session monitor pra mim"*

O Claude roda o `install.ps1` que:
- Copia os arquivos para `~/.claude/dashboard/`
- Configura o perfil do PowerShell para abrir o dashboard automaticamente a cada terminal
- Inicia o servidor e abre `http://localhost:4242`

## Como usar

| Ação | Como fazer |
|------|-----------|
| Ver sessões ativas | Abre automaticamente ao abrir qualquer terminal |
| Retomar sessão | Clique em **▶ RETOMAR** no card |
| Renomear sessão | Clique no nome do projeto no card |
| Fechar card | Clique no **✕** no canto do card |
| Atualização | Automática a cada 5 segundos |

## Personalizar projetos

O `server.js` tem uma lista de padrões genéricos para nomear suas sessões.  
Edite o array `PROJECTS` com os nomes dos seus próprios projetos:

```js
{ re: /meu-projeto/i, label: 'Meu Projeto', emoji: '🚀', color: '#3b82f6' },
```

## Notas

- O servidor roda **localmente** na porta `4242` — nenhum dado sai da sua máquina
- Os arquivos `sleeping.json` e `custom_names.json` são gerados automaticamente e ficam fora do repositório
- Para parar o servidor: feche o terminal ou mate o processo node na porta 4242

---

Feito por [@virginiamarcal](https://instagram.com/virginiamarcal)
