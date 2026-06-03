# skill.json — Manifesto da Skill Alexa

Manifesto da skill **Monitor da Piscina AquaSense** no formato exigido pelo Alexa Developer Console e pela ASK CLI.

---

## Informações de publicação (pt-BR)

| Campo | Valor |
|---|---|
| Nome | Monitor da Piscina AquaSense |
| Resumo | Monitore a qualidade da água e controle a bomba e a dosagem da piscina por voz. |
| Categoria | SMART_HOME |
| Disponível no mundo | Não |
| Países de distribuição | BR |

**Frases de exemplo:**
- *"Alexa, abrir monitor da piscina"*
- *"Alexa, pergunte ao monitor da piscina qual o pH"*
- *"Alexa, peça ao monitor da piscina para dosar cloro"*

**Palavras-chave:** piscina, iot, aquasense, água, automação, esp32

---

## Instruções de teste

> Requer um ESP32 publicando em `aquasense-ibmec-pt/dados` no broker configurado (padrão `broker.hivemq.com`). Sem o dispositivo online, as consultas respondem que não há conexão.

---

## Tipo de API

```json
"apis": { "custom": {} }
```

Skill do tipo **Custom** — todos os intents e respostas são definidos pelo desenvolvedor.

---

## Permissões

Nenhuma permissão adicional é requerida (sem acesso a dispositivos Alexa, localização ou conta do usuário).

---

## Como usar este arquivo

### Alexa-hosted

O `skill.json` é gerenciado automaticamente pelo Alexa Developer Console. Não é necessário editá-lo manualmente. Use a aba **Build → Skill information** para alterar nome, descrição e ícones.

### ASK CLI

```bash
cd alexa
ask deploy
```

O CLI lê `skill-package/skill.json` e `skill-package/interactionModels/` para criar ou atualizar a skill na conta configurada em `ask configure`.

Para apontar para uma Lambda própria (conta AWS), adicione ao `manifest.apis.custom`:

```json
"endpoint": {
  "uri": "arn:aws:lambda:us-east-1:XXXXXXXXXXXX:function:aquasense-alexa"
}
```

---

## Publicação na loja

Esta skill é de **uso pessoal/acadêmico** e não está publicada. Para publicar na Alexa Skill Store é necessário:

- Adicionar ícones (108×108 e 512×512 px) ao `skill-package/assets/`
- Preencher descrição longa e política de privacidade
- Passar pela revisão da Amazon
- Ajustar `isAvailableWorldwide` e `distributionCountries` conforme necessário
