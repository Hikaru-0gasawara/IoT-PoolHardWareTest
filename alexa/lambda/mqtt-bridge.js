// ============================================================================
//  Ponte MQTT — conecta ao broker a cada invocação da skill, faz UMA operação
//  (ler o snapshot retido ou publicar um comando) e fecha a conexão.
//
//  Ler o tópico ".../dados" é rápido porque o firmware publica com retain=true:
//  o broker entrega o último valor imediatamente após o subscribe.
// ============================================================================

const mqtt = require("mqtt");
const cfg = require("./config");

function novaConexao() {
  const opts = {
    connectTimeout: cfg.TIMEOUT_MS,
    reconnectPeriod: 0, // sem auto-reconnect: operação única e efêmera
    clean: true,
    clientId: "alexa-" + Math.random().toString(16).slice(2, 10),
  };
  if (cfg.MQTT_USERNAME) {
    opts.username = cfg.MQTT_USERNAME;
    opts.password = cfg.MQTT_PASSWORD;
  }
  return mqtt.connect(cfg.MQTT_URL, opts);
}

// Lê o último payload consolidado (retido) de ".../dados".
function lerSnapshot() {
  return new Promise((resolve, reject) => {
    const client = novaConexao();
    const topico = `${cfg.NAMESPACE}/dados`;
    let resolvido = false;

    const encerrar = (err, data) => {
      if (resolvido) return;
      resolvido = true;
      clearTimeout(timer);
      try { client.end(true); } catch (_) {}
      err ? reject(err) : resolve(data);
    };

    const timer = setTimeout(
      () => encerrar(new Error("timeout ao ler o snapshot da piscina")),
      cfg.TIMEOUT_MS
    );

    client.on("connect", () => {
      client.subscribe(topico, { qos: 0 }, (err) => {
        if (err) encerrar(err);
      });
    });

    client.on("message", (_t, payload) => {
      try {
        encerrar(null, JSON.parse(payload.toString()));
      } catch (e) {
        encerrar(new Error("payload da piscina inválido"));
      }
    });

    client.on("error", (e) => encerrar(e));
  });
}

// Publica um comando (objeto JSON) num subtópico do namespace.
function publicar(subtopico, objeto) {
  return new Promise((resolve, reject) => {
    const client = novaConexao();
    const topico = `${cfg.NAMESPACE}/${subtopico}`;
    let resolvido = false;

    const encerrar = (err) => {
      if (resolvido) return;
      resolvido = true;
      clearTimeout(timer);
      try { client.end(true); } catch (_) {}
      err ? reject(err) : resolve();
    };

    const timer = setTimeout(
      () => encerrar(new Error("timeout ao enviar o comando")),
      cfg.TIMEOUT_MS
    );

    client.on("connect", () => {
      client.publish(topico, JSON.stringify(objeto), { qos: 1 }, (err) =>
        encerrar(err || null)
      );
    });

    client.on("error", (e) => encerrar(e));
  });
}

module.exports = { lerSnapshot, publicar };
