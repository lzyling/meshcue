export function bindParts(review) {
  const { viewer, commands } = review;
  const panel = review.$("#parts-panel");
  let open = false,
    entries = [],
    byId = new Map(),
    rows = [],
    previousSelected = null;
  const collapsed = new Set();
  let query = "";
  const rowHeight = 34;
  const labels = {
    hide: "parts.hide",
    showAll: "parts.showAll",
    isolate: "parts.isolate",
    transparent: "parts.transparent",
  };
  panel.innerHTML = `<div class="parts-heading"><strong>${review.T("parts.title")}</strong></div>
    <div class="parts-actions">${["hide", "showAll", "isolate", "transparent"].map((key) => `<button class="quiet" data-command="parts-${key}" title="${review.T(labels[key])}">${review.T(labels[key])}</button>`).join("")}</div>
    <input id="parts-search" type="search" placeholder="${review.T("parts.search")}" aria-label="${review.T("parts.search")}">
    <div id="parts-tree" role="tree" aria-label="${review.T("parts.title")}" tabindex="0"><div class="parts-rows"></div></div>`;
  const tree = panel.querySelector("#parts-tree"),
    content = tree.firstElementChild;
  const toggleOpen = (value) => {
    open = value;
    viewer.hoverPart(null);
    if (open) {
      reveal(selected());
      render();
    }
  };
  const selected = () => viewer.parts.selected();
  for (const [id, shortcuts, run] of [
    ["hide", "Y", () => viewer.parts.setVisible(selected(), false)],
    ["showAll", "Shift+Y", () => viewer.parts.showAll()],
    [
      "isolate",
      "Shift+I",
      () =>
        viewer.parts.isolate(viewer.parts.isIsolated() ? null : [selected()]),
    ],
    [
      "transparent",
      "Shift+T",
      () =>
        viewer.parts.setTransparent(
          selected(),
          !viewer.parts.isTransparent(selected()),
        ),
    ],
  ])
    commands.register({
      id: `parts-${id}`,
      labelKey: labels[id],
      shortcuts,
      // The tree is always available, even when Marks is the selected tab.
      enabled: () =>
        viewer.enabled &&
        (id === "showAll" ||
          !!selected() ||
          (id === "isolate" && viewer.parts.isIsolated())),
      run,
    });
  // Escape already has one registry owner. Extend its entry so measurement and
  // relocation retain their behavior and there is still just one key binding.
  const escape = commands.get("escape"),
    previousRun = escape.run,
    previousEnabled = escape.enabled;
  escape.enabled = (source) =>
    viewer.parts.isIsolated() || previousEnabled(source);
  escape.run = () => {
    viewer.parts.isolate(null);
    previousRun();
  };
  function flatten() {
    rows = [];
    // Search keeps ancestors of matching names, never invents name-based
    // assemblies. During a query that path is expanded without changing the
    // reviewer's saved collapse state, which returns when the query is cleared.
    const included = new Set();
    if (query)
      for (const part of entries) {
        if (!part.name.toLocaleLowerCase().includes(query)) continue;
        for (let parent = part; parent; parent = byId.get(parent.parentId))
          included.add(parent.id);
      }
    const visit = (part, depth) => {
      if (query && !included.has(part.id)) return;
      rows.push({ part, depth });
      if (query || !collapsed.has(part.id))
        for (const id of part.childIds) visit(byId.get(id), depth + 1);
    };
    for (const part of entries) if (part.parentId === null) visit(part, 0);
  }
  function render() {
    if (!open) return;
    const start = Math.max(0, Math.floor(tree.scrollTop / rowHeight) - 3);
    const end = Math.min(
      rows.length,
      start + Math.ceil((tree.clientHeight || 240) / rowHeight) + 7,
    );
    const focused =
      document.activeElement?.closest("[data-part-id]")?.dataset.partId;
    content.style.height = `${rows.length * rowHeight}px`;
    content.replaceChildren();
    for (let i = start; i < end; i++) {
      const { part, depth } = rows[i];
      const expanded = !!query || !collapsed.has(part.id);
      const row = document.createElement("div");
      row.className = "parts-row";
      row.dataset.partId = part.id;
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-level", String(depth + 1));
      row.setAttribute("aria-selected", String(selected() === part.id));
      if (part.childIds.length)
        row.setAttribute("aria-expanded", String(expanded));
      row.style.top = `${i * rowHeight}px`;
      row.style.paddingLeft = `${4 + depth * 14}px`;
      row.classList.toggle("part-hidden", !viewer.parts.isVisible(part.id));
      row.classList.toggle(
        "part-transparent",
        viewer.parts.isTransparent(part.id),
      );
      row.innerHTML = `<button class="parts-expand quiet icon-only" tabindex="-1" aria-label="${review.T(expanded ? "parts.collapse" : "parts.expand")}" ${part.childIds.length ? "" : "disabled"}>${part.childIds.length ? (expanded ? "▾" : "▸") : ""}</button><button class="parts-name quiet" title="${review.esc(part.name)}">${review.esc(part.name)}</button><button class="parts-eye quiet icon-only" aria-label="${review.T(viewer.parts.isVisible(part.id) ? "parts.hidePart" : "parts.showPart", { name: part.name })}" aria-pressed="${viewer.parts.isVisible(part.id)}">${review.icon(viewer.parts.isVisible(part.id) ? "eye" : "eye-off")}</button>`;
      row.querySelector(".parts-expand").disabled =
        !!query || !part.childIds.length;
      row.querySelector(".parts-expand").onclick = () => {
        collapsed.has(part.id)
          ? collapsed.delete(part.id)
          : collapsed.add(part.id);
        flatten();
        render();
      };
      const name = row.querySelector(".parts-name");
      name.onclick = () => viewer.parts.select(part.id);
      name.ondblclick = () => viewer.fitPart(part.id);
      row.querySelector(".parts-eye").onclick = () =>
        viewer.parts.setVisible(part.id, !viewer.parts.isVisible(part.id));
      row.onpointerenter = () => viewer.hoverPart(part.id);
      row.onpointerleave = () => viewer.hoverPart(null);
      content.append(row);
      if (focused === part.id) name.focus({ preventScroll: true });
    }
  }
  function reveal(id) {
    if (!query)
      for (let p = byId.get(id); p?.parentId; p = byId.get(p.parentId))
        collapsed.delete(p.parentId);
    flatten();
    const index = rows.findIndex(({ part }) => part.id === id);
    if (index < 0) return;
    const top = index * rowHeight;
    if (
      top < tree.scrollTop ||
      top + rowHeight > tree.scrollTop + tree.clientHeight
    )
      tree.scrollTop = top;
  }
  panel.querySelector("#parts-search").addEventListener("input", (event) => {
    query = event.target.value.trim().toLocaleLowerCase();
    tree.scrollTop = 0;
    flatten();
    render();
  });
  panel.addEventListener("pointerleave", () => viewer.hoverPart(null));
  tree.addEventListener("scroll", () => {
    viewer.hoverPart(null);
    render();
  });
  tree.addEventListener("keydown", (event) => {
    // Modified arrows remain camera shortcuts. Plain arrows belong to this
    // focused tree and must not also turn the camera after moving a row.
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return;
    const index = rows.findIndex(({ part }) => part.id === selected());
    let next;
    if (event.key === "ArrowDown") next = Math.min(rows.length - 1, index + 1);
    if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = rows.length - 1;
    const part = rows[index]?.part;
    if (part && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "ArrowLeft") {
        if (!query && part.childIds.length && !collapsed.has(part.id)) {
          collapsed.add(part.id);
          flatten();
          render();
          return;
        }
        next = rows.findIndex(({ part: p }) => p.id === part.parentId);
      } else if (!query && part.childIds.length && collapsed.has(part.id)) {
        collapsed.delete(part.id);
        flatten();
        render();
        return;
      } else if (rows[index + 1]?.part.parentId === part.id) next = index + 1;
    }
    if (next !== undefined && rows[next]) {
      event.preventDefault();
      event.stopPropagation();
      viewer.parts.select(rows[next].part.id);
      content
        .querySelector(`[data-part-id="${selected()}"] .parts-name`)
        ?.focus();
    }
  });
  viewer.parts.onChange((kind) => {
    const next = viewer.parts.list();
    if (entries.length && !next.length) {
      collapsed.clear();
      query = "";
      panel.querySelector("#parts-search").value = "";
      tree.scrollTop = 0;
    }
    entries = next;
    byId = new Map(entries.map((part) => [part.id, part]));
    flatten();
    if (selected() !== previousSelected) reveal(selected());
    previousSelected = selected();
    // Preserve the clicked DOM node on selection: replacing it between the
    // two clicks would prevent the browser from delivering a double-click.
    if (
      kind === "selection" &&
      content.querySelector(`[data-part-id="${selected()}"]`)
    ) {
      for (const row of content.children)
        row.setAttribute(
          "aria-selected",
          String(row.dataset.partId === selected()),
        );
    } else render();
    panel
      .querySelector('[data-command="parts-isolate"]')
      .setAttribute("aria-pressed", String(viewer.parts.isIsolated()));
    panel
      .querySelector('[data-command="parts-transparent"]')
      .setAttribute(
        "aria-pressed",
        String(viewer.parts.isTransparent(selected())),
      );
    review.refreshCommands();
  });
  new ResizeObserver(render).observe(tree);
  review.sidebar.on(toggleOpen);
  toggleOpen(!panel.hidden);
}
