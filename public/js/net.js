// WebSocket connection that reconnects by itself (phones lock, Wi-Fi blips).
export function connect({ onOpen, onMessage, onClose }) {
  let ws;
  const queue = [];

  function open() {
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onopen = () => {
      onOpen?.();
      queue.splice(0).forEach((m) => ws.send(m));
    };
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      onClose?.();
      setTimeout(open, 1000);
    };
  }
  open();

  return {
    send(msg) {
      const data = JSON.stringify(msg);
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
      else queue.push(data);
    },
  };
}
