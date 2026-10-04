import { buildOrientCube, compassTransform } from "../orient-cube.js";
import { t } from "../i18n/index.js";

export function bindOrientation(review) {
  /* The cube is a compass: it turns with the camera so a reviewer who has orbited
   into an unfamiliar angle can still read which way the model is facing, and
   clicking a face reframes from that side without changing what is framed. */
  review.orientCube = review.$("#orient-cube");

  review.viewer.onOrient = (yaw, pitch) => {
    review.orientCube.style.transform = compassTransform(yaw, pitch);
  };

  /* Faces name a side; edges and corners are the three-quarter views a modeller
   reaches for to see two or three sides at once. */
  review.CUBE_KEYS = {
    "0,0,1": "cube.front",
    "0,0,-1": "cube.back",
    "1,0,0": "cube.right",
    "-1,0,0": "cube.left",
    "0,1,0": "cube.top",
    "0,-1,0": "cube.bottom",
  };

  review.CUBE_AXES = [
    ["cube.right", "cube.left"],
    ["cube.top", "cube.bottom"],
    ["cube.front", "cube.back"],
  ];

  review.cubeTitle = (view) =>
    view
      .split(",")
      .map(Number)
      .map((v, i) => (v ? t(review.CUBE_AXES[i][v > 0 ? 0 : 1]) : ""))
      .filter(Boolean)
      .reverse()
      .join(t("cube.sideJoin"));

  for (const region of buildOrientCube(review.orientCube, {
    label: (view) => (review.CUBE_KEYS[view] ? t(review.CUBE_KEYS[view]) : ""),
    title: (view) => t("cube.viewFrom", { side: review.cubeTitle(view) }),
  })) {
    const id = `navigation-cube-${region.view}`;
    review.commands.register({
      id,
      labelKey: review.CUBE_KEYS[region.view] || "cube.viewFrom",
      enabled: () => review.viewer.enabled,
      run: () => review.viewer.viewFrom(...region.view.split(",").map(Number)),
    });
    region.el.dataset.command = id;
  }
}
