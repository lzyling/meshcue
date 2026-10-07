export function bindSection(review) {
  // This panel changes only the viewer. In particular it never calls changed(),
  // which would turn a viewing aid into a draft edit or a submission field.
  let previousAxis = null;
  review.viewer.onSection = () => {
    const section = review.viewer.section;
    review.$("#section-toggle").disabled = !review.viewer.sectionBounds;
    review.$("#section-toggle").setAttribute("aria-pressed", String(!!section));
    review
      .$("#section-toggle")
      .setAttribute("aria-expanded", String(!!section));
    review.$("#section-toggle").classList.toggle("active", !!section);
    review.$("#section-options").hidden = !section;
    if (!section) {
      previousAxis = null;
      return;
    }
    review.$("#section-axis").value = section.axis;
    review
      .$("#section-flip")
      .setAttribute("aria-pressed", String(section.flip));
    const { min, max } = review.viewer.stats().section;
    const step = max - min < 20 ? 0.1 : max - min > 2000 ? 10 : 1;
    const range = review.$("#section-range");
    const alignedMin = Number((Math.ceil(min / step) * step).toFixed(10));
    const alignedMax = Number((Math.floor(max / step) * step).toFixed(10));
    range.step = step;
    range.disabled = alignedMin > alignedMax;
    const snap = (value) =>
      Number(
        Math.max(
          alignedMin,
          Math.min(alignedMax, Math.round(value / step) * step),
        ).toFixed(10),
      );
    if (previousAxis !== section.axis) {
      previousAxis = section.axis;
      const offset = snap(section.offset);
      if (!range.disabled && offset !== section.offset) {
        review.viewer.setSection({ offset });
        return;
      }
    }
    for (const id of ["#section-range", "#section-offset"]) {
      const input = review.$(id);
      input.min = id === "#section-range" ? alignedMin : min;
      input.max =
        id === "#section-range" ? Math.max(alignedMin, alignedMax) : max;
      input.value =
        id === "#section-range" ? snap(section.offset) : section.offset;
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
          review.viewer.setSection({
            offset:
              id === "#section-range"
                ? Number(
                    (
                      Math.round(
                        e.target.valueAsNumber / Number(e.target.step),
                      ) * Number(e.target.step)
                    ).toFixed(10),
                  )
                : e.target.valueAsNumber,
          });
        else review.viewer.onSection();
      });
}
