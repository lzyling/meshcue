import fs from "node:fs";
import path from "node:path";
import * as T from "three";
import { ModelViewer } from "../../src/viewer.js";
import { createParts } from "../../src/viewer/parts-tree.js";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { summarizeSubmission } from "../../integration/summarize.mjs";
import { circleThrough, planeAt, planesMeasure } from "../../src/measure.js";
export async function coordinateProbe(out) {
  fs.mkdirSync(out, { recursive: true });
  const save = (name, value) =>
    fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2));
  const report = [];
  let env;
  let servicePid;
  try {
    env = await startScenario({
      fixture: path.resolve("tmp/samples/parametric-bracket.glb"),
      runRoot: path.join(out, "runs"),
      dist: "dist",
    });
    servicePid = (await (await fetch(`${env.url}/api/health`)).json()).pid;
    save("service-identity.json", { pid: servicePid, url: env.url });
    for (const [file, up, units] of [
      ["nested-s1.glb", "z", "mm"],
      ["nested-s1.glb", "y", "mm"],
      ["nested-s2.glb", "z", "mm"],
      ["known.stl", "z", "cm"],
      ["fresh.glb", "z", "unspecified"],
      ["grouped-colours.step", "z", null],
    ]) {
      const key = `${file.replace(/\./g, "-")}-${up}-${units || "auto"}`;
      const src = file.endsWith("step")
        ? path.resolve("tests/fixtures", file)
        : path.resolve("tests/fixtures/coordinates", file);
      if (!fs.existsSync(path.join(env.workspace, file)))
        fs.copyFileSync(src, path.join(env.workspace, file));
      const publication = await env.ipc("/publish", {
        file,
        ...(up === "y" ? { up } : {}),
        name: key,
        version: key,
        ...(units ? { units } : {}),
      });
      save(`${key}-open.json`, publication);
      const model = publication.model;
      const bytes = fs.readFileSync(
        path.join(env.data, "models", (model.mesh || model).filename),
      );
      const viewer = Object.assign(Object.create(ModelViewer.prototype), {
        root: new T.Group(),
        grid: new T.Object3D(),
        meshMap: new Map(),
        meshes: [],
        loadingEpoch: 0,
        parts: createParts(),
        clearModel() {},
        home() {},
        async onReady(d) {
          this.manifest = d.meshes;
        },
      });
      await viewer.load(
        model,
        `data:application/octet-stream;base64,${bytes.toString("base64")}`,
      );
      viewer.camera = new T.PerspectiveCamera(38, 1.5, 0.01, 100);
      viewer.camera.position.set(4, 5, 6);
      viewer.camera.lookAt(0, 0, 0);
      viewer.camera.updateMatrixWorld();
      viewer.controls = { target: new T.Vector3() };
      viewer.navigationHeight = () => 4;
      viewer.toScreen = () => [1e6, 1e6];
      viewer.sectionContains = () => true;
      viewer.sectionOccludes = () => false;
      const mesh = viewer.meshes[0],
        local = viewer.triangle(mesh, 0).getMidpoint(new T.Vector3()),
        world = mesh.localToWorld(local.clone());
      const hit = {
        object: mesh,
        point: world,
        faceIndex: 0,
        face: { normal: viewer.triangle(mesh, 0).getNormal(new T.Vector3()) },
      };
      const view = viewer.markView();
      const pin = {
        id: "pin",
        type: "pin",
        label: "A",
        color: "#e76d5c",
        ...viewer.pinFromHit(hit),
        view,
      };
      const verts = viewer.sourceTriangle(mesh, 0);
      const region = {
        id: "region",
        type: "region",
        label: "",
        color: "#f0b44b",
        coverage: "source-v2",
        faces: { "mesh-0": [0] },
        surfacePatches: [
          {
            meshId: "mesh-0",
            faceIndex: 0,
            sourceFaceIndex: 0,
            vertices: verts,
          },
        ],
        view,
      };
      region.bounds = viewer.annotationBounds(region);
      const part = {
        id: "part",
        label: "B",
        color: "#e76d5c",
        ...viewer.partMark(viewer.parts.partOfMesh("mesh-0")),
        view,
      };
      const frame = viewer.modelFrame(mesh),
        points = verts.map((v) =>
          new T.Vector3().fromArray(v).applyMatrix4(frame),
        );
      const pick = { meshId: "mesh-0", sourceFaceIndex: 0 };
      viewer.measuring = {
        kind: "points",
        picks: [pick, pick],
        result: {
          quantity: "length",
          value: points[0].distanceTo(points[1]),
          points: points.slice(0, 2),
        },
      };
      const measure = {
        id: "measure",
        type: "measure",
        label: "M1",
        ...viewer.measureMark(),
        view,
      };
      const circle = circleThrough(points);
      viewer.measuring = {
        kind: "circle",
        picks: [pick, pick, pick],
        result: {
          quantity: "diameter",
          value: circle.diameter,
          points,
          center: circle.centre,
          normal: circle.normal,
        },
      };
      const cm = {
        id: "circle",
        type: "measure",
        label: "M2",
        ...viewer.measureMark(),
        view,
      };
      const plane = planeAt(mesh.userData.fillTopology, 0, frame);
      viewer.measuring = {
        kind: "planes",
        picks: [
          { ...pick, plane },
          { ...pick, plane: { normal: plane.normal.clone().negate() } },
        ],
        result: {
          quantity: "length",
          value: 2,
          points: [
            points[0],
            points[0].clone().addScaledVector(plane.normal, 2),
          ],
          normals: [plane.normal, plane.normal.clone().negate()],
        },
      };
      const pm = {
        id: "planes",
        type: "measure",
        label: "M3",
        ...viewer.measureMark(),
        view,
      };
      const edge = {
        id: "edge",
        label: "C",
        color: "#e76d5c",
        ...viewer.edgeMark({
          meshId: "mesh-0",
          curved: false,
          ends: points.slice(0, 2),
          sourceFaceIndex: 0,
        }),
        view,
      };
      const legacy = structuredClone(region);
      legacy.id = "legacy-region";
      legacy.bounds = {
        centroid: world.toArray(),
        min: world.toArray(),
        max: world.toArray(),
        area: 2 * viewer.root.scale.x ** 2,
      };
      if (file === "known.stl") {
        viewer.camera.isOrthographicCamera = true;
        for (const a of [pin, region, part, measure, cm, pm, edge, legacy])
          a.view = viewer.markView();
      }
      const extras = [];
      viewer.measuring = {
        kind: "edge",
        picks: [pick],
        result: {
          quantity: "length",
          value: points[0].distanceTo(points[1]),
          points: points.slice(0, 2),
        },
      };
      extras.push({
        id: "measure-edge",
        type: "measure",
        label: "M4",
        ...viewer.measureMark(),
        view,
      });
      if (file.endsWith("step")) {
        for (
          let face = 1;
          face < mesh.userData.fillTopology.vertices.length;
          face++
        ) {
          const second = planeAt(mesh.userData.fillTopology, face, frame);
          if (!second || Math.abs(second.normal.dot(plane.normal)) > 0.9)
            continue;
          const firstPick = { ...pick, plane, pick: points[0] },
            secondPick = {
              meshId: "mesh-0",
              sourceFaceIndex: face,
              plane: second,
              pick: new T.Vector3()
                .fromArray(viewer.sourceTriangle(mesh, face)[0])
                .applyMatrix4(frame),
            };
          viewer.measuring = {
            kind: "planes",
            picks: [firstPick, secondPick],
            result: planesMeasure(firstPick, secondPick),
          };
          extras.push({
            id: "angle",
            type: "measure",
            label: "M5",
            ...viewer.measureMark(),
            view,
          });
          break;
        }
      }
      const annotations = viewer.serializeAnnotations([
        pin,
        region,
        part,
        measure,
        cm,
        pm,
        edge,
        legacy,
        ...extras,
      ]);
      save(`${key}-wire.json`, { annotations, camera: viewer.cameraState() });
      const owner = { versionId: model.id, clientId: `probe-${key}` };
      const api = async (route, method, body) => {
        const r = await fetch(`${env.url}/api/${route}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Review-Client": "1",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await r.text();
        if (!r.ok) throw Error(`${route} ${r.status} ${text}`);
        return JSON.parse(text);
      };
      await api("ready", "POST", {
        ...owner,
        sha256: (model.mesh || model).sha256,
        meshes: viewer.manifest,
      });
      await api("review/begin", "POST", owner);
      const draft = await api("draft", "PUT", {
        ...owner,
        revision: 0,
        annotations,
        camera: viewer.cameraState(),
      });
      const submissionId = `batch-${key}`;
      await api("feedback", "POST", {
        ...owner,
        revision: draft.revision,
        submissionId,
      });
      const raw = await env.ipc("/submissions/" + submissionId);
      const receipt = await env.ipc("/read", {
        submissionId,
        versionId: model.id,
      });
      save(`${key}-raw.json`, raw);
      save(`${key}-read.json`, receipt);
      save(`${key}-summary.json`, summarizeSubmission(receipt));
      const snap = viewer.snapPoint(hit, 0, 0);
      viewer.sectionCaps = [];
      viewer.sectionCapMaterial = {};
      viewer.previewOverlay = {};
      viewer.measureCandidateGroup = {};
      viewer.effects = { replaceChildren() {} };
      viewer.applySectionMaterials = () => {};
      viewer.clearOverlay = () => {};
      viewer.highlightPart = () => {};
      const sectionBefore = {
        camera: viewer.cameraState(),
        view: viewer.markView(),
        annotations: viewer.serializeAnnotations(annotations),
      };
      viewer.setSection({
        axis: "z",
        offset: (viewer.sectionBounds.min.z + viewer.sectionBounds.max.z) / 2,
      });
      const sectionAfter = {
        camera: viewer.cameraState(),
        view: viewer.markView(),
        annotations: viewer.serializeAnnotations(annotations),
      };
      save(`${key}-section.json`, {
        state: viewer.section,
        clippingPlane: {
          normal: viewer.sectionClips[0].normal.toArray(),
          constant: viewer.sectionClips[0].constant,
        },
        readSerializationUnchanged:
          JSON.stringify(sectionBefore) === JSON.stringify(sectionAfter),
      });
      viewer.camera.isOrthographicCamera = true;
      const orthographic = {
        camera: viewer.cameraState(),
        view: viewer.markView(),
      };
      const check = {
        key,
        local: local.toArray(),
        file: local.clone().applyMatrix4(frame).toArray(),
        preview: world.toArray(),
        frame: frame.toArray(),
        root: viewer.root.matrixWorld.toArray(),
        manifest: viewer.manifest,
        sourceTriangle: verts,
        pin: pin.position,
        pinNormal: pin.normal,
        snap: snap.point.toArray(),
        plane: {
          point: plane.point?.toArray(),
          normal: plane.normal.toArray(),
        },
        bounds: region.bounds,
        view,
        camera: viewer.cameraState(),
        orthographic,
        sectionBounds: {
          min: viewer.sectionBounds.min.toArray(),
          max: viewer.sectionBounds.max.toArray(),
        },
        measure,
        cm,
        pm,
        units: model.units,
        meshCount: viewer.meshes.length,
        readSucceeded: receipt.id === submissionId,
      };
      report.push(check);
      save(`${key}-checks.json`, check);
    }
  } catch (e) {
    save("failure.json", { error: e.stack });
    throw e;
  } finally {
    if (env) {
      await env.stop();
      let alive = true;
      try {
        process.kill(servicePid, 0);
      } catch (e) {
        if (e.code === "ESRCH") alive = false;
        else throw e;
      }
      save("cleanup.json", {
        serviceStopped: !alive,
        pid: servicePid,
        run: env.run,
      });
      if (alive) throw Error("Owned service still alive");
    }
  }
  save("checks.json", report);
  return report;
}
