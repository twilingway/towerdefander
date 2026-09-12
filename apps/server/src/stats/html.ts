export const ROOM_STATS_HTML = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SpaceShip Defender — статистика комнат</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #08111f; color: #e8f0ff; }
      body { max-width: 1100px; margin: 0 auto; padding: 24px; }
      header, .summary { display: flex; flex-wrap: wrap; gap: 16px; align-items: baseline; }
      .card { background: #111f33; border: 1px solid #29415f; border-radius: 12px; padding: 14px 18px; }
      .value { font-size: 1.7rem; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #111f33; }
      th, td { padding: 10px 12px; border-bottom: 1px solid #29415f; text-align: left; }
      th { color: #9eb7d5; }
      .muted { color: #9eb7d5; }
      .error { color: #ff9d9d; }
    </style>
  </head>
  <body>
    <header>
      <h1>Активные комнаты</h1>
      <span id="updated" class="muted">Загрузка…</span>
    </header>
    <section class="summary" aria-label="Сводка">
      <div class="card"><div class="muted">Людей на сервере</div><div id="total-people" class="value">—</div></div>
      <div class="card"><div class="muted">Комнаты</div><div id="total-rooms" class="value">—</div></div>
      <div class="card"><div class="muted">Кампания</div><div id="campaign-people" class="value">—</div><div id="campaign-rooms" class="muted">—</div></div>
      <div class="card"><div class="muted">Арена</div><div id="arena-people" class="value">—</div><div id="arena-rooms" class="muted">—</div></div>
      <div class="card"><div class="muted">Места на reconnect</div><div id="reserved-players" class="value">—</div></div>
      <div class="card"><div class="muted">Общие экраны</div><div id="connected-displays" class="value">—</div></div>
    </section>
    <p id="error" class="error" role="status"></p>
    <h2>Кампания</h2>
    <table>
      <thead><tr><th>Статус</th><th>Игроки</th><th>Reconnect</th><th>Возраст</th><th>Закрытие</th></tr></thead>
      <tbody id="rooms-campaign"></tbody>
    </table>
    <h2>Арена</h2>
    <table>
      <thead><tr><th>Статус</th><th>Игроки</th><th>Reconnect</th><th>Возраст</th><th>Закрытие</th></tr></thead>
      <tbody id="rooms-arena"></tbody>
    </table>
    <script>
      const setText = (id, value) => { document.getElementById(id).textContent = String(value); };
      const appendCell = (row, value) => {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.appendChild(cell);
      };
      const refresh = async () => {
        try {
          const response = await fetch("/stats/rooms.json", { cache: "no-store" });
          if (!response.ok) throw new Error("Статистика временно недоступна");
          const snapshot = await response.json();
          setText("total-people", snapshot.totals.people);
          setText("total-rooms", snapshot.totals.rooms);
          setText("campaign-people", snapshot.byMode.campaign.people);
          setText("campaign-rooms", snapshot.byMode.campaign.rooms + " комн.");
          setText("arena-people", snapshot.byMode.arena.people);
          setText("arena-rooms", snapshot.byMode.arena.rooms + " комн.");
          setText("reserved-players", snapshot.totals.reservedPlayers);
          setText("connected-displays", snapshot.totals.connectedDisplays);
          setText("updated", new Date(snapshot.generatedAt).toLocaleString());
          setText("error", "");
          const bodies = {
            campaign: document.getElementById("rooms-campaign"),
            arena: document.getElementById("rooms-arena")
          };
          for (const body of Object.values(bodies)) body.replaceChildren();
          for (const room of snapshot.rooms) {
            const body = bodies[room.mode] ?? bodies.campaign;
            const row = document.createElement("tr");
            appendCell(row, room.status);
            appendCell(row, room.connectedPlayers + " / " + room.capacity);
            appendCell(row, room.reservedPlayers);
            appendCell(row, room.ageSeconds + " с");
            appendCell(row, room.expiresInSeconds === null ? "—" : room.expiresInSeconds + " с");
            body.appendChild(row);
          }
          for (const [mode, body] of Object.entries(bodies)) {
            if (body.childElementCount > 0) continue;
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 5;
            cell.className = "muted";
            cell.textContent = mode === "arena" ? "Матчей нет" : "Комнат нет";
            row.appendChild(cell);
            body.appendChild(row);
          }
        } catch {
          setText("error", "Статистика временно недоступна");
        }
      };
      void refresh();
      setInterval(refresh, 5000);
    </script>
  </body>
</html>`;
