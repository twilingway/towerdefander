const daysNav = document.querySelector("#days");
const panel = document.querySelector("#day");

try {
  const index = await fetch("/artifacts/project-history/index.json", { cache: "no-store" }).then(
    (response) => (response.ok ? response.json() : { days: [], eras: [] })
  );
  if (index.days.length === 0) {
    panel.innerHTML = "<p>Истории пока нет: сначала соберите её скриптами project-history.</p>";
  }
  for (const day of index.days) {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `${day.date}<small>${String(day.commits)} коммитов</small>`;
    button.addEventListener("click", () => {
      for (const other of daysNav.querySelectorAll("button")) other.removeAttribute("aria-current");
      button.setAttribute("aria-current", "true");
      void show(day);
    });
    daysNav.append(button);
  }
  const last = index.days.at(-1);
  if (last !== undefined) {
    daysNav.querySelector("button:last-of-type")?.setAttribute("aria-current", "true");
    await show(last);
  }
} catch (error) {
  panel.textContent = `Не удалось открыть историю: ${error.message}`;
}

async function show(day) {
  const base = `/artifacts/project-history/${day.date}`;
  const report = await fetch(`${base}/report.md`, { cache: "no-store" })
    .then((response) => (response.ok ? response.text() : ""))
    .catch(() => "");
  panel.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = day.title;
  const facts = document.createElement("p");
  facts.className = "facts";
  facts.textContent = `${day.date} · ${String(day.commits)} коммитов · ревизия ${String(day.revision ?? "").slice(0, 7)}`;
  panel.append(heading, facts);

  const recording = day.shots.find((shot) => shot.file.endsWith(".webm"));
  if (recording !== undefined) {
    const video = document.createElement("video");
    video.src = `${base}/captures/${recording.file}`;
    video.controls = true;
    video.preload = "metadata";
    panel.append(video);
  }

  const shots = document.createElement("div");
  shots.className = "shots";
  for (const shot of day.shots.filter((entry) => entry.file.endsWith(".png"))) {
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = `${base}/captures/${shot.file}`;
    image.alt = shot.title;
    image.loading = "lazy";
    const caption = document.createElement("figcaption");
    caption.textContent = shot.title;
    figure.append(image, caption);
    shots.append(figure);
  }
  if (shots.childElementCount > 0) panel.append(shots);

  const prose = document.createElement("div");
  prose.className = "prose";
  for (const block of report.split(/\n\s*\n/u)) {
    const text = block
      .replace(/^#\s+.*$/mu, "")
      .replace(/\s*\n\s*/gu, " ")
      .trim();
    if (text.length === 0) continue;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    prose.append(paragraph);
  }
  panel.append(prose);

  if (day.notes.length > 0) {
    const notes = document.createElement("div");
    notes.className = "notes";
    const title = document.createElement("p");
    title.textContent = "Что снять не удалось:";
    notes.append(title);
    for (const note of day.notes) {
      const item = document.createElement("p");
      item.textContent = note;
      notes.append(item);
    }
    panel.append(notes);
  }
}
