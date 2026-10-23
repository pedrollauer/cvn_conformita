Este arquivo explica como Visual Studio criou o projeto.

As seguintes ferramentas foram usadas para gerar este projeto:
- TypeScript Compiler (tsc)

As etapas a seguir foram usadas para gerar este projeto:
- Criar o arquivo de projeto (`conformita.esproj`).
- Crie `launch.json` para habilitar a depuração.
- Instale pacotes npm e crie `tsconfig.json`: `npm init && npm i --save-dev eslint @types/node typescript && npx tsc --init --sourceMap true`.
- Criar `app.ts`.
- Atualizar ponto de entrada `package.json`.
- Atualizar scripts de build do TypeScript no `package.json`.
- Crie `eslint.config.js` para habilitar a linting.
- Adicionar projeto à solução.
- Grave este arquivo.
