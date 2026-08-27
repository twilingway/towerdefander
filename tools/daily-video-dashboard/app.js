const days = document.querySelector("#days");
const report = document.querySelector("#report");

try {
  const entries = await fetch("/artifacts/daily-videos/index.json", { cache: "no-store" }).then(
    (response) => (response.ok ? response.json() : [])
  );
  if (entries.length === 0) report.innerHTML = "<p>Отчётов пока нет.</p>";
  for (const entry of entries) {
    const button = document.createElement("button");
    button.textContent = entry.date;
    button.addEventListener("click", () => show(entry));
    days.append(button);
  }
  if (entries[0]) await show(entries[0]);
} catch (error) {
  report.textContent = `Не удалось открыть ежедневник: ${error.message}`;
}

async function show(entry) {
  const base = `/artifacts/daily-videos/${entry.date}`;
  const manifest = await fetch(`${base}/manifest.json`, { cache: "no-store" }).then((response) =>
    response.json()
  );
  const markdown = await Promise.all(
    ["research.md", "shorts-script.md", "shot-list.md", "status.md"].map(async (name) => [
      name,
      await fetch(`${base}/${name}`).then((response) => response.text())
    ])
  );
  report.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = entry.date;
  report.append(heading);
  if (manifest.files.rawGameplay) {
    const rawHeading = document.createElement("h3");
    rawHeading.textContent = "Чистый клип для монтажа";
    const rawVideo = document.createElement("video");
    rawVideo.src = `${base}/${manifest.files.rawGameplay}`;
    rawVideo.controls = true;
    rawVideo.preload = "metadata";
    report.append(rawHeading, rawVideo);
  }
  if (manifest.files.draft) {
    const video = document.createElement("video");
    video.src = `${base}/${manifest.files.draft}`;
    video.controls = true;
    video.preload = "metadata";
    report.append(video);
  }
  for (const image of manifest.ui ?? []) {
    const figure = document.createElement("figure");
    const node = document.createElement("img");
    node.src = `${base}/${image.path}`;
    node.alt = image.title;
    figure.append(node);
    const caption = document.createElement("figcaption");
    caption.textContent = image.title;
    figure.append(caption);
    report.append(figure);
  }
  for (const [name, text] of markdown) {
    const article = document.createElement("article");
    const title = document.createElement("h3");
    title.textContent = name;
    article.append(title, renderMarkdown(text));
    report.append(article);
  }
}

function renderMarkdown(text) {
  const fragment = document.createDocumentFragment();
  let list;
  for (const line of text.split("\n")) {
    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    if (heading !== null) {
      list = undefined;
      const node = document.createElement(`h${String(heading[1].length + 2)}`);
      node.textContent = heading[2];
      fragment.append(node);
      continue;
    }
    if (line.startsWith("- ")) {
      list ??= document.createElement("ul");
      if (!list.isConnected) fragment.append(list);
      const item = document.createElement("li");
      item.textContent = line.slice(2);
      list.append(item);
      continue;
    }
    list = undefined;
    if (line.trim().length > 0) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      fragment.append(paragraph);
    }
  }
  return fragment;
}
