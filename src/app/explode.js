import { explodeUnits } from "../viewer/explode.js";
import { t } from "../i18n/index.js";

export function bindExplode(review) {
  const viewer = review.viewer;
  const panel = document.createElement("div");
  panel.id = "explode-options";
  panel.className = "section-options explode-options";
  panel.hidden = true;
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", t("explode.title"));
  panel.innerHTML = `<label>${review.esc(t("explode.amount"))} <input id="explode-range" type="range" min="0" max="100" step="1" value="0"></label><output id="explode-value">0%</output><label id="explode-group-control"><select id="explode-by"><option value="group">${review.esc(t("explode.group"))}</option><option value="part">${review.esc(t("explode.part"))}</option></select></label><button id="explode-reset" class="quiet-dark">${review.esc(t("explode.reset"))}</button>`;
  review.$("#section-options").parentElement.append(panel);
  const range = panel.querySelector("input");
  range.setAttribute("aria-label", t("explode.amount"));
  const select = panel.querySelector("select");
  select.setAttribute("aria-label", t("explode.by"));
  let open = false;
  review.commands.register({
    id: "explode",
    labelKey: "explode.title",
    captionKey: "explode.title",
    icon: "explode",
    menu: "view",
    menuOrder: 45,
    menuSection: "display",
    attributes: {
      id: "explode-toggle",
      "aria-controls": panel.id,
      "aria-expanded": "false",
    },
    enabled: () =>
      viewer.enabled &&
      explodeUnits(viewer.parts?.list() || [], [], "part").length > 1,
    run() {
      open = !open;
      if (open && review.mode === "measure") review.setMode("orbit");
      if (!open) viewer.setExplode(0);
      refresh();
    },
  });
  function refresh() {
    if (viewer.explode?.amount && review.mode === "measure")
      review.setMode("orbit");
    const state = viewer.explode || { amount: 0, by: "group" };
    const available = review.commands.get("explode").enabled();
    if (!available) open = false;
    panel.hidden = !open;
    const button = review.$("#explode-toggle");
    button.disabled = !available;
    button.classList.toggle("active", open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-pressed", String(open));
    button.title = t(available ? "explode.title" : "explode.single");
    button.setAttribute("aria-label", button.title);
    range.value = Math.round(state.amount * 100);
    panel.querySelector("output").textContent = `${range.value}%`;
    select.value = state.by;
    panel.querySelector("#explode-group-control").hidden =
      !viewer.parts?.hasGroups();
    review.refreshCommands();
    const measure = review.$('[data-command="mode-measure"]');
    measure.title = t(state.amount ? "explode.measure" : "tool.measure");
    measure.setAttribute("aria-label", measure.title);
  }
  viewer.onExplode = refresh;
  range.addEventListener("input", () => {
    if (review.mode === "measure") review.setMode("orbit");
    viewer.setExplode(Number(range.value) / 100, select.value);
  });
  select.addEventListener("change", () =>
    viewer.setExplode(Number(range.value) / 100, select.value),
  );
  panel
    .querySelector("button")
    .addEventListener("click", () => viewer.setExplode(0));
  refresh();
}
