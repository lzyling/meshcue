export function bindParts(review) {
  const { viewer, commands } = review;
  const panel = review.$("#parts-panel");
  let open = false,
    entries = [],
    byId = new Map(),
    rows = [],
    previousSelected = null;
  const collapsed = new Set(),
    initialized = new Set();
  let query = "";
  const rowHeight = 34;
  const labels = {
    hide: "parts.hide",
    showAll: "parts.showAll",
    isolate: "parts.isolate",
    transparent: "parts.transparent",
  };
  panel.innerHTML = `<div class="parts-heading"><strong>${review.T("parts.title")}</strong></div>
    <div class="parts-tools"><input id="parts-search" type="search" placeholder="${review.T("parts.search")}" aria-label="${review.T("parts.search")}"><button class="quiet parts-show-all" data-command="parts-showAll" title="${review.T(labels.showAll)}">${review.T("parts.showAllButton")}</button></div>
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
  const selected = () => viewer.parts.revealId(viewer.parts.selected());
  review.updatePartGroups = (state) => {
    if (state?.viewing !== review.loadedId) return;
    viewer.parts.setGroups(
      state.features?.partGroups === 1 ? state.partGroups || [] : [],
      {
        other: review.T("parts.other"),
        missing: review.T("parts.missing"),
        ambiguous: review.T("parts.ambiguous"),
      },
    );
    viewer.parts.setView(viewer.parts.hasGroups() ? "agent" : "file");
  };
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
          viewer.parts.meshIds(selected()).length > 0 ||
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
  function refreshEntries() {
    entries = viewer.parts.viewList();
    byId = new Map(entries.map((part) => [part.id, part]));
    for (const part of entries) {
      if (!initialized.has(part.id)) {
        initialized.add(part.id);
        if (part.collapsedByDefault) collapsed.add(part.id);
      }
    }
  }
  function flatten() {
    viewer.parts.search(query);
    refreshEntries();
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
      if (query || !collapsed.has(part.id)) {
        const children = query ? undefined : viewer.parts.expand(part.id);
        if (children) {
          part.childIds = children.map((child) => child.id);
          for (const child of children) {
            byId.set(child.id, child);
            if (!initialized.has(child.id)) {
              initialized.add(child.id);
              if (child.collapsedByDefault) collapsed.add(child.id);
            }
          }
        }
        for (const id of part.childIds) visit(byId.get(id), depth + 1);
      }
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
      if (part.hasChildren || part.childIds.length)
        row.setAttribute("aria-expanded", String(expanded));
      row.style.top = `${i * rowHeight}px`;
      row.style.paddingLeft = `${4 + depth * 14}px`;
      const actionable = part.meshIds.length > 0;
      if (!actionable) row.setAttribute("aria-disabled", "true");
      row.classList.toggle(
        "part-hidden",
        actionable && !viewer.parts.isVisible(part.id),
      );
      row.classList.toggle(
        "part-transparent",
        viewer.parts.isTransparent(part.id),
      );
      const expandable = part.hasChildren || part.childIds.length;
      const visible = viewer.parts.visibilityEnabled(part.id);
      const group = expandable || ["group", "other"].includes(part.kind);
      const glyph = group
        ? '<path d="M3 6h6l2 2h10v12H3z"/>'
        : '<path d="m12 3 9 5v9l-9 5-9-5V8z"/><path d="m3 8 9 5 9-5M12 13v9"/>';
      row.innerHTML = `<button class="parts-expand quiet icon-only" tabindex="-1" aria-label="${review.T(expanded ? "parts.collapse" : "parts.expand")}" ${expandable ? "" : "disabled"}>${expandable ? (expanded ? "▾" : "▸") : ""}</button><button class="parts-eye quiet icon-only" aria-label="${review.T(visible ? "parts.hidePart" : "parts.showPart", { name: part.name })}" aria-pressed="${visible}">${review.icon(visible && viewer.parts.isVisible(part.id) ? "eye" : "eye-off")}</button><span class="parts-kind" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${glyph}</svg></span><button class="parts-name quiet" title="${review.esc(part.name)}">${review.esc(part.name)}</button>`;
      row.querySelector(".parts-expand").disabled =
        !!query || !(part.hasChildren || part.childIds.length);
      row.querySelector(".parts-expand").onclick = () => {
        collapsed.has(part.id)
          ? collapsed.delete(part.id)
          : collapsed.add(part.id);
        flatten();
        render();
      };
      const name = row.querySelector(".parts-name");
      if (!actionable) {
        row.querySelector(".parts-eye").disabled = true;
        if (part.reason) name.disabled = true;
        else {
          const badge = document.createElement("small");
          badge.className = "parts-badge";
          badge.textContent = review.T(
            part.unresolvedMembers ? "parts.unresolved" : "parts.empty",
          );
          row.append(badge);
        }
      }
      name.onclick = () => viewer.parts.select(part.id);
      name.ondblclick = () => viewer.fitPart(part.id);
      row.querySelector(".parts-eye").onclick = () =>
        viewer.parts.setVisible(
          part.id,
          !viewer.parts.visibilityEnabled(part.id),
        );
      let pressTimer;
      const showMarkMenu = (event) => {
        event.preventDefault();
        document.querySelector(".part-mark-menu")?.remove();
        const menu = document.createElement("div");
        menu.className = "shell-menu part-mark-menu";
        menu.style.left = `${Math.min(event.clientX, innerWidth - 240)}px`;
        menu.style.top = `${Math.min(event.clientY, innerHeight - 60)}px`;
        const button = document.createElement("button");
        button.className = "menu-command";
        button.textContent = review.T(
          part.kind === "group" ? "marks2.markGroup" : "marks2.markPart",
        );
        button.onclick = async () => {
          menu.remove();
          try {
            if (await review.beginEdit()) {
              const mark = viewer.partMark(part.id);
              if (mark) {
                viewer.onObjectMark(mark);
                viewer.onStrokeEnd();
              }
            }
          } catch (e) {
            review.toast(e.message);
          }
        };
        menu.append(button);
        document.body.append(menu);
        button.focus();
        const close = (e) => {
          if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener("pointerdown", close);
          }
        };
        document.addEventListener("pointerdown", close);
        menu.onkeydown = (e) => {
          if (e.key === "Escape") menu.remove();
        };
      };
      row.oncontextmenu = showMarkMenu;
      row.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "touch")
          pressTimer = setTimeout(() => showMarkMenu(e), 600);
      });
      for (const event of ["pointerup", "pointercancel", "pointermove"])
        row.addEventListener(event, () => clearTimeout(pressTimer));
      row.onpointerenter = () => viewer.hoverPart(part.id);
      row.onpointerleave = () => viewer.hoverPart(null);
      content.append(row);
      if (focused === part.id) name.focus({ preventScroll: true });
    }
  }
  function reveal(id) {
    refreshEntries();
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
        if (
          !query &&
          (part.hasChildren || part.childIds.length) &&
          !collapsed.has(part.id)
        ) {
          collapsed.add(part.id);
          flatten();
          render();
          return;
        }
        next = rows.findIndex(({ part: p }) => p.id === part.parentId);
      } else if (
        !query &&
        (part.hasChildren || part.childIds.length) &&
        collapsed.has(part.id)
      ) {
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
    const next = viewer.parts.viewList();
    if (entries.length && !next.length) {
      collapsed.clear();
      initialized.clear();
      query = "";
      panel.querySelector("#parts-search").value = "";
      tree.scrollTop = 0;
    }
    entries = next;
    byId = new Map(entries.map((part) => [part.id, part]));
    flatten();
    if (kind === "selection" || selected() !== previousSelected)
      reveal(selected());
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
    review.refreshCommands();
  });
  new ResizeObserver(render).observe(tree);
  review.sidebar.on(toggleOpen);
  toggleOpen(!panel.hidden);
}
