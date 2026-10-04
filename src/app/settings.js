import {
  currentLocale,
  setLocale,
  LOCALES,
  localeName,
} from "../i18n/index.js";
import { storeThemeChoice, applyTheme, THEMES } from "../theme.js";

export function bindSettings(review) {
  /* The theme follows the system, so it can change while the page is open — at
   dusk, or when the reviewer flips the setting mid-review. CSS repaints itself;
   the WebGL canvas will not until it is told to. */
  review.darkQuery.addEventListener("change", () => {
    // Only while nobody has chosen. A reviewer who picked light meant it, and
    // dusk is not an argument against it.
    if (review.themeChoice === "system")
      applyTheme(review.themeChoice, review.darkQuery);
    review.viewer.applyTheme();
    review.viewer.render();
  });

  /* CSS repaints itself from the variables; the WebGL canvas is painted by us and
   will not, so every path that changes the theme has to say so here. The system
   listener above was the only one that existed, which is why the canvas could
   not have followed a manual switch. */
  review.$("#theme-choice").value = THEMES.includes(review.themeChoice)
    ? review.themeChoice
    : "system";

  review.$("#theme-choice").addEventListener("change", (e) => {
    review.themeChoice = storeThemeChoice(e.target.value);
    applyTheme(review.themeChoice, review.darkQuery);
    review.viewer.applyTheme();
    review.viewer.render();
  });

  for (const tag of LOCALES) {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = localeName(tag);
    review.$("#locale-choice").append(option);
  }

  review.$("#locale-choice").value = currentLocale();

  /* Every string was placed once, when the interface was built. Rebuilding it in
   place would mean re-binding every listener and rebuilding the viewer with the
   model still in it; reloading is honest and the choice is already stored.
   Flushing first is not optional — a reload with an unsaved draft in the tab
   would throw away marks the reviewer just made. */
  review.$("#locale-choice").addEventListener("change", async (e) => {
    const wanted = e.target.value;
    if (wanted === currentLocale()) return;
    setLocale(wanted);
    try {
      await review.flushDraft();
    } catch {
      /* a draft that will not save is a reason to reload no less carefully */
    }
    location.reload();
  });
}
