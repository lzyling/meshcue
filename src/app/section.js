export function bindSection(review) {
  // This panel changes only the viewer. In particular it never calls changed(),
  // which would turn a viewing aid into a draft edit or a submission field.
  review.viewer.onSection = () => {
    const section = review.viewer.section;
    review.$("#section-toggle").disabled = !review.viewer.sectionBounds;
    review.$("#section-toggle").setAttribute("aria-pressed", String(!!section));
    review
      .$("#section-toggle")
      .setAttribute("aria-expanded", String(!!section));
    review.$("#section-toggle").classList.toggle("active", !!section);
    review.$("#section-options").hidden = !section;
    if (!section) return;
    review.$("#section-axis").value = section.axis;
    review
      .$("#section-flip")
      .setAttribute("aria-pressed", String(section.flip));
    const { min, max } = review.viewer.stats().section;
    review.$("#section-range").step = (max - min) / 1000 || 1;
    for (const id of ["#section-range", "#section-offset"]) {
      const input = review.$(id);
      input.min = min;
      input.max = max;
      input.value = section.offset;
    }
    review.$("#section-units").textContent =
      review.loadedUnits === "unspecified" ? "" : review.loadedUnits;
  };

  review.$("#section-off").addEventListener("click", () => {
    review.viewer.setSection(null);
    review.$("#section-toggle").focus();
  });

  review
    .$("#section-axis")
    .addEventListener("change", (e) =>
      review.viewer.setSection({ axis: e.target.value }),
    );

  review
    .$("#section-flip")
    .addEventListener("click", () =>
      review.viewer.setSection({ flip: !review.viewer.section.flip }),
    );

  for (const id of ["#section-range", "#section-offset"])
    review
      .$(id)
      .addEventListener(id === "#section-range" ? "input" : "change", (e) => {
        if (Number.isFinite(e.target.valueAsNumber))
          review.viewer.setSection({ offset: e.target.valueAsNumber });
        else review.viewer.onSection();
      });
}
