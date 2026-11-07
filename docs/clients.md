# OpenCode, Claude Code y ChatGPT

Desktop Pilot puede conectarse como herramienta MCP a un agente y también puede observar o controlar una interfaz de chat. Son capacidades diferentes: conectar el MCP a Claude Code no hace que su terminal exponga automáticamente controles accesibles.

## Generar una configuración local

Los siguientes comandos imprimen JSON con las rutas absolutas de tu instalación. No modifican archivos de configuración existentes ni crean conexiones remotas. Ejecútalos desde la sesión gráfica: incluyen las variables de escritorio disponibles para que el cliente no pierda acceso a X11, Wayland o AT-SPI al lanzar el proceso. Regenera la configuración si cambia la sesión. Ejecuta el comando en tu equipo; no compartas el JSON generado si contiene rutas personales.

### OpenCode

```bash
node src/mcp.js --print-config opencode
```

Combina el bloque `mcp` generado con tu `opencode.json` o `opencode.jsonc`. El perfil utiliza un proceso local, habilita el conjunto de herramientas `chat` y establece un timeout de 60 segundos. Reinicia o recarga el cliente y comprueba que aparece `pilot_chat_read`.

Referencia: [MCP servers de OpenCode](https://opencode.ai/docs/mcp-servers/).

### Claude Code

```bash
node src/mcp.js --print-config claude-code
```

Combina el bloque `mcpServers` con `.mcp.json` en el proyecto donde usarás Claude Code. Revisa la autorización de servidores de proyecto en el cliente. Puedes comprobar la conexión con `/mcp`.

También puedes usar su CLI, reemplazando la ruta:

```bash
claude mcp add --transport stdio --env PILOT_TOOLSET=chat desktop-pilot -- node /ruta/desktop-pilot-mcp/src/mcp.js
claude mcp get desktop-pilot
```

Referencia: [documentación MCP de Claude Code](https://code.claude.com/docs/en/mcp).

### ChatGPT

```bash
node src/mcp.js --print-config chatgpt
```

Este resultado es un plan de conexión, no un archivo que ChatGPT pueda importar directamente. Incluye el comando local y los requisitos para usar un Secure MCP Tunnel. No convierte `localhost` en un servidor accesible desde ChatGPT.

Necesitas el cliente oficial `tunnel-client`, un túnel asociado a tu workspace y una clave de ejecución del túnel. Después de configurar `CONTROL_PLANE_API_KEY` localmente y obtener tu identificador, adapta estas instrucciones para una shell POSIX:

```bash
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile desktop-pilot \
  --tunnel-id TU_TUNNEL_ID \
  --mcp-command 'node /ruta/desktop-pilot-mcp/src/mcp.js'

tunnel-client doctor --profile desktop-pilot --explain
PILOT_TOOLSET=chat tunnel-client run --profile desktop-pilot
```

El comando de ejemplo supone una ruta sin espacios; usa el comando y los argumentos de `local_server` generados y consulta la ayuda del cliente para el escapado de tu plataforma. En ChatGPT, añade un servidor MCP personalizado con conexión **Tunnel**, selecciona ese túnel y comprueba una llamada a `desktop_status`. El túnel necesita acceso al workspace correcto y los permisos de organización correspondientes. El servidor permanece local; la conexión saliente la gestiona el cliente de túnel.

Estas instrucciones no crean credenciales, túneles ni plugins en tu cuenta. La disponibilidad depende de tu cuenta y workspace. Referencia: [Secure MCP Tunnel de OpenAI](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

## Conjunto reducido de herramientas

`PILOT_TOOLSET=chat` expone 18 herramientas: las seis `pilot_*` más doce herramientas de observación, esperas, ayuda y foco/teclado. `full` es el valor predeterminado y expone 73 con agent-desktop 1.2.0.

Una herramienta excluida también se rechaza si se llama directamente. Este filtro reduce el contexto del modelo; no constituye aislamiento del escritorio. Las operaciones internas de `pilot_chat_write` siguen disponibles. No actives varios controladores a la vez sobre la misma ventana.

## Operar una interfaz de chat

1. Localiza la ventana con `desktop_list_windows`.
2. Lee la interfaz con `pilot_chat_read`; revisa `composers`, los roles, nombres y `truncated`.
3. Limita `region` a un contenedor único cuando el historial sea largo. Por defecto devuelve el final del texto para priorizar lo reciente; `from: "start"` devuelve el inicio. El texto extraído no atribuye automáticamente cada mensaje a un autor. No uses una lectura truncada como `baseline` completo.
4. Escribe con `pilot_chat_write`. Sin `send`, solo prepara el borrador.
5. Si el usuario autorizó enviar, especifica el botón observado en `send`. No se inventa el nombre ni se pulsa Enter como alternativa.
6. Usa `pilot_chat_wait` sobre una región de respuesta única. Si tienes una lectura anterior completa de esa región, pásala en `baseline` para reconocer respuestas rápidas.

Ejemplo de borrador (los nombres son ilustrativos, no selectores fijos de ChatGPT):

```json
{
  "app": "Aplicación observada",
  "window_id": "ventana-observada",
  "target": {"role": "textfield", "name": "Nombre observado"},
  "text": "Analiza este ejemplo:\nconst total = 2 + 2;",
  "request_id": "consulta-001"
}
```

Para enviar añade `"send": {"role": "button", "name": "Nombre observado del botón"}`. Si el campo contiene otro borrador, falla con `EXISTING_DRAFT`; solo reemplaza con `replace: true`. Un campo cuyo valor no puede leerse se rechaza porque no permite comprobar la escritura.

`request_id` conserva el resultado de hasta 128 peticiones por proceso, incluidas las de entrega incierta. Reutiliza el mismo ID y argumentos después de un fallo de transporte. No hay deduplicación entre reinicios o procesos. Si quieres pasar de preparar un borrador a enviarlo, utiliza un nuevo ID, inspeccionando antes que el borrador sea el esperado. Cuando ya coincide, la herramienta evita reescribirlo. Puedes consultar `pilot_request_status` con el ID para obtener el estado cacheado sin repetir la escritura, incluso mientras el motor tiene una llamada pendiente.

`send_dispatched` indica que el clic terminó según el motor; **no** prueba que el servicio haya aceptado el mensaje. `text_stable` solo indica que el texto observado no cambió durante el intervalo solicitado; una generación puede detenerse temporalmente y continuar. La espera exige cambio respecto a la lectura inicial por defecto. `contains` comprueba una cadena literal y no debe usarse para atribuir texto a un autor.

## Límites comprobables

- OpenCode y Claude Code dentro de una terminal pueden exponer solo texto o píxeles. Sin un compositor accesible y verificable, `pilot_chat_write` devuelve `UNSUPPORTED_COMPOSER` o un error de selección. No introduce texto a ciegas en una shell.
- En ventanas que expongan accesibilidad, las herramientas usan capacidades observadas, sin reglas por nombre de aplicación.
- ChatGPT en navegador depende de lo que el navegador exponga al árbol de accesibilidad del sistema. Este servidor no añade un backend DOM. Si falta esa información, usa un controlador de navegador específico.
- Las pruebas del flujo de chat usan interfaces simuladas; la integración real comprueba el motor y MCP en Linux. OpenCode, Claude Code y `tunnel-client` no estaban instalados en el entorno de desarrollo, y no se ha verificado una conversación real en esos clientes ni una conexión desde ChatGPT.

## Diagnosticar desconexiones y cancelaciones

Ejecuta `node src/mcp.js --doctor` desde la sesión gráfica antes de conectar el cliente. Si falla la instalación, el informe indica preparar el motor con `npm run setup:desktop` o revisar `AGENT_DESKTOP_BIN`. No imprime claves ni direcciones de bus.

Cancelar una petición en un cliente que envíe la notificación MCP impide los pasos siguientes, pero no deshace lo ya ejecutado. La petición al motor en curso puede tardar hasta su timeout en liberar la cola. No pulses enviar de nuevo por no haber recibido respuesta; consulta el ID anterior y observa el estado. Un error de transporte pausa las acciones hasta reiniciar, mientras que los errores estructurados normales del motor se devuelven sin esa pausa.
