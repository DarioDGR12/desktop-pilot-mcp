# Desktop Pilot MCP

Servidor MCP independiente para computer use, basado en [agent-desktop](https://github.com/vercel-labs/agent-desktop). Expone las herramientas del motor original y añade observación visual y acciones con verificación de condiciones.

**No necesita una aplicación web, servidor HTTP ni clave de OpenAI.** El modelo lo proporciona el cliente MCP que conectes.

## Instalación desde GitHub

Requiere Node.js 22.9 o posterior y una sesión gráfica con accesibilidad habilitada.

```bash
git clone https://github.com/DarioDGR12/desktop-pilot-mcp.git
cd desktop-pilot-mcp
npm ci
npm run setup:desktop
```

El último comando prepara el binario oficial de agent-desktop para tu sistema y verifica sus checksums. Linux se ha probado con el motor real. Windows y macOS requieren validación en sus respectivos sistemas.

Añade este servidor a la configuración MCP de tu cliente, reemplazando la ruta:

```json
{
  "mcpServers": {
    "desktop-pilot": {
      "command": "node",
      "args": ["/ruta/absoluta/desktop-pilot-mcp/src/mcp.js"]
    }
  }
}
```

El cliente inicia directamente el servidor por stdio. No uses `npm start` como comando MCP: el banner de npm puede interferir con el protocolo. Si tu cliente no encuentra Node, usa su ruta absoluta.

Antes de operar, solicita `desktop_skills_get` con `name: "desktop"` y luego con `name: "platform"`.

## Herramientas

Con agent-desktop 1.2.0 se publican 69 herramientas: 67 del motor original y dos extensiones.

### `pilot_observe`

Lee el árbol de accesibilidad de una ventana. `vision: true` añade su captura como un bloque de imagen MCP.

```json
{"app": "Mi aplicación", "vision": true}
```

Si hay varias ventanas, añade `window_id`, obtenido de `desktop_list_windows`. El árbol y la captura son observaciones sucesivas, no una captura atómica. La captura depende del soporte y los permisos del sistema.

### `pilot_act`

Obtiene una observación completa, resuelve exactamente un elemento, actúa una vez y comprueba una condición en una nueva observación de la misma ventana y proceso.

```json
{
  "app": "Mi aplicación",
  "target": {"role": "button", "name": "Guardar"},
  "action": "click",
  "expect": {"role": "text", "name": "Guardado"}
}
```

Sustituye roles y nombres por los observados en tu aplicación. Las condiciones comparan `role`, `name` y, opcionalmente, `value` exactos. Acciones disponibles: `click`, `set_value`, `type`, `check`, `uncheck`, `expand`, `collapse`. `set_value` y `type` requieren `text`.

El servidor rechaza objetivos ambiguos y observaciones incompletas. No reintenta acciones automáticamente. Una condición fallida **no** significa que la acción no se haya ejecutado. Para cambios asíncronos, usa las esperas del motor y vuelve a observar.

Las herramientas originales conservan su semántica; la verificación adicional solo se aplica a `pilot_act`. Las capturas de `desktop_screenshot` se devuelven como imágenes MCP cuando contienen datos en memoria.

## Configuración opcional

Variables de entorno del proceso MCP:

- `AGENT_DESKTOP_BIN`: ruta absoluta a una compilación propia de agent-desktop, para trabajar sobre un fork del motor.
- `PILOT_HEADED=1`: habilita explícitamente entrada física de ratón y teclado. Por defecto está deshabilitada. Las restricciones de la plataforma siguen aplicando.
- `AGENT_DESKTOP_HOME`: cambia el directorio de estado del motor original.

Las llamadas se serializan dentro de cada proceso MCP. Procesos distintos no comparten el bloqueo: conecta un solo controlador a cada escritorio. La herramienta opera con los permisos de tu usuario; no crea una máquina virtual ni un entorno aislado. El contenido de las ventanas y las capturas se entrega a tu cliente MCP.

## Desarrollo y pruebas

```bash
npm test
npm run test:integration
npm pack --dry-run
```

Las pruebas unitarias usan dobles del motor para comprobar resolución ambigua, observaciones incompletas, verificación, identidad del proceso, serialización y conversión de imágenes. La integración inicia un servidor MCP real, descubre herramientas y consulta el estado del binario; no modifica aplicaciones.

El repositorio incluye únicamente la herramienta MCP. No contiene interfaz web, integración con un proveedor de modelos, claves ni historial de ejecuciones. No se ha medido una mejora de éxito frente al proyecto original en tareas reales de extremo a extremo.

## Base y licencia

Motor de ejecución: `agent-desktop@1.2.0`, de [Vercel Labs](https://github.com/vercel-labs/agent-desktop). Revisión del código base inspeccionada: `b43ac4f6e892ef608f8851428613c4009f0e84c7`.

Esta herramienta integra el motor como dependencia y mantiene sus adaptadores sin modificar. Licencia Apache-2.0; consulta [LICENSE](LICENSE).
