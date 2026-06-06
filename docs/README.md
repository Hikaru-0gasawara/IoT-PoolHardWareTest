# docs/ — Documentação de apoio

Documentos de referência transversais ao projeto.

## Conteúdo

| Arquivo | Descrição |
|---|---|
| `Glossario.md` | **Glossário de tradução EN→PT** — fonte única de verdade para nomes de campos MQTT, variáveis, funções e componentes, garantindo que firmware e dashboard usem exatamente os mesmos termos. |

## Por que o glossário importa

O fork PT renomeou todo o protocolo e o código (`chlorine`→`cloro`, `data`→`dados`,
`temp_solar`→`temp_coletor`, …). Se o firmware publica `cloro` e o schema Zod do dashboard espera
`chlorine`, a validação **descarta todos os dados** silenciosamente.

O `Glossario.md` evita esse tipo de divergência: consulte-o **antes** de criar ou renomear qualquer
campo, tópico ou identificador que cruze a fronteira firmware ↔ dashboard.

> O glossário foi escrito tendo o firmware MicroPython (`../wokwi/main.py`) como referência, mas o
> mapeamento de campos/tópicos vale igualmente para o firmware C++ (`../AquaSense/AquaSense.ino`) e
> para o `../dashboard-app/`. Há uma cópia espelhada em `dashboard-app/docs/Glossario.md` para
> consulta junto ao código do app.
