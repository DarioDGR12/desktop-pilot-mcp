export function desktopEnvironment(env = process.env) {
  const keys = ['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY', 'AT_SPI_BUS_ADDRESS', 'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP', 'AGENT_DESKTOP_HOME', 'AGENT_DESKTOP_SESSION', 'AGENT_DESKTOP_AGENT_ID', 'AGENT_DESKTOP_MACOS_HELPER_PATH'];
  return Object.fromEntries(keys.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
}
