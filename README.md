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

**1. Clone o repositório**
```bash
git clone https://github.com/virginiamarcal/session-monitor
```

**2. Mova a pasta para dentro do diretório do Claude**

| Sistema | Caminho |
|---------|---------|
| Windows | `C:\Users\SEU_NOME\.claude\dashboard` |
| Mac/Linux | `~/.claude/dashboard` |

A estrutura deve ficar assim:
```
~/.claude/
└── dashboard/
    ├── server.js
    ├── dashboard.html
    └── start.bat
```

**3. Inicie o dashboard**

No Windows:
```
Clique duplo em start.bat
```

No Mac/Linux:
```bash
node server.js
```

Acesse **http://localhost:4242** — o `start.bat` já abre automaticamente.

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
