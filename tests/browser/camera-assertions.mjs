import { expect } from "./fixtures.mjs";

// render() calls OrbitControls.update() even with damping off and no input.
// Its Cartesian -> spherical -> Cartesian round trip can change the last bit
// (the CI label case differed by 4.44e-16). A 1e-9 absolute tolerance in preview
// units still rejects camera motion; waiting longer cannot guarantee bit equality.
export function expectCameraUnchanged(actual, expected) {
  for (const key of ["position", "target"]) {
    expect(actual[key]).toHaveLength(expected[key].length);
    actual[key].forEach((value, i) => {
      expect(
        Math.abs(value - expected[key][i]),
        `${key}[${i}]`,
      ).toBeLessThanOrEqual(1e-9);
    });
  }
  const { position: _ap, target: _at, ...actualRest } = actual;
  const { position: _ep, target: _et, ...expectedRest } = expected;
  expect(actualRest).toEqual(expectedRest);
}
