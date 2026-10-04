# Offline Draco decoder

`draco_decoder.cjs` is the glTF JavaScript decoder copied from
`three@0.186.1/examples/jsm/libs/draco/gltf/draco_decoder.js` (512,465 bytes).
It is Apache-2.0 licensed; see `LICENSE.draco.txt`. The filename marks the upstream CommonJS export. One `__dirname` reference
is guarded for ESM bundles (this self-contained JS build reads no decoder files).
The Apache license is prepended as a legal comment so it travels with both the
raw browser asset and esbuild legal notices.
The browser receives the same bytes through Vite's local asset URL.

Meshopt is imported from Three's `meshopt_decoder.module.js` by both the server
and viewer. That module includes its WASM and MIT notice; it needs no remote
resource. No page security policy is changed.
