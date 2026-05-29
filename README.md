# Session Monitor · Claude Code

Dashboard local para monitorar todas as suas sessões do Claude Code em tempo real.

![dashboard](https://img.shields.io/badge/Claude_Code-Session_Monitor-00ff41?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6Ii8+PC9zdmc+)

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

Clique em **Code → Download ZIP**, extraia a pasta.

**2. Peça pro Claude instalar**

Abra o Claude Code, arraste a pasta para o chat e mande:

> *"instala o session monitor pra mim"*

O Claude move os arquivos para o lugar certo e inicia o dashboard automaticamente.

Acesse **http://localhost:4242**

## Como usar

| Ação | Como fazer |
|------|-----------|
| Ver sessões ativas | Abre automaticamente ao iniciar |
| Retomar sessão | Clique em **▶ RETOMAR** no card |
| Renomear sessão | Clique no nome do projeto no card |
| Fechar card | Clique no **✕** no canto do card |
| Atualização | Automática a cada 5 segundos |

## Notas

- O servidor roda **localmente** na porta `4242` — nenhum dado sai da sua máquina
- Os arquivos `sleeping.json` e `custom_names.json` são gerados automaticamente e ficam fora do repositório
- Para parar o servidor: `Ctrl+C` no terminal

---

Feito por [@virginiamarcal](https://instagram.com/virginiamarcal)
